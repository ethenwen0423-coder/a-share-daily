import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } }, { waitUntil() {}, passThroughOnException() {} });
}

test("server-renders the quant research product", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>量化策略实验室/);
  assert.match(html, /策略工作台/);
  assert.match(html, /不接实盘/);
  assert.match(html, /T\+1 开盘成交/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/);
});

test("product source exposes editor, report, risk and reproducibility surfaces", async () => {
  const [app, styles, layout] = await Promise.all([
    readFile(new URL("../frontend/src/App.tsx", import.meta.url), "utf8"),
    readFile(new URL("../frontend/src/styles.css", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
  ]);
  for (const phrase of ["技术指标", "买入与卖出规则", "回测报告", "完整交易明细", "需进一步核验", "不构成投资建议"]) assert.match(app, new RegExp(phrase));
  assert.match(styles, /@media\(max-width:760px\)/);
  assert.match(layout, /量化策略实验室/);
});
