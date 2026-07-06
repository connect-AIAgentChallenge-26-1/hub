import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { nextDueDate } from "@/lib/date";

// GET /api/bills — 항목 목록
export async function GET() {
  const auth = requireUserId();
  if ("error" in auth) return auth.error;

  const bills = await prisma.bill.findMany({
    where: { userId: auth.userId },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ bills });
}

// POST /api/bills — 항목 등록 + 다가오는 납부 Payment 자동 생성
export async function POST(req: Request) {
  const auth = requireUserId();
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => ({}));
  const { category, name, dueDay, defaultAmount, provider, notifyEnabled, notifyDaysBefore } = body;

  if (!category || !name) {
    return NextResponse.json({ message: "카테고리와 이름은 필수입니다." }, { status: 400 });
  }
  const day = dueDay === "" || dueDay === null || dueDay === undefined ? null : Number(dueDay);
  if (day !== null && (day < 1 || day > 31)) {
    return NextResponse.json({ message: "납부일은 1~31 사이여야 합니다." }, { status: 400 });
  }
  const amount =
    defaultAmount === "" || defaultAmount === null || defaultAmount === undefined
      ? null
      : Number(defaultAmount);

  const bill = await prisma.bill.create({
    data: {
      userId: auth.userId,
      category,
      name,
      dueDay: day,
      defaultAmount: amount,
      provider: provider || null,
      notifyEnabled: notifyEnabled ?? true,
      notifyDaysBefore: notifyDaysBefore ?? 2,
    },
  });

  // 납부일이 확정된 경우에만 다가오는 Payment 예정 레코드 생성 (예외처리: 미정이면 생성 안 함)
  if (day !== null) {
    const due = nextDueDate(day);
    await prisma.payment.create({
      data: {
        billId: bill.id,
        userId: auth.userId,
        periodYear: due.getFullYear(),
        periodMonth: due.getMonth() + 1,
        dueDate: due,
        amount,
        status: "PENDING",
      },
    });
  }

  return NextResponse.json({ bill });
}
