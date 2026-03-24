/**
 * Button tests for the Design System AI demo UI.
 *
 * All /api/chat calls are intercepted so tests never hit a real LLM.
 * Other API endpoints (/api/schema, /api/data, /api/data/reset, /prompt-templates)
 * are served by the real dev server that starts via playwright.config.ts webServer.
 */
import { test, expect, Page } from "@playwright/test";

// ── helpers ──────────────────────────────────────────────────────────────────

/** Shape of the structured JSON the server now returns from /api/chat. */
interface ChatApiResponse {
  message: string;
  preview?: string | null;
  model?: string;
  toolCallsUsed?: string[];
  generatedDesignSystem?: unknown;
}

/** Intercept /api/chat and return a controlled assistant response. */
async function mockChat(page: Page, payload: ChatApiResponse) {
  await page.route("/api/chat", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        toolCallsUsed: ["get_tokens"],
        generatedDesignSystem: null,
        model: "test-model",
        ...payload,
      }),
    })
  );
}

/** Navigate to the demo and wait until the chat panel is ready. */
async function openDemo(page: Page) {
  await page.goto("/");
  await page.waitForSelector("#send-btn");
}

/** Type into the chat input and click Send. */
async function sendMessage(page: Page, text: string) {
  await page.fill("#user-input", text);
  await page.click("#send-btn");
}

// ── tests ─────────────────────────────────────────────────────────────────────

test.describe("Send button", () => {
  test("sends message and displays assistant response in chat", async ({ page }) => {
    await mockChat(page, { message: "Here are the primary color tokens from the design system." });
    await openDemo(page);

    await sendMessage(page, "What are the primary colors?");

    const msgs = page.locator(".msg.assistant .msg-bubble");
    await expect(msgs.last()).toContainText("primary color tokens");
  });

  test("shows loading indicator while waiting for response", async ({ page }) => {
    await page.route("/api/chat", async (route) => {
      await new Promise((r) => setTimeout(r, 300));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ message: "Done.", model: "test-model", toolCallsUsed: [] }),
      });
    });
    await openDemo(page);

    await page.fill("#user-input", "hello");
    await page.click("#send-btn");

    await expect(page.locator(".loading-bubble")).toBeVisible();
    await expect(page.locator(".loading-bubble")).not.toBeVisible({ timeout: 5000 });
  });

  test("disables send button while request is in flight", async ({ page }) => {
    await page.route("/api/chat", async (route) => {
      await new Promise((r) => setTimeout(r, 300));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ message: "OK", model: "m", toolCallsUsed: [] }),
      });
    });
    await openDemo(page);

    await page.fill("#user-input", "test");
    await page.click("#send-btn");

    await expect(page.locator("#send-btn")).toBeDisabled();
    await expect(page.locator("#send-btn")).toBeEnabled({ timeout: 5000 });
  });

  test("displays error message when API call fails", async ({ page }) => {
    await page.route("/api/chat", (route) =>
      route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: "OpenRouter API error" }) })
    );
    await openDemo(page);

    await sendMessage(page, "test error");

    await expect(page.locator(".msg.error")).toContainText("OpenRouter API error");
  });
});

test.describe("Send button — two-part response (chat + live preview)", () => {
  const PREVIEW_HTML = `<button style="background:#2f81f7;color:#fff;padding:8px 16px;border:none;border-radius:4px;cursor:pointer;">Primary</button>`;

  test("renders preview HTML in the live preview iframe", async ({ page }) => {
    await mockChat(page, { message: "Here is a primary button.", preview: PREVIEW_HTML });
    await openDemo(page);

    await sendMessage(page, "Show me a primary button");

    await expect(page.locator(".preview-iframe")).toBeVisible({ timeout: 5000 });
  });

  test("shows only prose in chat bubble — no raw HTML code", async ({ page }) => {
    await mockChat(page, { message: "Here is a primary button.", preview: PREVIEW_HTML });
    await openDemo(page);

    await sendMessage(page, "Show me a primary button");

    const lastBubble = page.locator(".msg.assistant .msg-bubble").last();
    await expect(lastBubble).toContainText("primary button");
    // No raw markup should appear in the chat bubble
    await expect(lastBubble).not.toContainText("<button");
    await expect(lastBubble).not.toContainText("```");
  });

  test("shows 'Show Code' toggle button when preview HTML is present", async ({ page }) => {
    await mockChat(page, { message: "Here is a card.", preview: `<div style="padding:16px;border:1px solid #ddd;">Card</div>` });
    await openDemo(page);

    await sendMessage(page, "Build a card");

    await expect(page.locator("#code-toggle-btn")).toBeVisible({ timeout: 5000 });
  });

  test("shows empty-state placeholder when no preview is returned", async ({ page }) => {
    await mockChat(page, { message: "The primary color token is color.primary.500." });
    await openDemo(page);

    await sendMessage(page, "What is the primary color?");

    await expect(page.locator(".preview-empty")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("#code-toggle-btn")).not.toBeVisible();
  });
});

