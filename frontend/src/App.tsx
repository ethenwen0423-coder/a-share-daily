"use client";
import { useEffect, useRef, useState } from "react";
import { runApiBacktest, searchInstruments } from "./api/client";
import EquityChart from "./components/EquityChart";
import type {
  BacktestResult,
  Comparison,
  FormState,
  IndicatorConfig,
  IndicatorType,
  InstrumentSearchResult,
  RuleConditionConfig,
  RuleGroupConfig,
} from "./types";
import { runDemoBacktest } from "./utils/demoEngine";

type Page = "home" | "editor" | "running" | "report" | "history";
const nav: [Page, string, string][] = [
  ["home", "总览", "⌂"],
  ["editor", "策略工作台", "⌘"],
  ["history", "历史记录", "◷"],
];
const indicatorOptions: { type: IndicatorType; label: string }[] = [
  { type: "sma", label: "SMA" },
  { type: "ema", label: "EMA" },
  { type: "macd", label: "MACD" },
  { type: "rsi", label: "RSI" },
  { type: "bollinger", label: "布林带" },
  { type: "volume_ma", label: "成交量均线" },
  { type: "wma", label: "WMA" },
  { type: "atr", label: "ATR" },
  { type: "roc", label: "ROC" },
  { type: "cci", label: "CCI" },
  { type: "williams_r", label: "威廉指标" },
  { type: "obv", label: "OBV" },
];
const indicatorNames: Record<IndicatorType, string> = Object.fromEntries(
  indicatorOptions.map((item) => [item.type, item.label]),
) as Record<IndicatorType, string>;
const comparisonLabels: Record<Comparison, string> = {
  greater_than: "大于",
  greater_or_equal: "大于等于",
  less_than: "小于",
  less_or_equal: "小于等于",
  equal: "等于",
  not_equal: "不等于",
  cross_above: "上穿",
  cross_below: "下穿",
};
const assetTypeLabel: Record<FormState["assetType"], string> = {
  stock: "A股",
  etf: "ETF / 场内基金",
  index: "主要指数",
};
const defaultForm: FormState = {
  symbol: "510300",
  instrumentName: "沪深300ETF",
  assetType: "etf",
  startDate: "2024-01-02",
  endDate: "2026-07-10",
  initialCash: 100000,
  commission: 0.0003,
  stampDuty: 0.0005,
  slippage: 0.0005,
  indicators: [
    { id: "ma_fast", type: "sma", params: { period: 5 }, source: "close" },
    { id: "ma_slow", type: "sma", params: { period: 20 }, source: "close" },
  ],
  entryRule: {
    operator: "and",
    conditions: [
      {
        id: "entry_default",
        left: "ma_fast",
        comparison: "cross_above",
        rightMode: "indicator",
        right: "ma_slow",
      },
    ],
  },
  exitRule: {
    operator: "or",
    conditions: [
      {
        id: "exit_default",
        left: "ma_fast",
        comparison: "cross_below",
        rightMode: "indicator",
        right: "ma_slow",
      },
    ],
  },
  position: 1,
  stopLoss: 0.08,
  takeProfit: 0.2,
  maxHoldingDays: null,
  dataMode: "sample",
};
const pct = (v: number | null | undefined) =>
  v == null ? "—" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(2)}%`;
const money = (v: number) =>
  new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(v);
let configSequence = 0;
const nextConfigId = (prefix: string) =>
  `${prefix}_${Date.now()}_${configSequence++}`;
const indicatorLabel = (indicator: IndicatorConfig) => {
  const name = indicatorNames[indicator.type];
  if (indicator.type === "macd")
    return `${name}(${indicator.params.fast_period},${indicator.params.slow_period},${indicator.params.signal_period})`;
  if (indicator.type === "bollinger")
    return `${name}(${indicator.params.period}, ${indicator.params.standard_deviation}σ)`;
  if (indicator.type === "obv") return name;
  return `${name}(${indicator.params.period})`;
};
const indicatorDefaults = (type: IndicatorType): IndicatorConfig => {
  const periods: Partial<Record<IndicatorType, number>> = {
    rsi: 14,
    atr: 14,
    roc: 12,
    cci: 20,
    williams_r: 14,
  };
  return {
    id: nextConfigId(type),
    type,
    source: type === "volume_ma" ? "volume" : "close",
    params:
      type === "macd"
        ? { fast_period: 12, slow_period: 26, signal_period: 9 }
        : type === "bollinger"
          ? { period: 20, standard_deviation: 2 }
          : type === "obv"
            ? {}
            : { period: periods[type] ?? 20 },
  };
};

export default function App() {
  const [page, setPage] = useState<Page>("home");
  const [form, setForm] = useState<FormState>(defaultForm);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [history, setHistory] = useState<BacktestResult[]>([]);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState("");
  const [error, setError] = useState("");
  const runSequence = useRef(0);
  const go = (p: Page) => {
    setPage(p);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const cancelRun = (destination: Page = "editor") => {
    runSequence.current += 1;
    setProgress(0);
    setStatusText("");
    setError("");
    go(destination);
  };
  const navigate = (destination: Page) =>
    page === "running" ? cancelRun(destination) : go(destination);
  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));
  const run = async () => {
    const sequence = ++runSequence.current;
    const cancelled = () => sequence !== runSequence.current;
    setError("");
    setProgress(12);
    setStatusText("正在校验策略参数");
    go("running");
    await new Promise((r) => setTimeout(r, 250));
    if (cancelled()) return;
    setProgress(38);
    setStatusText(
      form.dataMode === "akshare"
        ? "正在请求 AKShare 并检查本地缓存"
        : "正在载入固定种子模拟行情",
    );
    await new Promise((r) => setTimeout(r, 300));
    if (cancelled()) return;
    setProgress(68);
    setStatusText("正在逐日计算信号、成本和资产曲线");
    try {
      let next: BacktestResult;
      try {
        next = await runApiBacktest(form);
      } catch (e) {
        if (form.dataMode === "akshare") throw e;
        next = runDemoBacktest(form);
      }
      if (cancelled()) return;
      setProgress(92);
      setStatusText("正在计算绩效指标并生成报告");
      await new Promise((r) => setTimeout(r, 260));
      if (cancelled()) return;
      setResult(next);
      setHistory((prev) => [{ ...next, id: next.id || Date.now() }, ...prev]);
      setProgress(100);
      go("report");
    } catch (e) {
      if (cancelled()) return;
      setError(e instanceof Error ? e.message : "回测失败");
      setProgress(100);
    }
  };
  const latest = result || history[0];
  return (
    <div className="appShell">
      <aside className="sidebar">
        <button className="logo" onClick={() => navigate("home")}>
          <span>Q</span>
          <div>
            <b>量化策略实验室</b>
            <small>QUANT LAB</small>
          </div>
        </button>
        <div className="researchBadge">
          <i />
          仅研究回测 · 不接实盘
        </div>
        <nav>
          {nav.map(([id, label, icon]) => (
            <button
              key={id}
              className={page === id ? "active" : ""}
              onClick={() => navigate(id)}
            >
              <span>{icon}</span>
              {label}
            </button>
          ))}
        </nav>
        <div className="sideFoot">
          <b>数据与成交纪律</b>
          <p>
            AKShare 日线 · T+1 开盘成交
            <br />
            固定种子样本可复现
          </p>
          <span>v0.1 MVP</span>
        </div>
      </aside>
      <div className="mainArea">
        <header className="topbar">
          <div>
            <span className="mobileBrand">Q</span>
            <p>
              {page === "home"
                ? "研究总览"
                : page === "editor"
                  ? "策略工作台"
                  : page === "running"
                    ? "回测运行"
                    : page === "report"
                      ? "回测报告"
                      : "历史记录"}
            </p>
          </div>
          <div className="topActions">
            <span className="health">
              <i />
              研究服务就绪
            </span>
            <button className="ghostBtn" onClick={() => navigate("history")}>
              历史记录
            </button>
            <button className="primaryBtn" onClick={() => navigate("editor")}>
              {page === "running" || page === "report"
                ? "← 修改策略"
                : "＋ 新建回测"}
            </button>
          </div>
        </header>
        {page === "home" && (
          <Home
            latest={latest}
            onCreate={() => go("editor")}
            onReport={() => latest && go("report")}
          />
        )}
        {page === "editor" && (
          <Editor
            form={form}
            update={update}
            onRun={run}
          />
        )}
        {page === "running" && (
          <Running
            progress={progress}
            text={statusText}
            error={error}
            onRetry={() => cancelRun("editor")}
            onCancel={() => cancelRun("editor")}
          />
        )}
        {page === "report" && result && (
          <Report result={result} form={form} onEdit={() => go("editor")} />
        )}
        {page === "report" && !result && (
          <Empty title="还没有可查看的报告" action={() => go("editor")} />
        )}
        {page === "history" && (
          <History
            rows={history}
            onOpen={(row) => {
              setResult(row);
              go("report");
            }}
            onRerun={run}
          />
        )}
      </div>
    </div>
  );
}

function Home({
  latest,
  onCreate,
  onReport,
}: {
  latest: BacktestResult | null;
  onCreate: () => void;
  onReport: () => void;
}) {
  return (
    <main className="content homePage">
      <section className="heroPanel">
        <div>
          <span className="eyebrow">VISUAL STRATEGY BACKTESTING</span>
          <h1>
            把交易想法，变成
            <br />
            <em>可验证的历史证据</em>
          </h1>
          <p>
            无需编写
            Python。组合技术指标与风控条件，用同一份数据、参数和策略版本复现每一次回测。
          </p>
          <div className="heroActions">
            <button className="primaryBtn large" onClick={onCreate}>
              开始创建策略 →
            </button>
            <span>日线 · 单标的 · A股 / ETF / 指数</span>
          </div>
        </div>
        <div className="heroDiagram">
          <div className="flowStep">
            <span>01</span>
            <b>定义规则</b>
            <small>SMA5 上穿 SMA20</small>
          </div>
          <i>→</i>
          <div className="flowStep">
            <span>02</span>
            <b>执行回测</b>
            <small>T+1 开盘成交</small>
          </div>
          <i>→</i>
          <div className="flowStep focus">
            <span>03</span>
            <b>核验证据</b>
            <small>收益 · 回撤 · 交易</small>
          </div>
        </div>
      </section>
      <section className="summaryRow">
        <article>
          <span>数据纪律</span>
          <b>拒绝虚假行情</b>
          <p>AKShare 异常或空数据时立即停止。</p>
        </article>
        <article>
          <span>成交纪律</span>
          <b>无未来函数</b>
          <p>收盘确认信号，下一交易日开盘成交。</p>
        </article>
        <article>
          <span>复现纪律</span>
          <b>版本化策略</b>
          <p>策略参数与数据快照随报告保存。</p>
        </article>
      </section>
      <section className="splitSection">
        <div className="sectionBlock">
          <div className="sectionTitle">
            <div>
              <span>RECENT RUN</span>
              <h2>最近回测</h2>
            </div>
            {latest && <button onClick={onReport}>查看完整报告 →</button>}
          </div>
          {latest ? (
            <div className="latestRun">
              <div className="runIdentity">
                <span className="instrumentIcon">3E</span>
                <div>
                  <b>{latest.instrument_name || latest.symbol}</b>
                  <small>{latest.symbol} · 可视化技术策略</small>
                </div>
                <span className="successPill">已完成</span>
              </div>
              <div className="miniMetrics">
                <div>
                  <span>累计收益</span>
                  <b
                    className={
                      (latest.metrics.total_return || 0) >= 0 ? "gain" : "loss"
                    }
                  >
                    {pct(latest.metrics.total_return)}
                  </b>
                </div>
                <div>
                  <span>最大回撤</span>
                  <b>{pct(latest.metrics.max_drawdown)}</b>
                </div>
                <div>
                  <span>夏普比率</span>
                  <b>{latest.metrics.sharpe_ratio?.toFixed(2) || "—"}</b>
                </div>
                <div>
                  <span>交易次数</span>
                  <b>{latest.metrics.trade_count}</b>
                </div>
              </div>
            </div>
          ) : (
            <EmptyInline onCreate={onCreate} />
          )}
        </div>
        <div className="sectionBlock methodBlock">
          <div className="sectionTitle">
            <div>
              <span>METHODOLOGY</span>
              <h2>当前回测口径</h2>
            </div>
          </div>
          <dl>
            <div>
              <dt>信号时点</dt>
              <dd>T 日收盘后确认</dd>
            </div>
            <div>
              <dt>成交时点</dt>
              <dd>T+1 交易日开盘</dd>
            </div>
            <div>
              <dt>基准</dt>
              <dd>标的买入并持有</dd>
            </div>
            <div>
              <dt>交易单位</dt>
              <dd>100 股整数手</dd>
            </div>
          </dl>
        </div>
      </section>
    </main>
  );
}

function Editor({
  form,
  update,
  onRun,
}: {
  form: FormState;
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  onRun: () => void;
}) {
  const [lookupState, setLookupState] = useState<
    "idle" | "loading" | "success" | "error"
  >(form.instrumentName ? "success" : "idle");
  const [matches, setMatches] = useState<InstrumentSearchResult[]>([]);
  const addIndicator = (type: IndicatorType) =>
    update("indicators", [...form.indicators, indicatorDefaults(type)]);
  const changeIndicator = (id: string, patch: Partial<IndicatorConfig>) =>
    update(
      "indicators",
      form.indicators.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    );
  const removeIndicator = (id: string) => {
    update(
      "indicators",
      form.indicators.filter((item) => item.id !== id),
    );
    const clean = (group: RuleGroupConfig): RuleGroupConfig => ({
      ...group,
      conditions: group.conditions.filter(
        (condition) =>
          condition.left !== id &&
          !(condition.rightMode === "indicator" && condition.right === id),
      ),
    });
    update("entryRule", clean(form.entryRule));
    update("exitRule", clean(form.exitRule));
  };
  const chooseInstrument = (instrument: InstrumentSearchResult) => {
    update("instrumentName", instrument.name);
    update("assetType", instrument.asset_type);
    setLookupState("success");
  };

  useEffect(() => {
    if (!/^\d{6}$/.test(form.symbol)) {
      setMatches([]);
      setLookupState("idle");
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLookupState("loading");
      try {
        const found = await searchInstruments(form.symbol, controller.signal);
        const exact = found.filter((item) => item.symbol === form.symbol);
        const candidates = exact.length ? exact : found;
        if (!candidates.length) {
          update("instrumentName", "");
          setMatches([]);
          setLookupState("error");
          return;
        }
        setMatches(candidates);
        chooseInstrument(candidates[0]);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        update("instrumentName", "");
        setMatches([]);
        setLookupState("error");
      }
    }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [form.symbol]);

  const onSymbolChange = (value: string) => {
    const symbol = value.replace(/\D/g, "").slice(0, 6);
    update("symbol", symbol);
    update("instrumentName", "");
    setMatches([]);
    setLookupState("idle");
  };
  const instrumentReady =
    lookupState === "success" && Boolean(form.instrumentName);
  const indicatorIds = new Set(form.indicators.map((item) => item.id));
  const strategyErrors = [
    ...(form.indicators.length ? [] : ["请至少新增一个技术指标"]),
    ...(form.entryRule.conditions.length ? [] : ["请至少设置一个买入条件"]),
    ...(form.exitRule.conditions.length ? [] : ["请至少设置一个卖出条件"]),
    ...[...form.entryRule.conditions, ...form.exitRule.conditions].flatMap(
      (condition) =>
        !indicatorIds.has(condition.left) ||
        (condition.rightMode === "indicator" &&
          !indicatorIds.has(String(condition.right)))
          ? ["交易条件引用了已删除的指标"]
          : [],
    ),
    ...form.indicators.flatMap((indicator) => {
      if (
        indicator.type === "macd" &&
        indicator.params.fast_period >= indicator.params.slow_period
      )
        return ["MACD 快线周期必须小于慢线周期"];
      if (Object.values(indicator.params).some((value) => value <= 0))
        return [`${indicatorNames[indicator.type]} 参数必须大于 0`];
      return [];
    }),
  ];
  const strategyError = [...new Set(strategyErrors)][0];
  const indicatorSummary = form.indicators.length
    ? form.indicators.map(indicatorLabel).join(" · ")
    : "尚未添加指标";
  return (
    <main className="content editorPage">
      <div className="pageLead">
        <div>
          <span className="eyebrow">STRATEGY BUILDER</span>
          <h1>可视化策略工作台</h1>
          <p>按顺序配置标的、指标、买卖条件与风控。普通用户无需接触 JSON。</p>
        </div>
        <button
          className="templateBtn"
          onClick={() => {
            Object.entries(defaultForm).forEach(([k, v]) =>
              update(k as keyof FormState, v as never),
            );
            setMatches([]);
            setLookupState("success");
          }}
        >
          ↻ 一键加载双均线示例
        </button>
      </div>
      <div className="stepper">
        {["选择标的", "回测设置", "技术指标", "交易规则", "仓位风控"].map(
          (x, i) => (
            <div className={i < 5 ? "done" : ""} key={x}>
              <span>{i + 1}</span>
              <b>{x}</b>
            </div>
          ),
        )}
      </div>
      <section className="editorLayout">
        <div className="formStack">
          <FormSection no="01" title="标的与数据">
            <div className="fieldGrid three">
              <Field label="证券代码">
                <input
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="输入 6 位代码"
                  value={form.symbol}
                  onChange={(e) => onSymbolChange(e.target.value)}
                  aria-describedby="instrument-lookup-status"
                />
              </Field>
              <Field label="标的名称">
                <input
                  className="autoField"
                  value={form.instrumentName}
                  placeholder="输入代码后自动识别"
                  readOnly
                  aria-readonly="true"
                />
              </Field>
              <Field label="资产类型">
                <input
                  className="autoField"
                  value={instrumentReady ? assetTypeLabel[form.assetType] : ""}
                  placeholder="输入代码后自动识别"
                  readOnly
                  aria-readonly="true"
                  aria-label="自动识别的资产类型"
                />
              </Field>
            </div>
            <div
              id="instrument-lookup-status"
              className={`lookupStatus ${lookupState}`}
              aria-live="polite"
            >
              {lookupState === "loading" ? (
                <>
                  <i />正在识别证券代码…
                </>
              ) : lookupState === "success" ? (
                <>
                  ✓ 已识别：{form.instrumentName} · {assetTypeLabel[form.assetType]}
                </>
              ) : lookupState === "error" ? (
                <>未找到该证券代码，请检查后重试</>
              ) : form.symbol.length > 0 && form.symbol.length < 6 ? (
                <>请输入完整的 6 位证券代码</>
              ) : (
                <>输入代码后将自动带出名称和资产类型</>
              )}
            </div>
            {matches.length > 1 && (
              <div className="instrumentMatches">
                <span>该代码对应多个标的，请确认：</span>
                {matches.map((item) => (
                  <button
                    type="button"
                    className={
                      item.name === form.instrumentName &&
                      item.asset_type === form.assetType
                        ? "selected"
                        : ""
                    }
                    key={`${item.symbol}-${item.name}-${item.asset_type}`}
                    onClick={() => chooseInstrument(item)}
                  >
                    <b>{item.name}</b>
                    <small>
                      {assetTypeLabel[item.asset_type]} · {item.exchange}
                    </small>
                  </button>
                ))}
              </div>
            )}
            <div className="fieldGrid three">
              <Field label="开始日期">
                <input
                  type="date"
                  value={form.startDate}
                  onChange={(e) => update("startDate", e.target.value)}
                />
              </Field>
              <Field label="结束日期">
                <input
                  type="date"
                  value={form.endDate}
                  onChange={(e) => update("endDate", e.target.value)}
                />
              </Field>
              <Field label="数据来源">
                <select
                  value={form.dataMode}
                  onChange={(e) =>
                    update("dataMode", e.target.value as FormState["dataMode"])
                  }
                >
                  <option value="sample">固定种子演示数据</option>
                  <option value="akshare">AKShare 真实行情（本地）</option>
                </select>
              </Field>
            </div>
            <p className="hint">
              公网版本默认使用可复现的固定种子行情；连接本地 Python 服务后可切换
              AKShare，空数据不会执行回测。
            </p>
          </FormSection>
          <FormSection no="02" title="资金与交易成本">
            <div className="fieldGrid four">
              <Field label="初始资金（元）">
                <input
                  type="number"
                  value={form.initialCash}
                  onChange={(e) => update("initialCash", +e.target.value)}
                />
              </Field>
              <Field label="手续费率">
                <input
                  type="number"
                  step="0.0001"
                  value={form.commission}
                  onChange={(e) => update("commission", +e.target.value)}
                />
              </Field>
              <Field label="卖出印花税率">
                <input
                  type="number"
                  step="0.0001"
                  value={form.stampDuty}
                  onChange={(e) => update("stampDuty", +e.target.value)}
                />
              </Field>
              <Field label="滑点率">
                <input
                  type="number"
                  step="0.0001"
                  value={form.slippage}
                  onChange={(e) => update("slippage", +e.target.value)}
                />
              </Field>
            </div>
          </FormSection>
          <FormSection no="03" title="技术指标">
            <p className="sectionHint">
              点击指标即可新增实例；同一指标可添加多次并设置不同参数。
            </p>
            <div className="indicatorPicker">
              {indicatorOptions.map((option) => {
                const count = form.indicators.filter(
                  (item) => item.type === option.type,
                ).length;
                return (
                <button
                  type="button"
                  className={count ? "selected" : ""}
                  aria-label={`新增 ${option.label} 指标`}
                  onClick={() => addIndicator(option.type)}
                  key={option.type}
                >
                  <span>＋</span>
                  {option.label}
                  {count > 0 && <small>{count}</small>}
                </button>
                );
              })}
            </div>
            <div className="indicatorRows">
              {form.indicators.map((indicator, index) => (
                <IndicatorEditor
                  key={indicator.id}
                  indicator={indicator}
                  index={index}
                  onChange={(patch) => changeIndicator(indicator.id, patch)}
                  onRemove={() => removeIndicator(indicator.id)}
                />
              ))}
              {!form.indicators.length && (
                <div className="configEmpty">点击上方按钮新增技术指标</div>
              )}
            </div>
          </FormSection>
          <FormSection no="04" title="买入与卖出规则">
            <div className="rulesGrid">
              <RuleGroupEditor
                kind="entry"
                title="买入条件"
                group={form.entryRule}
                indicators={form.indicators}
                onChange={(group) => update("entryRule", group)}
              />
              <RuleGroupEditor
                kind="exit"
                title="卖出条件"
                group={form.exitRule}
                indicators={form.indicators}
                onChange={(group) => update("exitRule", group)}
              />
            </div>
          </FormSection>
          <FormSection no="05" title="仓位与风控">
            <div className="fieldGrid four">
              <Field label="固定仓位比例">
                <div className="suffix">
                  <input
                    type="number"
                    min="10"
                    max="100"
                    value={form.position * 100}
                    onChange={(e) => update("position", +e.target.value / 100)}
                  />
                  <span>%</span>
                </div>
              </Field>
              <Field label="固定止损">
                <div className="suffix">
                  <input
                    type="number"
                    value={form.stopLoss * 100}
                    onChange={(e) => update("stopLoss", +e.target.value / 100)}
                  />
                  <span>%</span>
                </div>
              </Field>
              <Field label="固定止盈">
                <div className="suffix">
                  <input
                    type="number"
                    value={form.takeProfit * 100}
                    onChange={(e) =>
                      update("takeProfit", +e.target.value / 100)
                    }
                  />
                  <span>%</span>
                </div>
              </Field>
              <Field label="最大持仓天数">
                <input
                  placeholder="不限制"
                  type="number"
                  value={form.maxHoldingDays ?? ""}
                  onChange={(e) =>
                    update(
                      "maxHoldingDays",
                      e.target.value ? +e.target.value : null,
                    )
                  }
                />
              </Field>
            </div>
          </FormSection>
        </div>
        <aside className="runSummary">
          <span className="eyebrow">RUN SUMMARY</span>
          <h3>回测摘要</h3>
          <dl>
            <div>
              <dt>标的</dt>
              <dd>
                {form.instrumentName || "待识别"}
                <small>{form.symbol}</small>
              </dd>
            </div>
            <div>
              <dt>区间</dt>
              <dd>
                {form.startDate}
                <small>至 {form.endDate}</small>
              </dd>
            </div>
            <div>
              <dt>初始资金</dt>
              <dd>¥ {money(form.initialCash)}</dd>
            </div>
            <div>
              <dt>策略</dt>
              <dd>
                {form.indicators.length} 个指标 · {form.entryRule.conditions.length + form.exitRule.conditions.length} 个条件
                <small>T+1 开盘成交</small>
              </dd>
            </div>
            <div>
              <dt>数据</dt>
              <dd>{form.dataMode === "sample" ? "固定种子样本" : "AKShare"}</dd>
            </div>
          </dl>
          <p className="summaryIndicators">{indicatorSummary}</p>
          {strategyError && <p className="fieldError">{strategyError}</p>}
          {!instrumentReady && (
            <p className="fieldError">请先输入并识别有效的证券代码</p>
          )}
          <button
            className="primaryBtn runButton"
            disabled={Boolean(strategyError) || !instrumentReady}
            onClick={onRun}
          >
            开始回测 <span>→</span>
          </button>
          <button className="saveButton">保存策略版本</button>
          <p className="riskText">本功能仅用于历史研究，不构成投资建议。</p>
        </aside>
      </section>
    </main>
  );
}

function IndicatorEditor({
  indicator,
  index,
  onChange,
  onRemove,
}: {
  indicator: IndicatorConfig;
  index: number;
  onChange: (patch: Partial<IndicatorConfig>) => void;
  onRemove: () => void;
}) {
  const setParam = (name: string, value: number) =>
    onChange({ params: { ...indicator.params, [name]: value } });
  const sourceLabels = {
    open: "开盘价",
    high: "最高价",
    low: "最低价",
    close: "收盘价",
    volume: "成交量",
  } as const;
  const lockedSourceLabels: Partial<Record<IndicatorType, string>> = {
    volume_ma: "成交量",
    atr: "最高/最低/收盘",
    cci: "最高/最低/收盘",
    williams_r: "最高/最低/收盘",
    obv: "收盘价 + 成交量",
  };
  const lockedSourceLabel = lockedSourceLabels[indicator.type];
  return (
    <div className="indicatorRow">
      <span className="indicatorOrder">{String(index + 1).padStart(2, "0")}</span>
      <div className="indicatorIdentity">
        <b>{indicatorNames[indicator.type]}</b>
        <small>{indicatorLabel(indicator)}</small>
      </div>
      <div className="indicatorParams">
        {indicator.type === "macd" ? (
          <>
            <label>
              <span>快线</span>
              <input
                aria-label={`${indicatorNames[indicator.type]} 快线周期`}
                type="number"
                min="2"
                value={indicator.params.fast_period}
                onChange={(event) =>
                  setParam("fast_period", +event.target.value)
                }
              />
            </label>
            <label>
              <span>慢线</span>
              <input
                aria-label={`${indicatorNames[indicator.type]} 慢线周期`}
                type="number"
                min="3"
                value={indicator.params.slow_period}
                onChange={(event) =>
                  setParam("slow_period", +event.target.value)
                }
              />
            </label>
            <label>
              <span>信号</span>
              <input
                aria-label={`${indicatorNames[indicator.type]} 信号周期`}
                type="number"
                min="2"
                value={indicator.params.signal_period}
                onChange={(event) =>
                  setParam("signal_period", +event.target.value)
                }
              />
            </label>
          </>
        ) : indicator.type === "obv" ? (
          <span className="indicatorStaticParam">累计量价指标，无需周期参数</span>
        ) : (
          <label>
            <span>周期</span>
            <input
              aria-label={`${indicatorNames[indicator.type]} 周期`}
              type="number"
              min="2"
              value={indicator.params.period}
              onChange={(event) => setParam("period", +event.target.value)}
            />
          </label>
        )}
        {indicator.type === "bollinger" && (
          <label>
            <span>标准差</span>
            <input
              aria-label="布林带标准差倍数"
              type="number"
              min="0.1"
              step="0.1"
              value={indicator.params.standard_deviation}
              onChange={(event) =>
                setParam("standard_deviation", +event.target.value)
              }
            />
          </label>
        )}
      </div>
      <label className="sourceSelect">
        <span>数据源</span>
        <select
          aria-label={`${indicatorNames[indicator.type]} 数据源`}
          value={indicator.source}
          disabled={Boolean(lockedSourceLabel)}
          onChange={(event) =>
            onChange({ source: event.target.value as IndicatorConfig["source"] })
          }
        >
          {lockedSourceLabel ? (
            <option value={indicator.source}>{lockedSourceLabel}</option>
          ) : (
            Object.entries(sourceLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))
          )}
        </select>
      </label>
      <button
        type="button"
        className="removeConfig"
        aria-label={`删除 ${indicatorLabel(indicator)}`}
        onClick={onRemove}
      >
        删除
      </button>
    </div>
  );
}

function RuleGroupEditor({
  kind,
  title,
  group,
  indicators,
  onChange,
}: {
  kind: "entry" | "exit";
  title: string;
  group: RuleGroupConfig;
  indicators: IndicatorConfig[];
  onChange: (group: RuleGroupConfig) => void;
}) {
  const addCondition = () => {
    if (!indicators.length) return;
    const rightIndicator = indicators[1];
    const condition: RuleConditionConfig = {
      id: nextConfigId(kind),
      left: indicators[0].id,
      comparison: rightIndicator
        ? kind === "entry"
          ? "cross_above"
          : "cross_below"
        : kind === "entry"
          ? "greater_than"
          : "less_than",
      rightMode: rightIndicator ? "indicator" : "value",
      right: rightIndicator?.id ?? (kind === "entry" ? 50 : 30),
    };
    onChange({ ...group, conditions: [...group.conditions, condition] });
  };
  const changeCondition = (
    id: string,
    patch: Partial<RuleConditionConfig>,
  ) =>
    onChange({
      ...group,
      conditions: group.conditions.map((condition) =>
        condition.id === id ? { ...condition, ...patch } : condition,
      ),
    });
  const removeCondition = (id: string) =>
    onChange({
      ...group,
      conditions: group.conditions.filter((condition) => condition.id !== id),
    });
  return (
    <div className={`ruleBox ${kind}`}>
      <div className="ruleHeader">
        <span>{title}</span>
        <label>
          <span>组合方式</span>
          <select
            aria-label={`${title}组合方式`}
            value={group.operator}
            onChange={(event) =>
              onChange({
                ...group,
                operator: event.target.value as RuleGroupConfig["operator"],
              })
            }
          >
            <option value="and">全部满足 AND</option>
            <option value="or">任一满足 OR</option>
          </select>
        </label>
      </div>
      <div className="conditionList">
        {group.conditions.map((condition, index) => (
          <div className="conditionRow" key={condition.id}>
            <span className="conditionNumber">{index + 1}</span>
            <select
              aria-label={`${title} ${index + 1} 左侧指标`}
              value={condition.left}
              onChange={(event) =>
                changeCondition(condition.id, { left: event.target.value })
              }
            >
              {indicators.map((indicator) => (
                <option value={indicator.id} key={indicator.id}>
                  {indicatorLabel(indicator)}
                </option>
              ))}
            </select>
            <select
              aria-label={`${title} ${index + 1} 比较方式`}
              value={condition.comparison}
              onChange={(event) =>
                changeCondition(condition.id, {
                  comparison: event.target.value as Comparison,
                })
              }
            >
              {Object.entries(comparisonLabels).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
            <select
              className="operandMode"
              aria-label={`${title} ${index + 1} 右侧类型`}
              value={condition.rightMode}
              onChange={(event) => {
                const mode = event.target.value as RuleConditionConfig["rightMode"];
                changeCondition(condition.id, {
                  rightMode: mode,
                  right: mode === "indicator" ? indicators[0]?.id || "" : 0,
                });
              }}
            >
              <option value="indicator">指标</option>
              <option value="value">数值</option>
            </select>
            {condition.rightMode === "indicator" ? (
              <select
                aria-label={`${title} ${index + 1} 右侧指标`}
                value={String(condition.right)}
                onChange={(event) =>
                  changeCondition(condition.id, { right: event.target.value })
                }
              >
                {indicators.map((indicator) => (
                  <option value={indicator.id} key={indicator.id}>
                    {indicatorLabel(indicator)}
                  </option>
                ))}
              </select>
            ) : (
              <input
                aria-label={`${title} ${index + 1} 比较数值`}
                type="number"
                step="0.1"
                value={Number(condition.right)}
                onChange={(event) =>
                  changeCondition(condition.id, { right: +event.target.value })
                }
              />
            )}
            <button
              type="button"
              className="removeCondition"
              aria-label={`删除${title} ${index + 1}`}
              onClick={() => removeCondition(condition.id)}
            >
              ×
            </button>
          </div>
        ))}
        {!group.conditions.length && (
          <div className="conditionEmpty">尚未设置{title}</div>
        )}
      </div>
      <button
        type="button"
        className="addCondition"
        disabled={!indicators.length}
        onClick={addCondition}
      >
        ＋ 新增{title}
      </button>
    </div>
  );
}

function Running({
  progress,
  text,
  error,
  onRetry,
  onCancel,
}: {
  progress: number;
  text: string;
  error: string;
  onRetry: () => void;
  onCancel: () => void;
}) {
  return (
    <main className="content runningPage">
      <div className="runningCard">
        <div className={error ? "runOrb errorOrb" : "runOrb"}>
          <span>{error ? "!" : `${progress}%`}</span>
        </div>
        <span className="eyebrow">BACKTEST ENGINE</span>
        <h1>{error ? "回测未完成" : "正在执行回测"}</h1>
        <p>{error || text}</p>
        <div className="progressTrack">
          <i style={{ width: `${progress}%` }} />
        </div>
        <div className="runStages">
          {["参数校验", "行情准备", "信号计算", "绩效分析"].map((x, i) => (
            <span className={progress > i * 25 ? "done" : ""} key={x}>
              {progress > i * 25 ? "✓" : "○"} {x}
            </span>
          ))}
        </div>
        {error && (
          <button className="primaryBtn" onClick={onRetry}>
            返回修改参数
          </button>
        )}
        {!error && (
          <button className="ghostBtn runningCancel" onClick={onCancel}>
            ← 取消回测并修改策略
          </button>
        )}
      </div>
    </main>
  );
}

function Report({
  result,
  form,
  onEdit,
}: {
  result: BacktestResult;
  form: FormState;
  onEdit: () => void;
}) {
  const m = result.metrics;
  return (
    <main className="content reportPage">
      <div className="reportHead">
        <div>
          <span className="eyebrow">
            BACKTEST REPORT · STRATEGY V{result.strategy_version}
          </span>
          <h1>{result.instrument_name || result.symbol} · 可视化技术策略</h1>
          <p>
            {form.startDate} — {form.endDate} · 数据快照{" "}
            {new Date(result.data_snapshot_time).toLocaleString("zh-CN")}
          </p>
        </div>
        <div className="reportActions">
          <button className="primaryBtn" onClick={onEdit}>
            ← 返回修改策略
          </button>
          <button className="ghostBtn" onClick={() => window.print()}>
            打印报告
          </button>
          <span className="successPill">回测完成</span>
        </div>
      </div>
      {result.warnings.length > 0 && (
        <div className="verifyBanner">
          <b>需进一步核验</b>
          <span>{result.warnings.join("；")}</span>
        </div>
      )}
      <section className="metricGrid">
        {[
          ["累计收益率", pct(m.total_return), m.total_return],
          ["年化收益率", pct(m.annualized_return), m.annualized_return],
          ["最大回撤", pct(m.max_drawdown), m.max_drawdown],
          ["夏普比率", m.sharpe_ratio?.toFixed(2) || "—", m.sharpe_ratio],
          ["基准收益", pct(m.benchmark_return), m.benchmark_return],
          ["超额收益", pct(m.excess_return), m.excess_return],
          [
            "胜率",
            m.win_rate == null ? "—" : `${(m.win_rate * 100).toFixed(1)}%`,
            m.win_rate,
          ],
          ["完整交易", String(m.trade_count), 0],
        ].map(([label, value, tone]) => (
          <article key={label as string}>
            <span>{label}</span>
            <b
              className={
                typeof tone === "number" && tone > 0
                  ? "gain"
                  : typeof tone === "number" && tone < 0
                    ? "loss"
                    : ""
              }
            >
              {value}
            </b>
            <small>
              {label === "最大回撤"
                ? "历史峰值至谷底"
                : label === "夏普比率"
                  ? "年化 252 个交易日"
                  : "按策略权益计算"}
            </small>
          </article>
        ))}
      </section>
      <section className="reportGrid">
        <article className="chartPanel wide">
          <div className="panelTitle">
            <div>
              <span>EQUITY CURVE</span>
              <h2>策略净值与买入持有</h2>
            </div>
            <small>净值基准 = 1.00</small>
          </div>
          <EquityChart data={result.equity} />
        </article>
        <article className="chartPanel">
          <div className="panelTitle">
            <div>
              <span>DRAWDOWN</span>
              <h2>回撤曲线</h2>
            </div>
            <small>单位：%</small>
          </div>
          <EquityChart data={result.equity} mode="drawdown" />
        </article>
        <article className="parameterPanel">
          <div className="panelTitle">
            <div>
              <span>REPRODUCIBILITY</span>
              <h2>复现信息</h2>
            </div>
          </div>
          <dl>
            <div>
              <dt>数据来源</dt>
              <dd>{result.data_source}</dd>
            </div>
            <div>
              <dt>复权方式</dt>
              <dd>前复权 qfq</dd>
            </div>
            <div>
              <dt>初始资金</dt>
              <dd>¥ {money(form.initialCash)}</dd>
            </div>
            <div>
              <dt>手续费 / 印花税</dt>
              <dd>
                {form.commission} / {form.stampDuty}
              </dd>
            </div>
            <div>
              <dt>滑点率</dt>
              <dd>{form.slippage}</dd>
            </div>
            <div>
              <dt>成交口径</dt>
              <dd>T 日收盘确认，T+1 开盘成交</dd>
            </div>
          </dl>
        </article>
      </section>
      <section className="tradeSection">
        <div className="sectionTitle">
          <div>
            <span>TRADE LEDGER</span>
            <h2>完整交易明细</h2>
          </div>
          <small>共 {result.trades.length} 笔成交</small>
        </div>
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>信号日期</th>
                <th>成交日期</th>
                <th>方向</th>
                <th>成交价</th>
                <th>数量</th>
                <th>手续费</th>
                <th>印花税</th>
                <th>已实现盈亏</th>
                <th>原因</th>
              </tr>
            </thead>
            <tbody>
              {result.trades.slice(0, 20).map((t, i) => (
                <tr key={i}>
                  <td>{t.signal_date}</td>
                  <td>{t.trade_date}</td>
                  <td>
                    <span className={t.side === "buy" ? "buyTag" : "sellTag"}>
                      {t.side === "buy" ? "买入" : "卖出"}
                    </span>
                  </td>
                  <td>{t.price.toFixed(3)}</td>
                  <td>{t.quantity}</td>
                  <td>{t.commission.toFixed(2)}</td>
                  <td>{t.stamp_duty.toFixed(2)}</td>
                  <td
                    className={(t.realized_profit || 0) >= 0 ? "gain" : "loss"}
                  >
                    {t.realized_profit == null ? "—" : money(t.realized_profit)}
                  </td>
                  <td>{t.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="disclaimer">
        <b>风险提示</b>
        <p>
          本结果基于历史数据和指定参数，不代表未来收益，不构成投资建议。固定种子数据仅用于验证回测流程；投资研究应使用已核验的真实行情。
        </p>
      </div>
    </main>
  );
}

function History({
  rows,
  onOpen,
  onRerun,
}: {
  rows: BacktestResult[];
  onOpen: (x: BacktestResult) => void;
  onRerun: () => void;
}) {
  return (
    <main className="content historyPage">
      <div className="pageLead">
        <div>
          <span className="eyebrow">RESEARCH ARCHIVE</span>
          <h1>策略与回测记录</h1>
          <p>
            连接本地 FastAPI 后，策略版本、数据快照和历史报告将持久保存至
            SQLite。
          </p>
        </div>
        <button className="primaryBtn" onClick={onRerun}>
          再次运行示例
        </button>
      </div>
      {rows.length ? (
        <div className="historyList">
          {rows.map((row, i) => (
            <article key={row.id || i}>
              <div>
                <span className="instrumentIcon">3E</span>
                <div>
                  <b>{row.instrument_name || row.symbol}</b>
                  <small>可视化技术策略 · V{row.strategy_version}</small>
                </div>
              </div>
              <span className="successPill">
                {row.status === "success" ? "已完成" : row.status}
              </span>
              <dl>
                <div>
                  <dt>累计收益</dt>
                  <dd
                    className={
                      (row.metrics.total_return || 0) >= 0 ? "gain" : "loss"
                    }
                  >
                    {pct(row.metrics.total_return)}
                  </dd>
                </div>
                <div>
                  <dt>最大回撤</dt>
                  <dd>{pct(row.metrics.max_drawdown)}</dd>
                </div>
                <div>
                  <dt>交易次数</dt>
                  <dd>{row.metrics.trade_count}</dd>
                </div>
              </dl>
              <button onClick={() => onOpen(row)}>查看报告 →</button>
            </article>
          ))}
        </div>
      ) : (
        <Empty title="还没有历史回测" action={onRerun} />
      )}
      <p className="historyNote">
        公网演示记录仅保留在当前页面内；持久化保存需启动本地 Python 服务。
      </p>
    </main>
  );
}

function FormSection({
  no,
  title,
  children,
}: {
  no: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="formSection">
      <div className="formSectionTitle">
        <span>{no}</span>
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function EmptyInline({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="emptyInline">
      <span>⌁</span>
      <div>
        <b>还没有回测记录</b>
        <p>加载示例策略，几步即可完成第一次验证。</p>
      </div>
      <button onClick={onCreate}>创建回测</button>
    </div>
  );
}
function Empty({ title, action }: { title: string; action: () => void }) {
  return (
    <div className="fullEmpty">
      <span>⌁</span>
      <h2>{title}</h2>
      <button className="primaryBtn" onClick={action}>
        开始第一次回测
      </button>
    </div>
  );
}
