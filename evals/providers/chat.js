/**
 * Promptfoo custom provider — wraps the /api/chat SSE endpoint.
 *
 * The provider posts a single user message to /api/chat and parses the
 * SSE stream, returning the terminal `done` event payload as the output
 * object so that YAML assertions can reference fields directly:
 *
 *   output.routedAgent   → the specialist agent that handled the request
 *   output.message       → the final assistant message
 *   output.toolCallsUsed → array of MCP tool names called
 *   output.preview       → HTML preview string (builder only) or null
 *   output.schemaVersion → response schema version
 *
 * Configuration via environment variables:
 *   EVAL_BASE_URL   — base URL of the running server (default: http://localhost:3033)
 */

const BASE_URL = process.env.EVAL_BASE_URL || "http://localhost:3033";

export default class ChatApiProvider {
  id() {
    return "designsystem-chat";
  }

  async callApi(prompt, context) {
    const body = {
      messages: [{ role: "user", content: prompt }],
      previousAgent: context?.vars?.previousAgent ?? null,
    };

    const response = await fetch(`${BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      // 120 s matches the defaultTest timeout in promptfooconfig.yaml so the
      // fetch never outlives the eval runner's own timeout window.
      signal: AbortSignal.timeout(120_000),
    });

    if (!response.ok) {
      throw new Error(
        `/api/chat returned ${response.status}: ${await response.text()}`
      );
    }

    const raw = await response.text();
    for (const line of raw.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      let event;
      try {
        event = JSON.parse(line.slice(6));
      } catch {
        continue;
      }
      if (event.type === "error") {
        throw new Error(`Agent error: ${event.error}`);
      }
      if (event.type === "done") {
        return { output: event };
      }
    }

    throw new Error("No done event received from /api/chat");
  }
}
