import { escapeHtml } from '../utils.js';

// ── Constants ─────────────────────────────────────────────────────────────────
const DEFAULT_MODEL          = "openai/gpt-oss-20b:nitro";
const SNIPPET_LENGTH         = 80;   // short detail snippet in check results
const RESPONSE_DETAIL_LENGTH = 200;  // response preview in suite row details
const PREVIEW_TRUNCATE_LENGTH = 400; // preview HTML truncation in playground

// ── Test Suite Definition ────────────────────────────────────────────────────
// 100 tests across 4 agent types.
// Each test has:
//   id          – unique number
//   agent       – expected agent to handle the prompt
//   prompt      – the user message to send
//   description – one-sentence description of what is being verified
//   checks      – array of { type, value? } objects:
//                   { type:'agentMatch', value:'reader' }  → routedAgent must match
//                   { type:'contains', value:'keyword' }   → message contains keyword (case-insensitive)
//                   { type:'hasPreview' }                  → preview HTML must be non-empty
//                   { type:'notEmpty' }                    → message must be non-empty
// ────────────────────────────────────────────────────────────────────────────

export const TEST_SUITE = [

  // ── Orchestrator routing tests (15) ─────────────────────────────────────
  {
    id: 1, agent: "orchestrator",
    prompt: "What are the primary color tokens?",
    description: "Route color token query to the reader agent",
    checks: [{ type: "agentMatch", value: "reader" }, { type: "notEmpty" }],
  },
  {
    id: 2, agent: "orchestrator",
    prompt: "Show me all spacing tokens in the design system",
    description: "Route spacing token query to the reader agent",
    checks: [{ type: "agentMatch", value: "reader" }, { type: "notEmpty" }],
  },
  {
    id: 3, agent: "orchestrator",
    prompt: "Build a card component",
    description: "Route build request to the builder agent",
    checks: [{ type: "agentMatch", value: "builder" }, { type: "hasPreview" }],
  },
  {
    id: 4, agent: "orchestrator",
    prompt: "Create a brand new design system for my startup",
    description: "Route design-system creation to the generator agent",
    checks: [{ type: "agentMatch", value: "generator" }, { type: "notEmpty" }],
  },
  {
    id: 5, agent: "orchestrator",
    prompt: "What button variants are available?",
    description: "Route component spec query to the reader agent",
    checks: [{ type: "agentMatch", value: "reader" }, { type: "notEmpty" }],
  },
  {
    id: 6, agent: "orchestrator",
    prompt: "Render a login form using the design system",
    description: "Route render request to the builder agent",
    checks: [{ type: "agentMatch", value: "builder" }, { type: "hasPreview" }],
  },
  {
    id: 7, agent: "orchestrator",
    prompt: "Generate a design system for a fintech app",
    description: "Route generate request to the generator agent",
    checks: [{ type: "agentMatch", value: "generator" }, { type: "notEmpty" }],
  },
  {
    id: 8, agent: "orchestrator",
    prompt: "What accessibility rules apply to the modal component?",
    description: "Route accessibility query to the reader agent",
    checks: [{ type: "agentMatch", value: "reader" }, { type: "notEmpty" }],
  },
  {
    id: 9, agent: "orchestrator",
    prompt: "Create a primary button with a hover state",
    description: "Route UI creation to the builder agent",
    checks: [{ type: "agentMatch", value: "builder" }, { type: "hasPreview" }],
  },
  {
    id: 10, agent: "orchestrator",
    prompt: "List all icons in the navigation category",
    description: "Route icon list query to the reader agent",
    checks: [{ type: "agentMatch", value: "reader" }, { type: "notEmpty" }],
  },
  {
    id: 11, agent: "orchestrator",
    prompt: "I want to create a complete design system from scratch",
    description: "Route new design system request to the generator agent",
    checks: [{ type: "agentMatch", value: "generator" }, { type: "notEmpty" }],
  },
  {
    id: 12, agent: "orchestrator",
    prompt: "What colors does the dark theme use?",
    description: "Route dark theme query to the reader agent",
    checks: [{ type: "agentMatch", value: "reader" }, { type: "notEmpty" }],
  },
  {
    id: 13, agent: "orchestrator",
    prompt: "Build a navigation bar component",
    description: "Route nav bar creation to the builder agent",
    checks: [{ type: "agentMatch", value: "builder" }, { type: "hasPreview" }],
  },
  {
    id: 14, agent: "orchestrator",
    prompt: "What changed in the most recent design system changelog?",
    description: "Route changelog query to the reader agent",
    checks: [{ type: "agentMatch", value: "reader" }, { type: "notEmpty" }],
  },
  {
    id: 15, agent: "orchestrator",
    prompt: "Generate a new brand design system with a blue primary color",
    description: "Route brand generation to the generator agent",
    checks: [{ type: "agentMatch", value: "generator" }, { type: "notEmpty" }],
  },

  // ── Reader agent tests (35) ──────────────────────────────────────────────
  {
    id: 16, agent: "reader",
    prompt: "What are the primary color tokens in the design system?",
    description: "Reader returns primary color palette values",
    checks: [{ type: "agentMatch", value: "reader" }, { type: "contains", value: "primary" }, { type: "notEmpty" }],
  },
  {
    id: 17, agent: "reader",
    prompt: "Show me all spacing tokens",
    description: "Reader returns the spacing scale",
    checks: [{ type: "agentMatch", value: "reader" }, { type: "contains", value: "spacing" }, { type: "notEmpty" }],
  },
  {
    id: 18, agent: "reader",
    prompt: "What typography sizes are available?",
    description: "Reader returns font size tokens",
    checks: [{ type: "agentMatch", value: "reader" }, { type: "notEmpty" }],
  },
  {
    id: 19, agent: "reader",
    prompt: "What is the font family used for body text?",
    description: "Reader returns the body font family token",
    checks: [{ type: "agentMatch", value: "reader" }, { type: "notEmpty" }],
  },
  {
    id: 20, agent: "reader",
    prompt: "What border radius values are defined in the design system?",
    description: "Reader returns border radius tokens",
    checks: [{ type: "agentMatch", value: "reader" }, { type: "notEmpty" }],
  },
  {
    id: 21, agent: "reader",
    prompt: "What shadow tokens are available?",
    description: "Reader returns shadow token definitions",
    checks: [{ type: "agentMatch", value: "reader" }, { type: "notEmpty" }],
  },
  {
    id: 22, agent: "reader",
    prompt: "What animation/motion tokens are defined?",
    description: "Reader returns duration and easing tokens",
    checks: [{ type: "agentMatch", value: "reader" }, { type: "notEmpty" }],
  },
  {
    id: 23, agent: "reader",
    prompt: "List all components in the design system",
    description: "Reader returns a list of available components",
    checks: [{ type: "agentMatch", value: "reader" }, { type: "notEmpty" }],
  },
  {
    id: 24, agent: "reader",
    prompt: "What are the variants for the button component?",
    description: "Reader returns button variant options",
    checks: [{ type: "agentMatch", value: "reader" }, { type: "notEmpty" }],
  },
  {
    id: 25, agent: "reader",
    prompt: "What states does the input component support?",
    description: "Reader returns input states (focus, error, disabled, etc.)",
    checks: [{ type: "agentMatch", value: "reader" }, { type: "notEmpty" }],
  },
  {
    id: 26, agent: "reader",
    prompt: "What ARIA role does the modal component use?",
    description: "Reader returns the modal ARIA role",
    checks: [{ type: "agentMatch", value: "reader" }, { type: "contains", value: "dialog" }, { type: "notEmpty" }],
  },
  {
    id: 27, agent: "reader",
    prompt: "What keyboard interactions does the select component support?",
    description: "Reader returns keyboard interaction patterns for select",
    checks: [{ type: "agentMatch", value: "reader" }, { type: "notEmpty" }],
  },
  {
    id: 28, agent: "reader",
    prompt: "What tokens are used by the card component?",
    description: "Reader returns token references for the card component",
    checks: [{ type: "agentMatch", value: "reader" }, { type: "notEmpty" }],
  },
  {
    id: 29, agent: "reader",
    prompt: "What are the badge component variants?",
    description: "Reader returns badge variant options",
    checks: [{ type: "agentMatch", value: "reader" }, { type: "notEmpty" }],
  },
  {
    id: 30, agent: "reader",
    prompt: "List all available themes",
    description: "Reader returns the list of themes (light, dark, etc.)",
    checks: [{ type: "agentMatch", value: "reader" }, { type: "notEmpty" }],
  },
  {
    id: 31, agent: "reader",
    prompt: "What background color does the dark theme use?",
    description: "Reader returns the dark theme background color value",
    checks: [{ type: "agentMatch", value: "reader" }, { type: "notEmpty" }],
  },
  {
    id: 32, agent: "reader",
    prompt: "What is the value of the semantic action.primary token?",
    description: "Reader resolves a semantic token to its value",
    checks: [{ type: "agentMatch", value: "reader" }, { type: "notEmpty" }],
  },
  {
    id: 33, agent: "reader",
    prompt: "What icons are in the navigation category?",
    description: "Reader returns navigation icons",
    checks: [{ type: "agentMatch", value: "reader" }, { type: "notEmpty" }],
  },
  {
    id: 34, agent: "reader",
    prompt: "Search for icons related to settings",
    description: "Reader returns settings-related icons via icon search",
    checks: [{ type: "agentMatch", value: "reader" }, { type: "notEmpty" }],
  },
  {
    id: 35, agent: "reader",
    prompt: "What has changed in the latest design system changelog?",
    description: "Reader returns recent changelog entries",
    checks: [{ type: "agentMatch", value: "reader" }, { type: "notEmpty" }],
  },
  {
    id: 36, agent: "reader",
    prompt: "Which components are currently deprecated?",
    description: "Reader returns deprecation notices",
    checks: [{ type: "agentMatch", value: "reader" }, { type: "notEmpty" }],
  },
  {
    id: 37, agent: "reader",
    prompt: "What is the maximum content width in the layout system?",
    description: "Reader returns layout maxWidth tokens",
    checks: [{ type: "agentMatch", value: "reader" }, { type: "notEmpty" }],
  },
  {
    id: 38, agent: "reader",
    prompt: "What is the error color in the design system?",
    description: "Reader returns the error color token value",
    checks: [{ type: "agentMatch", value: "reader" }, { type: "notEmpty" }],
  },
  {
    id: 39, agent: "reader",
    prompt: "What font weight is typically used for headings?",
    description: "Reader returns heading font weight tokens",
    checks: [{ type: "agentMatch", value: "reader" }, { type: "notEmpty" }],
  },
  {
    id: 40, agent: "reader",
    prompt: "What is the base font size?",
    description: "Reader returns the base font size token",
    checks: [{ type: "agentMatch", value: "reader" }, { type: "notEmpty" }],
  },
  {
    id: 41, agent: "reader",
    prompt: "What are the success, warning, and error status colors?",
    description: "Reader returns all status color tokens",
    checks: [{ type: "agentMatch", value: "reader" }, { type: "notEmpty" }],
  },
  {
    id: 42, agent: "reader",
    prompt: "What is the normal line height value?",
    description: "Reader returns the normal/default line height token",
    checks: [{ type: "agentMatch", value: "reader" }, { type: "notEmpty" }],
  },
  {
    id: 43, agent: "reader",
    prompt: "What does spacing size 4 equal in pixels?",
    description: "Reader returns the pixel value for spacing token 4",
    checks: [{ type: "agentMatch", value: "reader" }, { type: "notEmpty" }],
  },
  {
    id: 44, agent: "reader",
    prompt: "What constraints apply to the button component?",
    description: "Reader returns button usage constraints",
    checks: [{ type: "agentMatch", value: "reader" }, { type: "notEmpty" }],
  },
  {
    id: 45, agent: "reader",
    prompt: "What is the anatomy of the card component?",
    description: "Reader returns card component anatomy (slots/parts)",
    checks: [{ type: "agentMatch", value: "reader" }, { type: "notEmpty" }],
  },
  {
    id: 46, agent: "reader",
    prompt: "What accessibility guidance exists for form components?",
    description: "Reader returns form accessibility guidelines",
    checks: [{ type: "agentMatch", value: "reader" }, { type: "notEmpty" }],
  },
  {
    id: 47, agent: "reader",
    prompt: "What are the mobile layout gutter values?",
    description: "Reader returns mobile gutter layout tokens",
    checks: [{ type: "agentMatch", value: "reader" }, { type: "notEmpty" }],
  },
  {
    id: 48, agent: "reader",
    prompt: "What are the secondary color tokens?",
    description: "Reader returns the secondary color palette",
    checks: [{ type: "agentMatch", value: "reader" }, { type: "contains", value: "secondary" }, { type: "notEmpty" }],
  },
  {
    id: 49, agent: "reader",
    prompt: "What is the alert component's accessibility role?",
    description: "Reader returns the alert ARIA role",
    checks: [{ type: "agentMatch", value: "reader" }, { type: "notEmpty" }],
  },
  {
    id: 50, agent: "reader",
    prompt: "What are all the neutral color shades?",
    description: "Reader returns the neutral color scale",
    checks: [{ type: "agentMatch", value: "reader" }, { type: "contains", value: "neutral" }, { type: "notEmpty" }],
  },

  // ── Builder agent tests (30) ─────────────────────────────────────────────
  {
    id: 51, agent: "builder",
    prompt: "Create a primary button component",
    description: "Builder generates a styled primary button with a live preview",
    checks: [{ type: "agentMatch", value: "builder" }, { type: "hasPreview" }, { type: "notEmpty" }],
  },
  {
    id: 52, agent: "builder",
    prompt: "Build a text input field",
    description: "Builder generates a text input with proper design tokens",
    checks: [{ type: "agentMatch", value: "builder" }, { type: "hasPreview" }, { type: "notEmpty" }],
  },
  {
    id: 53, agent: "builder",
    prompt: "Generate a card component",
    description: "Builder generates a card with token-based styles",
    checks: [{ type: "agentMatch", value: "builder" }, { type: "hasPreview" }, { type: "notEmpty" }],
  },
  {
    id: 54, agent: "builder",
    prompt: "Create a modal dialog component",
    description: "Builder generates an accessible modal dialog",
    checks: [{ type: "agentMatch", value: "builder" }, { type: "hasPreview" }, { type: "notEmpty" }],
  },
  {
    id: 55, agent: "builder",
    prompt: "Build a badge with an error/danger variant",
    description: "Builder generates an error badge with correct token values",
    checks: [{ type: "agentMatch", value: "builder" }, { type: "hasPreview" }, { type: "notEmpty" }],
  },
  {
    id: 56, agent: "builder",
    prompt: "Create a select dropdown component",
    description: "Builder generates a styled select dropdown",
    checks: [{ type: "agentMatch", value: "builder" }, { type: "hasPreview" }, { type: "notEmpty" }],
  },
  {
    id: 57, agent: "builder",
    prompt: "Build a checkbox component",
    description: "Builder generates an accessible checkbox",
    checks: [{ type: "agentMatch", value: "builder" }, { type: "hasPreview" }, { type: "notEmpty" }],
  },
  {
    id: 58, agent: "builder",
    prompt: "Create a warning alert component",
    description: "Builder generates a warning alert with correct status colors",
    checks: [{ type: "agentMatch", value: "builder" }, { type: "hasPreview" }, { type: "notEmpty" }],
  },
  {
    id: 59, agent: "builder",
    prompt: "Generate a login form with email and password fields",
    description: "Builder generates a complete login form",
    checks: [{ type: "agentMatch", value: "builder" }, { type: "hasPreview" }, { type: "notEmpty" }],
  },
  {
    id: 60, agent: "builder",
    prompt: "Build a navigation bar with a logo and links",
    description: "Builder generates a navigation bar component",
    checks: [{ type: "agentMatch", value: "builder" }, { type: "hasPreview" }, { type: "notEmpty" }],
  },
  {
    id: 61, agent: "builder",
    prompt: "Create a hero section with a headline and call-to-action button",
    description: "Builder generates a hero section layout",
    checks: [{ type: "agentMatch", value: "builder" }, { type: "hasPreview" }, { type: "notEmpty" }],
  },
  {
    id: 62, agent: "builder",
    prompt: "Build a pricing card component",
    description: "Builder generates a pricing card with token-based styles",
    checks: [{ type: "agentMatch", value: "builder" }, { type: "hasPreview" }, { type: "notEmpty" }],
  },
  {
    id: 63, agent: "builder",
    prompt: "Create a secondary button",
    description: "Builder generates a secondary variant button",
    checks: [{ type: "agentMatch", value: "builder" }, { type: "hasPreview" }, { type: "notEmpty" }],
  },
  {
    id: 64, agent: "builder",
    prompt: "Build a disabled text input field",
    description: "Builder generates a disabled input using the disabled state tokens",
    checks: [{ type: "agentMatch", value: "builder" }, { type: "hasPreview" }, { type: "notEmpty" }],
  },
  {
    id: 65, agent: "builder",
    prompt: "Create a button group with three buttons",
    description: "Builder generates a grouped button layout",
    checks: [{ type: "agentMatch", value: "builder" }, { type: "hasPreview" }, { type: "notEmpty" }],
  },
  {
    id: 66, agent: "builder",
    prompt: "Create an icon button with a settings icon",
    description: "Builder generates an icon button component",
    checks: [{ type: "agentMatch", value: "builder" }, { type: "hasPreview" }, { type: "notEmpty" }],
  },
  {
    id: 67, agent: "builder",
    prompt: "Generate a toast notification message",
    description: "Builder generates a toast notification component",
    checks: [{ type: "agentMatch", value: "builder" }, { type: "hasPreview" }, { type: "notEmpty" }],
  },
  {
    id: 68, agent: "builder",
    prompt: "Build a registration form with first name, last name, and email",
    description: "Builder generates a multi-field form",
    checks: [{ type: "agentMatch", value: "builder" }, { type: "hasPreview" }, { type: "notEmpty" }],
  },
  {
    id: 69, agent: "builder",
    prompt: "Create a 3-column card grid layout",
    description: "Builder generates a card grid layout",
    checks: [{ type: "agentMatch", value: "builder" }, { type: "hasPreview" }, { type: "notEmpty" }],
  },
  {
    id: 70, agent: "builder",
    prompt: "Build a success alert with a checkmark icon",
    description: "Builder generates a success alert component",
    checks: [{ type: "agentMatch", value: "builder" }, { type: "hasPreview" }, { type: "notEmpty" }],
  },
  {
    id: 71, agent: "builder",
    prompt: "Create a search input with a search button",
    description: "Builder generates a search bar component",
    checks: [{ type: "agentMatch", value: "builder" }, { type: "hasPreview" }, { type: "notEmpty" }],
  },
  {
    id: 72, agent: "builder",
    prompt: "Generate a tab bar component with three tabs",
    description: "Builder generates a tab bar with proper styling",
    checks: [{ type: "agentMatch", value: "builder" }, { type: "hasPreview" }, { type: "notEmpty" }],
  },
  {
    id: 73, agent: "builder",
    prompt: "Build a data table with column headers",
    description: "Builder generates a styled data table",
    checks: [{ type: "agentMatch", value: "builder" }, { type: "hasPreview" }, { type: "notEmpty" }],
  },
  {
    id: 74, agent: "builder",
    prompt: "Create a dropdown menu component",
    description: "Builder generates a dropdown menu",
    checks: [{ type: "agentMatch", value: "builder" }, { type: "hasPreview" }, { type: "notEmpty" }],
  },
  {
    id: 75, agent: "builder",
    prompt: "Build a loading spinner component",
    description: "Builder generates an animated loading spinner",
    checks: [{ type: "agentMatch", value: "builder" }, { type: "hasPreview" }, { type: "notEmpty" }],
  },
  {
    id: 76, agent: "builder",
    prompt: "Generate a breadcrumb navigation component",
    description: "Builder generates a breadcrumb with proper separators",
    checks: [{ type: "agentMatch", value: "builder" }, { type: "hasPreview" }, { type: "notEmpty" }],
  },
  {
    id: 77, agent: "builder",
    prompt: "Create a stepper component with three steps",
    description: "Builder generates a step wizard/stepper component",
    checks: [{ type: "agentMatch", value: "builder" }, { type: "hasPreview" }, { type: "notEmpty" }],
  },
  {
    id: 78, agent: "builder",
    prompt: "Build a progress bar at 60% completion",
    description: "Builder generates a progress bar component",
    checks: [{ type: "agentMatch", value: "builder" }, { type: "hasPreview" }, { type: "notEmpty" }],
  },
  {
    id: 79, agent: "builder",
    prompt: "Create a profile avatar component with initials",
    description: "Builder generates an avatar component",
    checks: [{ type: "agentMatch", value: "builder" }, { type: "hasPreview" }, { type: "notEmpty" }],
  },
  {
    id: 80, agent: "builder",
    prompt: "Generate an error state for a form input with a validation message",
    description: "Builder generates an input in error state with message",
    checks: [{ type: "agentMatch", value: "builder" }, { type: "hasPreview" }, { type: "notEmpty" }],
  },

  // ── Generator agent tests (20) ───────────────────────────────────────────
  {
    id: 81, agent: "generator",
    prompt: "I want to create a brand-new design system for my tech startup",
    description: "Generator begins the design system creation conversation",
    checks: [{ type: "agentMatch", value: "generator" }, { type: "notEmpty" }],
  },
  {
    id: 82, agent: "generator",
    prompt: "Generate a complete design system for a healthcare application",
    description: "Generator starts gathering brand info for a healthcare design system",
    checks: [{ type: "agentMatch", value: "generator" }, { type: "notEmpty" }],
  },
  {
    id: 83, agent: "generator",
    prompt: "Create a dark-first design system for a developer tool",
    description: "Generator engages with a dark-theme-first design system request",
    checks: [{ type: "agentMatch", value: "generator" }, { type: "notEmpty" }],
  },
  {
    id: 84, agent: "generator",
    prompt: "I need a design system for an e-commerce platform",
    description: "Generator acknowledges and gathers info for e-commerce DS",
    checks: [{ type: "agentMatch", value: "generator" }, { type: "notEmpty" }],
  },
  {
    id: 85, agent: "generator",
    prompt: "Build me a design system with purple as the primary brand color",
    description: "Generator accepts a brand color and requests more info",
    checks: [{ type: "agentMatch", value: "generator" }, { type: "notEmpty" }],
  },
  {
    id: 86, agent: "generator",
    prompt: "Create a minimal, clean design system for a SaaS dashboard",
    description: "Generator starts the SaaS dashboard design system conversation",
    checks: [{ type: "agentMatch", value: "generator" }, { type: "notEmpty" }],
  },
  {
    id: 87, agent: "generator",
    prompt: "Generate a design system for a fintech banking brand",
    description: "Generator gathers brand direction for a fintech design system",
    checks: [{ type: "agentMatch", value: "generator" }, { type: "notEmpty" }],
  },
  {
    id: 88, agent: "generator",
    prompt: "I want to create a design system for a social media platform",
    description: "Generator engages with a social media design system request",
    checks: [{ type: "agentMatch", value: "generator" }, { type: "notEmpty" }],
  },
  {
    id: 89, agent: "generator",
    prompt: "Start building a design system for a B2B project management tool",
    description: "Generator starts the process for a B2B tool design system",
    checks: [{ type: "agentMatch", value: "generator" }, { type: "notEmpty" }],
  },
  {
    id: 90, agent: "generator",
    prompt: "Create a children's educational app design system",
    description: "Generator begins gathering info for a playful education DS",
    checks: [{ type: "agentMatch", value: "generator" }, { type: "notEmpty" }],
  },
  {
    id: 91, agent: "generator",
    prompt: "Generate a luxury brand design system",
    description: "Generator gathers brand aesthetic for a luxury design system",
    checks: [{ type: "agentMatch", value: "generator" }, { type: "notEmpty" }],
  },
  {
    id: 92, agent: "generator",
    prompt: "Build a design system for a news media website",
    description: "Generator starts the news media design system conversation",
    checks: [{ type: "agentMatch", value: "generator" }, { type: "notEmpty" }],
  },
  {
    id: 93, agent: "generator",
    prompt: "I need a complete new design system from scratch",
    description: "Generator begins the creation process for a fresh DS",
    checks: [{ type: "agentMatch", value: "generator" }, { type: "notEmpty" }],
  },
  {
    id: 94, agent: "generator",
    prompt: "Create a gaming platform design system",
    description: "Generator engages with a gaming aesthetic design system request",
    checks: [{ type: "agentMatch", value: "generator" }, { type: "notEmpty" }],
  },
  {
    id: 95, agent: "generator",
    prompt: "Generate a design system for a food delivery mobile app",
    description: "Generator gathers brand info for a food delivery app DS",
    checks: [{ type: "agentMatch", value: "generator" }, { type: "notEmpty" }],
  },
  {
    id: 96, agent: "generator",
    prompt: "Create a B2B enterprise design system with a professional tone",
    description: "Generator begins a professional B2B design system conversation",
    checks: [{ type: "agentMatch", value: "generator" }, { type: "notEmpty" }],
  },
  {
    id: 97, agent: "generator",
    prompt: "Build a nature-inspired design system with earthy green tones",
    description: "Generator acknowledges the nature theme and asks clarifying questions",
    checks: [{ type: "agentMatch", value: "generator" }, { type: "notEmpty" }],
  },
  {
    id: 98, agent: "generator",
    prompt: "Generate a design system for a travel booking platform",
    description: "Generator starts gathering info for a travel app design system",
    checks: [{ type: "agentMatch", value: "generator" }, { type: "notEmpty" }],
  },
  {
    id: 99, agent: "generator",
    prompt: "I want to generate a design system with a vibrant, energetic feel",
    description: "Generator engages with an energy-driven aesthetic direction",
    checks: [{ type: "agentMatch", value: "generator" }, { type: "notEmpty" }],
  },
  {
    id: 100, agent: "generator",
    prompt: "Create a design system for a mental wellness and meditation app",
    description: "Generator gathers calm, wellness-oriented brand direction",
    checks: [{ type: "agentMatch", value: "generator" }, { type: "notEmpty" }],
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
    case "hasPreview":
      return {
        label: "Response includes a preview",
        passed: typeof result.preview === "string" && result.preview.trim().length > 0,
        detail: result.preview ? "preview present" : "no preview",
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
  orchestrator: "purple",
  reader: "accent",
  builder: "orange",
  generator: "green",
};

const AGENT_LABELS = {
  orchestrator: "Orchestrator",
  reader: "Reader",
  builder: "Builder",
  generator: "Generator",
};

function agentBadge(agent) {
  const color = AGENT_COLORS[agent] ?? "accent";
  return `<span class="tl-agent-badge tl-badge-${color}">${escapeHtml(AGENT_LABELS[agent] ?? agent)}</span>`;
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

// ── State ─────────────────────────────────────────────────────────────────────
const testState = {}; // testId → { status, result, checkResults, error }

function getTestState(id) {
  return testState[id] ?? { status: "idle" };
}

export function initTestLabModal() {
  const overlay    = document.getElementById("testlab-modal");
  const modalBody  = document.getElementById("testlab-modal-body");
  const closeBtn   = document.getElementById("testlab-modal-close");
  const cancelBtn  = document.getElementById("testlab-modal-cancel");
  const openBtn    = document.getElementById("test-lab-btn");
  const tabBtns    = overlay.querySelectorAll(".tl-tab");

  let activeTab = "suite";
  let suiteFilter = "all";
  let runningAll = false;
  let stopAllFlag = false;

  // ── Tab switching ──────────────────────────────────────────────────────
  function switchTab(tab) {
    activeTab = tab;
    tabBtns.forEach(t => t.classList.toggle("active", t.dataset.tab === tab));
    if (tab === "suite") renderSuite();
    else renderPlayground();
  }

  // ── Model helper ──────────────────────────────────────────────────────
  function getModel() {
    return document.getElementById("model-select")?.value || DEFAULT_MODEL;
  }

  // ── Suite tab ─────────────────────────────────────────────────────────
  function filteredTests() {
    if (suiteFilter === "all") return TEST_SUITE;
    return TEST_SUITE.filter(t => t.agent === suiteFilter);
  }

  function renderSuite() {
    const tests = filteredTests();
    const total = tests.length;
    const ran   = tests.filter(t => getTestState(t.id).status !== "idle").length;
    const passed = tests.filter(t => getTestState(t.id).status === "pass").length;
    const failed = tests.filter(t => ["fail", "error"].includes(getTestState(t.id).status)).length;

    const filterTabs = ["all", "orchestrator", "reader", "builder", "generator"].map(f => {
      const count = f === "all" ? TEST_SUITE.length : TEST_SUITE.filter(t => t.agent === f).length;
      return `<button class="tl-filter-tab${suiteFilter === f ? " active" : ""}" data-filter="${f}">
        ${f === "all" ? "All" : AGENT_LABELS[f]} <span class="tl-filter-count">${count}</span>
      </button>`;
    }).join("");

    const rows = tests.map(test => {
      const st = getTestState(test.id);
      const expandedHtml = st.status !== "idle" && st.status !== "running" ? renderTestDetail(test, st) : "";
      return `<div class="tl-test-row" data-id="${test.id}">
        <div class="tl-test-row-header">
          <span class="tl-test-id">#${test.id}</span>
          ${agentBadge(test.agent)}
          <span class="tl-test-desc">${escapeHtml(test.description)}</span>
          <div class="tl-test-row-actions">
            ${statusBadge(st.status)}
            <button class="tl-run-btn" data-run="${test.id}" title="Run this test">▶</button>
          </div>
        </div>
        <div class="tl-test-prompt">${escapeHtml(test.prompt)}</div>
        ${expandedHtml}
      </div>`;
    }).join("");

    modalBody.innerHTML = `
      <div class="tl-suite-toolbar">
        <div class="tl-filter-tabs">${filterTabs}</div>
        <div class="tl-suite-actions">
          <span class="tl-suite-stats">${ran}/${total} run &middot; ${passed} pass &middot; ${failed} fail</span>
          ${runningAll
            ? `<button class="btn-secondary tl-stop-btn" id="tl-stop-all">⏹ Stop</button>`
            : `<button class="btn-secondary tl-run-all-btn" id="tl-run-all">▶ Run All (${total})</button>`}
          <button class="btn-secondary tl-clear-btn" id="tl-clear-results">Clear</button>
        </div>
      </div>
      <div class="tl-test-list">${rows}</div>`;

    // Wire filter tabs
    modalBody.querySelectorAll(".tl-filter-tab").forEach(btn => {
      btn.addEventListener("click", () => {
        suiteFilter = btn.dataset.filter;
        renderSuite();
      });
    });

    // Wire run-all / stop / clear
    document.getElementById("tl-run-all")?.addEventListener("click", runAll);
    document.getElementById("tl-stop-all")?.addEventListener("click", () => { stopAllFlag = true; });
    document.getElementById("tl-clear-results")?.addEventListener("click", () => {
      Object.keys(testState).forEach(k => delete testState[k]);
      renderSuite();
    });

    // Wire per-test run buttons
    modalBody.querySelectorAll(".tl-run-btn[data-run]").forEach(btn => {
      btn.addEventListener("click", () => runSingleTest(Number(btn.dataset.run)));
    });
  }

  function renderTestDetail(test, st) {
    if (!st) return "";
    if (st.status === "error") {
      return `<div class="tl-test-detail"><span class="tl-error-msg">Error: ${escapeHtml(st.error ?? "unknown")}</span></div>`;
    }
    const checks = (st.checkResults ?? []).map(c =>
      `<div class="tl-check-row ${c.passed ? "tl-check-pass" : "tl-check-fail"}">
        <span class="tl-check-icon">${c.passed ? "✓" : "✗"}</span>
        <span class="tl-check-label">${escapeHtml(c.label)}</span>
        <span class="tl-check-detail">${escapeHtml(c.detail ?? "")}</span>
      </div>`
    ).join("");
    const msg = st.result?.message ?? "";
    return `<div class="tl-test-detail">
      <div class="tl-check-list">${checks}</div>
      ${msg ? `<div class="tl-response-snippet">${escapeHtml(msg.slice(0, RESPONSE_DETAIL_LENGTH))}${msg.length > RESPONSE_DETAIL_LENGTH ? "…" : ""}</div>` : ""}
    </div>`;
  }

  async function runSingleTest(id) {
    const test = TEST_SUITE.find(t => t.id === id);
    if (!test) return;
    testState[id] = { status: "running" };
    updateRowStatus(id, "running");
    try {
      const outcome = await runTest(test, getModel());
      testState[id] = { status: outcome.passed ? "pass" : "fail", ...outcome };
    } catch (err) {
      testState[id] = { status: "error", error: String(err) };
    }
    // Re-render the specific row in place to avoid full re-render flicker
    renderSuiteRow(id);
    updateSuiteStats();
  }

  function updateRowStatus(id, status) {
    const row = modalBody.querySelector(`.tl-test-row[data-id="${id}"]`);
    if (!row) return;
    const chip = row.querySelector(".tl-status-chip");
    if (chip) chip.outerHTML = statusBadge(status);
  }

  function renderSuiteRow(id) {
    const test = TEST_SUITE.find(t => t.id === id);
    if (!test) return;
    const row = modalBody.querySelector(`.tl-test-row[data-id="${id}"]`);
    if (!row) return;
    const st = getTestState(id);
    const expandedHtml = st.status !== "idle" && st.status !== "running" ? renderTestDetail(test, st) : "";
    row.innerHTML = `
      <div class="tl-test-row-header">
        <span class="tl-test-id">#${test.id}</span>
        ${agentBadge(test.agent)}
        <span class="tl-test-desc">${escapeHtml(test.description)}</span>
        <div class="tl-test-row-actions">
          ${statusBadge(st.status)}
          <button class="tl-run-btn" data-run="${test.id}" title="Run this test">▶</button>
        </div>
      </div>
      <div class="tl-test-prompt">${escapeHtml(test.prompt)}</div>
      ${expandedHtml}`;
    row.querySelector(".tl-run-btn")?.addEventListener("click", () => runSingleTest(id));
  }

  function updateSuiteStats() {
    const tests = filteredTests();
    const total  = tests.length;
    const ran    = tests.filter(t => getTestState(t.id).status !== "idle").length;
    const passed = tests.filter(t => getTestState(t.id).status === "pass").length;
    const failed = tests.filter(t => ["fail", "error"].includes(getTestState(t.id).status)).length;
    const el = modalBody.querySelector(".tl-suite-stats");
    if (el) el.textContent = `${ran}/${total} run · ${passed} pass · ${failed} fail`;
  }

  async function runAll() {
    const tests = filteredTests();
    runningAll = true;
    stopAllFlag = false;
    renderSuite();
    for (const test of tests) {
      if (stopAllFlag) break;
      await runSingleTest(test.id);
    }
    runningAll = false;
    renderSuite();
  }

  // ── Playground tab ────────────────────────────────────────────────────
  let playgroundRunning = false;

  function renderPlayground() {
    modalBody.innerHTML = `
      <div class="tl-playground">
        <div class="tl-pg-fields">
          <div class="tl-pg-field">
            <label class="tl-pg-label">Prompt</label>
            <textarea class="tl-pg-textarea" id="pg-prompt" placeholder="Type any prompt to test…" rows="4"></textarea>
          </div>
          <div class="tl-pg-row">
            <div class="tl-pg-field tl-pg-field-half">
              <label class="tl-pg-label">Expected Agent (optional)</label>
              <select class="tl-pg-select" id="pg-expected-agent">
                <option value="">Any</option>
                <option value="orchestrator">Orchestrator</option>
                <option value="reader">Reader</option>
                <option value="builder">Builder</option>
                <option value="generator">Generator</option>
              </select>
            </div>
            <div class="tl-pg-field tl-pg-field-half">
              <label class="tl-pg-label">Expect preview HTML</label>
              <select class="tl-pg-select" id="pg-expect-preview">
                <option value="">Don't check</option>
                <option value="yes">Yes — must have preview</option>
                <option value="no">No — must not have preview</option>
              </select>
            </div>
          </div>
          <div class="tl-pg-field">
            <label class="tl-pg-label">Expected keywords in response (comma-separated, optional)</label>
            <input class="tl-pg-input" type="text" id="pg-keywords" placeholder="e.g. primary, color, hex" />
          </div>
        </div>
        <div class="tl-pg-run-row">
          <button class="btn-primary tl-pg-run-btn" id="pg-run-btn" ${playgroundRunning ? "disabled" : ""}>
            ${playgroundRunning ? "⏳ Running…" : "▶ Run Test"}
          </button>
          <span class="tl-pg-hint">Uses the model selected in the top bar.</span>
        </div>
        <div class="tl-pg-result" id="pg-result" style="display:none"></div>
      </div>`;

    document.getElementById("pg-run-btn")?.addEventListener("click", runPlayground);
  }

  async function runPlayground() {
    const prompt = document.getElementById("pg-prompt")?.value.trim();
    if (!prompt) return;

    const expectedAgent = document.getElementById("pg-expected-agent")?.value;
    const expectPreview = document.getElementById("pg-expect-preview")?.value;
    const keywords = (document.getElementById("pg-keywords")?.value ?? "")
      .split(",").map(s => s.trim()).filter(Boolean);

    const resultEl = document.getElementById("pg-result");
    const runBtn   = document.getElementById("pg-run-btn");
    playgroundRunning = true;
    if (runBtn) { runBtn.disabled = true; runBtn.textContent = "⏳ Running…"; }
    if (resultEl) { resultEl.style.display = "none"; }

    // Build ad-hoc checks
    const checks = [{ type: "notEmpty" }];
    if (expectedAgent) checks.push({ type: "agentMatch", value: expectedAgent });
    if (expectPreview === "yes") checks.push({ type: "hasPreview" });
    keywords.forEach(kw => checks.push({ type: "contains", value: kw }));

    const pgTest = { id: 0, agent: expectedAgent || "any", prompt, description: "Playground test", checks };

    try {
      const outcome = await runTest(pgTest, getModel());
      if (resultEl) {
        resultEl.style.display = "";
        const checkRows = outcome.checkResults.map(c =>
          `<div class="tl-check-row ${c.passed ? "tl-check-pass" : "tl-check-fail"}">
            <span class="tl-check-icon">${c.passed ? "✓" : "✗"}</span>
            <span class="tl-check-label">${escapeHtml(c.label)}</span>
            <span class="tl-check-detail">${escapeHtml(c.detail ?? "")}</span>
          </div>`
        ).join("");

        const summary = outcome.passed ? "tl-pg-pass" : "tl-pg-fail";
        const summaryText = outcome.passed ? "✓ All checks passed" : "✗ Some checks failed";
        const msg = outcome.result?.message ?? "";
        const hasPreview = outcome.result?.preview;

        resultEl.innerHTML = `
          <div class="tl-pg-summary ${summary}">${summaryText}</div>
          <div class="tl-pg-meta">
            <span>Agent routed to: ${agentBadge(outcome.result?.routedAgent ?? "unknown")}</span>
            <span class="tl-pg-meta-sep">·</span>
            <span>Preview: ${hasPreview ? "yes" : "no"}</span>
          </div>
          <div class="tl-check-list">${checkRows}</div>
          ${msg ? `<div class="tl-pg-response-label">Response</div>
          <div class="tl-pg-response">${escapeHtml(msg)}</div>` : ""}
          ${hasPreview ? `<div class="tl-pg-response-label">Preview HTML <span style="font-size:10px;opacity:.6">(truncated)</span></div>
          <pre class="tl-pg-preview-pre">${escapeHtml(hasPreview.slice(0, PREVIEW_TRUNCATE_LENGTH))}${hasPreview.length > PREVIEW_TRUNCATE_LENGTH ? "…" : ""}</pre>` : ""}`;
      }
    } catch (err) {
      if (resultEl) {
        resultEl.style.display = "";
        resultEl.innerHTML = `<div class="tl-pg-summary tl-pg-fail">⚠ Error: ${escapeHtml(String(err))}</div>`;
      }
    } finally {
      playgroundRunning = false;
      if (runBtn) { runBtn.disabled = false; runBtn.textContent = "▶ Run Test"; }
    }
  }

  // ── Open / close ──────────────────────────────────────────────────────
  function openModal() {
    overlay.classList.add("open");
    switchTab(activeTab);
  }
  function closeModal() { overlay.classList.remove("open"); }

  tabBtns.forEach(t => t.addEventListener("click", () => switchTab(t.dataset.tab)));
  openBtn.addEventListener("click", openModal);
  closeBtn.addEventListener("click", closeModal);
  cancelBtn.addEventListener("click", closeModal);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlay.classList.contains("open")) closeModal();
  });
}
