import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";
import { dueDateFor } from "@/lib/date";

// POST /api/payments/:id/pay  { amount?, addToExpense? }
// 납부 완료 처리 (KPI 플로우 C). 하나의 트랜잭션으로:
//   1) Payment status=PAID, paidAt=now, amount 반영
//   2) (옵션) Expense 자동 생성
//   3) 다음 달 예정 Payment 생성 (중복 시 무시)
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const auth = requireUserId();
  if ("error" in auth) return auth.error;

  const id = Number(params.id);
  const body = await req.json().catch(() => ({}));

  const payment = await prisma.payment.findUnique({ where: { id }, include: { bill: true } });
  if (!payment || payment.userId !== auth.userId) {
    return NextResponse.json({ message: "찾을 수 없습니다." }, { status: 404 });
  }
  if (payment.status === "PAID") {
    return NextResponse.json({ message: "이미 납부 완료된 항목입니다." }, { status: 409 });
  }

  const paidAmount =
    body.amount === "" || body.amount === null || body.amount === undefined
      ? payment.amount
      : Number(body.amount);
  const addToExpense = Boolean(body.addToExpense);

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.payment.update({
      where: { id },
      data: { status: "PAID", paidAt: new Date(), amount: paidAmount },
    });

    // 2) 지출 자동 반영 (금액이 있을 때만)
    if (addToExpense && paidAmount != null) {
      await tx.expense.upsert({
        where: { sourcePaymentId: id },
        create: {
          userId: auth.userId,
          categoryLabel: "공과금",
          amount: paidAmount,
          spentAt: updated.paidAt ?? new Date(),
          memo: payment.bill.name,
          sourcePaymentId: id,
        },
        update: { amount: paidAmount },
      });
    }

    // 3) 다음 달 예정 생성 (dueDay가 확정된 항목만)
    if (payment.bill.dueDay != null) {
      const nextY = payment.periodMonth === 12 ? payment.periodYear + 1 : payment.periodYear;
      const nextM = payment.periodMonth === 12 ? 1 : payment.periodMonth + 1;
      const nextDue = dueDateFor(nextY, nextM, payment.bill.dueDay);
      await tx.payment
        .create({
          data: {
            billId: payment.billId,
            userId: auth.userId,
            periodYear: nextY,
            periodMonth: nextM,
            dueDate: nextDue,
            amount: payment.bill.defaultAmount,
            status: "PENDING",
          },
        })
        .catch(() => null); // unique 충돌(이미 존재) 시 무시
    }

    return updated;
  });

  return NextResponse.json({ payment: result });
}
