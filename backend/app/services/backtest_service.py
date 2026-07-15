from __future__ import annotations

from datetime import datetime

import pandas as pd
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.backtest.engine import BacktestEngine
from app.data.providers import AkShareMarketDataProvider, MarketDataError, sample_daily_bars
from app.models.entities import BacktestMetric, BacktestRun, EquityPoint, Instrument, MarketBar, Strategy, StrategyVersion, Trade, now
from app.schemas.strategy import BacktestRequest, StrategyCreate


def get_or_create_instrument(db: Session, req: BacktestRequest) -> Instrument:
    instrument = db.scalar(select(Instrument).where(Instrument.symbol == req.symbol, Instrument.market == req.market, Instrument.asset_type == req.asset_type))
    if instrument:
        return instrument
    instrument = Instrument(symbol=req.symbol, name=req.name, market=req.market, asset_type=req.asset_type, exchange=req.exchange)
    db.add(instrument)
    db.flush()
    return instrument


def create_strategy(db: Session, payload: StrategyCreate) -> Strategy:
    strategy = Strategy(name=payload.name, description=payload.description)
    db.add(strategy)
    db.flush()
    version = StrategyVersion(strategy_id=strategy.id, version=1, configuration_json=payload.configuration.model_dump(mode="json"))
    db.add(version)
    db.commit()
    db.refresh(strategy)
    return strategy


def update_strategy(db: Session, strategy: Strategy, payload: StrategyCreate) -> Strategy:
    strategy.name, strategy.description = payload.name, payload.description
    latest = db.scalar(select(func.max(StrategyVersion.version)).where(StrategyVersion.strategy_id == strategy.id)) or 0
    db.add(StrategyVersion(strategy_id=strategy.id, version=latest + 1, configuration_json=payload.configuration.model_dump(mode="json")))
    db.commit()
    db.refresh(strategy)
    return strategy


def _cached_bars(db: Session, instrument_id: int, start_date, end_date, adjust: str) -> list[MarketBar]:
    return list(db.scalars(select(MarketBar).where(MarketBar.instrument_id == instrument_id, MarketBar.adjust_type == adjust, MarketBar.trade_date >= start_date, MarketBar.trade_date <= end_date).order_by(MarketBar.trade_date)).all())


def _bars_frame(rows: list[MarketBar]) -> pd.DataFrame:
    return pd.DataFrame([{"trade_date": row.trade_date, "open": row.open, "high": row.high, "low": row.low, "close": row.close, "volume": row.volume, "amount": row.amount} for row in rows])


def load_market_data(db: Session, instrument: Instrument, req: BacktestRequest) -> tuple[pd.DataFrame, str, datetime]:
    if req.data_mode == "sample":
        frame = sample_daily_bars()
        frame = frame[(frame.trade_date >= req.start_date) & (frame.trade_date <= req.end_date)].reset_index(drop=True)
        if frame.empty:
            frame = sample_daily_bars(320, req.end_date.isoformat())
        return frame, "sample_fixture", now()
    cached = _cached_bars(db, instrument.id, req.start_date, req.end_date, req.adjust)
    status = "cache_hit"
    if not cached or cached[0].trade_date > req.start_date or cached[-1].trade_date < req.end_date:
        fetched = AkShareMarketDataProvider().fetch_daily_bars(req.symbol, req.start_date, req.end_date, req.adjust, req.asset_type)
        existing_dates = {row.trade_date for row in cached}
        fetched_at = now()
        for row in fetched.to_dict("records"):
            if row["trade_date"] not in existing_dates:
                db.add(MarketBar(instrument_id=instrument.id, trade_date=row["trade_date"], open=row["open"], high=row["high"], low=row["low"], close=row["close"], volume=row["volume"], amount=None if pd.isna(row.get("amount")) else row.get("amount"), adjust_type=req.adjust, data_source="akshare", fetched_at=fetched_at))
        db.commit()
        cached = _cached_bars(db, instrument.id, req.start_date, req.end_date, req.adjust)
        status = "fetched" if not existing_dates else "partial_cache_filled"
    if not cached:
        raise MarketDataError("本地缓存和 AKShare 均无有效行情", "empty_data")
    snapshot = max(row.fetched_at for row in cached)
    return _bars_frame(cached), status, snapshot


def run_backtest(db: Session, req: BacktestRequest) -> BacktestRun:
    instrument = get_or_create_instrument(db, req)
    strategy = db.get(Strategy, req.strategy_id) if req.strategy_id else None
    if strategy is None:
        strategy = Strategy(name=req.configuration.name, description="由回测请求自动保存")
        db.add(strategy)
        db.flush()
        version_number = 1
    else:
        version_number = (db.scalar(select(func.max(StrategyVersion.version)).where(StrategyVersion.strategy_id == strategy.id)) or 0) + 1
    version = StrategyVersion(strategy_id=strategy.id, version=version_number, configuration_json=req.configuration.model_dump(mode="json"))
    db.add(version)
    db.flush()
    run = BacktestRun(strategy_version_id=version.id, instrument_id=instrument.id, start_date=req.start_date, end_date=req.end_date, initial_cash=req.initial_cash, commission_rate=req.commission_rate, stamp_duty_rate=req.stamp_duty_rate, slippage_rate=req.slippage_rate, status="running")
    db.add(run)
    db.commit()
    try:
        bars, data_status, snapshot = load_market_data(db, instrument, req)
        engine = BacktestEngine(initial_cash=req.initial_cash, commission_rate=req.commission_rate, stamp_duty_rate=req.stamp_duty_rate, slippage_rate=req.slippage_rate, minimum_commission=req.minimum_commission)
        result = engine.run(bars, req.configuration)
        run.status, run.data_snapshot_time, run.completed_at = "success", snapshot, now()
        run.error_message = None
        db.add(BacktestMetric(backtest_run_id=run.id, **result.metrics))
        for point in result.equity.to_dict("records"):
            db.add(EquityPoint(backtest_run_id=run.id, **point))
        for trade in result.trades:
            db.add(Trade(backtest_run_id=run.id, **trade))
        db.commit()
        setattr(run, "runtime_warnings", result.warnings)
        setattr(run, "data_status", data_status)
    except Exception as exc:
        run.status, run.error_message, run.completed_at = "failed", str(exc), now()
        db.commit()
    db.refresh(run)
    return run


def serialize_run(db: Session, run: BacktestRun, detail: bool = False) -> dict:
    metric = db.get(BacktestMetric, run.id)
    instrument = db.get(Instrument, run.instrument_id)
    version = db.get(StrategyVersion, run.strategy_version_id)
    payload = {
        "id": run.id, "status": run.status, "error_message": run.error_message,
        "symbol": instrument.symbol if instrument else None, "instrument_name": instrument.name if instrument else None,
        "start_date": run.start_date, "end_date": run.end_date, "initial_cash": run.initial_cash,
        "commission_rate": run.commission_rate, "stamp_duty_rate": run.stamp_duty_rate, "slippage_rate": run.slippage_rate,
        "strategy_version_id": run.strategy_version_id, "strategy_version": version.version if version else None,
        "data_snapshot_time": run.data_snapshot_time, "created_at": run.created_at, "completed_at": run.completed_at,
        "metrics": {column.name: getattr(metric, column.name) for column in BacktestMetric.__table__.columns if column.name != "backtest_run_id"} if metric else None,
    }
    if detail and version:
        payload["configuration"] = version.configuration_json
    return payload
