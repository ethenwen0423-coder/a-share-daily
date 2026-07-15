import type {
  BacktestResult,
  Comparison,
  EquityPoint,
  FormState,
  IndicatorConfig,
  RuleGroupConfig,
  Trade,
} from "../types";

type Bar = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};
type NullableSeries = Array<number | null>;

const round = (value: number, digits = 2) => Number(value.toFixed(digits));

function generateBars(start: string, end: string): Bar[] {
  const bars: Bar[] = [];
  let seed = 20260715;
  let price = 100;
  const cursor = new Date(`${start}T00:00:00`);
  const finish = new Date(`${end}T00:00:00`);
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  let index = 0;
  while (cursor <= finish && bars.length < 900) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) {
      const cycle = Math.sin(index / 11) * 0.008;
      const change = 0.00032 + cycle + (random() - 0.5) * 0.018;
      const open = price * (1 + (random() - 0.5) * 0.006);
      price = Math.max(20, price * (1 + change));
      const high = Math.max(open, price) * (1 + random() * 0.01);
      const low = Math.min(open, price) * (1 - random() * 0.01);
      bars.push({
        date: cursor.toISOString().slice(0, 10),
        open,
        high,
        low,
        close: price,
        volume: 8_000_000 + Math.floor(random() * 22_000_000),
      });
      index += 1;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return bars;
}

const smaSeries = (values: number[], period: number): NullableSeries =>
  values.map((_, index) =>
    index + 1 < period
      ? null
      : values
          .slice(index - period + 1, index + 1)
          .reduce((sum, value) => sum + value, 0) / period,
  );

const emaSeries = (values: number[], period: number): NullableSeries => {
  const alpha = 2 / (period + 1);
  let previous = values[0];
  return values.map((value, index) => {
    previous = index === 0 ? value : alpha * value + (1 - alpha) * previous;
    return index + 1 >= period ? previous : null;
  });
};

const wmaSeries = (values: number[], period: number): NullableSeries => {
  const result: NullableSeries = Array(values.length).fill(null);
  const denominator = (period * (period + 1)) / 2;
  for (let index = period - 1; index < values.length; index += 1) {
    let weighted = 0;
    for (let offset = 0; offset < period; offset += 1)
      weighted += values[index - period + 1 + offset] * (offset + 1);
    result[index] = weighted / denominator;
  }
  return result;
};

const rsiSeries = (values: number[], period: number): NullableSeries => {
  const result: NullableSeries = Array(values.length).fill(null);
  let averageGain = 0;
  let averageLoss = 0;
  for (let index = 1; index < values.length; index += 1) {
    const delta = values[index] - values[index - 1];
    const gain = Math.max(delta, 0);
    const loss = Math.max(-delta, 0);
    if (index <= period) {
      averageGain += gain / period;
      averageLoss += loss / period;
    } else {
      averageGain = (averageGain * (period - 1) + gain) / period;
      averageLoss = (averageLoss * (period - 1) + loss) / period;
    }
    if (index >= period)
      result[index] =
        averageLoss === 0
          ? 100
          : 100 - 100 / (1 + averageGain / averageLoss);
  }
  return result;
};

const atrSeries = (bars: Bar[], period: number): NullableSeries => {
  const result: NullableSeries = Array(bars.length).fill(null);
  let smoothed = 0;
  for (let index = 0; index < bars.length; index += 1) {
    const bar = bars[index];
    const previousClose = index > 0 ? bars[index - 1].close : bar.close;
    const trueRange = Math.max(
      bar.high - bar.low,
      Math.abs(bar.high - previousClose),
      Math.abs(bar.low - previousClose),
    );
    if (index < period) smoothed += trueRange / period;
    else smoothed = (smoothed * (period - 1) + trueRange) / period;
    if (index >= period - 1) result[index] = smoothed;
  }
  return result;
};

const rocSeries = (values: number[], period: number): NullableSeries =>
  values.map((value, index) =>
    index < period || values[index - period] === 0
      ? null
      : (value / values[index - period] - 1) * 100,
  );

const cciSeries = (bars: Bar[], period: number): NullableSeries => {
  const typical = bars.map((bar) => (bar.high + bar.low + bar.close) / 3);
  const result: NullableSeries = Array(bars.length).fill(null);
  for (let index = period - 1; index < typical.length; index += 1) {
    const window = typical.slice(index - period + 1, index + 1);
    const average = window.reduce((sum, value) => sum + value, 0) / period;
    const deviation =
      window.reduce((sum, value) => sum + Math.abs(value - average), 0) /
      period;
    result[index] = deviation === 0 ? null : (typical[index] - average) / (0.015 * deviation);
  }
  return result;
};

const williamsRSeries = (bars: Bar[], period: number): NullableSeries => {
  const result: NullableSeries = Array(bars.length).fill(null);
  for (let index = period - 1; index < bars.length; index += 1) {
    const window = bars.slice(index - period + 1, index + 1);
    const highest = Math.max(...window.map((bar) => bar.high));
    const lowest = Math.min(...window.map((bar) => bar.low));
    result[index] =
      highest === lowest
        ? null
        : (-100 * (highest - bars[index].close)) / (highest - lowest);
  }
  return result;
};

