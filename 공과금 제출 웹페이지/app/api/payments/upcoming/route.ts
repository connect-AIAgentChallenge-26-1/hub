import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";

// GET /api/payments/upcoming?days=7
// 홈 '다가오는 납부' — 오늘 기준 N일 이내 미납부(PENDING) 항목. 알림의 1차 채널/폴백.
export async function GET(req: Request) {
  const auth = requireUserId();
  if ("error" in auth) return auth.error;

  const days = Number(new URL(req.url).searchParams.get("days") ?? 7);
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + days + 1);

  const payments = await prisma.payment.findMany({
    where: {
      userId: auth.userId,
      status: "PENDING",
      dueDate: { gte: start, lt: end },
    },
    include: { bill: { select: { name: true, category: true, provider: true } } },
    orderBy: { dueDate: "asc" },
    take: 5,
  });

  return NextResponse.json({ payments });
}
