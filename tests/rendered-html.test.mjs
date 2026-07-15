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
  const [app, styles, layout, client, demoEngine] = await Promise.all([
    readFile(new URL("../frontend/src/App.tsx", import.meta.url), "utf8"),
    readFile(new URL("../frontend/src/styles.css", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../frontend/src/api/client.ts", import.meta.url), "utf8"),
    readFile(new URL("../frontend/src/utils/demoEngine.ts", import.meta.url), "utf8"),
  ]);
  for (const phrase of ["技术指标", "买入与卖出规则", "回测报告", "完整交易明细", "需进一步核验", "不构成投资建议"]) assert.match(app, new RegExp(phrase));
  assert.match(styles, /@media\s*\(max-width:\s*760px\)/);
  assert.match(styles, /\.field input,[\s\S]*?font-size:\s*15px/);
  assert.match(styles, /\.indicatorParams input,[\s\S]*?font-size:\s*14px/);
  assert.match(styles, /@media\s*\(max-width:\s*760px\)[\s\S]*?font-size:\s*16px/);
  assert.match(layout, /量化策略实验室/);
  assert.match(app, /searchInstruments/);
  assert.match(app, /输入代码后将自动带出名称和资产类型/);
  assert.match(app, /该代码对应多个标的，请确认/);
  assert.match(app, /同一指标可添加多次/);
  assert.match(app, /RuleGroupEditor/);
  assert.match(app, /removeIndicator|删除.*指标/);
  assert.match(app, /removeCondition|删除.*条件/);
  for (const feature of ["WMA", "ATR", "ROC", "CCI", "威廉指标", "OBV", "大于等于", "小于等于", "不等于"]) assert.match(app, new RegExp(feature));
  assert.match(app, /取消回测并修改策略/);
  assert.match(app, /返回修改策略/);
  assert.match(app, /runSequence/);
  assert.match(client, /indicators: form\.indicators/);
  assert.match(client, /entry_rule: serializeRule/);
  assert.match(demoEngine, /calculateIndicator/);
  assert.match(demoEngine, /wmaSeries|atrSeries|rocSeries|cciSeries|williamsRSeries|obvSeries/);
  assert.match(demoEngine, /evaluateGroup\(form\.entryRule/);
});
