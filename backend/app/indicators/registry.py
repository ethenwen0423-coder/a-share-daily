from __future__ import annotations

from collections.abc import Callable

import numpy as np
import pandas as pd

from app.schemas.strategy import IndicatorSpec


def _period(params: dict, name: str = "period", minimum: int = 2, maximum: int = 1000) -> int:
    value = int(params.get(name, 0))
    if value < minimum or value > maximum:
        raise ValueError(f"{name} 必须在 {minimum} 到 {maximum} 之间")
    return value


def sma(df: pd.DataFrame, spec: IndicatorSpec) -> tuple[pd.DataFrame, str]:
    period = _period(spec.params)
    column = f"sma_{period}_{spec.source}"
    df[column] = df[spec.source].rolling(period, min_periods=period).mean()
    return df, column


def ema(df: pd.DataFrame, spec: IndicatorSpec) -> tuple[pd.DataFrame, str]:
    period = _period(spec.params)
    column = f"ema_{period}_{spec.source}"
    df[column] = df[spec.source].ewm(span=period, adjust=False, min_periods=period).mean()
    return df, column


def rsi(df: pd.DataFrame, spec: IndicatorSpec) -> tuple[pd.DataFrame, str]:
    period = _period(spec.params)
    delta = df[spec.source].diff()
    gain = delta.clip(lower=0).ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
    loss = (-delta.clip(upper=0)).ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
    rs = gain / loss.replace(0, np.nan)
    column = f"rsi_{period}_{spec.source}"
    df[column] = 100 - (100 / (1 + rs))
    df.loc[(loss == 0) & (gain > 0), column] = 100.0
    return df, column


def macd(df: pd.DataFrame, spec: IndicatorSpec) -> tuple[pd.DataFrame, str]:
    fast = _period(spec.params, "fast_period")
    slow = _period(spec.params, "slow_period")
    signal = _period(spec.params, "signal_period")
    if fast >= slow:
        raise ValueError("MACD 快线周期必须小于慢线周期")
    prefix = f"macd_{fast}_{slow}_{signal}_{spec.source}"
    fast_line = df[spec.source].ewm(span=fast, adjust=False, min_periods=fast).mean()
    slow_line = df[spec.source].ewm(span=slow, adjust=False, min_periods=slow).mean()
    df[prefix] = fast_line - slow_line
    df[f"{prefix}_signal"] = df[prefix].ewm(span=signal, adjust=False, min_periods=signal).mean()
    df[f"{prefix}_hist"] = df[prefix] - df[f"{prefix}_signal"]
    return df, prefix


def bollinger(df: pd.DataFrame, spec: IndicatorSpec) -> tuple[pd.DataFrame, str]:
    period = _period(spec.params)
    deviation = float(spec.params.get("standard_deviation", 2.0))
    if not 0.1 <= deviation <= 10:
        raise ValueError("布林带标准差倍数必须在 0.1 到 10 之间")
    prefix = f"bollinger_{period}_{deviation:g}_{spec.source}"
    middle = df[spec.source].rolling(period, min_periods=period).mean()
    std = df[spec.source].rolling(period, min_periods=period).std(ddof=0)
    df[f"{prefix}_middle"] = middle
    df[f"{prefix}_upper"] = middle + deviation * std
    df[f"{prefix}_lower"] = middle - deviation * std
    return df, f"{prefix}_middle"


def volume_ma(df: pd.DataFrame, spec: IndicatorSpec) -> tuple[pd.DataFrame, str]:
    period = _period(spec.params)
    column = f"volume_ma_{period}"
    df[column] = df["volume"].rolling(period, min_periods=period).mean()
    return df, column


INDICATOR_REGISTRY: dict[str, Callable[[pd.DataFrame, IndicatorSpec], tuple[pd.DataFrame, str]]] = {
    "sma": sma, "ema": ema, "rsi": rsi, "macd": macd, "bollinger": bollinger, "volume_ma": volume_ma,
}


def apply_indicators(data: pd.DataFrame, specs: list[IndicatorSpec]) -> tuple[pd.DataFrame, dict[str, str]]:
    required = {"trade_date", "open", "high", "low", "close", "volume"}
    missing = required - set(data.columns)
    if missing:
        raise ValueError(f"行情缺少字段: {', '.join(sorted(missing))}")
    result = data.copy().sort_values("trade_date").drop_duplicates("trade_date").reset_index(drop=True)
    aliases: dict[str, str] = {}
    for spec in specs:
        fn = INDICATOR_REGISTRY.get(spec.type)
        if not fn:
            raise ValueError(f"不支持的指标: {spec.type}")
        result, column = fn(result, spec)
        aliases[spec.id] = column
        result[spec.id] = result[column]
    return result, aliases
