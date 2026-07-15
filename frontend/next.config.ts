import type { NextConfig } from "next";

function backendOrigin(): string {
  const source = process.env.BACKEND_ORIGIN ?? "http://127.0.0.1:8080";
  const value = new URL(source);
  const loopback = value.hostname === "127.0.0.1" || value.hostname === "localhost";
  const allowedProtocol = value.protocol === "https:" || (value.protocol === "http:" && loopback);
  if (!allowedProtocol || value.username || value.password || value.search || value.hash ||
      (value.pathname !== "/" && value.pathname !== "")) {
    throw new Error("BACKEND_ORIGIN must be HTTPS, or unauthenticated loopback HTTP for local development.");
  }
  value.pathname = "";
  value.search = "";
  value.hash = "";
  return value.origin;
}

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  reactStrictMode: true,
  // make dev/dev-live는 Docker port publish를 위해 0.0.0.0에 listen한다. 브라우저가
  // 사용하는 두 loopback 이름만 개발 asset origin으로 허용하고 production에는
  // 적용하지 않는다.
  allowedDevOrigins: process.env.NODE_ENV === "development"
    ? ["localhost", "127.0.0.1"]
    : undefined,
  async rewrites() {
    const origin = backendOrigin();
    const routes = [
      {
        source: "/api/v1/:path*",
        destination: `${origin}/api/v1/:path*`,
      },
    ];
    if (process.env.NODE_ENV !== "production") {
      routes.unshift({
        source: "/__dev/api/:path*",
        destination: `${origin}/__dev/api/:path*`,
      });
    }
    return routes;
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, max-age=0" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
