/**
 * Design System MCP — Chat Route
 * Author: Thomas J McLeish
 * License: MIT
 *
 * POST /api/chat
 *
 * OpenRouter-backed multi-agent agentic loop.  Each request goes through
 * two steps:
 *
 *   Step 1 — Orchestrator routing
 *     A single fast LLM call classifies the user intent and returns a
 *     delegate_to_agent tool call routing to "reader", "builder", or
 *     "generator".  If the client supplies previousAgent the routing step
 *     is skipped entirely (continuation of the same conversation).
 *
 *   Step 2 — Specialist agentic loop
 *     The specialist agent receives only the tools relevant to its role and
 *     runs its own tool-call loop until it returns a final text response or
 *     MAX_ITERATIONS is reached.
 *
 * Progress is streamed to the client via Server-Sent Events so the UI shows
 * live feedback ("Thinking…", "Calling get_component…") rather than a
 * silent spinner.
 *
 * The generate_design_system tool is handled inline here (not via runMcpTool)
 * so it can share the request AbortController and return generated data back
 * in the SSE "done" payload.
 */

import express from "express";
import { runMcpTool } from "../toolRunner.js";
import { generateDesignSystem } from "../generator.js";
import { setData, type DataType } from "../dataStore.js";
import {
  OPENROUTER_TOOLS,
  CHAT_SYSTEM_PROMPT,
  ORCHESTRATOR_SYSTEM_PROMPT,
  SPECIALIST_CONFIGS,
  DELEGATE_TOOL,
  type SpecialistName,
} from "../agentConfig.js";

const router = express.Router();

const VALID_TYPES: DataType[] = ["tokens", "components", "themes", "icons"];

// ── Response parser ───────────────────────────────────────────────────────
// Parse the LLM's JSON response into {message, preview}.  Falls back to
// treating the raw text as the message if JSON parsing fails, so a
// non-compliant model reply still works rather than throwing.
// ─────────────────────────────────────────────────────────────────────────
function parseChatResponse(raw: string): { message: string; preview: string | null } {
  const text = raw.trim();

  // Attempt to extract a {message, preview} object from the text using several
  // strategies, in order of specificity.  Models sometimes emit prose before or
  // after the JSON, so we scan the whole string rather than requiring it to start
  // at position 0.
  function tryParse(candidate: string): { message: string; preview: string | null } | null {
    try {
      const parsed = JSON.parse(candidate) as { message?: unknown; preview?: unknown };
      if (typeof parsed !== "object" || parsed === null) return null;
      const message = typeof parsed.message === "string" ? parsed.message : null;
      if (!message) return null;
      const preview = typeof parsed.preview === "string" && parsed.preview.trim() ? parsed.preview.trim() : null;
      return { message, preview };
    } catch {
      return null;
    }
  }

  // 1. Whole text is JSON
  const r1 = tryParse(text);
  if (r1) return r1;

  // 2. Code fence: ```json … ``` or ``` … ```
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    const r2 = tryParse(fenced[1].trim());
    if (r2) return r2;
  }

  // 3. Scan forward from the first '{' to find a balanced JSON object anywhere
  //    in the response (handles models that prepend a prose sentence).
  const brace = text.indexOf("{");
  if (brace !== -1) {
    let depth = 0;
    let end = -1;
    for (let i = brace; i < text.length; i++) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}") { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end !== -1) {
      const r3 = tryParse(text.slice(brace, end + 1));
      if (r3) return r3;
    }
  }

  // 4. Nothing parseable — return the raw text as the message.
  return { message: raw, preview: null };
}

