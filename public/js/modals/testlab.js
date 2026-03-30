import { escapeHtml } from '../utils.js';

// ── Constants ─────────────────────────────────────────────────────────────────
const DEFAULT_MODEL          = "openai/gpt-oss-20b:nitro";
const SNIPPET_LENGTH         = 80;   // short detail snippet in check results
const RESPONSE_DETAIL_LENGTH = 200;  // response preview in suite row details
const PREVIEW_TRUNCATE_LENGTH = 400; // preview HTML truncation in playground

// ── Test Suite Definition ────────────────────────────────────────────────────
// 110 tests across 5 agent types (added 10 style-guide tests in v0.5.0).
//
// Each test has:
//   id          – unique number
//   agent       – expected specialist to handle the prompt
//   tags        – array from: "routing" | "epistemic" | "grounding" | "behavioral" | "mechanistic"
//                   routing    → verifies orchestrator routing decision
//                   epistemic  → verifies a specific factual value from the design system data
//                   grounding  → verifies the agent called an MCP tool (not hallucinating)
//                   behavioral → verifies the agent behaves correctly (e.g. asks questions)
//                   mechanistic→ only structural checks (non-empty, preview present)
//   prompt      – the user message to send
//   description – one-sentence description of what is being verified
//   checks      – array of check objects:
//     { type: "agentMatch",      value: "reader" }       → routedAgent must match
//     { type: "contains",        value: "keyword" }       → message contains value (case-insensitive)
//     { type: "toolUsed",        value: "get_tokens" }    → toolCallsUsed includes the tool name
//     { type: "hasPreview" }                              → preview HTML must be non-empty
//     { type: "previewContains", value: "#2563eb" }       → preview HTML contains value (case-insensitive)
//     { type: "notEmpty" }                                → message must be non-empty
// ─────────────────────────────────────────────────────────────────────────────

