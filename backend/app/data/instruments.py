from __future__ import annotations

from typing import Any

import httpx


EASTMONEY_SUGGEST_URL = "https://searchapi.eastmoney.com/api/suggest/get"
EASTMONEY_TOKEN = "D43BF722C8E33BDC906FB84D85E326E8"


def _asset_type(item: dict[str, Any]) -> str | None:
    classify = str(item.get("Classify", ""))
    security_name = str(item.get("SecurityTypeName", ""))
    if classify == "AStock" or security_name in {"沪A", "深A", "京A"}:
        return "stock"
    if classify == "Fund" and str(item.get("MktNum", "")) in {"0", "1"}:
        return "etf"
    if classify == "Index" and str(item.get("MktNum", "")) in {"0", "1"}:
        return "index"
    return None


def parse_eastmoney_instruments(payload: dict[str, Any], query: str = "") -> list[dict[str, str]]:
    rows = payload.get("QuotationCodeTable", {}).get("Data") or []
    result: list[dict[str, str]] = []
    seen: set[tuple[str, str, str]] = set()
    normalized_query = query.strip().upper()
    for item in rows:
        asset_type = _asset_type(item)
        symbol = str(item.get("Code", "")).strip().upper()
        name = str(item.get("Name", "")).strip()
        if not asset_type or not symbol or not name:
            continue
        quote_market = str(item.get("QuoteID", "")).partition(".")[0]
        security_name = str(item.get("SecurityTypeName", ""))
        exchange = "BJ" if security_name == "京A" else {"0": "SZ", "1": "SH", "2": "BJ"}.get(quote_market)
        if not exchange:
            exchange = {"沪A": "SH", "深A": "SZ", "京A": "BJ"}.get(security_name, "CN")
        key = (symbol, name, asset_type)
        if key in seen:
            continue
        seen.add(key)
        result.append({
            "symbol": symbol,
            "name": name,
            "market": "a_share" if asset_type == "stock" else asset_type,
            "asset_type": asset_type,
            "exchange": exchange,
        })
    return sorted(result, key=lambda item: (item["symbol"] != normalized_query, {"stock": 0, "etf": 1, "index": 2}[item["asset_type"]]))


def lookup_instruments(query: str, timeout: float = 5.0) -> list[dict[str, str]]:
    normalized = query.strip()
    if not normalized:
        return []
    try:
        response = httpx.get(
            EASTMONEY_SUGGEST_URL,
            params={"input": normalized, "type": 14, "count": 20, "token": EASTMONEY_TOKEN},
            headers={"User-Agent": "Mozilla/5.0 QuantLab/0.1"},
            timeout=timeout,
        )
        response.raise_for_status()
        return parse_eastmoney_instruments(response.json(), normalized)
    except (httpx.HTTPError, ValueError, TypeError):
        return []
