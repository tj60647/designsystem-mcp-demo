/**
 * Remote data mode (DESIGN_SYSTEM_DATA_URL): the data store fetches the seven
 * data sets from a published design system, refreshes them after the TTL,
 * keeps the last good copy when a refresh fails, refuses to start with none,
 * and cannot be overwritten at runtime.
 *
 * Self-contained: serves its own data from a local HTTP server.
 *   node --import tsx/esm --test tests/remote-data.test.ts
 */
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

const TYPES = ["tokens", "components", "themes", "icons", "changelog", "deprecations", "style-guide"];
let served: Record<string, unknown> = {};
let failing = false;
let hits = 0;
let server: Server;
let base = "";

before(async () => {
  server = createServer((req, res) => {
    hits += 1;
    const name = (req.url ?? "").replace(/^\/ds\//, "").replace(/\.json$/, "");
    if (failing || !(name in served)) { res.writeHead(failing ? 500 : 404).end(); return; }
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(served[name]));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/ds`;
  served = Object.fromEntries(TYPES.map((t) => [t, t === "changelog" || t === "deprecations" ? [] : {}]));
  served.tokens = { color: { text: { $value: "#141716", $type: "color", $description: "Use var(--ds-text)." } } };
});

after(() => { server.close(); });

describe("remote data mode", () => {
  test("loads every data set from the address, and refuses to be overwritten", async () => {
    process.env.DESIGN_SYSTEM_DATA_URL = `${base}/`;
    process.env.DESIGN_SYSTEM_DATA_TTL_SECONDS = "0";
    const store = await import("../src/dataStore.ts?first");
    assert.equal(store.isReadOnly(), true);
    assert.equal(store.getData("tokens"), null, "nothing is served before the first fetch");
    await store.ensureFresh();
    assert.deepEqual(store.getData("tokens"), served.tokens);
    assert.deepEqual(store.getData("changelog"), []);
    assert.throws(() => store.setData("tokens", {}), /read-only/);
    assert.throws(() => store.resetData(), /read-only/);
    assert.equal(store.dataSource().mode, "remote");
  });

  test("a change to the published data arrives on the next refresh", async () => {
    const store = await import("../src/dataStore.ts?first");
    served.tokens = { color: { text: { $value: "#000000", $type: "color" } } };
    await store.ensureFresh();
    assert.equal((store.getData("tokens") as any).color.text.$value, "#000000");
  });

  test("a failed refresh keeps the last good copy", async () => {
    const store = await import("../src/dataStore.ts?first");
    failing = true;
    await store.ensureFresh();
    assert.equal((store.getData("tokens") as any).color.text.$value, "#000000");
    assert.match(String(store.dataSource().lastError), /HTTP 500/);
    failing = false;
  });

  test("within the TTL, no new request is made", async () => {
    process.env.DESIGN_SYSTEM_DATA_TTL_SECONDS = "60";
    const store = await import("../src/dataStore.ts?first");
    await store.ensureFresh();
    const before = hits;
    await store.ensureFresh();
    assert.equal(hits, before);
  });

  test("with no good copy, it throws rather than serve the bundled sample", async () => {
    failing = true;
    const store = await import("../src/dataStore.ts?second");
    await assert.rejects(store.ensureFresh(), /unavailable/);
    assert.equal(store.getData("tokens"), null);
    failing = false;
  });
});