export const TEST_SUITE = [

  // ── Orchestrator routing tests (15) ─────────────────────────────────────
  {
    id: 1, agent: "orchestrator", tags: ["routing"],
    prompt: "What are the primary color tokens?",
    description: "Route color token query to the reader agent",
    checks: [{ type: "agentMatch", value: "reader" }, { type: "notEmpty" }],
  },
  {
    id: 2, agent: "orchestrator", tags: ["routing"],
    prompt: "Show me all spacing tokens in the design system",
    description: "Route spacing token query to the reader agent",
    checks: [{ type: "agentMatch", value: "reader" }, { type: "notEmpty" }],
  },
  {
    id: 3, agent: "orchestrator", tags: ["routing"],
    prompt: "Build a card component",
    description: "Route build request to the builder agent",
    checks: [{ type: "agentMatch", value: "builder" }, { type: "hasPreview" }, { type: "notEmpty" }],
  },
  {
    id: 4, agent: "orchestrator", tags: ["routing"],
    prompt: "Create a brand new design system for my startup",
    description: "Route design-system creation to the generator agent",
    checks: [{ type: "agentMatch", value: "generator" }, { type: "notEmpty" }],
  },
  {
    id: 5, agent: "orchestrator", tags: ["routing"],
    prompt: "What button variants are available?",
    description: "Route component spec query to the reader agent",
    checks: [{ type: "agentMatch", value: "reader" }, { type: "notEmpty" }],
  },
  {
    id: 6, agent: "orchestrator", tags: ["routing"],
    prompt: "Render a login form using the design system",
    description: "Route render request to the builder agent",
    checks: [{ type: "agentMatch", value: "builder" }, { type: "hasPreview" }, { type: "notEmpty" }],
  },
  {
    id: 7, agent: "orchestrator", tags: ["routing"],
    prompt: "Generate a design system for a fintech app",
    description: "Route generate request to the generator agent",
    checks: [{ type: "agentMatch", value: "generator" }, { type: "notEmpty" }],
  },
  {
    id: 8, agent: "orchestrator", tags: ["routing"],
    prompt: "What accessibility rules apply to the modal component?",
    description: "Route accessibility query to the reader agent",
    checks: [{ type: "agentMatch", value: "reader" }, { type: "notEmpty" }],
  },
  {
    id: 9, agent: "orchestrator", tags: ["routing"],
    prompt: "Create a primary button with a hover state",
    description: "Route UI creation to the builder agent",
    checks: [{ type: "agentMatch", value: "builder" }, { type: "hasPreview" }, { type: "notEmpty" }],
  },
  {
    id: 10, agent: "orchestrator", tags: ["routing"],
    prompt: "List all icons in the navigation category",
    description: "Route icon list query to the reader agent",
    checks: [{ type: "agentMatch", value: "reader" }, { type: "notEmpty" }],
  },
  {
    id: 11, agent: "orchestrator", tags: ["routing"],
    prompt: "I want to create a complete design system from scratch",
    description: "Route new design system request to the generator agent",
    checks: [{ type: "agentMatch", value: "generator" }, { type: "notEmpty" }],
  },
  {
    id: 12, agent: "orchestrator", tags: ["routing"],
    prompt: "What colors does the dark theme use?",
    description: "Route dark theme query to the reader agent",
    checks: [{ type: "agentMatch", value: "reader" }, { type: "notEmpty" }],
  },
  {
    id: 13, agent: "orchestrator", tags: ["routing"],
    prompt: "Build a navigation bar component",
    description: "Route nav bar creation to the builder agent",
    checks: [{ type: "agentMatch", value: "builder" }, { type: "hasPreview" }, { type: "notEmpty" }],
  },
  {
    id: 14, agent: "orchestrator", tags: ["routing"],
    prompt: "What changed in the most recent design system changelog?",
    description: "Route changelog query to the reader agent",
    checks: [{ type: "agentMatch", value: "reader" }, { type: "notEmpty" }],
  },
  {
    id: 15, agent: "orchestrator", tags: ["routing"],
    prompt: "Generate a new brand design system with a blue primary color",
    description: "Route brand generation to the generator agent",
    checks: [{ type: "agentMatch", value: "generator" }, { type: "notEmpty" }],
  },

  // ── Reader agent tests (35) ──────────────────────────────────────────────
  {
    id: 16, agent: "reader", tags: ["epistemic", "grounding"],
    prompt: "What is the hex value of the primary 600 color token?",
    description: "Reader returns the exact hex for color.primary.600 (#2563eb)",
    checks: [
      { type: "agentMatch", value: "reader" },
      { type: "toolUsed", value: "get_tokens" },
      { type: "contains", value: "#2563eb" },
      { type: "notEmpty" },
    ],
  },
  {
    id: 17, agent: "reader", tags: ["epistemic", "grounding"],
    prompt: "What pixel value does spacing token 4 have?",
    description: "Reader returns 16px for spacing.4",
    checks: [
      { type: "agentMatch", value: "reader" },
      { type: "toolUsed", value: "get_tokens" },
      { type: "contains", value: "16px" },
      { type: "notEmpty" },
    ],
  },
  {
    id: 18, agent: "reader", tags: ["epistemic", "grounding"],
    prompt: "What is the base font size in the design system?",
    description: "Reader returns 1rem / 16px for typography.fontSize.base",
    checks: [
      { type: "agentMatch", value: "reader" },
      { type: "toolUsed", value: "get_tokens" },
      { type: "contains", value: "1rem" },
      { type: "notEmpty" },
    ],
  },
  {
    id: 19, agent: "reader", tags: ["epistemic", "grounding"],
    prompt: "What font family is used for body text?",
    description: "Reader returns Inter as the sans font family",
    checks: [
      { type: "agentMatch", value: "reader" },
      { type: "toolUsed", value: "get_tokens" },
      { type: "contains", value: "Inter" },
      { type: "notEmpty" },
    ],
  },
  {
    id: 20, agent: "reader", tags: ["epistemic", "grounding"],
    prompt: "What is the border radius value for fully rounded pill-shaped elements?",
    description: "Reader returns 9999px for borderRadius.full",
    checks: [
      { type: "agentMatch", value: "reader" },
      { type: "toolUsed", value: "get_tokens" },
      { type: "contains", value: "9999px" },
      { type: "notEmpty" },
    ],
  },
  {
    id: 21, agent: "reader", tags: ["epistemic", "grounding"],
    prompt: "What is the CSS box-shadow value of the small shadow token?",
    description: "Reader returns the shadow.sm value which starts with 0 1px 2px",
    checks: [
      { type: "agentMatch", value: "reader" },
      { type: "toolUsed", value: "get_tokens" },
      { type: "contains", value: "0 1px 2px" },
      { type: "notEmpty" },
    ],
  },
  {
    id: 22, agent: "reader", tags: ["epistemic", "grounding"],
    prompt: "What is the duration of the normal/default motion transition?",
    description: "Reader returns 200ms for motion.duration.normal",
    checks: [
      { type: "agentMatch", value: "reader" },
      { type: "toolUsed", value: "get_tokens" },
      { type: "contains", value: "200ms" },
      { type: "notEmpty" },
    ],
  },
  {
    id: 23, agent: "reader", tags: ["epistemic", "grounding"],
    prompt: "List all components in the design system",
    description: "Reader returns at least button and modal from the component list",
    checks: [
      { type: "agentMatch", value: "reader" },
      { type: "toolUsed", value: "list_components" },
      { type: "contains", value: "button" },
      { type: "contains", value: "modal" },
      { type: "notEmpty" },
    ],
  },
  {
    id: 24, agent: "reader", tags: ["epistemic", "grounding"],
    prompt: "What are all the variants for the button component?",
    description: "Reader returns ghost and destructive among the four button variants",
    checks: [
      { type: "agentMatch", value: "reader" },
      { type: "toolUsed", value: "get_component" },
      { type: "contains", value: "ghost" },
      { type: "contains", value: "destructive" },
      { type: "notEmpty" },
    ],
  },
  {
    id: 25, agent: "reader", tags: ["epistemic", "grounding"],
    prompt: "What states does the input component support?",
    description: "Reader returns focus and disabled among the input states",
    checks: [
      { type: "agentMatch", value: "reader" },
      { type: "toolUsed", value: "get_component" },
      { type: "contains", value: "focus" },
      { type: "contains", value: "disabled" },
      { type: "notEmpty" },
    ],
  },
  {
    id: 26, agent: "reader", tags: ["epistemic", "grounding"],
    prompt: "What ARIA role does the modal component use?",
    description: "Reader returns dialog as the modal ARIA role",
    checks: [
      { type: "agentMatch", value: "reader" },
      { type: "toolUsed", value: "get_component" },
      { type: "contains", value: "dialog" },
      { type: "notEmpty" },
    ],
  },
  {
    id: 27, agent: "reader", tags: ["grounding"],
    prompt: "What keyboard interactions does the select component support?",
    description: "Reader uses get_component to look up select keyboard interactions",
    checks: [
      { type: "agentMatch", value: "reader" },
      { type: "toolUsed", value: "get_component" },
      { type: "notEmpty" },
    ],
  },
  {
    id: 28, agent: "reader", tags: ["epistemic", "grounding"],
    prompt: "What shadow token does an elevated card use?",
    description: "Reader returns shadow.md as the elevated card shadow token",
    checks: [
      { type: "agentMatch", value: "reader" },
      { type: "toolUsed", value: "get_component_tokens" },
      { type: "contains", value: "shadow" },
      { type: "notEmpty" },
    ],
  },
  {
    id: 29, agent: "reader", tags: ["epistemic", "grounding"],
    prompt: "What are the badge component variants?",
    description: "Reader returns warning and error among the badge variants",
    checks: [
      { type: "agentMatch", value: "reader" },
      { type: "toolUsed", value: "get_component" },
      { type: "contains", value: "warning" },
      { type: "contains", value: "error" },
      { type: "notEmpty" },
    ],
  },
  {
    id: 30, agent: "reader", tags: ["epistemic", "grounding"],
    prompt: "List all available themes",
    description: "Reader returns both light and dark themes",
    checks: [
      { type: "agentMatch", value: "reader" },
      { type: "toolUsed", value: "list_themes" },
      { type: "contains", value: "light" },
      { type: "contains", value: "dark" },
      { type: "notEmpty" },
    ],
  },
  {
    id: 31, agent: "reader", tags: ["epistemic", "grounding"],
    prompt: "What is the background color value used in the dark theme?",
    description: "Reader returns #111827 (neutral.900) as the dark theme background",
    checks: [
      { type: "agentMatch", value: "reader" },
      { type: "toolUsed", value: "get_theme" },
      { type: "contains", value: "#111827" },
      { type: "notEmpty" },
    ],
  },
  {
    id: 32, agent: "reader", tags: ["epistemic", "grounding"],
    prompt: "What is the hex value of the semantic action.primary color token?",
    description: "Reader resolves action.primary to #2563eb (primary.600)",
    checks: [
      { type: "agentMatch", value: "reader" },
      { type: "contains", value: "#2563eb" },
      { type: "notEmpty" },
    ],
  },
  {
    id: 33, agent: "reader", tags: ["epistemic", "grounding"],
    prompt: "What icons are in the navigation category?",
    description: "Reader returns arrow icons from the navigation category",
    checks: [
      { type: "agentMatch", value: "reader" },
      { type: "toolUsed", value: "list_icons" },
      { type: "contains", value: "arrow" },
      { type: "notEmpty" },
    ],
  },
  {
    id: 34, agent: "reader", tags: ["grounding"],
    prompt: "Search for icons related to settings",
    description: "Reader uses search_icons to look up settings-related icons",
    checks: [
      { type: "agentMatch", value: "reader" },
      { type: "toolUsed", value: "search_icons" },
      { type: "notEmpty" },
    ],
  },
  {
    id: 35, agent: "reader", tags: ["epistemic", "grounding"],
    prompt: "What is the latest version in the design system changelog?",
    description: "Reader returns version 0.3.0 from the changelog",
    checks: [
      { type: "agentMatch", value: "reader" },
      { type: "toolUsed", value: "get_changelog" },
      { type: "contains", value: "0.3.0" },
      { type: "notEmpty" },
    ],
  },
  {
    id: 36, agent: "reader", tags: ["epistemic", "grounding"],
    prompt: "Which components or tokens are currently deprecated?",
    description: "Reader returns the deprecated Overlay component",
    checks: [
      { type: "agentMatch", value: "reader" },
      { type: "toolUsed", value: "get_deprecations" },
      { type: "contains", value: "Overlay" },
      { type: "notEmpty" },
    ],
  },
  {
    id: 37, agent: "reader", tags: ["epistemic", "grounding"],
    prompt: "What is the xl container max-width value in the layout system?",
    description: "Reader returns 1280px for layout.containerMaxWidth.xl",
    checks: [
      { type: "agentMatch", value: "reader" },
      { type: "contains", value: "1280px" },
      { type: "notEmpty" },
    ],
  },
  {
    id: 38, agent: "reader", tags: ["epistemic", "grounding"],
    prompt: "What is the exact hex value of the default error color token?",
    description: "Reader returns #ef4444 for color.error.default",
    checks: [
      { type: "agentMatch", value: "reader" },
      { type: "toolUsed", value: "get_tokens" },
      { type: "contains", value: "#ef4444" },
      { type: "notEmpty" },
    ],
  },
  {
    id: 39, agent: "reader", tags: ["epistemic", "grounding"],
    prompt: "What numeric value is the bold font weight token?",
    description: "Reader returns 700 for typography.fontWeight.bold",
    checks: [
      { type: "agentMatch", value: "reader" },
      { type: "toolUsed", value: "get_tokens" },
      { type: "contains", value: "700" },
      { type: "notEmpty" },
    ],
  },
  {
    id: 40, agent: "reader", tags: ["epistemic", "grounding"],
    prompt: "What is the pixel value of the base font size?",
    description: "Reader returns 16px for typography.fontSize.base",
    checks: [
      { type: "agentMatch", value: "reader" },
      { type: "toolUsed", value: "get_tokens" },
      { type: "contains", value: "16px" },
      { type: "notEmpty" },
    ],
  },
  {
    id: 41, agent: "reader", tags: ["epistemic", "grounding"],
    prompt: "What is the hex value of the default success color token?",
    description: "Reader returns #10b981 for color.success.default",
    checks: [
      { type: "agentMatch", value: "reader" },
      { type: "toolUsed", value: "get_tokens" },
      { type: "contains", value: "#10b981" },
      { type: "notEmpty" },
    ],
  },
  {
    id: 42, agent: "reader", tags: ["epistemic", "grounding"],
    prompt: "What is the numeric value of the normal line height token?",
    description: "Reader returns 1.5 for typography.lineHeight.normal",
    checks: [
      { type: "agentMatch", value: "reader" },
      { type: "toolUsed", value: "get_tokens" },
      { type: "contains", value: "1.5" },
      { type: "notEmpty" },
    ],
  },
  {
    id: 43, agent: "reader", tags: ["epistemic", "grounding"],
    prompt: "What is the pixel value of the medium border-radius token?",
    description: "Reader returns 8px for borderRadius.md",
    checks: [
      { type: "agentMatch", value: "reader" },
      { type: "toolUsed", value: "get_tokens" },
      { type: "contains", value: "8px" },
      { type: "notEmpty" },
    ],
  },
  {
    id: 44, agent: "reader", tags: ["epistemic", "grounding"],
    prompt: "What is the minimum touch target size constraint for the button component?",
    description: "Reader returns the 44px minimum touch target constraint",
    checks: [
      { type: "agentMatch", value: "reader" },
      { type: "toolUsed", value: "get_component_constraints" },
      { type: "contains", value: "44" },
      { type: "notEmpty" },
    ],
  },
  {
    id: 45, agent: "reader", tags: ["epistemic", "grounding"],
    prompt: "What are the anatomy slots of the card component?",
    description: "Reader returns header and footer as card anatomy slots",
    checks: [
      { type: "agentMatch", value: "reader" },
      { type: "toolUsed", value: "get_component_anatomy" },
      { type: "contains", value: "header" },
      { type: "contains", value: "footer" },
      { type: "notEmpty" },
    ],
  },
  {
    id: 46, agent: "reader", tags: ["epistemic", "grounding"],
    prompt: "What accessibility requirements exist for form components regarding labels?",
    description: "Reader returns label requirements from form accessibility guidance",
    checks: [
      { type: "agentMatch", value: "reader" },
      { type: "toolUsed", value: "get_accessibility_guidance" },
      { type: "contains", value: "label" },
      { type: "notEmpty" },
    ],
  },
  {
    id: 47, agent: "reader", tags: ["epistemic", "grounding"],
    prompt: "What is the grid column gutter value in the layout system?",
    description: "Reader returns 24px (spacing.6) as the layout grid gutter",
    checks: [
      { type: "agentMatch", value: "reader" },
      { type: "contains", value: "24px" },
      { type: "notEmpty" },
    ],
  },
  {
    id: 48, agent: "reader", tags: ["epistemic", "grounding"],
    prompt: "What is the hex value of the semantic text.primary color token?",
    description: "Reader returns #111827 (neutral.900) for the semantic text.primary token",
    checks: [
      { type: "agentMatch", value: "reader" },
      { type: "contains", value: "#111827" },
      { type: "notEmpty" },
    ],
  },
  {
    id: 49, agent: "reader", tags: ["epistemic", "grounding"],
    prompt: "What ARIA role does the toast/alert notification component use?",
    description: "Reader returns alert as the toast component ARIA role",
    checks: [
      { type: "agentMatch", value: "reader" },
      { type: "toolUsed", value: "get_component" },
      { type: "contains", value: "alert" },
      { type: "notEmpty" },
    ],
  },
  {
    id: 50, agent: "reader", tags: ["epistemic", "grounding"],
    prompt: "What is the hex value of the lightest neutral color (neutral.0)?",
    description: "Reader returns #ffffff for color.neutral.0",
    checks: [
      { type: "agentMatch", value: "reader" },
      { type: "toolUsed", value: "get_tokens" },
      { type: "contains", value: "#ffffff" },
      { type: "notEmpty" },
    ],
  },

  // ── Builder agent tests (30) ─────────────────────────────────────────────
  {
    id: 51, agent: "builder", tags: ["epistemic"],
    prompt: "Create a primary button component",
    description: "Builder uses the primary action color (#2563eb) in the generated preview",
    checks: [
      { type: "agentMatch", value: "builder" },
      { type: "hasPreview" },
      { type: "previewContains", value: "#2563eb" },
      { type: "notEmpty" },
    ],
  },
  {
    id: 52, agent: "builder", tags: ["mechanistic"],
    prompt: "Build a text input field",
    description: "Builder generates a text input with a live preview",
    checks: [{ type: "agentMatch", value: "builder" }, { type: "hasPreview" }, { type: "notEmpty" }],
  },
  {
    id: 53, agent: "builder", tags: ["mechanistic"],
    prompt: "Generate a card component",
    description: "Builder generates a card component with a live preview",
    checks: [{ type: "agentMatch", value: "builder" }, { type: "hasPreview" }, { type: "notEmpty" }],
  },
  {
    id: 54, agent: "builder", tags: ["mechanistic"],
    prompt: "Create a modal dialog component",
    description: "Builder generates an accessible modal dialog with a live preview",
    checks: [{ type: "agentMatch", value: "builder" }, { type: "hasPreview" }, { type: "notEmpty" }],
  },
  {
    id: 55, agent: "builder", tags: ["epistemic"],
    prompt: "Build a badge with an error/danger variant",
    description: "Builder uses the error token color (#ef4444) in the error badge preview",
    checks: [
      { type: "agentMatch", value: "builder" },
      { type: "hasPreview" },
      { type: "previewContains", value: "#ef4444" },
      { type: "notEmpty" },
    ],
  },
  {
    id: 56, agent: "builder", tags: ["mechanistic"],
    prompt: "Create a select dropdown component",
    description: "Builder generates a styled select dropdown with a live preview",
    checks: [{ type: "agentMatch", value: "builder" }, { type: "hasPreview" }, { type: "notEmpty" }],
  },
  {
    id: 57, agent: "builder", tags: ["mechanistic"],
    prompt: "Build a checkbox component",
    description: "Builder generates an accessible checkbox with a live preview",
    checks: [{ type: "agentMatch", value: "builder" }, { type: "hasPreview" }, { type: "notEmpty" }],
  },
  {
    id: 58, agent: "builder", tags: ["epistemic"],
    prompt: "Create a warning alert component",
    description: "Builder uses the warning token color (#f59e0b) in the alert preview",
    checks: [
      { type: "agentMatch", value: "builder" },
      { type: "hasPreview" },
      { type: "previewContains", value: "#f59e0b" },
      { type: "notEmpty" },
    ],
  },
  {
    id: 59, agent: "builder", tags: ["mechanistic"],
    prompt: "Generate a login form with email and password fields",
    description: "Builder generates a complete login form with a live preview",
    checks: [{ type: "agentMatch", value: "builder" }, { type: "hasPreview" }, { type: "notEmpty" }],
  },
  {
    id: 60, agent: "builder", tags: ["mechanistic"],
    prompt: "Build a navigation bar with a logo and links",
    description: "Builder generates a navigation bar component with a live preview",
    checks: [{ type: "agentMatch", value: "builder" }, { type: "hasPreview" }, { type: "notEmpty" }],
  },
  {
    id: 61, agent: "builder", tags: ["mechanistic"],
    prompt: "Create a hero section with a headline and call-to-action button",
    description: "Builder generates a hero section layout with a live preview",
    checks: [{ type: "agentMatch", value: "builder" }, { type: "hasPreview" }, { type: "notEmpty" }],
  },
  {
    id: 62, agent: "builder", tags: ["mechanistic"],
    prompt: "Build a pricing card component",
    description: "Builder generates a pricing card with a live preview",
    checks: [{ type: "agentMatch", value: "builder" }, { type: "hasPreview" }, { type: "notEmpty" }],
  },
  {
    id: 63, agent: "builder", tags: ["mechanistic"],
    prompt: "Create a secondary button",
    description: "Builder generates a secondary variant button with a live preview",
    checks: [{ type: "agentMatch", value: "builder" }, { type: "hasPreview" }, { type: "notEmpty" }],
  },
  {
    id: 64, agent: "builder", tags: ["epistemic"],
    prompt: "Build a disabled text input field",
    description: "Builder uses the disabled text color token (#9ca3af) in the preview",
    checks: [
      { type: "agentMatch", value: "builder" },
      { type: "hasPreview" },
      { type: "previewContains", value: "#9ca3af" },
      { type: "notEmpty" },
    ],
  },
  {
    id: 65, agent: "builder", tags: ["mechanistic"],
    prompt: "Create a button group with three buttons",
    description: "Builder generates a grouped button layout with a live preview",
    checks: [{ type: "agentMatch", value: "builder" }, { type: "hasPreview" }, { type: "notEmpty" }],
  },
  {
    id: 66, agent: "builder", tags: ["mechanistic"],
    prompt: "Create an icon button with a settings icon",
    description: "Builder generates an icon button component with a live preview",
    checks: [{ type: "agentMatch", value: "builder" }, { type: "hasPreview" }, { type: "notEmpty" }],
  },
  {
    id: 67, agent: "builder", tags: ["mechanistic"],
    prompt: "Generate a toast notification message",
    description: "Builder generates a toast notification component with a live preview",
    checks: [{ type: "agentMatch", value: "builder" }, { type: "hasPreview" }, { type: "notEmpty" }],
  },
  {
    id: 68, agent: "builder", tags: ["mechanistic"],
    prompt: "Build a registration form with first name, last name, and email",
    description: "Builder generates a multi-field registration form with a live preview",
    checks: [{ type: "agentMatch", value: "builder" }, { type: "hasPreview" }, { type: "notEmpty" }],
  },
  {
    id: 69, agent: "builder", tags: ["mechanistic"],
    prompt: "Create a 3-column card grid layout",
    description: "Builder generates a card grid layout with a live preview",
    checks: [{ type: "agentMatch", value: "builder" }, { type: "hasPreview" }, { type: "notEmpty" }],
  },
  {
    id: 70, agent: "builder", tags: ["epistemic"],
    prompt: "Build a success alert with a checkmark icon",
    description: "Builder uses the success token color (#10b981) in the alert preview",
    checks: [
      { type: "agentMatch", value: "builder" },
      { type: "hasPreview" },
      { type: "previewContains", value: "#10b981" },
      { type: "notEmpty" },
    ],
  },
  {
    id: 71, agent: "builder", tags: ["mechanistic"],
    prompt: "Create a search input with a search button",
    description: "Builder generates a search bar component with a live preview",
    checks: [{ type: "agentMatch", value: "builder" }, { type: "hasPreview" }, { type: "notEmpty" }],
  },
  {
    id: 72, agent: "builder", tags: ["mechanistic"],
    prompt: "Generate a tab bar component with three tabs",
    description: "Builder generates a tab bar component with a live preview",
    checks: [{ type: "agentMatch", value: "builder" }, { type: "hasPreview" }, { type: "notEmpty" }],
  },
  {
    id: 73, agent: "builder", tags: ["mechanistic"],
    prompt: "Build a data table with column headers",
    description: "Builder generates a styled data table with a live preview",
    checks: [{ type: "agentMatch", value: "builder" }, { type: "hasPreview" }, { type: "notEmpty" }],
  },
  {
    id: 74, agent: "builder", tags: ["mechanistic"],
    prompt: "Create a dropdown menu component",
    description: "Builder generates a dropdown menu with a live preview",
    checks: [{ type: "agentMatch", value: "builder" }, { type: "hasPreview" }, { type: "notEmpty" }],
  },
  {
    id: 75, agent: "builder", tags: ["mechanistic"],
    prompt: "Build a loading spinner component",
    description: "Builder generates an animated loading spinner with a live preview",
    checks: [{ type: "agentMatch", value: "builder" }, { type: "hasPreview" }, { type: "notEmpty" }],
  },
  {
    id: 76, agent: "builder", tags: ["mechanistic"],
    prompt: "Generate a breadcrumb navigation component",
    description: "Builder generates a breadcrumb with proper separators in a live preview",
    checks: [{ type: "agentMatch", value: "builder" }, { type: "hasPreview" }, { type: "notEmpty" }],
  },
  {
    id: 77, agent: "builder", tags: ["mechanistic"],
    prompt: "Create a stepper component with three steps",
    description: "Builder generates a step wizard/stepper component with a live preview",
    checks: [{ type: "agentMatch", value: "builder" }, { type: "hasPreview" }, { type: "notEmpty" }],
  },
  {
    id: 78, agent: "builder", tags: ["mechanistic"],
    prompt: "Build a progress bar at 60% completion",
    description: "Builder generates a progress bar component with a live preview",
    checks: [{ type: "agentMatch", value: "builder" }, { type: "hasPreview" }, { type: "notEmpty" }],
  },
  {
    id: 79, agent: "builder", tags: ["epistemic"],
    prompt: "Create a profile avatar component using the primary brand color",
    description: "Builder uses the primary action color (#2563eb) in the avatar preview",
    checks: [
      { type: "agentMatch", value: "builder" },
      { type: "hasPreview" },
      { type: "previewContains", value: "#2563eb" },
      { type: "notEmpty" },
    ],
  },
  {
    id: 80, agent: "builder", tags: ["epistemic"],
    prompt: "Generate an error state for a form input with a validation message",
    description: "Builder uses the error token color (#ef4444) in the error input preview",
    checks: [
      { type: "agentMatch", value: "builder" },
      { type: "hasPreview" },
      { type: "previewContains", value: "#ef4444" },
      { type: "notEmpty" },
    ],
  },

  // ── Generator agent tests (20) ───────────────────────────────────────────
  {
    id: 81, agent: "generator", tags: ["behavioral"],
    prompt: "I want to create a brand-new design system for my tech startup",
    description: "Generator asks a clarifying question before proceeding",
    checks: [{ type: "agentMatch", value: "generator" }, { type: "contains", value: "?" }, { type: "notEmpty" }],
  },
  {
    id: 82, agent: "generator", tags: ["behavioral"],
    prompt: "Generate a complete design system for a healthcare application",
    description: "Generator asks for more brand information before generating",
    checks: [{ type: "agentMatch", value: "generator" }, { type: "contains", value: "?" }, { type: "notEmpty" }],
  },
  {
    id: 83, agent: "generator", tags: ["behavioral"],
    prompt: "Create a dark-first design system for a developer tool",
    description: "Generator asks a clarifying question about brand or aesthetic direction",
    checks: [{ type: "agentMatch", value: "generator" }, { type: "contains", value: "?" }, { type: "notEmpty" }],
  },
  {
    id: 84, agent: "generator", tags: ["behavioral"],
    prompt: "I need a design system for an e-commerce platform",
    description: "Generator asks a clarifying question before gathering brand direction",
    checks: [{ type: "agentMatch", value: "generator" }, { type: "contains", value: "?" }, { type: "notEmpty" }],
  },
  {
    id: 85, agent: "generator", tags: ["behavioral"],
    prompt: "Build me a design system with purple as the primary brand color",
    description: "Generator acknowledges the color and asks at least one follow-up question",
    checks: [{ type: "agentMatch", value: "generator" }, { type: "contains", value: "?" }, { type: "notEmpty" }],
  },
  {
    id: 86, agent: "generator", tags: ["behavioral"],
    prompt: "Create a minimal, clean design system for a SaaS dashboard",
    description: "Generator asks a clarifying question about typography or brand details",
    checks: [{ type: "agentMatch", value: "generator" }, { type: "contains", value: "?" }, { type: "notEmpty" }],
  },
  {
    id: 87, agent: "generator", tags: ["behavioral"],
    prompt: "Generate a design system for a fintech banking brand",
    description: "Generator asks for brand color or tone information before generating",
    checks: [{ type: "agentMatch", value: "generator" }, { type: "contains", value: "?" }, { type: "notEmpty" }],
  },
  {
    id: 88, agent: "generator", tags: ["behavioral"],
    prompt: "I want to create a design system for a social media platform",
    description: "Generator asks a clarifying question to gather more brand context",
    checks: [{ type: "agentMatch", value: "generator" }, { type: "contains", value: "?" }, { type: "notEmpty" }],
  },
  {
    id: 89, agent: "generator", tags: ["behavioral"],
    prompt: "Start building a design system for a B2B project management tool",
    description: "Generator asks about brand tone or product aesthetic before proceeding",
    checks: [{ type: "agentMatch", value: "generator" }, { type: "contains", value: "?" }, { type: "notEmpty" }],
  },
  {
    id: 90, agent: "generator", tags: ["behavioral"],
    prompt: "Create a children's educational app design system",
    description: "Generator asks for color preferences or brand details to gather direction",
    checks: [{ type: "agentMatch", value: "generator" }, { type: "contains", value: "?" }, { type: "notEmpty" }],
  },
  {
    id: 91, agent: "generator", tags: ["behavioral"],
    prompt: "Generate a luxury brand design system",
    description: "Generator asks a clarifying question about the luxury brand direction",
    checks: [{ type: "agentMatch", value: "generator" }, { type: "contains", value: "?" }, { type: "notEmpty" }],
  },
  {
    id: 92, agent: "generator", tags: ["behavioral"],
    prompt: "Build a design system for a news media website",
    description: "Generator asks for brand or typographic direction before generating",
    checks: [{ type: "agentMatch", value: "generator" }, { type: "contains", value: "?" }, { type: "notEmpty" }],
  },
  {
    id: 93, agent: "generator", tags: ["behavioral"],
    prompt: "I need a complete new design system from scratch",
    description: "Generator asks a question to start gathering brand information",
    checks: [{ type: "agentMatch", value: "generator" }, { type: "contains", value: "?" }, { type: "notEmpty" }],
  },
  {
    id: 94, agent: "generator", tags: ["behavioral"],
    prompt: "Create a gaming platform design system",
    description: "Generator asks about brand aesthetic or color direction for the game platform",
    checks: [{ type: "agentMatch", value: "generator" }, { type: "contains", value: "?" }, { type: "notEmpty" }],
  },
  {
    id: 95, agent: "generator", tags: ["behavioral"],
    prompt: "Generate a design system for a food delivery mobile app",
    description: "Generator asks for brand info or color preferences before proceeding",
    checks: [{ type: "agentMatch", value: "generator" }, { type: "contains", value: "?" }, { type: "notEmpty" }],
  },
  {
    id: 96, agent: "generator", tags: ["behavioral"],
    prompt: "Create a B2B enterprise design system with a professional tone",
    description: "Generator asks a clarifying question about the brand or color palette",
    checks: [{ type: "agentMatch", value: "generator" }, { type: "contains", value: "?" }, { type: "notEmpty" }],
  },
  {
    id: 97, agent: "generator", tags: ["behavioral"],
    prompt: "Build a nature-inspired design system with earthy green tones",
    description: "Generator acknowledges the direction and asks one follow-up question",
    checks: [{ type: "agentMatch", value: "generator" }, { type: "contains", value: "?" }, { type: "notEmpty" }],
  },
  {
    id: 98, agent: "generator", tags: ["behavioral"],
    prompt: "Generate a design system for a travel booking platform",
    description: "Generator asks for more brand direction before generating",
    checks: [{ type: "agentMatch", value: "generator" }, { type: "contains", value: "?" }, { type: "notEmpty" }],
  },
  {
    id: 99, agent: "generator", tags: ["behavioral"],
    prompt: "I want to generate a design system with a vibrant, energetic feel",
    description: "Generator asks a clarifying question about brand name or color preferences",
    checks: [{ type: "agentMatch", value: "generator" }, { type: "contains", value: "?" }, { type: "notEmpty" }],
  },
  {
    id: 100, agent: "generator", tags: ["behavioral"],
    prompt: "Create a design system for a mental wellness and meditation app",
    description: "Generator asks about calm brand direction before proceeding",
    checks: [{ type: "agentMatch", value: "generator" }, { type: "contains", value: "?" }, { type: "notEmpty" }],
  },

  // ── Style Guide tests (10): 2 routing + 8 direct ───────────────────────
  {
    id: 101, agent: "orchestrator", tags: ["routing"],
    prompt: "What are the design principles of this design system?",
    description: "Route design principles query to the style-guide agent",
    checks: [{ type: "agentMatch", value: "style-guide" }, { type: "notEmpty" }],
  },
  {
    id: 102, agent: "orchestrator", tags: ["routing"],
    prompt: "Explain the typography guidelines",
    description: "Route typography guidelines query to the style-guide agent",
    checks: [{ type: "agentMatch", value: "style-guide" }, { type: "notEmpty" }],
  },
  {
    id: 103, agent: "style-guide", tags: ["grounding"],
    prompt: "What does the style guide say about color usage?",
    description: "Style guide agent uses get_style_guide to explain color usage rules",
    checks: [
      { type: "agentMatch", value: "style-guide" },
      { type: "toolUsed",   value: "get_style_guide" },
      { type: "notEmpty" },
    ],
  },
  {
    id: 104, agent: "style-guide", tags: ["grounding"],
    prompt: "Does the primary blue (#2563eb) have sufficient contrast on a white background?",
    description: "Style guide agent uses check_contrast to evaluate the contrast ratio",
    checks: [
      { type: "agentMatch", value: "style-guide" },
      { type: "toolUsed",   value: "check_contrast" },
      { type: "notEmpty" },
    ],
  },
  {
    id: 105, agent: "style-guide", tags: ["epistemic", "grounding"],
    prompt: "What is the semantic intent of the primary color in this design system?",
    description: "Style guide agent grounds its answer using get_token or get_style_guide",
    checks: [
      { type: "agentMatch", value: "style-guide" },
      { type: "notEmpty" },
    ],
  },
  {
    id: 106, agent: "style-guide", tags: ["grounding"],
    prompt: "What spacing principles guide the design system?",
    description: "Style guide agent uses get_style_guide to explain spatial consistency principles",
    checks: [
      { type: "agentMatch", value: "style-guide" },
      { type: "toolUsed",   value: "get_style_guide" },
      { type: "notEmpty" },
    ],
  },
  {
    id: 107, agent: "style-guide", tags: ["grounding"],
    prompt: "What color tokens are available for text and backgrounds?",
    description: "Style guide agent uses get_tokens to look up text and surface color tokens",
    checks: [
      { type: "agentMatch", value: "style-guide" },
      { type: "toolUsed",   value: "get_tokens" },
      { type: "notEmpty" },
    ],
  },
  {
    id: 108, agent: "style-guide", tags: ["behavioral"],
    prompt: "How should I use motion in this design system?",
    description: "Style guide agent explains motion and animation guidance",
    checks: [
      { type: "agentMatch", value: "style-guide" },
      { type: "notEmpty" },
    ],
  },
  {
    id: 109, agent: "style-guide", tags: ["epistemic", "grounding"],
    prompt: "What is the value of the primary 600 color token according to the style guide?",
    description: "Style guide agent uses get_token to retrieve color.primary.600 (#2563eb)",
    checks: [
      { type: "agentMatch", value: "style-guide" },
      { type: "toolUsed",   value: "get_token" },
      { type: "contains",   value: "#2563eb" },
      { type: "notEmpty" },
    ],
  },
  {
    id: 110, agent: "style-guide", tags: ["grounding"],
    prompt: "What composition patterns does the design system recommend?",
    description: "Style guide agent uses get_style_guide to describe layout and composition patterns",
    checks: [
      { type: "agentMatch", value: "style-guide" },
      { type: "toolUsed",   value: "get_style_guide" },
      { type: "notEmpty" },
    ],
  },
];

