import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "later.",
  description: "링크나 텍스트를 저장하면 자동으로 분류해주는 앱",
  manifest: "/manifest.json",
  applicationName: "later.",
  formatDetection: {
    telephone: false,
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "later.",
  },
  icons: {
    icon: [
      { url: "/icons/later-icon.svg", type: "image/svg+xml" },
      { url: "/icons/later-icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/later-icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      {
        url: "/icons/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#FFFFFF",
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
