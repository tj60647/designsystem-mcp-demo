/**
 * Button tests for the Design System AI demo UI.
 *
 * All /api/chat calls are intercepted so tests never hit a real LLM.
 * Other API endpoints (/api/schema, /api/data, /api/data/reset, /prompt-templates)
 * are served by the real dev server that starts via playwright.config.ts webServer.
 */
import { test, expect, Page } from "@playwright/test";

// ── helpers ──────────────────────────────────────────────────────────────────

/** Intercept /api/chat and return a controlled assistant response. */
async function mockChat(page: Page, responseText: string) {
  await page.route("/api/chat", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        response: responseText,
        model: "test-model",
        toolCallsUsed: ["get_tokens"],
        generatedDesignSystem: null,
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
    await mockChat(page, "Here are the primary color tokens from the design system.");
    await openDemo(page);

    await sendMessage(page, "What are the primary colors?");

    // The assistant message should appear in the chat
    const msgs = page.locator(".msg.assistant .msg-bubble");
    await expect(msgs.last()).toContainText("primary color tokens");
  });

  test("shows loading indicator while waiting for response", async ({ page }) => {
    // Delay the route so we can check the loading state
    await page.route("/api/chat", async (route) => {
      await new Promise((r) => setTimeout(r, 300));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          response: "Done.",
          model: "test-model",
          toolCallsUsed: [],
          generatedDesignSystem: null,
        }),
      });
    });
    await openDemo(page);

    await page.fill("#user-input", "hello");
    await page.click("#send-btn");

    // Loading dots should appear briefly
    await expect(page.locator(".loading-bubble")).toBeVisible();
    // Then disappear once the response arrives
    await expect(page.locator(".loading-bubble")).not.toBeVisible({ timeout: 5000 });
  });

  test("disables send button while request is in flight", async ({ page }) => {
    await page.route("/api/chat", async (route) => {
      await new Promise((r) => setTimeout(r, 300));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ response: "OK", model: "m", toolCallsUsed: [], generatedDesignSystem: null }),
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
  const HTML_RESPONSE = `Here is a primary button using your design tokens.

\`\`\`html
<button style="background:#2f81f7;color:#fff;padding:8px 16px;border:none;border-radius:4px;cursor:pointer;">Primary</button>
\`\`\``;

  test("renders HTML block in the live preview iframe", async ({ page }) => {
    await mockChat(page, HTML_RESPONSE);
    await openDemo(page);

    await sendMessage(page, "Show me a primary button");

    // Preview iframe should appear
    await expect(page.locator(".preview-iframe")).toBeVisible({ timeout: 5000 });
  });

  test("shows preview indicator pill in chat bubble, not raw code", async ({ page }) => {
    await mockChat(page, HTML_RESPONSE);
    await openDemo(page);

    await sendMessage(page, "Show me a primary button");

    const lastBubble = page.locator(".msg.assistant .msg-bubble").last();
    // The prose part should be present
    await expect(lastBubble).toContainText("primary button");
    // The raw code block must NOT appear in the chat bubble
    await expect(lastBubble).not.toContainText("```html");
    // The preview indicator pill should be visible
    await expect(lastBubble.locator(".preview-indicator")).toBeVisible();
  });

  test("shows 'Show Code' toggle button when HTML was generated", async ({ page }) => {
    await mockChat(page, HTML_RESPONSE);
    await openDemo(page);

    await sendMessage(page, "Build a button");

    await expect(page.locator("#code-toggle-btn")).toBeVisible({ timeout: 5000 });
  });

  test("shows empty-state placeholder when response has no HTML", async ({ page }) => {
    await mockChat(page, "The primary color token is color.primary.500.");
    await openDemo(page);

    await sendMessage(page, "What is the primary color?");

    await expect(page.locator(".preview-empty")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("#code-toggle-btn")).not.toBeVisible();
  });
});

test.describe("Show Code / Show Preview toggle button", () => {
  const HTML_RESPONSE = `Here is a card component.\n\`\`\`html\n<div style="padding:16px;border:1px solid #ddd;">Card</div>\n\`\`\``;

  test("toggles from preview to code view and back", async ({ page }) => {
    await mockChat(page, HTML_RESPONSE);
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
    // Schema content should load
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
    // Modal should stay open since the input is empty
    await expect(page.locator("#load-json-modal")).toHaveClass(/open/);
  });
});

test.describe("Reset button", () => {
  test("shows confirmation dialog", async ({ page }) => {
    await openDemo(page);
    let dialogMessage = "";
    page.once("dialog", (dialog) => {
      dialogMessage = dialog.message();
      dialog.dismiss(); // cancel
    });
    await page.click("#reset-btn");
    expect(dialogMessage).toContain("Reset");
  });

  test("resets data and shows confirmation message when confirmed", async ({ page }) => {
    await openDemo(page);
    page.once("dialog", (dialog) => dialog.accept()); // confirm
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
    // Wait for initial load
    await expect(page.locator("#explorer-body")).not.toContainText("Loading", { timeout: 5000 });
    await page.click("#explorer-refresh-btn");
    // After refresh the explorer body should re-populate
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
