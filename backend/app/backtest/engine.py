from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

from app.analytics.performance import calculate_metrics
from app.indicators.registry import apply_indicators
from app.schemas.strategy import StrategyConfig
from app.strategies.rules import evaluate_group


@dataclass
class BacktestResult:
    equity: pd.DataFrame
    trades: list[dict]
    metrics: dict
    indicator_aliases: dict[str, str]
    warnings: list[str]


class BacktestEngine:
    def __init__(self, *, initial_cash: float = 100_000, commission_rate: float = .0003, stamp_duty_rate: float = .0005, slippage_rate: float = .0005, minimum_commission: float = 0, lot_size: int = 100):
        self.initial_cash = float(initial_cash)
        self.commission_rate = float(commission_rate)
        self.stamp_duty_rate = float(stamp_duty_rate)
        self.slippage_rate = float(slippage_rate)
        self.minimum_commission = float(minimum_commission)
        self.lot_size = int(lot_size)

    def run(self, bars: pd.DataFrame, config: StrategyConfig) -> BacktestResult:
        if bars is None or bars.empty:
            raise ValueError("行情为空，已停止回测")
        data, aliases = apply_indicators(bars, config.indicators)
        cash, quantity = self.initial_cash, 0
        entry_price = entry_cost = 0.0
        entry_date = signal_date = None
        pending: tuple[str, str, object] | None = None
        trades: list[dict] = []
        points: list[dict] = []
        benchmark_shares = self.initial_cash / float(data.iloc[0]["close"])
        previous_equity = self.initial_cash
        peak = self.initial_cash

        for idx, row in data.iterrows():
            date = row["trade_date"]
            raw_open = float(row["open"])
            if pending:
                side, reason, signal_date = pending
                if side == "buy" and quantity == 0:
                    price = raw_open * (1 + self.slippage_rate)
                    available = cash * config.position.value
                    per_share = price * (1 + self.commission_rate)
                    quantity_to_buy = int(available / per_share / self.lot_size) * self.lot_size
                    if quantity_to_buy > 0:
                        gross = price * quantity_to_buy
                        commission = max(gross * self.commission_rate, self.minimum_commission)
                        while quantity_to_buy > 0 and gross + commission > cash:
                            quantity_to_buy -= self.lot_size
                            gross = price * quantity_to_buy
                            commission = max(gross * self.commission_rate, self.minimum_commission) if quantity_to_buy else 0
                        if quantity_to_buy:
                            cash -= gross + commission
                            quantity = quantity_to_buy
                            entry_price, entry_cost, entry_date = price, commission, date
                            trades.append({"signal_date": signal_date, "trade_date": date, "side": "buy", "price": price, "quantity": quantity, "commission": commission, "stamp_duty": 0.0, "slippage_cost": (price - raw_open) * quantity, "realized_profit": None, "holding_days": None, "reason": reason})
                elif side == "sell" and quantity > 0:
                    cash, quantity, entry_price, entry_cost, entry_date = self._sell(cash, quantity, entry_price, entry_cost, entry_date, date, raw_open, signal_date, reason, trades)
                pending = None

            current = row
            previous = data.iloc[idx - 1] if idx > 0 else None
            if idx < len(data) - 1:
                if quantity > 0:
                    holding_days = (pd.Timestamp(date) - pd.Timestamp(entry_date)).days if entry_date else 0
                    return_from_entry = float(row["close"]) / entry_price - 1 if entry_price else 0
                    reason = None
                    if config.risk.stop_loss is not None and return_from_entry <= -config.risk.stop_loss:
                        reason = "固定比例止损（收盘确认，下一交易日开盘成交）"
                    elif config.risk.take_profit is not None and return_from_entry >= config.risk.take_profit:
                        reason = "固定比例止盈（收盘确认，下一交易日开盘成交）"
                    elif config.risk.max_holding_days is not None and holding_days >= config.risk.max_holding_days:
                        reason = "达到最大持仓天数"
                    elif evaluate_group(current, previous, config.exit_rule):
                        reason = "卖出规则触发"
                    if reason:
                        pending = ("sell", reason, date)
                elif evaluate_group(current, previous, config.entry_rule):
                    pending = ("buy", "买入规则触发", date)

            position_value = quantity * float(row["close"])
            equity = cash + position_value
            peak = max(peak, equity)
            points.append({"trade_date": date, "cash": cash, "position_quantity": quantity, "position_value": position_value, "total_equity": equity, "daily_return": equity / previous_equity - 1 if points else 0.0, "drawdown": equity / peak - 1, "benchmark_equity": benchmark_shares * float(row["close"])})
            previous_equity = equity

        if quantity > 0 and config.close_at_end:
            last = data.iloc[-1]
            cash, quantity, entry_price, entry_cost, entry_date = self._sell(cash, quantity, entry_price, entry_cost, entry_date, last["trade_date"], float(last["close"]), last["trade_date"], "回测结束按最后收盘价强制平仓", trades, is_close=True)
            points[-1]["cash"] = cash
            points[-1]["position_quantity"] = 0
            points[-1]["position_value"] = 0.0
            points[-1]["total_equity"] = cash
            if len(points) > 1:
                points[-1]["daily_return"] = cash / points[-2]["total_equity"] - 1
            peak = max(p["total_equity"] for p in points)
            running_peak = 0.0
            for point in points:
                running_peak = max(running_peak, point["total_equity"])
                point["drawdown"] = point["total_equity"] / running_peak - 1

        equity_df = pd.DataFrame(points)
        warnings = []
        sell_count = sum(1 for trade in trades if trade["side"] == "sell")
        if len(data) < 60:
            warnings.append("有效回测期过短，需进一步核验")
        if sell_count < 5:
            warnings.append("交易次数过少，结果可能受单次交易显著影响，需进一步核验")
        metrics = calculate_metrics(equity_df, trades, self.initial_cash)
        return BacktestResult(equity_df, trades, metrics, aliases, warnings)

    def _sell(self, cash, quantity, entry_price, entry_cost, entry_date, date, raw_price, signal_date, reason, trades, is_close=False):
        price = raw_price * (1 - self.slippage_rate)
        gross = price * quantity
        commission = max(gross * self.commission_rate, self.minimum_commission)
        stamp = gross * self.stamp_duty_rate
        realized = gross - commission - stamp - (entry_price * quantity + entry_cost)
        holding = (pd.Timestamp(date) - pd.Timestamp(entry_date)).days if entry_date else 0
        trades.append({"signal_date": signal_date, "trade_date": date, "side": "sell", "price": price, "quantity": quantity, "commission": commission, "stamp_duty": stamp, "slippage_cost": (raw_price - price) * quantity, "realized_profit": realized, "holding_days": holding, "reason": reason})
        return cash + gross - commission - stamp, 0, 0.0, 0.0, None
