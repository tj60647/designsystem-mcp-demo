/**
 * The answers agents rely on, against a snapshot of A Rough Idea's v2 data (tests/fixtures/):
 * suggest_token puts the right token first for everyday questions, validate_component_usage
 * refuses a class the component does not have, and a component that is planned is named as
 * planned instead of "not found".
 *
 *   node --import tsx/esm --test tests/answers.test.ts
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { componentNotFound, rankTokens, validateUsage, type FlatToken, type PlannedComponents } from "../src/answers.ts";

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const tokens = fixture("v2-tokens.json");
const components = fixture("v2-components.json");
const planned: PlannedComponents = fixture("v2-planned.json");

function flatten(obj: Record<string, unknown>, prefix = ""): Record<string, FlatToken> {
  const out: Record<string, FlatToken> = {};
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && "$value" in v) {
      const t = v as { $value: string; $type: string; $description?: string };
      out[path] = { value: t.$value, type: t.$type, ...(t.$description ? { description: t.$description } : {}) };
    } else if (v && typeof v === "object") Object.assign(out, flatten(v as Record<string, unknown>, path));
  }
  return out;
}
const flat = flatten(tokens);

describe("suggest_token", () => {
  const QUESTIONS: Array<[string, string]> = [
    ["error text color", "color.bad"],
    ["space between a label and its field", "spacing.2"],
    ["corner radius for a button", "borderRadius.act"],
    ["muted secondary text for a caption", "color.text-2"],
    ["primary button background", "color.ink"],
    ["focus ring", "color.focus"],
    ["page background", "color.bg"],
    ["z-index for things that float over the page", "layout.zIndex.float"],
    ["gap between page sections", "spacing.8"],
    ["border of an input", "color.field-border"],
    ["reading column width", "layout.containerMaxWidth.measure"],
    ["status tag corner", "borderRadius.tag"],
  ];
  for (const [intent, want] of QUESTIONS) {
    test(`"${intent}" puts ${want} first`, () => {
      const ranked = rankTokens(flat, intent);
      assert.equal(ranked[0]?.tokenPath, want, `got ${ranked.map((r) => r.tokenPath).join(", ")}`);
    });
  }

  test("a question of stopwords alone matches nothing", () => {
    assert.deepEqual(rankTokens(flat, "the and of a for"), []);
  });
});

describe("validate_component_usage", () => {
  test("refuses a class the button does not have", () => {
    const violations = validateUsage(components.button, { class: "ds-button ds-button--danger" });
    assert.equal(violations.length, 1);
    assert.match(violations[0].rule, /ds-button--danger/);
    assert.match(violations[0].suggestion, /ds-button ds-button--primary/);
  });

  test("accepts the button's classes in any order", () => {
    assert.deepEqual(validateUsage(components.button, { class: "ds-button--primary  ds-button" }), []);
  });
});

describe("a component that is not in the system", () => {
  test("a planned one is named as planned, with its batch and what it must get right", () => {
    const answer = componentNotFound("dialog", components, planned);
    assert.match(answer, /Dialog is planned/);
    assert.match(answer, /batch 1/);
    assert.match(answer, /showModal/);
    assert.match(answer, /not invent/i);
  });

  test("a planned one is found by its name as well as its key", () => {
    assert.match(componentNotFound("Copy button", components, planned), /Copy button is planned/);
  });

  test("one that is neither lists what there is", () => {
    const answer = componentNotFound("widget", components, planned);
    assert.match(answer, /not found/);
    assert.match(answer, /button/);
  });
});
