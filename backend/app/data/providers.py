from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import date

import numpy as np
import pandas as pd


class MarketDataError(RuntimeError):
    def __init__(self, message: str, status: str = "request_failed"):
        super().__init__(message)
        self.status = status


class MarketDataProvider(ABC):
    @abstractmethod
    def fetch_daily_bars(self, symbol: str, start_date: date, end_date: date, adjust: str, asset_type: str) -> pd.DataFrame:
        raise NotImplementedError


class AkShareMarketDataProvider(MarketDataProvider):
    COLUMN_MAP = {
        "日期": "trade_date", "date": "trade_date", "开盘": "open", "open": "open",
        "最高": "high", "high": "high", "最低": "low", "low": "low",
        "收盘": "close", "close": "close", "成交量": "volume", "volume": "volume",
        "成交额": "amount", "amount": "amount",
    }

    def fetch_daily_bars(self, symbol: str, start_date: date, end_date: date, adjust: str = "qfq", asset_type: str = "stock") -> pd.DataFrame:
        try:
            import akshare as ak
            start, end = start_date.strftime("%Y%m%d"), end_date.strftime("%Y%m%d")
            if asset_type == "stock":
                raw = ak.stock_zh_a_hist(symbol=symbol, period="daily", start_date=start, end_date=end, adjust=adjust)
            elif asset_type == "etf":
                raw = ak.fund_etf_hist_em(symbol=symbol, period="daily", start_date=start, end_date=end, adjust=adjust)
            elif asset_type == "index":
                raw = ak.index_zh_a_hist(symbol=symbol, period="daily", start_date=start, end_date=end)
            else:
                raise MarketDataError(f"不支持的资产类型: {asset_type}")
        except MarketDataError:
            raise
        except Exception as exc:
            raise MarketDataError(f"AKShare 请求失败: {exc}", "request_failed") from exc
        if raw is None or raw.empty:
            raise MarketDataError("AKShare 返回空数据，已停止回测", "empty_data")
        return self.normalize(raw)

    @classmethod
    def normalize(cls, raw: pd.DataFrame) -> pd.DataFrame:
        data = raw.rename(columns={key: value for key, value in cls.COLUMN_MAP.items() if key in raw.columns}).copy()
        required = ["trade_date", "open", "high", "low", "close", "volume"]
        missing = set(required) - set(data.columns)
        if missing:
            raise MarketDataError(f"AKShare 字段缺失: {', '.join(sorted(missing))}", "invalid_data")
        data["trade_date"] = pd.to_datetime(data["trade_date"], errors="coerce").dt.date
        for col in ["open", "high", "low", "close", "volume", "amount"]:
            if col in data:
                data[col] = pd.to_numeric(data[col], errors="coerce")
        data = data.dropna(subset=required).sort_values("trade_date").drop_duplicates("trade_date", keep="last")
        invalid = (data[["open", "high", "low", "close"]] <= 0).any(axis=1) | (data["high"] < data[["open", "close", "low"]].max(axis=1)) | (data["low"] > data[["open", "close", "high"]].min(axis=1))
        if invalid.any():
            raise MarketDataError("行情包含非法 OHLC 数据", "invalid_data")
        if data.empty:
            raise MarketDataError("清洗后无有效行情，已停止回测", "empty_data")
        if "amount" not in data:
            data["amount"] = np.nan
        return data[["trade_date", "open", "high", "low", "close", "volume", "amount"]].reset_index(drop=True)


def sample_daily_bars(periods: int = 320, end_date: str = "2026-07-10") -> pd.DataFrame:
    """固定种子的模拟行情，仅用于离线测试与演示，结果仍由回测引擎计算。"""
    rng = np.random.default_rng(20260715)
    dates = pd.bdate_range(end=end_date, periods=periods)
    cycle = np.sin(np.linspace(0, 10 * np.pi, periods)) * 0.011
    drift = np.where(np.arange(periods) < periods * .55, .00045, .00015)
    returns = drift + cycle + rng.normal(0, .008, periods)
    close = 100 * np.cumprod(1 + returns)
    open_price = np.r_[close[0] * .997, close[:-1] * (1 + rng.normal(0, .0025, periods - 1))]
    high = np.maximum(open_price, close) * (1 + rng.uniform(.001, .012, periods))
    low = np.minimum(open_price, close) * (1 - rng.uniform(.001, .012, periods))
    volume = rng.integers(8_000_000, 30_000_000, periods)
    return pd.DataFrame({"trade_date": dates.date, "open": open_price, "high": high, "low": low, "close": close, "volume": volume.astype(float), "amount": volume * close})
