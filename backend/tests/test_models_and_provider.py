from datetime import date

import pandas as pd
import pytest
from pydantic import ValidationError
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.core.database import Base
from app.data.providers import AkShareMarketDataProvider, MarketDataError
from app.models.entities import BacktestRun, Instrument, Strategy, StrategyVersion
from app.schemas.strategy import StrategyConfig


def valid_config():
    return {"name": "x", "indicators": [{"id": "m", "type": "sma", "params": {"period": 5}, "source": "close"}], "entry_rule": {"operator": "and", "conditions": [{"left": "m", "comparison": "greater_than", "right": 1}]}, "exit_rule": {"operator": "and", "conditions": [{"left": "m", "comparison": "less_than", "right": 1}]}, "position": {"value": 1}, "risk": {}}


def test_illegal_strategy_config_rejected():
    payload = valid_config()
    payload["position"] = {"value": 2}
    with pytest.raises(ValidationError):
        StrategyConfig.model_validate(payload)


def test_normalizer_empty_and_invalid_data():
    with pytest.raises(MarketDataError):
        AkShareMarketDataProvider.normalize(pd.DataFrame())
    bad = pd.DataFrame({"日期": ["2026-01-01"], "开盘": [2], "最高": [1], "最低": [1], "收盘": [2], "成交量": [100]})
    with pytest.raises(MarketDataError, match="非法 OHLC"):
        AkShareMarketDataProvider.normalize(bad)


def test_backtest_record_can_be_saved_and_reloaded(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'test.db'}")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        instrument = Instrument(symbol="600519", name="贵州茅台", market="a_share", asset_type="stock", exchange="SH")
        strategy = Strategy(name="测试", description="")
        db.add_all([instrument, strategy]); db.flush()
        version = StrategyVersion(strategy_id=strategy.id, version=1, configuration_json=valid_config())
        db.add(version); db.flush()
        run = BacktestRun(strategy_version_id=version.id, instrument_id=instrument.id, start_date=date(2026,1,1), end_date=date(2026,2,1), initial_cash=100000, commission_rate=.0003, stamp_duty_rate=.0005, slippage_rate=.0005, status="success")
        db.add(run); db.commit()
        loaded = db.scalar(select(BacktestRun).where(BacktestRun.id == run.id))
        assert loaded.status == "success" and loaded.initial_cash == 100000
