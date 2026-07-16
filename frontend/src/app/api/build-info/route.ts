import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET(): NextResponse {
  const source = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.NEXT_PUBLIC_BUILD_SHA ?? "";
  const gitSha = /^[0-9a-f]{40}$/i.test(source) ? source.toLowerCase() : "local";
  return NextResponse.json(
    { gitSha },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