// ── Check evaluation ─────────────────────────────────────────────────────────
function evaluateCheck(check, result) {
  switch (check.type) {
    case "agentMatch":
      return {
        label: `Routed to "${check.value}"`,
        passed: result.routedAgent === check.value,
        detail: `Got: ${result.routedAgent ?? "unknown"}`,
      };
    case "contains":
      return {
        label: `Response contains "${check.value}"`,
        passed: typeof result.message === "string" && result.message.toLowerCase().includes(check.value.toLowerCase()),
        detail: result.message ? result.message.slice(0, SNIPPET_LENGTH) + "…" : "no message",
      };
    case "toolUsed":
      return {
        label: `Called MCP tool "${check.value}"`,
        passed: Array.isArray(result.toolCallsUsed) && result.toolCallsUsed.includes(check.value),
        detail: result.toolCallsUsed?.join(", ") || "no tools called",
      };
    case "hasPreview":
      return {
        label: "Response includes a preview",
        passed: typeof result.preview === "string" && result.preview.trim().length > 0,
        detail: result.preview ? "preview present" : "no preview",
      };
    case "noPreview":
      return {
        label: "Response must not include a preview",
        passed: !result.preview || result.preview.trim().length === 0,
        detail: result.preview ? "preview unexpectedly present" : "no preview (correct)",
      };
    case "previewContains":
      return {
        label: `Preview HTML contains "${check.value}"`,
        passed: typeof result.preview === "string" && result.preview.toLowerCase().includes(check.value.toLowerCase()),
        detail: result.preview ? (result.preview.toLowerCase().includes(check.value.toLowerCase()) ? "found in preview" : "not found in preview") : "no preview",
      };
    case "notEmpty":
      return {
        label: "Response message is not empty",
        passed: typeof result.message === "string" && result.message.trim().length > 0,
        detail: result.message ? "non-empty" : "empty",
      };
    default:
      return { label: check.type, passed: false, detail: "unknown check type" };
  }
}

