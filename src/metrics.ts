/**
 * Design System MCP — In-Process Metrics Store
 * Author: Thomas J McLeish
 * License: MIT
 *
 * Simple in-memory counters for the /api/eval/metrics dashboard.
 * Resets on server restart (intentionally stateless).
 */

export interface MetricsSnapshot {
  requests:   number;
  cacheHits:  number;
  routing:    Record<string, number>;
  toolCalls:  Record<string, number>;
  resetAt:    string;
}

const state = {
  requests:  0,
  cacheHits: 0,
  routing:   {} as Record<string, number>,
  toolCalls: {} as Record<string, number>,
  resetAt:   new Date().toISOString(),
};

export function recordRequest(): void {
  state.requests++;
}

export function recordCacheHit(): void {
  state.cacheHits++;
}

export function recordRouting(agent: string): void {
  state.routing[agent] = (state.routing[agent] ?? 0) + 1;
}

export function recordToolCall(tool: string): void {
  state.toolCalls[tool] = (state.toolCalls[tool] ?? 0) + 1;
}

export function getMetrics(): MetricsSnapshot {
  return {
    requests:  state.requests,
    cacheHits: state.cacheHits,
    routing:   { ...state.routing },
    toolCalls: { ...state.toolCalls },
    resetAt:   state.resetAt,
  };
}

export function resetMetrics(): void {
  state.requests  = 0;
  state.cacheHits = 0;
  state.routing   = {};
  state.toolCalls = {};
  state.resetAt   = new Date().toISOString();
}
