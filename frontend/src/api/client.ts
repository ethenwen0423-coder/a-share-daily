import type {
  BacktestResult,
  FormState,
  InstrumentSearchResult,
} from "../types";

const localApi =
  typeof window !== "undefined" && window.location.port === "5173"
    ? "http://127.0.0.1:8000"
    : "";

export async function searchInstruments(
  query: string,
  signal?: AbortSignal,
): Promise<InstrumentSearchResult[]> {
  const response = await fetch(
    `${localApi}/api/instruments/search?q=${encodeURIComponent(query)}`,
    { signal },
  );
  if (!response.ok) throw new Error("标的查询服务暂时不可用");
  return response.json();
}

export async function runApiBacktest(form: FormState): Promise<BacktestResult> {
  if (!localApi) throw new Error("公网演示模式未连接 Python 服务");
  const serializeRule = (group: FormState["entryRule"]) => ({
    operator: group.operator,
    conditions: group.conditions.map((condition) => ({
      left: condition.left,
      comparison: condition.comparison,
      right: condition.right,
    })),
  });
  const configuration = {
    name: "可视化技术策略",
    indicators: form.indicators.map(({ id, type, params, source }) => ({
      id,
      type,
      params,
      source,
    })),
    entry_rule: serializeRule(form.entryRule),
    exit_rule: serializeRule(form.exitRule),
    position: { type: "fixed_ratio", value: form.position },
    risk: {
      stop_loss: form.stopLoss,
      take_profit: form.takeProfit,
      max_holding_days: form.maxHoldingDays,
    },
    close_at_end: true,
  };
  const response = await fetch(`${localApi}/api/backtests`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      configuration,
      symbol: form.symbol,
      name: form.instrumentName,
      market: form.assetType === "stock" ? "a_share" : form.assetType,
      asset_type: form.assetType,
      exchange: "CN",
      start_date: form.startDate,
      end_date: form.endDate,
      initial_cash: form.initialCash,
      commission_rate: form.commission,
      stamp_duty_rate: form.stampDuty,
      slippage_rate: form.slippage,
      minimum_commission: 0,
      adjust: "qfq",
      data_mode: form.dataMode,
    }),
  });
  const run = await response.json();
  if (!response.ok || run.status === "failed")
    throw new Error(run.error_message || run.error?.message || "回测失败");
  const [equity, trades] = await Promise.all([
    fetch(`${localApi}/api/backtests/${run.id}/equity`).then((r) => r.json()),
    fetch(`${localApi}/api/backtests/${run.id}/trades`).then((r) => r.json()),
  ]);
  return {
    ...run,
    equity: equity.map((x: Record<string, unknown>) => ({
      ...x,
      trade_date: String(x.trade_date),
    })),
    trades,
    data_source: form.dataMode === "sample" ? "固定模拟行情" : "AKShare",
    warnings: run.warnings || [],
    strategy_version: run.strategy_version || 1,
  };
}