test.describe("Show Code / Show Preview toggle button", () => {
  test("toggles from preview to code view and back", async ({ page }) => {
    await mockChat(page, { message: "Here is a card.", preview: `<div style="padding:16px;border:1px solid #ddd;">Card</div>` });
    await openDemo(page);
    await sendMessage(page, "Create a card");
    await expect(page.locator(".preview-iframe")).toBeVisible({ timeout: 5000 });

    // Click "Show Code"
    await page.click("#code-toggle-btn");
    await expect(page.locator("#code-toggle-btn")).toHaveText("Show Preview");
    await expect(page.locator(".code-view")).toBeVisible();
    await expect(page.locator(".preview-iframe")).not.toBeVisible();

    // Click "Show Preview"
    await page.click("#code-toggle-btn");
    await expect(page.locator("#code-toggle-btn")).toHaveText("Show Code");
    await expect(page.locator(".preview-iframe")).toBeVisible();
    await expect(page.locator(".code-view")).not.toBeVisible();
  });
});

test.describe("Quick start chip buttons", () => {
  test("chips are rendered from the /prompt-templates endpoint", async ({ page }) => {
    await openDemo(page);
    const chips = page.locator(".chip");
    await expect(chips.first()).toBeVisible({ timeout: 5000 });
    const count = await chips.count();
    expect(count).toBeGreaterThan(0);
  });

  test("clicking a chip submits its prompt as a user message", async ({ page }) => {
    await mockChat(page, { message: "Here are the primary colors." });
    await openDemo(page);

    const chips = page.locator(".chip");
    await chips.first().waitFor({ state: "visible", timeout: 5000 });
    await chips.first().click();

    // A user message bubble should appear (the chip's prompt text)
    await expect(page.locator(".msg.user .msg-bubble").last()).toBeVisible({ timeout: 5000 });
  });

  test("clicking a chip clears the input field after sending", async ({ page }) => {
    await mockChat(page, { message: "Done." });
    await openDemo(page);

    const chips = page.locator(".chip");
    await chips.first().waitFor({ state: "visible", timeout: 5000 });
    await chips.first().click();

    // Input should be empty after sending
    await expect(page.locator("#user-input")).toHaveValue("");
  });

  test("clicking the 'Create a login form' chip renders a preview", async ({ page }) => {
    await mockChat(page, {
      message: "Here is a login form using your design tokens.",
      preview: `<form style="display:flex;flex-direction:column;gap:10px;padding:18px;"><input type="email" placeholder="Email"/><input type="password" placeholder="Password"/><button type="submit">Sign in</button></form>`,
    });
    await openDemo(page);

    const loginChip = page.locator(".chip", { hasText: "Create a login form" });
    await loginChip.waitFor({ state: "visible", timeout: 5000 });
    await loginChip.click();

    await expect(page.locator(".preview-iframe")).toBeVisible({ timeout: 5000 });
  });

  test("clicking a non-UI chip (e.g. 'List primary colors') shows the empty preview state", async ({ page }) => {
    await mockChat(page, { message: "The primary colors are color.primary.500 and color.primary.600." });
    await openDemo(page);

    const colorsChip = page.locator(".chip", { hasText: "List primary colors" });
    await colorsChip.waitFor({ state: "visible", timeout: 5000 });
    await colorsChip.click();

    await expect(page.locator(".preview-empty")).toBeVisible({ timeout: 5000 });
  });

  test("each chip title matches its corresponding prompt-template entry", async ({ page }) => {
    await openDemo(page);
    // Fetch expected titles from the server
    const templateRes = await page.request.get("/prompt-templates");
    const body = await templateRes.json();
    const templates = Array.isArray(body?.templates) ? (body.templates as Array<{ title?: unknown }>) : [];
    const expectedTitles = templates.flatMap((t) => (typeof t.title === "string" ? [t.title] : []));
    expect(expectedTitles.length).toBeGreaterThan(0);

    for (const title of expectedTitles) {
      await expect(page.locator(".chip", { hasText: title })).toBeVisible({ timeout: 5000 });
    }
  });
});