const obvSeries = (bars: Bar[]): NullableSeries => {
  let value = 0;
  return bars.map((bar, index) => {
    if (index > 0)
      value +=
        bar.close > bars[index - 1].close
          ? bar.volume
          : bar.close < bars[index - 1].close
            ? -bar.volume
            : 0;
    return value;
  });
};

function calculateIndicator(bars: Bar[], indicator: IndicatorConfig) {
  const values = bars.map((bar) => bar[indicator.source]);
  if (indicator.type === "sma" || indicator.type === "volume_ma")
    return smaSeries(
      indicator.type === "volume_ma" ? bars.map((bar) => bar.volume) : values,
      indicator.params.period,
    );
  if (indicator.type === "ema")
    return emaSeries(values, indicator.params.period);
  if (indicator.type === "wma")
    return wmaSeries(values, indicator.params.period);
  if (indicator.type === "rsi")
    return rsiSeries(values, indicator.params.period);
  if (indicator.type === "bollinger")
    return smaSeries(values, indicator.params.period);
  if (indicator.type === "atr")
    return atrSeries(bars, indicator.params.period);
  if (indicator.type === "roc")
    return rocSeries(values, indicator.params.period);
  if (indicator.type === "cci")
    return cciSeries(bars, indicator.params.period);
  if (indicator.type === "williams_r")
    return williamsRSeries(bars, indicator.params.period);
  if (indicator.type === "obv") return obvSeries(bars);
  const fast = emaSeries(values, indicator.params.fast_period);
  const slow = emaSeries(values, indicator.params.slow_period);
  return values.map((_, index) =>
    fast[index] === null || slow[index] === null
      ? null
      : (fast[index] as number) - (slow[index] as number),
  );
}

function compare(
  comparison: Comparison,
  left: number,
  right: number,
  previousLeft: number | null,
  previousRight: number | null,
) {
  if (comparison === "greater_than") return left > right;
  if (comparison === "greater_or_equal") return left >= right;
  if (comparison === "less_than") return left < right;
  if (comparison === "less_or_equal") return left <= right;
  if (comparison === "equal") return Math.abs(left - right) < 1e-9;
  if (comparison === "not_equal") return Math.abs(left - right) >= 1e-9;
  if (previousLeft === null || previousRight === null) return false;
  if (comparison === "cross_above")
    return previousLeft <= previousRight && left > right;
  return previousLeft >= previousRight && left < right;
}

function evaluateGroup(
  group: RuleGroupConfig,
  series: Record<string, NullableSeries>,
  index: number,
) {
  const values = group.conditions.map((condition) => {
    const left = series[condition.left]?.[index] ?? null;
    const right =
      typeof condition.right === "number"
        ? condition.right
        : (series[condition.right]?.[index] ?? null);
    if (left === null || right === null) return false;
    const previousLeft = index > 0 ? series[condition.left]?.[index - 1] ?? null : null;
    const previousRight =
      typeof condition.right === "number"
        ? condition.right
        : index > 0
          ? series[condition.right]?.[index - 1] ?? null
          : null;
    return compare(
      condition.comparison,
      left,
      right,
      previousLeft,
      previousRight,
    );
  });
  return group.operator === "and" ? values.every(Boolean) : values.some(Boolean);
}