// ── SSE stream parser ────────────────────────────────────────────────────────
async function parseSSEStream(res) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";
    for (const part of parts) {
      if (!part.startsWith("data: ")) continue;
      let event;
      try { event = JSON.parse(part.slice(6)); } catch (e) { console.debug("[testlab] SSE parse error", e); continue; }
      if (event.type === "done") {
        return {
          message: event.message ?? "",
          preview: event.preview ?? null,
          routedAgent: event.routedAgent ?? null,
          toolCallsUsed: event.toolCallsUsed ?? [],
        };
      }
      if (event.type === "error") {
        throw new Error(event.error || "Unknown error");
      }
    }
  }
  throw new Error("Stream ended without a done event");
}

// ── LLM-as-judge quality score ───────────────────────────────────────────────
// Calls POST /api/eval/judge with the prompt and the agent's response text.
// Returns { score: 1-10, reasoning: string } or null on failure.
export async function judgeTest(prompt, response, model) {
  try {
    const res = await fetch("/api/eval/judge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, response, model }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ── Run a single test ────────────────────────────────────────────────────────
export async function runTest(test, model) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: test.prompt }],
      model,
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `HTTP ${res.status}`);
  }

  const result = await parseSSEStream(res);

  const checkResults = test.checks.map(c => evaluateCheck(c, result));
  const passed = checkResults.every(c => c.passed);

  return { testId: test.id, passed, result, checkResults };
}