test.describe("Tab buttons — Live Preview / Component Explorer / Component Gallery", () => {
  test("Live Preview tab is active by default", async ({ page }) => {
    await openDemo(page);
    await expect(page.locator("#tab-preview")).toHaveClass(/active/);
    await expect(page.locator("#panel-preview")).toBeVisible();
  });

  test("Component Explorer tab shows the explorer panel", async ({ page }) => {
    await openDemo(page);
    await page.click("#tab-explorer");
    await expect(page.locator("#tab-explorer")).toHaveClass(/active/);
    await expect(page.locator("#panel-explorer")).toBeVisible();
    await expect(page.locator("#panel-preview")).not.toBeVisible();
  });

  test("Component Gallery tab shows the gallery panel", async ({ page }) => {
    await openDemo(page);
    await page.click("#tab-gallery");
    await expect(page.locator("#tab-gallery")).toHaveClass(/active/);
    await expect(page.locator("#panel-gallery")).toBeVisible();
  });

  test("clicking back to Live Preview tab restores the preview panel", async ({ page }) => {
    await openDemo(page);
    await page.click("#tab-explorer");
    await page.click("#tab-preview");
    await expect(page.locator("#tab-preview")).toHaveClass(/active/);
    await expect(page.locator("#panel-preview")).toBeVisible();
  });
});

test.describe("MCP server button", () => {
  test("opens the MCP info modal", async ({ page }) => {
    await openDemo(page);
    await page.click("#mcp-info-btn");
    await expect(page.locator("#info-modal")).toHaveClass(/open/);
    await expect(page.locator("#info-modal-title")).toContainText("MCP");
  });

  test("modal closes via Got it button", async ({ page }) => {
    await openDemo(page);
    await page.click("#mcp-info-btn");
    await page.click("#info-modal-ok");
    await expect(page.locator("#info-modal")).not.toHaveClass(/open/);
  });

  test("modal closes via Escape key", async ({ page }) => {
    await openDemo(page);
    await page.click("#mcp-info-btn");
    await page.keyboard.press("Escape");
    await expect(page.locator("#info-modal")).not.toHaveClass(/open/);
  });
});

test.describe("View Schema button", () => {
  test("opens the View Schema modal with schema content", async ({ page }) => {
    await openDemo(page);
    await page.click("#view-schema-btn");
    await expect(page.locator("#schema-modal")).toHaveClass(/open/);
    await expect(page.locator("#schema-modal-pre")).toBeVisible({ timeout: 5000 });
  });

  test("modal closes via Close button", async ({ page }) => {
    await openDemo(page);
    await page.click("#view-schema-btn");
    await page.click("#schema-modal-cancel");
    await expect(page.locator("#schema-modal")).not.toHaveClass(/open/);
  });

  test("modal closes via × button", async ({ page }) => {
    await openDemo(page);
    await page.click("#view-schema-btn");
    await page.click("#schema-modal-close");
    await expect(page.locator("#schema-modal")).not.toHaveClass(/open/);
  });
});

test.describe("Load JSON button", () => {
  test("opens the Load JSON modal", async ({ page }) => {
    await openDemo(page);
    await page.click("#load-json-btn");
    await expect(page.locator("#load-json-modal")).toHaveClass(/open/);
  });

  test("modal closes via Cancel button", async ({ page }) => {
    await openDemo(page);
    await page.click("#load-json-btn");
    await page.click("#modal-cancel-btn");
    await expect(page.locator("#load-json-modal")).not.toHaveClass(/open/);
  });

  test("modal closes via × button", async ({ page }) => {
    await openDemo(page);
    await page.click("#load-json-btn");
    await page.click("#modal-close-btn");
    await expect(page.locator("#load-json-modal")).not.toHaveClass(/open/);
  });

  test("shows alert when Load is clicked with no JSON", async ({ page }) => {
    await openDemo(page);
    await page.click("#load-json-btn");
    page.once("dialog", (dialog) => dialog.accept());
    await page.click("#modal-submit-btn");
    await expect(page.locator("#load-json-modal")).toHaveClass(/open/);
  });
});

test.describe("Reset button", () => {
  test("shows confirmation dialog", async ({ page }) => {
    await openDemo(page);
    let dialogMessage = "";
    page.once("dialog", (dialog) => {
      dialogMessage = dialog.message();
      dialog.dismiss();
    });
    await page.click("#reset-btn");
    expect(dialogMessage).toContain("Reset");
  });

  test("resets data and shows confirmation message when confirmed", async ({ page }) => {
    await openDemo(page);
    page.once("dialog", (dialog) => dialog.accept());
    await page.click("#reset-btn");
    const msgs = page.locator(".msg.assistant .msg-bubble");
    await expect(msgs.last()).toContainText("reset to bundled defaults", { timeout: 5000 });
  });
});