export function runDemoBacktest(form: FormState): BacktestResult {
  const bars = generateBars(form.startDate, form.endDate);
  const warmup = Math.max(
    20,
    ...form.indicators.map((indicator) =>
      indicator.type === "macd"
        ? indicator.params.slow_period + indicator.params.signal_period
        : indicator.type === "obv"
          ? 2
          : indicator.params.period,
    ),
  );
  if (bars.length < warmup + 3)
    throw new Error("有效回测期过短，无法完成指标预热");
  const series = Object.fromEntries(
    form.indicators.map((indicator) => [
      indicator.id,
      calculateIndicator(bars, indicator),
    ]),
  );
  let cash = form.initialCash;
  let quantity = 0;
  let entryPrice = 0;
  let entryIndex = 0;
  let pending: "buy" | "sell" | null = null;
  let signalDate = "";
  let peak = form.initialCash;
  const equity: EquityPoint[] = [];
  const trades: Trade[] = [];
  const benchmarkQuantity = form.initialCash / bars[0].close;

  for (let index = 0; index < bars.length; index += 1) {
    const bar = bars[index];
    if (pending === "buy" && quantity === 0) {
      const price = bar.open * (1 + form.slippage);
      const amount = cash * form.position;
      let shares = Math.floor(amount / (price * (1 + form.commission)) / 100) * 100;
      let fee = shares * price * form.commission;
      while (shares > 0 && shares * price + fee > cash) {
        shares -= 100;
        fee = shares * price * form.commission;
      }
      if (shares > 0) {
        cash -= shares * price + fee;
        quantity = shares;
        entryPrice = price;
        entryIndex = index;
        trades.push({
          signal_date: signalDate,
          trade_date: bar.date,
          side: "buy",
          price: round(price, 4),
          quantity: shares,
          commission: round(fee),
          stamp_duty: 0,
          realized_profit: null,
          holding_days: null,
          reason: "买入规则触发",
        });
      }
      pending = null;
    }
    if (pending === "sell" && quantity > 0) {
      const price = bar.open * (1 - form.slippage);
      const gross = price * quantity;
      const fee = gross * form.commission;
      const tax = gross * form.stampDuty;
      const profit = gross - fee - tax - entryPrice * quantity;
      cash += gross - fee - tax;
      trades.push({
        signal_date: signalDate,
        trade_date: bar.date,
        side: "sell",
        price: round(price, 4),
        quantity,
        commission: round(fee),
        stamp_duty: round(tax),
        realized_profit: round(profit),
        holding_days: index - entryIndex,
        reason: "卖出规则或风控触发",
      });
      quantity = 0;
      pending = null;
    }
    if (index < bars.length - 1) {
      if (quantity === 0 && evaluateGroup(form.entryRule, series, index)) {
        pending = "buy";
        signalDate = bar.date;
      } else if (quantity > 0) {
        const profitRate = bar.close / entryPrice - 1;
        const held = index - entryIndex;
        if (
          evaluateGroup(form.exitRule, series, index) ||
          profitRate <= -form.stopLoss ||
          profitRate >= form.takeProfit ||
          (form.maxHoldingDays !== null && held >= form.maxHoldingDays)
        ) {
          pending = "sell";
          signalDate = bar.date;
        }
      }
    }
    const total = cash + quantity * bar.close;
    peak = Math.max(peak, total);
    equity.push({
      trade_date: bar.date,
      total_equity: round(total),
      benchmark_equity: round(benchmarkQuantity * bar.close),
      cash: round(cash),
      drawdown: total / peak - 1,
      position_quantity: quantity,
    });
  }
  if (quantity > 0) {
    const bar = bars.at(-1)!;
    const price = bar.close * (1 - form.slippage);
    const gross = price * quantity;
    const fee = gross * form.commission;
    const tax = gross * form.stampDuty;
    const profit = gross - fee - tax - entryPrice * quantity;
    cash += gross - fee - tax;
    trades.push({
      signal_date: bar.date,
      trade_date: bar.date,
      side: "sell",
      price: round(price, 4),
      quantity,
      commission: round(fee),
      stamp_duty: round(tax),
      realized_profit: round(profit),
      holding_days: bars.length - 1 - entryIndex,
      reason: "回测结束按最后收盘价强制平仓",
    });
    const point = equity.at(-1)!;
    point.cash = round(cash);
    point.total_equity = round(cash);
    point.position_quantity = 0;
  }
  let runningPeak = 0;
  equity.forEach((point) => {
    runningPeak = Math.max(runningPeak, point.total_equity);
    point.drawdown = point.total_equity / runningPeak - 1;
  });
  const returns = equity
    .slice(1)
    .map((point, index) => point.total_equity / equity[index].total_equity - 1);
  const mean =
    returns.reduce((sum, value) => sum + value, 0) / Math.max(1, returns.length);
  const variance =
    returns.length > 1
      ? returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
        (returns.length - 1)
      : 0;
  const standardDeviation = Math.sqrt(variance);
  const totalReturn =
    equity.at(-1)!.total_equity / form.initialCash - 1;
  const benchmarkReturn =
    equity.at(-1)!.benchmark_equity / form.initialCash - 1;
  const sells = trades.filter((trade) => trade.side === "sell");
  const wins = sells.filter((trade) => (trade.realized_profit || 0) > 0);
  const losses = sells.filter((trade) => (trade.realized_profit || 0) < 0);
  const average = (values: number[]) =>
    values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null;
  const averageWin = average(wins.map((trade) => trade.realized_profit!));
  const averageLoss = average(
    losses.map((trade) => Math.abs(trade.realized_profit!)),
  );
  return {
    status: "success",
    symbol: form.symbol,
    instrument_name: form.instrumentName,
    equity,
    trades,
    warnings: [
      ...(bars.length < 60 ? ["有效回测期过短，需进一步核验"] : []),
      ...(sells.length < 5
        ? ["交易次数过少，结果可能受单次交易显著影响，需进一步核验"]
        : []),
    ],
    data_snapshot_time: new Date().toISOString(),
    data_source: "固定种子模拟行情（仅演示）",
    strategy_version: 1,
    metrics: {
      total_return: totalReturn,
      annualized_return: (1 + totalReturn) ** (252 / equity.length) - 1,
      benchmark_return: benchmarkReturn,
      excess_return: totalReturn - benchmarkReturn,
      annualized_volatility: standardDeviation * Math.sqrt(252),
      sharpe_ratio: standardDeviation
        ? (mean / standardDeviation) * Math.sqrt(252)
        : null,
      max_drawdown: Math.min(...equity.map((point) => point.drawdown)),
      win_rate: sells.length ? wins.length / sells.length : null,
      profit_loss_ratio:
        averageWin !== null && averageLoss !== null
          ? averageWin / averageLoss
          : null,
      trade_count: sells.length,
      average_holding_days: average(
        sells.map((trade) => trade.holding_days || 0),
      ),
    },
  };
}
