from pathlib import Path

import pandas as pd

from app.analytics.performance import calculate_metrics
from app.backtest.engine import BacktestEngine
from app.schemas.strategy import StrategyConfig

FIXTURE = Path(__file__).parent / "fixtures" / "sample_bars.csv"


def fixture_bars():
    df = pd.read_csv(FIXTURE)
    df["trade_date"] = pd.to_datetime(df["trade_date"]).dt.date
    return df


def strategy(entry="cross_above", exit="cross_below"):
    return StrategyConfig.model_validate({
        "name": "test", "indicators": [
            {"id": "fast", "type": "sma", "params": {"period": 2}, "source": "close"},
            {"id": "slow", "type": "sma", "params": {"period": 3}, "source": "close"},
        ],
        "entry_rule": {"operator": "and", "conditions": [{"left": "fast", "comparison": entry, "right": "slow"}]},
        "exit_rule": {"operator": "or", "conditions": [{"left": "fast", "comparison": exit, "right": "slow"}]},
        "position": {"type": "fixed_ratio", "value": 1}, "risk": {}, "close_at_end": True,
    })


def test_signal_executes_next_trading_day_not_same_day():
    result = BacktestEngine(slippage_rate=0).run(fixture_bars(), strategy())
    buy = result.trades[0]
    assert str(buy["signal_date"]) == "2026-01-09"
    assert str(buy["trade_date"]) == "2026-01-12"


def test_fees_stamp_duty_slippage_and_cash_are_consistent():
    engine = BacktestEngine(initial_cash=100_000, commission_rate=.001, stamp_duty_rate=.001, slippage_rate=.01)
    result = engine.run(fixture_bars(), strategy())
    buy, sell = result.trades[0], result.trades[1]
    assert buy["price"] > 4.0
    assert sell["price"] < 2.0
    assert buy["commission"] > 0 and sell["commission"] > 0 and sell["stamp_duty"] > 0
    assert result.equity.iloc[-1]["position_quantity"] == 0
    assert result.equity.iloc[-1]["cash"] == result.equity.iloc[-1]["total_equity"]


def test_cash_shortage_never_creates_negative_cash_or_odd_lot():
    result = BacktestEngine(initial_cash=500, commission_rate=.01).run(fixture_bars(), strategy())
    assert (result.equity.cash >= 0).all()
    assert all(trade["quantity"] % 100 == 0 for trade in result.trades)


def test_no_trade_strategy_returns_null_trade_metrics():
    config = strategy(entry="greater_than")
    config.entry_rule.conditions[0].right = 10_000
    result = BacktestEngine().run(fixture_bars(), config)
    assert result.metrics["trade_count"] == 0
    assert result.metrics["win_rate"] is None


def test_max_drawdown_and_annualized_return():
    equity = pd.DataFrame({"total_equity": [100, 120, 90, 110], "daily_return": [0, .2, -.25, .222222], "drawdown": [0, 0, -.25, -.08333], "benchmark_equity": [100, 105, 100, 108]})
    metrics = calculate_metrics(equity, [], 100)
    assert metrics["max_drawdown"] == -.25
    assert metrics["annualized_return"] is not None
