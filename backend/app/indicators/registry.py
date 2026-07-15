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


def wma(df: pd.DataFrame, spec: IndicatorSpec) -> tuple[pd.DataFrame, str]:
    period = _period(spec.params)
    weights = np.arange(1, period + 1, dtype=float)
    column = f"wma_{period}_{spec.source}"
    df[column] = df[spec.source].rolling(period, min_periods=period).apply(
        lambda values: float(np.dot(values, weights) / weights.sum()), raw=True
    )
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


def atr(df: pd.DataFrame, spec: IndicatorSpec) -> tuple[pd.DataFrame, str]:
    period = _period(spec.params)
    previous_close = df["close"].shift(1)
    true_range = pd.concat(
        [
            df["high"] - df["low"],
            (df["high"] - previous_close).abs(),
            (df["low"] - previous_close).abs(),
        ],
        axis=1,
    ).max(axis=1)
    column = f"atr_{period}"
    df[column] = true_range.ewm(alpha=1 / period, adjust=False, min_periods=period).mean()
    return df, column


def roc(df: pd.DataFrame, spec: IndicatorSpec) -> tuple[pd.DataFrame, str]:
    period = _period(spec.params)
    column = f"roc_{period}_{spec.source}"
    previous = df[spec.source].shift(period).replace(0, np.nan)
    df[column] = (df[spec.source] / previous - 1) * 100
    return df, column


def cci(df: pd.DataFrame, spec: IndicatorSpec) -> tuple[pd.DataFrame, str]:
    period = _period(spec.params)
    typical_price = (df["high"] + df["low"] + df["close"]) / 3
    average = typical_price.rolling(period, min_periods=period).mean()
    mean_deviation = typical_price.rolling(period, min_periods=period).apply(
        lambda values: float(np.mean(np.abs(values - np.mean(values)))), raw=True
    )
    column = f"cci_{period}"
    df[column] = (typical_price - average) / (0.015 * mean_deviation.replace(0, np.nan))
    return df, column


def williams_r(df: pd.DataFrame, spec: IndicatorSpec) -> tuple[pd.DataFrame, str]:
    period = _period(spec.params)
    highest = df["high"].rolling(period, min_periods=period).max()
    lowest = df["low"].rolling(period, min_periods=period).min()
    spread = (highest - lowest).replace(0, np.nan)
    column = f"williams_r_{period}"
    df[column] = -100 * (highest - df["close"]) / spread
    return df, column


def obv(df: pd.DataFrame, spec: IndicatorSpec) -> tuple[pd.DataFrame, str]:
    column = "obv"
    direction = np.sign(df["close"].diff()).fillna(0)
    df[column] = (direction * df["volume"]).cumsum()
    return df, column


def volume_ma(df: pd.DataFrame, spec: IndicatorSpec) -> tuple[pd.DataFrame, str]:
    period = _period(spec.params)
    column = f"volume_ma_{period}"
    df[column] = df["volume"].rolling(period, min_periods=period).mean()
    return df, column


INDICATOR_REGISTRY: dict[str, Callable[[pd.DataFrame, IndicatorSpec], tuple[pd.DataFrame, str]]] = {
    "sma": sma,
    "ema": ema,
    "wma": wma,
    "rsi": rsi,
    "macd": macd,
    "bollinger": bollinger,
    "atr": atr,
    "roc": roc,
    "cci": cci,
    "williams_r": williams_r,
    "obv": obv,
    "volume_ma": volume_ma,
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
