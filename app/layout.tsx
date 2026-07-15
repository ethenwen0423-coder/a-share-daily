import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const list = await headers();
  const host = list.get("x-forwarded-host") ?? list.get("host") ?? "localhost:3000";
  const protocol = list.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  return {
    metadataBase: new URL(`${protocol}://${host}`),
    title: "量化策略实验室｜可视化回测平台",
    description: "无需编写代码的 A股、ETF 与指数技术策略回测平台。严格遵守 T+1 成交和无未来函数。",
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: { title: "量化策略实验室", description: "把交易想法变成可验证、可复现的历史证据。", type: "website", images: [{ url: "/og.png", width: 1536, height: 1024, alt: "量化策略实验室" }] },
    twitter: { card: "summary_large_image", title: "量化策略实验室", description: "可视化策略、T+1 回测、完整交易证据。", images: ["/og.png"] },
  };
}

export default function RootLayout({children}:{children:React.ReactNode}) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
