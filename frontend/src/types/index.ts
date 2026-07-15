export type MetricMap = {
  total_return: number | null;
  annualized_return: number | null;
  benchmark_return: number | null;
  excess_return: number | null;
  annualized_volatility: number | null;
  sharpe_ratio: number | null;
  max_drawdown: number | null;
  win_rate: number | null;
  profit_loss_ratio: number | null;
  trade_count: number;
  average_holding_days: number | null;
};
export type EquityPoint = {
  trade_date: string;
  total_equity: number;
  benchmark_equity: number;
  cash: number;
  drawdown: number;
  position_quantity: number;
};
export type Trade = {
  signal_date: string;
  trade_date: string;
  side: "buy" | "sell";
  price: number;
  quantity: number;
  commission: number;
  stamp_duty: number;
  realized_profit: number | null;
  holding_days: number | null;
  reason: string;
};
export type BacktestResult = {
  id?: number;
  status: string;
  symbol: string;
  instrument_name?: string;
  metrics: MetricMap;
  equity: EquityPoint[];
  trades: Trade[];
  warnings: string[];
  data_snapshot_time: string;
  data_source: string;
  strategy_version: number;
};
export type InstrumentSearchResult = {
  symbol: string;
  name: string;
  market: "a_share" | "etf" | "index";
  asset_type: "stock" | "etf" | "index";
  exchange: string;
};
export type IndicatorType =
  | "sma"
  | "ema"
  | "macd"
  | "rsi"
  | "bollinger"
  | "volume_ma";
export type PriceSource = "open" | "high" | "low" | "close" | "volume";
export type IndicatorConfig = {
  id: string;
  type: IndicatorType;
  params: Record<string, number>;
  source: PriceSource;
};
export type Comparison =
  | "greater_than"
  | "less_than"
  | "equal"
  | "cross_above"
  | "cross_below";
export type RuleConditionConfig = {
  id: string;
  left: string;
  comparison: Comparison;
  rightMode: "indicator" | "value";
  right: string | number;
};
export type RuleGroupConfig = {
  operator: "and" | "or";
  conditions: RuleConditionConfig[];
};
export type FormState = {
  symbol: string;
  instrumentName: string;
  assetType: "stock" | "etf" | "index";
  startDate: string;
  endDate: string;
  initialCash: number;
  commission: number;
  stampDuty: number;
  slippage: number;
  indicators: IndicatorConfig[];
  entryRule: RuleGroupConfig;
  exitRule: RuleGroupConfig;
  position: number;
  stopLoss: number;
  takeProfit: number;
  maxHoldingDays: number | null;
  dataMode: "sample" | "akshare";
};
