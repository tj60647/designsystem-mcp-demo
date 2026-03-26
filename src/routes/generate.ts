/**
 * Design System MCP — Generate from Website Route
 * Author: Thomas J McLeish
 * License: MIT
 *
 * POST /api/generate-from-website
 *
 * Accepts a public website URL, extracts CSS design context from it using
 * the website extractor, then calls the AI generator to produce a complete
 * design system JSON (tokens, components, themes, icons).  The result is
 * auto-loaded into the data store so MCP tools reflect it immediately.
 */

import express from "express";
import { generateDesignSystem } from "../generator.js";
import { extractWebsiteDesignContext, validateWebsiteUrl } from "../websiteExtractor.js";
import { setData, type DataType } from "../dataStore.js";

const router = express.Router();

const VALID_TYPES: DataType[] = ["tokens", "components", "themes", "icons"];

// ── POST /api/generate-from-website ──────────────────────────────────────
// Body: { "url": "https://...", "model": "<optional override>" }
// Fetches the website, extracts design context, generates a design system,
// loads it into the data store, and returns the generated JSON.
// ─────────────────────────────────────────────────────────────────────────
router.post("/generate-from-website", async (req, res) => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    res.status(503).json({
      error: "OpenRouter not configured. Set OPENROUTER_API_KEY environment variable.",
    });
    return;
  }

  const { url, model: requestedModel } = req.body as { url?: string; model?: string };

  if (!url || typeof url !== "string" || !url.trim()) {
    res.status(400).json({ error: "url is required." });
    return;
  }

  try {
    validateWebsiteUrl(url.trim());
  } catch (err) {
    res.status(400).json({ error: String(err) });
    return;
  }

  const model = requestedModel ?? process.env.OPENROUTER_MODEL ?? "openai/gpt-oss-20b:nitro";

  try {
    const description = await extractWebsiteDesignContext(url.trim());
    const result      = await generateDesignSystem(description, apiKey, model);

    for (const section of VALID_TYPES) {
      if (result.data[section] !== undefined) {
        setData(section, result.data[section]);
      }
    }

    res.json({
      generatedDesignSystem: result.data,
      warnings: result.warnings,
    });
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: String(err) });
    }
  }
});

export default router;
