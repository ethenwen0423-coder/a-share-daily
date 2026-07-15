type EastmoneyRow = {
  Code?: string;
  Name?: string;
  Classify?: string;
  MktNum?: string | number;
  QuoteID?: string;
  SecurityTypeName?: string;
};

type Instrument = {
  symbol: string;
  name: string;
  market: "a_share" | "etf" | "index";
  asset_type: "stock" | "etf" | "index";
  exchange: "SH" | "SZ" | "BJ" | "CN";
};

const fallback: Instrument[] = [
  {
    symbol: "600519",
    name: "贵州茅台",
    market: "a_share",
    asset_type: "stock",
    exchange: "SH",
  },
  {
    symbol: "300750",
    name: "宁德时代",
    market: "a_share",
    asset_type: "stock",
    exchange: "SZ",
  },
  {
    symbol: "510300",
    name: "沪深300ETF华泰柏瑞",
    market: "etf",
    asset_type: "etf",
    exchange: "SH",
  },
  {
    symbol: "159915",
    name: "创业板ETF易方达",
    market: "etf",
    asset_type: "etf",
    exchange: "SZ",
  },
  {
    symbol: "000300",
    name: "沪深300",
    market: "index",
    asset_type: "index",
    exchange: "SH",
  },
  {
    symbol: "399006",
    name: "创业板指",
    market: "index",
    asset_type: "index",
    exchange: "SZ",
  },
];

function assetType(row: EastmoneyRow): Instrument["asset_type"] | null {
  if (
    row.Classify === "AStock" ||
    ["沪A", "深A", "京A"].includes(row.SecurityTypeName || "")
  )
    return "stock";
  if (row.Classify === "Fund" && ["0", "1"].includes(String(row.MktNum)))
    return "etf";
  if (row.Classify === "Index" && ["0", "1"].includes(String(row.MktNum)))
    return "index";
  return null;
}

function normalize(rows: EastmoneyRow[], query: string): Instrument[] {
  const seen = new Set<string>();
  return rows
    .flatMap((row): Instrument[] => {
      const type = assetType(row);
      const symbol = String(row.Code || "")
        .trim()
        .toUpperCase();
      const name = String(row.Name || "").trim();
      if (!type || !symbol || !name) return [];
      const marketNumber = String(row.QuoteID || "").split(".")[0];
    const exchange =
      row.SecurityTypeName === "京A"
        ? "BJ"
        : ({ "0": "SZ", "1": "SH", "2": "BJ" } as const)[
            marketNumber as "0" | "1" | "2"
          ] || "CN";
      const key = `${symbol}:${name}:${type}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [
        {
          symbol,
          name,
          asset_type: type,
          market: type === "stock" ? "a_share" : type,
          exchange,
        },
      ];
    })
    .sort(
      (a, b) =>
        Number(a.symbol !== query) - Number(b.symbol !== query) ||
        { stock: 0, etf: 1, index: 2 }[a.asset_type] -
          { stock: 0, etf: 1, index: 2 }[b.asset_type],
    );
}

export async function GET(request: Request) {
  const query =
    new URL(request.url).searchParams.get("q")?.trim().toUpperCase() || "";
  if (!query || query.length > 30) return Response.json([]);
  let instruments: Instrument[] = [];
  try {
    const endpoint = new URL("https://searchapi.eastmoney.com/api/suggest/get");
    endpoint.search = new URLSearchParams({
      input: query,
      type: "14",
      count: "20",
      token: "D43BF722C8E33BDC906FB84D85E326E8",
    }).toString();
    const response = await fetch(endpoint, {
      headers: { "User-Agent": "Mozilla/5.0 QuantLab/0.1" },
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) {
      const payload = (await response.json()) as {
        QuotationCodeTable?: { Data?: EastmoneyRow[] };
      };
      instruments = normalize(payload.QuotationCodeTable?.Data || [], query);
    }
  } catch {
    // Keep the most-used examples available if the upstream lookup is temporarily unavailable.
  }
  if (!instruments.length)
    instruments = fallback.filter(
      (item) => item.symbol.includes(query) || item.name.includes(query),
    );
  return Response.json(instruments.slice(0, 20), {
    headers: { "Cache-Control": "public, max-age=300, s-maxage=86400" },
  });
}
