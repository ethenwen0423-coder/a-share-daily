from __future__ import annotations

import math

import numpy as np
import pandas as pd

from app.core.config import TRADING_DAYS_PER_YEAR


def _safe(value: float | np.floating | None) -> float | None:
    if value is None or not math.isfinite(float(value)):
        return None
    return float(value)


def calculate_metrics(equity: pd.DataFrame, trades: list[dict], initial_cash: float, risk_free_rate: float = 0.0) -> dict:
    if equity.empty or initial_cash <= 0:
        return {key: None for key in ["total_return", "annualized_return", "benchmark_return", "excess_return", "annualized_volatility", "sharpe_ratio", "max_drawdown", "win_rate", "profit_loss_ratio", "average_holding_days"]} | {"trade_count": 0}
    final_equity = float(equity.iloc[-1]["total_equity"])
    total_return = final_equity / initial_cash - 1 if final_equity >= 0 else None
    days = len(equity)
    annualized_return = (final_equity / initial_cash) ** (TRADING_DAYS_PER_YEAR / days) - 1 if days >= 2 and final_equity > 0 else None
    returns = pd.to_numeric(equity["daily_return"], errors="coerce").dropna()
    volatility = returns.std(ddof=1) * math.sqrt(TRADING_DAYS_PER_YEAR) if len(returns) >= 2 else None
    daily_rf = (1 + risk_free_rate) ** (1 / TRADING_DAYS_PER_YEAR) - 1
    sharpe = ((returns.mean() - daily_rf) / returns.std(ddof=1) * math.sqrt(TRADING_DAYS_PER_YEAR)) if len(returns) >= 2 and returns.std(ddof=1) > 0 else None
    benchmark_return = float(equity.iloc[-1]["benchmark_equity"] / initial_cash - 1)
    sells = [trade for trade in trades if trade["side"] == "sell" and trade.get("realized_profit") is not None]
    profits = [float(t["realized_profit"]) for t in sells]
    wins, losses = [p for p in profits if p > 0], [p for p in profits if p < 0]
    win_rate = len(wins) / len(profits) if profits else None
    profit_loss = (np.mean(wins) / abs(np.mean(losses))) if wins and losses else None
    avg_holding = np.mean([t["holding_days"] for t in sells if t.get("holding_days") is not None]) if sells else None
    return {
        "total_return": _safe(total_return), "annualized_return": _safe(annualized_return),
        "benchmark_return": _safe(benchmark_return), "excess_return": _safe(total_return - benchmark_return if total_return is not None else None),
        "annualized_volatility": _safe(volatility), "sharpe_ratio": _safe(sharpe),
        "max_drawdown": _safe(equity["drawdown"].min()), "win_rate": _safe(win_rate),
        "profit_loss_ratio": _safe(profit_loss), "trade_count": len(sells), "average_holding_days": _safe(avg_holding),
    }
