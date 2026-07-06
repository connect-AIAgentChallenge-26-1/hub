import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";

async function owned(userId: number, id: number) {
  const e = await prisma.expense.findUnique({ where: { id } });
  return e && e.userId === userId ? e : null;
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = requireUserId();
  if ("error" in auth) return auth.error;
  const id = Number(params.id);
  if (!(await owned(auth.userId, id)))
    return NextResponse.json({ message: "찾을 수 없습니다." }, { status: 404 });

  const b = await req.json().catch(() => ({}));
  const expense = await prisma.expense.update({
    where: { id },
    data: {
      categoryLabel: b.categoryLabel,
      amount: b.amount === undefined ? undefined : Number(b.amount),
      spentAt: b.spentAt ? new Date(b.spentAt) : undefined,
      memo: b.memo === undefined ? undefined : b.memo || null,
    },
  });
  return NextResponse.json({ expense });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const auth = requireUserId();
  if ("error" in auth) return auth.error;
  const id = Number(params.id);
  if (!(await owned(auth.userId, id)))
    return NextResponse.json({ message: "찾을 수 없습니다." }, { status: 404 });

  await prisma.expense.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
