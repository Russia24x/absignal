import type { Metadata, Viewport } from "next";
import { Inter, Vazirmatn } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import { Providers } from "@/components/providers";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const vazirmatn = Vazirmatn({
  variable: "--font-vazir",
  subsets: ["arabic", "latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "PenguSignal — Daily PENGU Signals on Abstract",
  description:
    "Professional daily BUY/SELL signals for PENGU on the Abstract blockchain. Multi-timeframe technical analysis, on-chain payments, transparent track record.",
  keywords: ["PENGU", "Abstract", "Pudgy Penguins", "trading signals", "technical analysis", "crypto"],
  icons: { icon: "/pengu.svg" },
  openGraph: {
    title: "PenguSignal — Daily PENGU Signals",
    description: "Daily BUY/SELL signals for PENGU on Abstract. Powered by real market data.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#061019",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const cookieStore = await cookies();
  const lang = cookieStore.get("pengu_lang")?.value === "en" ? "en" : "fa";
  const dir = lang === "fa" ? "rtl" : "ltr";

  return (
    <html lang={lang} dir={dir} suppressHydrationWarning className="dark">
      <body
        className={`${inter.variable} ${vazirmatn.variable} antialiased bg-background text-foreground min-h-screen`}
        style={{ fontFamily: "var(--font-vazir), var(--font-inter), system-ui, sans-serif" }}
      >
        <Providers initialLang={lang}>{children}</Providers>
      </body>
    </html>
  );
}