// ── UI ────────────────────────────────────────────────────────────────────────
const AGENT_COLORS = {
  orchestrator:  "purple",
  reader:        "accent",
  builder:       "orange",
  generator:     "green",
  "style-guide": "red",
};

const AGENT_LABELS = {
  orchestrator:  "Orchestrator",
  reader:        "Reader",
  builder:       "Builder",
  generator:     "Generator",
  "style-guide": "Style Guide",
};

const TAG_STYLES = {
  routing:     { cls: "tl-tag-routing",     label: "routing"     },
  epistemic:   { cls: "tl-tag-epistemic",   label: "epistemic"   },
  grounding:   { cls: "tl-tag-grounding",   label: "grounding"   },
  behavioral:  { cls: "tl-tag-behavioral",  label: "behavioral"  },
  mechanistic: { cls: "tl-tag-mechanistic", label: "mechanistic" },
};

function judgeScoreBadge(score) {
  const cls = score >= 8 ? "tl-judge-high" : score >= 5 ? "tl-judge-mid" : "tl-judge-low";
  return `<span class="tl-judge-badge ${cls}">Quality ${score}/10</span>`;
}

function agentBadge(agent) {
  const color = AGENT_COLORS[agent] ?? "accent";
  return `<span class="tl-agent-badge tl-badge-${color}">${escapeHtml(AGENT_LABELS[agent] ?? agent)}</span>`;
}

function tagBadges(tags) {
  if (!tags || tags.length === 0) return "";
  return tags.map(tag => {
    const s = TAG_STYLES[tag] ?? { cls: "tl-tag-mechanistic", label: tag };
    return `<span class="tl-tag ${s.cls}">${s.label}</span>`;
  }).join("");
}

function statusBadge(status) {
  const map = {
    idle:    ["tl-status-idle",    "—"],
    running: ["tl-status-running", "⏳"],
    pass:    ["tl-status-pass",    "✓"],
    fail:    ["tl-status-fail",    "✗"],
    error:   ["tl-status-error",   "!"],
  };
  const [cls, icon] = map[status] ?? map.idle;
  return `<span class="tl-status-chip ${cls}">${icon}</span>`;
}

