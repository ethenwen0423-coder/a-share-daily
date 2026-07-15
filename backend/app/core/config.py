from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = PROJECT_ROOT / "data"
DATA_DIR.mkdir(exist_ok=True)
DATABASE_URL = f"sqlite:///{DATA_DIR / 'quant_lab.db'}"
TRADING_DAYS_PER_YEAR = 252
DEFAULT_TIMEZONE = "Asia/Shanghai"
