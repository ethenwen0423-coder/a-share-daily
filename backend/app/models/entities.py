from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def now() -> datetime:
    return datetime.now().astimezone()


class Instrument(Base):
    __tablename__ = "instruments"
    id: Mapped[int] = mapped_column(primary_key=True)
    symbol: Mapped[str] = mapped_column(String(32), index=True)
    name: Mapped[str] = mapped_column(String(80))
    market: Mapped[str] = mapped_column(String(20))
    asset_type: Mapped[str] = mapped_column(String(20))
    exchange: Mapped[str] = mapped_column(String(20))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)
    __table_args__ = (UniqueConstraint("symbol", "market", "asset_type", name="uq_instrument_identity"),)


class MarketBar(Base):
    __tablename__ = "market_bars"
    id: Mapped[int] = mapped_column(primary_key=True)
    instrument_id: Mapped[int] = mapped_column(ForeignKey("instruments.id"), index=True)
    trade_date: Mapped[date] = mapped_column(Date, index=True)
    open: Mapped[float] = mapped_column(Float)
    high: Mapped[float] = mapped_column(Float)
    low: Mapped[float] = mapped_column(Float)
    close: Mapped[float] = mapped_column(Float)
    volume: Mapped[float] = mapped_column(Float)
    amount: Mapped[float | None] = mapped_column(Float, nullable=True)
    adjust_type: Mapped[str] = mapped_column(String(12), default="qfq")
    data_source: Mapped[str] = mapped_column(String(32), default="akshare")
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    instrument: Mapped[Instrument] = relationship()
    __table_args__ = (UniqueConstraint("instrument_id", "trade_date", "adjust_type", name="uq_bar_snapshot"),)


class Strategy(Base):
    __tablename__ = "strategies"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)
    versions: Mapped[list[StrategyVersion]] = relationship(back_populates="strategy", cascade="all, delete-orphan")


class StrategyVersion(Base):
    __tablename__ = "strategy_versions"
    id: Mapped[int] = mapped_column(primary_key=True)
    strategy_id: Mapped[int] = mapped_column(ForeignKey("strategies.id"), index=True)
    version: Mapped[int] = mapped_column(Integer)
    configuration_json: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    strategy: Mapped[Strategy] = relationship(back_populates="versions")
    __table_args__ = (UniqueConstraint("strategy_id", "version", name="uq_strategy_version"),)


class BacktestRun(Base):
    __tablename__ = "backtest_runs"
    id: Mapped[int] = mapped_column(primary_key=True)
    strategy_version_id: Mapped[int] = mapped_column(ForeignKey("strategy_versions.id"), index=True)
    instrument_id: Mapped[int] = mapped_column(ForeignKey("instruments.id"), index=True)
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date] = mapped_column(Date)
    initial_cash: Mapped[float] = mapped_column(Float)
    commission_rate: Mapped[float] = mapped_column(Float)
    stamp_duty_rate: Mapped[float] = mapped_column(Float)
    slippage_rate: Mapped[float] = mapped_column(Float)
    status: Mapped[str] = mapped_column(String(16), default="pending", index=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    data_snapshot_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    metrics: Mapped[BacktestMetric | None] = relationship(back_populates="run", uselist=False, cascade="all, delete-orphan")
    equity_points: Mapped[list[EquityPoint]] = relationship(back_populates="run", cascade="all, delete-orphan")
    trades: Mapped[list[Trade]] = relationship(back_populates="run", cascade="all, delete-orphan")


class BacktestMetric(Base):
    __tablename__ = "backtest_metrics"
    backtest_run_id: Mapped[int] = mapped_column(ForeignKey("backtest_runs.id"), primary_key=True)
    total_return: Mapped[float | None] = mapped_column(Float, nullable=True)
    annualized_return: Mapped[float | None] = mapped_column(Float, nullable=True)
    benchmark_return: Mapped[float | None] = mapped_column(Float, nullable=True)
    excess_return: Mapped[float | None] = mapped_column(Float, nullable=True)
    annualized_volatility: Mapped[float | None] = mapped_column(Float, nullable=True)
    sharpe_ratio: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_drawdown: Mapped[float | None] = mapped_column(Float, nullable=True)
    win_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    profit_loss_ratio: Mapped[float | None] = mapped_column(Float, nullable=True)
    trade_count: Mapped[int] = mapped_column(Integer, default=0)
    average_holding_days: Mapped[float | None] = mapped_column(Float, nullable=True)
    run: Mapped[BacktestRun] = relationship(back_populates="metrics")


class EquityPoint(Base):
    __tablename__ = "equity_points"
    id: Mapped[int] = mapped_column(primary_key=True)
    backtest_run_id: Mapped[int] = mapped_column(ForeignKey("backtest_runs.id"), index=True)
    trade_date: Mapped[date] = mapped_column(Date)
    cash: Mapped[float] = mapped_column(Float)
    position_quantity: Mapped[int] = mapped_column(Integer)
    position_value: Mapped[float] = mapped_column(Float)
    total_equity: Mapped[float] = mapped_column(Float)
    daily_return: Mapped[float | None] = mapped_column(Float, nullable=True)
    drawdown: Mapped[float] = mapped_column(Float)
    benchmark_equity: Mapped[float] = mapped_column(Float)
    run: Mapped[BacktestRun] = relationship(back_populates="equity_points")
    __table_args__ = (UniqueConstraint("backtest_run_id", "trade_date", name="uq_run_equity_date"),)


class Trade(Base):
    __tablename__ = "trades"
    id: Mapped[int] = mapped_column(primary_key=True)
    backtest_run_id: Mapped[int] = mapped_column(ForeignKey("backtest_runs.id"), index=True)
    signal_date: Mapped[date] = mapped_column(Date)
    trade_date: Mapped[date] = mapped_column(Date)
    side: Mapped[str] = mapped_column(String(8))
    price: Mapped[float] = mapped_column(Float)
    quantity: Mapped[int] = mapped_column(Integer)
    commission: Mapped[float] = mapped_column(Float)
    stamp_duty: Mapped[float] = mapped_column(Float, default=0)
    slippage_cost: Mapped[float] = mapped_column(Float, default=0)
    realized_profit: Mapped[float | None] = mapped_column(Float, nullable=True)
    holding_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reason: Mapped[str] = mapped_column(String(80))
    run: Mapped[BacktestRun] = relationship(back_populates="trades")
