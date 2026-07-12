import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const protocol = headerList.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const base = new URL(`${protocol}://${host}`);

  return {
    metadataBase: base,
    title: "市场脉搏｜A股分析日报",
    description: "面向A股投资者的每日市场诊断：指数、市场宽度、板块强弱、因果传导与情景推演。",
    openGraph: {
      title: "市场脉搏｜A股分析日报",
      description: "指数重挫，个股普涨：拆解市场分化背后的资金逻辑。",
      type: "website",
      images: [{ url: "/og.png", width: 1536, height: 1024, alt: "市场脉搏 A股分析日报" }],
    },
    twitter: { card: "summary_large_image", title: "市场脉搏｜A股分析日报", description: "把噪音变成因果，把观点变成可核验的信号。", images: ["/og.png"] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body>
    </html>
  );
}
