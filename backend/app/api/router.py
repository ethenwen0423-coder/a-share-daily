from __future__ import annotations

from sqlalchemy import desc, select
from sqlalchemy.orm import Session
from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.database import get_db
from app.data.providers import AkShareMarketDataProvider, MarketDataError
from app.indicators.registry import INDICATOR_REGISTRY
from app.models.entities import BacktestRun, EquityPoint, Instrument, Strategy, StrategyVersion, Trade
from app.schemas.strategy import BacktestRequest, DOUBLE_MA_STRATEGY, StrategyCreate
from app.services.backtest_service import create_strategy, get_or_create_instrument, load_market_data, run_backtest, serialize_run, update_strategy

router = APIRouter(prefix="/api")


@router.get("/health")
def health():
    return {"status": "ok", "service": "量化策略实验室", "mode": "research_only"}


@router.get("/instruments/search")
def search_instruments(q: str = Query("", max_length=30), db: Session = Depends(get_db)):
    presets = [
        {"symbol": "600519", "name": "贵州茅台", "market": "a_share", "asset_type": "stock", "exchange": "SH"},
        {"symbol": "510300", "name": "沪深300ETF", "market": "etf", "asset_type": "etf", "exchange": "SH"},
        {"symbol": "000300", "name": "沪深300", "market": "index", "asset_type": "index", "exchange": "SH"},
    ]
    local = list(db.scalars(select(Instrument).where((Instrument.symbol.contains(q)) | (Instrument.name.contains(q))).limit(20)).all()) if q else []
    result = [{"symbol": x.symbol, "name": x.name, "market": x.market, "asset_type": x.asset_type, "exchange": x.exchange} for x in local]
    for item in presets:
        if (not q or q in item["symbol"] or q in item["name"]) and item not in result:
            result.append(item)
    return result[:20]


@router.post("/market-data/fetch")
def fetch_market_data(req: BacktestRequest, db: Session = Depends(get_db)):
    instrument = get_or_create_instrument(db, req)
    try:
        frame, status, snapshot = load_market_data(db, instrument, req)
        return {"status": status, "rows": len(frame), "first_date": frame.iloc[0]["trade_date"], "last_date": frame.iloc[-1]["trade_date"], "data_snapshot_time": snapshot, "source": "sample_fixture" if req.data_mode == "sample" else "akshare"}
    except MarketDataError as exc:
        raise HTTPException(status_code=422, detail={"code": exc.status, "message": str(exc)}) from exc


@router.get("/indicators")
def indicators():
    return {
        "items": [
            {"type": "sma", "name": "简单移动平均线", "params": {"period": 5}},
            {"type": "ema", "name": "指数移动平均线", "params": {"period": 12}},
            {"type": "macd", "name": "MACD", "params": {"fast_period": 12, "slow_period": 26, "signal_period": 9}},
            {"type": "rsi", "name": "RSI", "params": {"period": 14}},
            {"type": "bollinger", "name": "布林带", "params": {"period": 20, "standard_deviation": 2}},
            {"type": "volume_ma", "name": "成交量均线", "params": {"period": 20}},
        ],
        "comparisons": ["greater_than", "less_than", "equal", "cross_above", "cross_below"],
        "example_strategy": DOUBLE_MA_STRATEGY.model_dump(mode="json"),
    }


def strategy_payload(db: Session, strategy: Strategy) -> dict:
    versions = list(db.scalars(select(StrategyVersion).where(StrategyVersion.strategy_id == strategy.id).order_by(desc(StrategyVersion.version))).all())
    return {"id": strategy.id, "name": strategy.name, "description": strategy.description, "created_at": strategy.created_at, "updated_at": strategy.updated_at, "latest_version": versions[0].version if versions else None, "configuration": versions[0].configuration_json if versions else None, "versions": [{"id": v.id, "version": v.version, "created_at": v.created_at} for v in versions]}


@router.post("/strategies", status_code=201)
def create_strategy_endpoint(payload: StrategyCreate, db: Session = Depends(get_db)):
    return strategy_payload(db, create_strategy(db, payload))


@router.get("/strategies")
def list_strategies(db: Session = Depends(get_db)):
    return [strategy_payload(db, item) for item in db.scalars(select(Strategy).order_by(desc(Strategy.updated_at))).all()]


@router.get("/strategies/{strategy_id}")
def get_strategy(strategy_id: int, db: Session = Depends(get_db)):
    strategy = db.get(Strategy, strategy_id)
    if not strategy:
        raise HTTPException(404, "策略不存在")
    return strategy_payload(db, strategy)


@router.put("/strategies/{strategy_id}")
def put_strategy(strategy_id: int, payload: StrategyCreate, db: Session = Depends(get_db)):
    strategy = db.get(Strategy, strategy_id)
    if not strategy:
        raise HTTPException(404, "策略不存在")
    return strategy_payload(db, update_strategy(db, strategy, payload))


@router.post("/backtests", status_code=201)
def create_backtest(req: BacktestRequest, db: Session = Depends(get_db)):
    run = run_backtest(db, req)
    payload = serialize_run(db, run, detail=True)
    payload["warnings"] = getattr(run, "runtime_warnings", [])
    payload["data_status"] = getattr(run, "data_status", None)
    return payload


@router.get("/backtests")
def list_backtests(db: Session = Depends(get_db)):
    return [serialize_run(db, run) for run in db.scalars(select(BacktestRun).order_by(desc(BacktestRun.created_at)).limit(100)).all()]


@router.get("/backtests/{run_id}")
def get_backtest(run_id: int, db: Session = Depends(get_db)):
    run = db.get(BacktestRun, run_id)
    if not run:
        raise HTTPException(404, "回测记录不存在")
    return serialize_run(db, run, detail=True)


@router.get("/backtests/{run_id}/equity")
def get_equity(run_id: int, db: Session = Depends(get_db)):
    if not db.get(BacktestRun, run_id):
        raise HTTPException(404, "回测记录不存在")
    rows = db.scalars(select(EquityPoint).where(EquityPoint.backtest_run_id == run_id).order_by(EquityPoint.trade_date)).all()
    return [{column.name: getattr(row, column.name) for column in EquityPoint.__table__.columns if column.name != "id"} for row in rows]


@router.get("/backtests/{run_id}/trades")
def get_trades(run_id: int, db: Session = Depends(get_db)):
    if not db.get(BacktestRun, run_id):
        raise HTTPException(404, "回测记录不存在")
    rows = db.scalars(select(Trade).where(Trade.backtest_run_id == run_id).order_by(Trade.trade_date)).all()
    return [{column.name: getattr(row, column.name) for column in Trade.__table__.columns if column.name != "id"} for row in rows]
