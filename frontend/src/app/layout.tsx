import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "PlacePick AI · 근거 기반 장소 추천",
  description: "조건을 직접 확인하고 근거가 연결된 Top 3를 함께 투표하는 장소 추천 서비스",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light",
  themeColor: "#0f172a",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ko" data-scroll-behavior="smooth">
      <body>
        <a className="skip-link" href="#main-content">본문으로 건너뛰기</a>
        {children}
      </body>
    </html>
  );
}
