import numpy as np
import pandas as pd

from app.indicators.registry import apply_indicators
from app.schemas.strategy import IndicatorSpec


def bars(count=30):
    close = np.arange(1, count + 1, dtype=float)
    return pd.DataFrame({"trade_date": pd.bdate_range("2026-01-01", periods=count).date, "open": close, "high": close + 1, "low": close - .5, "close": close, "volume": close * 1000})


def test_sma_has_warmup_and_correct_value():
    result, aliases = apply_indicators(bars(), [IndicatorSpec(id="fast", type="sma", params={"period": 5})])
    assert result["fast"].iloc[:4].isna().all()
    assert result["fast"].iloc[4] == 3
    assert aliases["fast"] == "sma_5_close"


def test_rsi_for_rising_series_is_100():
    result, _ = apply_indicators(bars(), [IndicatorSpec(id="r", type="rsi", params={"period": 14})])
    assert result["r"].iloc[-1] == 100


def test_all_indicator_types_register_without_future_fill():
    specs = [
        IndicatorSpec(id="e", type="ema", params={"period": 5}),
        IndicatorSpec(id="m", type="macd", params={"fast_period": 5, "slow_period": 10, "signal_period": 4}),
        IndicatorSpec(id="b", type="bollinger", params={"period": 10, "standard_deviation": 2}),
        IndicatorSpec(id="v", type="volume_ma", params={"period": 5}, source="volume"),
    ]
    result, aliases = apply_indicators(bars(), specs)
    assert set(aliases) == {"e", "m", "b", "v"}
    assert result["e"].iloc[:4].isna().all()
