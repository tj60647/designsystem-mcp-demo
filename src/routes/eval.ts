/**
 * Design System MCP — Eval Metrics Route
 * Author: Thomas J McLeish
 * License: MIT
 *
 * Routes:
 *   GET  /api/eval/metrics        — return current in-process counters
 *   POST /api/eval/metrics/reset  — zero all counters
 */

import express from "express";
import { getMetrics, resetMetrics } from "../metrics.js";

const router = express.Router();

// ── GET /api/eval/metrics ─────────────────────────────────────────────────
router.get("/eval/metrics", (_req, res) => {
  res.json(getMetrics());
});

// ── POST /api/eval/metrics/reset ──────────────────────────────────────────
router.post("/eval/metrics/reset", (_req, res) => {
  resetMetrics();
  res.json({ ok: true, resetAt: new Date().toISOString() });
});

export default router;
