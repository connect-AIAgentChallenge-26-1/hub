import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";

// GET /api/budgets/:year/:month — 월 예산 조회(없으면 null)
export async function GET(_req: Request, { params }: { params: { year: string; month: string } }) {
  const auth = requireUserId();
  if ("error" in auth) return auth.error;

  const budget = await prisma.budget.findUnique({
    where: {
      userId_periodYear_periodMonth: {
        userId: auth.userId,
        periodYear: Number(params.year),
        periodMonth: Number(params.month),
      },
    },
  });
  return NextResponse.json({ budget });
}

// PUT /api/budgets/:year/:month — 월 예산 설정/수정(upsert)
export async function PUT(req: Request, { params }: { params: { year: string; month: string } }) {
  const auth = requireUserId();
  if ("error" in auth) return auth.error;

  const { amount } = await req.json().catch(() => ({}));
  if (amount === undefined || amount === null || Number(amount) < 0) {
    return NextResponse.json({ message: "예산 금액을 올바르게 입력해 주세요." }, { status: 400 });
  }
  const year = Number(params.year);
  const month = Number(params.month);

  const budget = await prisma.budget.upsert({
    where: { userId_periodYear_periodMonth: { userId: auth.userId, periodYear: year, periodMonth: month } },
    create: { userId: auth.userId, periodYear: year, periodMonth: month, amount: Number(amount) },
    update: { amount: Number(amount) },
  });
  return NextResponse.json({ budget });
}