// ── POST /api/chat ────────────────────────────────────────────────────────
router.post("/chat", async (req, res) => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    res.status(503).json({
      error: "OpenRouter not configured. Set OPENROUTER_API_KEY environment variable.",
    });
    return;
  }

  const { messages, model: requestedModel, previousAgent } = req.body as {
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    model?: string;
    /** Agent name from the previous turn, sent by the client to skip re-routing. */
    previousAgent?: string;
  };

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages array is required and must not be empty." });
    return;
  }

  const model = requestedModel ?? process.env.OPENROUTER_MODEL ?? "openai/gpt-oss-20b:nitro";

  // Stream progress updates via Server-Sent Events
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const sendEvent       = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  const sendProgress    = (message: string) => sendEvent({ type: "progress", message });
  const endWithDone     = (payload: object) => { sendEvent({ type: "done", ...payload }); res.end(); };
  const endWithError    = (error: string)   => { sendEvent({ type: "error", error }); res.end(); };
  /** Emitted once after the orchestrator picks a specialist. */
  const sendAgentRouted = (agent: string, reason: string) =>
    sendEvent({ type: "agent_routed", agent, reason });
  /** Emitted just before each MCP tool is called — client renders this live. */
  const sendToolCall    = (callId: string, tool: string, args: Record<string, unknown>) =>
    sendEvent({ type: "tool_call", callId, tool, args });
  /** Emitted after each tool returns — client appends result metadata to the live row. */
  const sendToolResult  = (callId: string, tool: string, chars: number, preview: string) =>
    sendEvent({ type: "tool_result", callId, tool, chars, preview });
  /** Emitted when the model emits a thinking/reasoning block or narrating prose before tool calls. */
  const sendReasoning   = (iteration: number, content: string) =>
    sendEvent({ type: "reasoning", iteration, content });

  type OpenRouterMessage = {
    role: string;
    content: string | null;
    tool_calls?: unknown[];
    tool_call_id?: string;
    name?: string;
  };

  const toolCallsUsed: string[] = [];

  // Abort the whole loop after a generous timeout.  Progress is streamed so
  // the user sees activity; 120 s gives multi-step tasks (including
  // generate_design_system) time to complete.  Override with CHAT_TIMEOUT_MS.
  const CHAT_TIMEOUT_MS = Number(process.env.CHAT_TIMEOUT_MS ?? 120_000);
  const chatAbort = new AbortController();
  const chatTimer = setTimeout(() => chatAbort.abort(), CHAT_TIMEOUT_MS);

  type ThinkingStep =
    | { type: "reasoning"; content: string }
    | { type: "tool_call"; tool: string; args: string };
  const thinkingSteps: ThinkingStep[] = [];

  // ── Step 1: Orchestrator routing ────────────────────────────────────────
  // Call the Orchestrator with tool_choice:"required" so it must call
  // delegate_to_agent.  Fall back to unified single-agent mode if routing
  // fails; the unified mode uses CHAT_SYSTEM_PROMPT and all tools so every
  // capability remains available even when orchestration is unavailable.
  //
  // If the client supplies a valid previousAgent, skip the orchestrator
  // entirely — short follow-up messages (e.g. "yes, go ahead") would
  // otherwise be mis-classified as a new topic.
  // ─────────────────────────────────────────────────────────────────────────
  let routedAgent: SpecialistName | "unified" = "unified";
  let systemPrompt = CHAT_SYSTEM_PROMPT;
  type AnyTool = { type: string; function: { name: string; description: string; parameters: unknown } };
  let agentTools: AnyTool[] = OPENROUTER_TOOLS as unknown as AnyTool[];
  let MAX_ITERATIONS = 8;

  if (typeof previousAgent === "string" && previousAgent in SPECIALIST_CONFIGS) {
    const prev = previousAgent as SpecialistName;
    routedAgent    = prev;
    systemPrompt   = SPECIALIST_CONFIGS[prev].systemPrompt;
    agentTools     = SPECIALIST_CONFIGS[prev].tools;
    MAX_ITERATIONS = SPECIALIST_CONFIGS[prev].maxIterations;
    console.log(`[chat:orchestrator] reusing previousAgent="${prev}" (skip re-route)`);
  } else {
    try {
      sendProgress("Routing request…");
      const orchMessages: OpenRouterMessage[] = [
        { role: "system", content: ORCHESTRATOR_SYSTEM_PROMPT },
        messages.at(-1)!,
      ];
      const orchResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://github.com/designsystem-mcp-demo",
          "X-Title": "Design System MCP Demo",
        },
        body: JSON.stringify({
          model,
          messages: orchMessages,
          tools: [DELEGATE_TOOL],
          tool_choice: "required",
        }),
        signal: chatAbort.signal,
      });
      if (orchResponse.ok) {
        const orchData = await orchResponse.json() as { choices: Array<{ message: { tool_calls?: Array<{ function: { name: string; arguments: string } }> } }> };
        const delegateCall = orchData.choices?.[0]?.message?.tool_calls?.[0];
        if (delegateCall?.function?.name === "delegate_to_agent") {
          let delegateArgs: { agent?: string; reason?: string } = {};
          try {
            delegateArgs = JSON.parse(delegateCall.function.arguments) as { agent?: string; reason?: string };
          } catch (parseErr) {
            console.warn("[chat:orchestrator] failed to parse delegate_to_agent arguments:", String(parseErr), delegateCall.function.arguments);
          }
          const agent = delegateArgs.agent as SpecialistName | undefined;
          if (agent && agent in SPECIALIST_CONFIGS) {
            routedAgent    = agent;
            systemPrompt   = SPECIALIST_CONFIGS[agent].systemPrompt;
            agentTools     = SPECIALIST_CONFIGS[agent].tools;
            MAX_ITERATIONS = SPECIALIST_CONFIGS[agent].maxIterations;
            console.log(`[chat:orchestrator] routed to "${agent}" — ${delegateArgs.reason ?? ""}`);
            sendAgentRouted(agent, delegateArgs.reason ?? "");
          }
        }
      } else {
        console.warn(`[chat:orchestrator] non-ok response ${orchResponse.status}, falling back to unified agent`);
      }
    } catch (err) {
      console.warn("[chat:orchestrator] routing failed, falling back to unified agent:", String(err));
    }
  }

  // ── Step 2: Specialist (or unified fallback) agentic loop ───────────────
  const loopMessages: OpenRouterMessage[] = [
    { role: "system", content: systemPrompt },
    ...messages,
  ];

  let generatedDesignSystemData: Record<string, unknown> | null = null;

  type ContentBlock =
    | { type: "thinking"; thinking: string }
    | { type: "text"; text: string }
    | { type: string; [key: string]: unknown };

  try {
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      console.log(`[chat] iteration=${i} model=${model} messages=${loopMessages.length}`);

      sendProgress("Thinking…");

      const orResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://github.com/designsystem-mcp-demo",
          "X-Title": "Design System MCP Demo",
        },
        body: JSON.stringify({
          model,
          messages: loopMessages,
          tools: agentTools,
          tool_choice: "auto",
        }),
        signal: chatAbort.signal,
      });

      if (!orResponse.ok) {
        const errText = await orResponse.text();
        clearTimeout(chatTimer);
        let errMsg = `OpenRouter API error (${orResponse.status})`;
        try {
          const errJson = JSON.parse(errText) as { error?: { message?: string } };
          if (errJson.error?.message) {
            errMsg += `: ${errJson.error.message}`;
          } else {
            errMsg += `: ${errText}`;
          }
        } catch {
          errMsg += `: ${errText}`;
        }
        endWithError(errMsg);
        return;
      }

      const orData = await orResponse.json() as {
        choices: Array<{
          message: {
            role: string;
            content: string | Array<ContentBlock> | null;
            tool_calls?: Array<{
              id: string;
              type: string;
              function: { name: string; arguments: string };
            }>;
          };
          finish_reason: string;
        }>;
      };

      const choice = orData.choices[0];
      if (!choice) {
        clearTimeout(chatTimer);
        endWithError("OpenRouter returned no choices.");
        return;
      }

      const assistantMessage = choice.message;

      // Extract text content and any reasoning blocks (thinking-capable models
      // like Claude return an array of content blocks)
      let assistantTextContent: string | null = null;
      if (Array.isArray(assistantMessage.content)) {
        for (const block of assistantMessage.content as ContentBlock[]) {
          if (block.type === "thinking" && block.thinking) {
            thinkingSteps.push({ type: "reasoning", content: block.thinking as string });
            sendReasoning(i, block.thinking as string);
          } else if (block.type === "text" && block.text) {
            assistantTextContent = (assistantTextContent ?? "") + block.text;
          }
        }
      } else {
        assistantTextContent = assistantMessage.content;
      }

      // If the model narrates its plan before calling tools (e.g. "I'll look up
      // the button tokens first"), stream that as reasoning so it shows in the
      // live trace alongside the tool calls that follow.
      if (assistantTextContent && assistantMessage.tool_calls?.length) {
        sendReasoning(i, assistantTextContent);
      }

      loopMessages.push({
        ...assistantMessage,
        content: assistantTextContent,
      } as OpenRouterMessage);

      if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
        for (const toolCall of assistantMessage.tool_calls) {
          const toolName = toolCall.function.name;
          let toolArgs: Record<string, unknown> = {};
          try {
            toolArgs = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
          } catch {
            toolArgs = {};
          }

          if (!toolCallsUsed.includes(toolName)) toolCallsUsed.push(toolName);

          thinkingSteps.push({ type: "tool_call", tool: toolName, args: toolCall.function.arguments });

          console.log(`[chat:tool] calling ${toolName}`, JSON.stringify(toolArgs));

          if (toolName === "generate_design_system") {
            sendProgress("Generating design system — this may take a moment…");
          } else {
            sendProgress(`Calling \`${toolName}\`…`);
          }
          sendToolCall(toolCall.id, toolName, toolArgs);

          let toolResult: string;

          // ── Special handling: generate_design_system ─────────────────
          // Handled inline (not via runMcpTool) so the generation respects
          // the request AbortController and the result is included in the
          // SSE "done" payload for the UI to display.
          if (toolName === "generate_design_system") {
            try {
              const description = (toolArgs.description as string) ?? "";
              const result = await generateDesignSystem(description, apiKey, model, chatAbort.signal);

              const loadedSections: string[] = [];
              for (const section of VALID_TYPES) {
                if (result.data[section] !== undefined) {
                  setData(section, result.data[section]);
                  loadedSections.push(section);
                }
              }

              generatedDesignSystemData = result.data;

              toolResult = JSON.stringify({
                success: true,
                message:        "Design system generated and loaded successfully.",
                sectionsLoaded: loadedSections,
                componentCount: Object.keys((result.data.components ?? {}) as object).length,
                themeCount:     Object.keys((result.data.themes    ?? {}) as object).length,
                iconCount:      Object.keys((result.data.icons     ?? {}) as object).length,
                warnings:       result.warnings,
              });
            } catch (genErr) {
              clearTimeout(chatTimer);
              endWithError(`Design system generation failed: ${String(genErr)}`);
              return;
            }
          } else {
            // ── Standard tool execution ──────────────────────────────
            try {
              toolResult = await runMcpTool(toolName, toolArgs);
            } catch (toolErr) {
              toolResult = JSON.stringify({ error: String(toolErr) });
            }
          }

          loopMessages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            name: toolName,
            content: toolResult,
          });
          const resultPreview = toolResult.length > 500 ? toolResult.slice(0, 500) + "…" : toolResult;
          sendToolResult(toolCall.id, toolName, toolResult.length, resultPreview);
          console.log(`[chat:tool] result for ${toolName}:`, resultPreview);
        }
        continue;
      }

      // No tool calls — return the final answer
      const rawResponse = assistantTextContent ?? "";
      const { message, preview } = parseChatResponse(rawResponse);
      console.log("[chat:response]", message.slice(0, 300));
      clearTimeout(chatTimer);
      endWithDone({ message, preview, model, routedAgent, toolCallsUsed, thinkingSteps, generatedDesignSystem: generatedDesignSystemData });
      return;
    }

    // Reached max iterations without a final text response
    const lastAssistant = [...loopMessages].reverse().find((m: OpenRouterMessage) => m.role === "assistant" && m.content);
    const rawLast = String(lastAssistant?.content ?? "");
    const { message: lastMessage, preview: lastPreview } = parseChatResponse(rawLast);
    clearTimeout(chatTimer);
    endWithDone({ message: lastMessage, preview: lastPreview, model, routedAgent, toolCallsUsed, thinkingSteps, generatedDesignSystem: generatedDesignSystemData });
  } catch (err) {
    clearTimeout(chatTimer);
    console.error("Chat error:", err);
    const isTimeout = (err as { name?: string }).name === "AbortError";
    const errMessage = (err as { message?: string }).message;
    endWithError(
      isTimeout
        ? "The AI took too long to respond. Please try a simpler question or try again."
        : `Internal server error during chat${errMessage ? `: ${errMessage}.` : "."}`,
    );
  }
});

export default router;
