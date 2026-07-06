import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";

// GET /api/expenses?year=&month= — 월 지출 목록
export async function GET(req: Request) {
  const auth = requireUserId();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year"));
  const month = Number(searchParams.get("month"));

  let where: any = { userId: auth.userId };
  if (year && month) {
    where.spentAt = { gte: new Date(year, month - 1, 1), lt: new Date(year, month, 1) };
  }

  const expenses = await prisma.expense.findMany({ where, orderBy: { spentAt: "desc" } });
  return NextResponse.json({ expenses });
}

// POST /api/expenses — 지출 입력
export async function POST(req: Request) {
  const auth = requireUserId();
  if ("error" in auth) return auth.error;

  const b = await req.json().catch(() => ({}));
  if (!b.categoryLabel || b.amount === undefined || b.amount === "" || Number(b.amount) <= 0) {
    return NextResponse.json({ message: "카테고리와 금액을 입력해 주세요." }, { status: 400 });
  }

  const expense = await prisma.expense.create({
    data: {
      userId: auth.userId,
      categoryLabel: b.categoryLabel,
      amount: Number(b.amount),
      spentAt: b.spentAt ? new Date(b.spentAt) : new Date(),
      memo: b.memo || null,
    },
  });
  return NextResponse.json({ expense });
}