test.describe("Info (ℹ) buttons", () => {
  test("Chat info button opens the Chat info modal", async ({ page }) => {
    await openDemo(page);
    await page.click(".info-btn[data-info='chat']");
    await expect(page.locator("#info-modal")).toHaveClass(/open/);
    await expect(page.locator("#info-modal-title")).toContainText("Chat");
  });

  test("Preview info button opens the Preview info modal", async ({ page }) => {
    await openDemo(page);
    await page.click(".info-btn[data-info='preview']");
    await expect(page.locator("#info-modal")).toHaveClass(/open/);
    await expect(page.locator("#info-modal-title")).toContainText("Preview");
  });

  test("info modal closes via the × button", async ({ page }) => {
    await openDemo(page);
    await page.click(".info-btn[data-info='chat']");
    await page.click("#info-modal-close");
    await expect(page.locator("#info-modal")).not.toHaveClass(/open/);
  });
});

test.describe("Explorer Refresh button", () => {
  test("reload button is visible in the Component Explorer tab", async ({ page }) => {
    await openDemo(page);
    await page.click("#tab-explorer");
    await expect(page.locator("#explorer-refresh-btn")).toBeVisible();
  });

  test("clicking Refresh re-loads the component list", async ({ page }) => {
    await openDemo(page);
    await page.click("#tab-explorer");
    await expect(page.locator("#explorer-body")).not.toContainText("Loading", { timeout: 5000 });
    await page.click("#explorer-refresh-btn");
    await expect(page.locator("#explorer-body")).not.toContainText("Loading", { timeout: 5000 });
  });
});

test.describe("Gallery Refresh button", () => {
  test("reload button is visible in the Component Gallery tab", async ({ page }) => {
    await openDemo(page);
    await page.click("#tab-gallery");
    await expect(page.locator("#gallery-refresh-btn")).toBeVisible();
  });

  test("clicking Refresh reloads the gallery", async ({ page }) => {
    await openDemo(page);
    await page.click("#tab-gallery");
    await expect(page.locator("#gallery-body")).not.toContainText("Loading", { timeout: 5000 });
    await page.click("#gallery-refresh-btn");
    await expect(page.locator("#gallery-body")).not.toContainText("Loading", { timeout: 5000 });
  });
});

test.describe("View Agents button", () => {
  test("opens the View Agents modal", async ({ page }) => {
    await openDemo(page);
    await page.click("#view-agents-btn");
    await expect(page.locator("#agents-modal")).toHaveClass(/open/);
  });

  test("modal shows agent name on Config tab", async ({ page }) => {
    await openDemo(page);
    await page.click("#view-agents-btn");
    // Wait for the agent info to load
    await expect(page.locator("#agents-modal-body")).not.toContainText("Loading agent info", { timeout: 5000 });
    await expect(page.locator("#agents-modal-body")).toContainText("Chat Assistant");
  });

  test("System Prompt tab shows the system instructions", async ({ page }) => {
    await openDemo(page);
    await page.click("#view-agents-btn");
    await expect(page.locator("#agents-modal-body")).not.toContainText("Loading agent info", { timeout: 5000 });
    await page.click(".agents-tab[data-tab='prompt']");
    // The system prompt should contain the JSON format instruction
    await expect(page.locator("#agents-modal-body")).toContainText("message");
  });

  test("Tools tab lists MCP tool names", async ({ page }) => {
    await openDemo(page);
    await page.click("#view-agents-btn");
    await expect(page.locator("#agents-modal-body")).not.toContainText("Loading agent info", { timeout: 5000 });
    await page.click(".agents-tab[data-tab='tools']");
    await expect(page.locator("#agents-modal-body")).toContainText("get_tokens");
  });

  test("System Diagram tab renders the flow diagram", async ({ page }) => {
    await openDemo(page);
    await page.click("#view-agents-btn");
    await expect(page.locator("#agents-modal-body")).not.toContainText("Loading agent info", { timeout: 5000 });
    await page.click(".agents-tab[data-tab='diagram']");
    await expect(page.locator(".diagram")).toBeVisible();
    await expect(page.locator(".diagram")).toContainText("User Input");
    await expect(page.locator(".diagram")).toContainText("Live Preview");
  });

  test("modal closes via × button", async ({ page }) => {
    await openDemo(page);
    await page.click("#view-agents-btn");
    await page.click("#agents-modal-close");
    await expect(page.locator("#agents-modal")).not.toHaveClass(/open/);
  });

  test("modal closes via Escape key", async ({ page }) => {
    await openDemo(page);
    await page.click("#view-agents-btn");
    await page.keyboard.press("Escape");
    await expect(page.locator("#agents-modal")).not.toHaveClass(/open/);
  });
});

test.describe("Load JSON — drag-and-drop zone", () => {
  test("drop zone is visible inside the Load JSON modal", async ({ page }) => {
    await openDemo(page);
    await page.click("#load-json-btn");
    await expect(page.locator("#modal-drop-zone")).toBeVisible();
  });

  test("file input element is present", async ({ page }) => {
    await openDemo(page);
    await page.click("#load-json-btn");
    await expect(page.locator("#modal-file-input")).toBeAttached();
  });
});
