import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";

// GET /api/payments?from=YYYY-MM-DD&to=YYYY-MM-DD&status=PENDING
// 캘린더 마킹/기간 조회용. bill 정보(카테고리·이름)를 함께 반환.
export async function GET(req: Request) {
  const auth = requireUserId();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const status = searchParams.get("status");

  const payments = await prisma.payment.findMany({
    where: {
      userId: auth.userId,
      ...(status ? { status } : {}),
      ...(from || to
        ? {
            dueDate: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to + "T23:59:59") } : {}),
            },
          }
        : {}),
    },
    include: { bill: { select: { name: true, category: true, provider: true } } },
    orderBy: { dueDate: "asc" },
  });

  return NextResponse.json({ payments });
}
