/**
 * Design System Ops — Readiness and Warning Display (Phase 4, Workstream B)
 *
 * Renders the readiness panel and normalization warnings in the Design System
 * Ops section after every successful ingest operation.  Called from the
 * load-json modal and generate-from-website modal via notifyDsOpsResult().
 */

import { escapeHtml } from './utils.js';

const READINESS_LABELS = {
  "ready": "Ready",
  "usable-with-warnings": "Usable — with warnings",
  "insufficient": "Insufficient",
};

const FINDING_ICONS = {
  critical: "✕",
  warning: "⚠",
  info: "ℹ",
};

/**
 * Update the Design System Ops section with a readiness report and
 * normalization warnings from a successful ingest result.
 *
 * @param result — The ingest result payload from the server
 */
export function notifyDsOpsResult(result) {
  if (!result) return;
  renderReadiness(result.readiness ?? null);
  renderWarnings(result.warnings ?? [], result.normalizationSummary ?? null);
}

function renderReadiness(readiness) {
  const panel = document.getElementById("ds-ops-readiness");
  if (!panel) return;

  if (!readiness) {
    panel.style.display = "none";
    return;
  }

  const badge = document.getElementById("ds-ops-readiness-status-badge");
  const scoreEl = document.getElementById("ds-ops-readiness-score");
  const findingsEl = document.getElementById("ds-ops-readiness-findings");
  const nextStepsEl = document.getElementById("ds-ops-readiness-next-steps");

  if (badge) {
    badge.textContent = READINESS_LABELS[readiness.status] ?? readiness.status;
    badge.className = `ds-ops-readiness-badge ${readiness.status}`;
  }
  if (scoreEl) {
    scoreEl.textContent = `Score: ${readiness.score}/100`;
  }
  if (findingsEl) {
    findingsEl.innerHTML = "";
    for (const finding of (readiness.findings ?? [])) {
      const item = document.createElement("div");
      item.className = `ds-ops-readiness-finding ${finding.severity}`;
      const icon = FINDING_ICONS[finding.severity] ?? "·";
      item.innerHTML = `<span class="ds-ops-readiness-finding-icon">${icon}</span><span>${escapeHtml(finding.message)}</span>`;
      findingsEl.appendChild(item);
    }
  }
  if (nextStepsEl) {
    const steps = readiness.nextSteps ?? [];
    nextStepsEl.style.display = steps.length > 0 ? "" : "none";
    nextStepsEl.innerHTML = steps.length > 0
      ? `<strong>Next steps:</strong> ${steps.map(s => escapeHtml(s)).join(" · ")}`
      : "";
  }

  panel.style.display = "";
}

function renderWarnings(warnings, normSummary) {
  const panel = document.getElementById("ds-ops-warnings");
  if (!panel) return;

  // Filter to only actionable warnings (not info-level normalization notes if summary covers them)
  const displayWarnings = warnings.filter(w => w.severity === "warning" || w.severity === "info");

  if (displayWarnings.length === 0 && !normSummary) {
    panel.style.display = "none";
    return;
  }

  const titleEl = document.getElementById("ds-ops-warnings-title");
  const listEl = document.getElementById("ds-ops-warnings-list");

  if (listEl) {
    listEl.innerHTML = "";

    // Show normalization summary at top if there were rewrites
    if (normSummary && (normSummary.renamedKeys > 0 || normSummary.filledDefaults > 0)) {
      const summaryParts = [];
      if (normSummary.renamedKeys > 0) summaryParts.push(`${normSummary.renamedKeys} key(s) renamed/normalized`);
      if (normSummary.filledDefaults > 0) summaryParts.push(`${normSummary.filledDefaults} default(s) filled`);
      if (normSummary.droppedUnknownSections > 0) summaryParts.push(`${normSummary.droppedUnknownSections} unknown section(s) dropped`);
      if (summaryParts.length > 0) {
        const item = document.createElement("li");
        item.className = "info";
        item.textContent = `Normalization: ${summaryParts.join(", ")}.`;
        listEl.appendChild(item);
      }
    }

    for (const w of displayWarnings) {
      const item = document.createElement("li");
      item.className = w.severity;
      item.textContent = `[${w.section}] ${w.message}`;
      listEl.appendChild(item);
    }
  }

  const hasContent = (listEl?.children.length ?? 0) > 0;
  if (titleEl) {
    const warnCount = displayWarnings.filter(w => w.severity === "warning").length;
    titleEl.textContent = warnCount > 0 ? `${warnCount} warning(s) noted` : "Normalization notes";
  }
  panel.style.display = hasContent ? "" : "none";
}

export function initDsOpsPanel() {
  const dismissReadiness = document.getElementById("ds-ops-readiness-dismiss");
  if (dismissReadiness) {
    dismissReadiness.addEventListener("click", () => {
      const panel = document.getElementById("ds-ops-readiness");
      if (panel) panel.style.display = "none";
    });
  }
  const dismissWarnings = document.getElementById("ds-ops-warnings-dismiss");
  if (dismissWarnings) {
    dismissWarnings.addEventListener("click", () => {
      const panel = document.getElementById("ds-ops-warnings");
      if (panel) panel.style.display = "none";
    });
  }
}
