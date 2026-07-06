import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";

// GET /api/expenses/summary?year=&month=
// 게이지/카테고리 분석용: 월 예산, 총 지출, 잔여금, 카테고리별 합계
export async function GET(req: Request) {
  const auth = requireUserId();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year"));
  const month = Number(searchParams.get("month"));

  const [budget, expenses] = await Promise.all([
    prisma.budget.findUnique({
      where: {
        userId_periodYear_periodMonth: { userId: auth.userId, periodYear: year, periodMonth: month },
      },
    }),
    prisma.expense.findMany({
      where: {
        userId: auth.userId,
        spentAt: { gte: new Date(year, month - 1, 1), lt: new Date(year, month, 1) },
      },
    }),
  ]);

  const spent = expenses.reduce((s, e) => s + e.amount, 0);
  const byCategory: Record<string, number> = {};
  for (const e of expenses) byCategory[e.categoryLabel] = (byCategory[e.categoryLabel] ?? 0) + e.amount;

  return NextResponse.json({
    budget: budget?.amount ?? null,
    spent,
    remaining: budget ? budget.amount - spent : null,
    byCategory: Object.entries(byCategory)
      .map(([label, amount]) => ({ label, amount }))
      .sort((a, b) => b.amount - a.amount),
  });
}
