# Next

Updated: 2026-11-22

## Where it stands

A tutorial and live demo of a Design System MCP server: a design system's tokens, components, themes and icons as tools an AI can query, with a web app that builds compliant UI by chat, answers questions about the system, and generates new systems. The demo answers at designsystem-mcp-demo.vercel.app/demo. The last work (25 October to 3 November 2026) let a second deployment serve A Rough Idea's design system from its published files, made `suggest_token` and `validate_component_usage` give answers agents can trust, and pointed the README at that design system's Get started page.

## Next step

Bring `PLAN.md` up to date with what is built. Its Generate and Generate from Website tasks are still unchecked although `src/generator.ts`, `src/websiteExtractor.ts` and `src/playwrightExtractor.ts` exist; check each item against the code, tick what is done, and mark what was dropped (the website extractor was partly removed on 19 April). Do the same for the phases in `IMPORT_EXPORT_ROLLOUT_PLAN.md`.

## After that

- Choose the next piece from what is left: the v0.4.0 background tasks (`batch_validate`, `full_audit`, and the rest) or the Import/Export readiness phases.
- Remove `test-results/` from the repository and add it to `.gitignore`.

## Blocked or waiting

- None.

## Open questions

- Is the demo's own generator still wanted, now that the main use is serving one design system to agents?
- This plan was drafted by Claude on 2026-11-22 from the code and its history. Is the next step right?
