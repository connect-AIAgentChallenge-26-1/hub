import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";

async function owned(userId: number, id: number) {
  const bill = await prisma.bill.findUnique({ where: { id } });
  return bill && bill.userId === userId ? bill : null;
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const auth = requireUserId();
  if ("error" in auth) return auth.error;
  const bill = await owned(auth.userId, Number(params.id));
  if (!bill) return NextResponse.json({ message: "찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json({ bill });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = requireUserId();
  if ("error" in auth) return auth.error;
  const id = Number(params.id);
  if (!(await owned(auth.userId, id)))
    return NextResponse.json({ message: "찾을 수 없습니다." }, { status: 404 });

  const b = await req.json().catch(() => ({}));
  const bill = await prisma.bill.update({
    where: { id },
    data: {
      category: b.category,
      name: b.name,
      dueDay: b.dueDay === "" ? null : b.dueDay === undefined ? undefined : Number(b.dueDay),
      defaultAmount:
        b.defaultAmount === "" ? null : b.defaultAmount === undefined ? undefined : Number(b.defaultAmount),
      provider: b.provider === undefined ? undefined : b.provider || null,
      notifyEnabled: b.notifyEnabled,
      notifyDaysBefore: b.notifyDaysBefore,
    },
  });
  return NextResponse.json({ bill });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const auth = requireUserId();
  if ("error" in auth) return auth.error;
  const id = Number(params.id);
  if (!(await owned(auth.userId, id)))
    return NextResponse.json({ message: "찾을 수 없습니다." }, { status: 404 });

  // 미래 미납부(PENDING) 예정은 함께 삭제, 과거 납부 이력은 cascade로 정리
  await prisma.bill.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
