from __future__ import annotations

from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, Field, model_validator


class IndicatorSpec(BaseModel):
    id: str = Field(pattern=r"^[a-zA-Z][a-zA-Z0-9_]{0,39}$")
    type: Literal["sma", "ema", "macd", "rsi", "bollinger", "volume_ma"]
    params: dict[str, float | int]
    source: Literal["open", "high", "low", "close", "volume"] = "close"


Operand = str | float | int


class Condition(BaseModel):
    left: Operand
    comparison: Literal["greater_than", "less_than", "equal", "cross_above", "cross_below"]
    right: Operand


class RuleGroup(BaseModel):
    operator: Literal["and", "or"] = "and"
    conditions: list[Condition] = Field(min_length=1)


class PositionConfig(BaseModel):
    type: Literal["fixed_ratio"] = "fixed_ratio"
    value: float = Field(gt=0, le=1)


class RiskConfig(BaseModel):
    stop_loss: float | None = Field(default=None, gt=0, lt=1)
    take_profit: float | None = Field(default=None, gt=0)
    max_holding_days: int | None = Field(default=None, ge=1, le=5000)


class StrategyConfig(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    indicators: list[IndicatorSpec] = Field(min_length=1, max_length=20)
    entry_rule: RuleGroup
    exit_rule: RuleGroup
    position: PositionConfig = PositionConfig(value=1.0)
    risk: RiskConfig = RiskConfig(stop_loss=0.08, take_profit=0.20)
    close_at_end: bool = True

    @model_validator(mode="after")
    def unique_indicator_ids(self):
        ids = [item.id for item in self.indicators]
        if len(ids) != len(set(ids)):
            raise ValueError("指标 id 不能重复")
        return self


class StrategyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=1000)
    configuration: StrategyConfig


class BacktestRequest(BaseModel):
    strategy_id: int | None = None
    configuration: StrategyConfig
    symbol: str = Field(min_length=3, max_length=20)
    name: str = Field(default="待查询", max_length=80)
    market: Literal["a_share", "etf", "index"] = "a_share"
    asset_type: Literal["stock", "etf", "index"] = "stock"
    exchange: str = "CN"
    start_date: date
    end_date: date
    initial_cash: float = Field(default=100_000, gt=0)
    commission_rate: float = Field(default=0.0003, ge=0, lt=0.1)
    stamp_duty_rate: float = Field(default=0.0005, ge=0, lt=0.1)
    slippage_rate: float = Field(default=0.0005, ge=0, lt=0.1)
    minimum_commission: float = Field(default=0, ge=0)
    adjust: Literal["", "qfq", "hfq"] = "qfq"
    data_mode: Literal["akshare", "sample"] = "akshare"

    @model_validator(mode="after")
    def validate_dates(self):
        if self.start_date >= self.end_date:
            raise ValueError("开始日期必须早于结束日期")
        return self


DOUBLE_MA_STRATEGY = StrategyConfig.model_validate({
    "name": "双均线趋势策略",
    "indicators": [
        {"id": "ma_fast", "type": "sma", "params": {"period": 5}, "source": "close"},
        {"id": "ma_slow", "type": "sma", "params": {"period": 20}, "source": "close"},
    ],
    "entry_rule": {"operator": "and", "conditions": [{"left": "ma_fast", "comparison": "cross_above", "right": "ma_slow"}]},
    "exit_rule": {"operator": "or", "conditions": [{"left": "ma_fast", "comparison": "cross_below", "right": "ma_slow"}]},
    "position": {"type": "fixed_ratio", "value": 1.0},
    "risk": {"stop_loss": 0.08, "take_profit": 0.20, "max_holding_days": None},
    "close_at_end": True,
})
