from app.data.instruments import parse_eastmoney_instruments


def test_parse_supported_instruments_and_filter_unrelated_markets():
    payload = {
        "QuotationCodeTable": {
            "Data": [
                {"Code": "000001", "Name": "平安银行", "Classify": "AStock", "MktNum": "0", "QuoteID": "0.000001", "SecurityTypeName": "深A"},
                {"Code": "000001", "Name": "上证指数", "Classify": "Index", "MktNum": "1", "QuoteID": "1.000001", "SecurityTypeName": "指数"},
                {"Code": "000001", "Name": "场外基金", "Classify": "OTCFUND", "MktNum": "150", "QuoteID": "150.000001", "SecurityTypeName": "基金"},
                {"Code": "000001", "Name": "海外证券", "Classify": "KRX", "MktNum": "177", "QuoteID": "177.000001", "SecurityTypeName": "韩股"},
            ]
        }
    }

    result = parse_eastmoney_instruments(payload, "000001")

    assert [(item["name"], item["asset_type"], item["exchange"]) for item in result] == [
        ("平安银行", "stock", "SZ"),
        ("上证指数", "index", "SH"),
    ]


def test_parse_stock_etf_index_and_beijing_exchange():
    payload = {
        "QuotationCodeTable": {
            "Data": [
                {"Code": "510300", "Name": "沪深300ETF华泰柏瑞", "Classify": "Fund", "MktNum": "1", "QuoteID": "1.510300", "SecurityTypeName": "基金"},
                {"Code": "399006", "Name": "创业板指", "Classify": "Index", "MktNum": "0", "QuoteID": "0.399006", "SecurityTypeName": "指数"},
                {"Code": "920001", "Name": "纬达光电", "Classify": "NEEQ", "MktNum": "0", "QuoteID": "0.920001", "SecurityTypeName": "京A"},
            ]
        }
    }

    result = parse_eastmoney_instruments(payload)

    assert {item["symbol"]: (item["asset_type"], item["exchange"]) for item in result} == {
        "510300": ("etf", "SH"),
        "399006": ("index", "SZ"),
        "920001": ("stock", "BJ"),
    }
