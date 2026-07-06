import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";

async function owned(userId: number, id: number) {
  const t = await prisma.adminTask.findUnique({ where: { id } });
  return t && t.userId === userId ? t : null;
}

// PATCH /api/admin-tasks/:id — 완료 토글/수정
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = requireUserId();
  if ("error" in auth) return auth.error;
  const id = Number(params.id);
  if (!(await owned(auth.userId, id)))
    return NextResponse.json({ message: "찾을 수 없습니다." }, { status: 404 });

  const b = await req.json().catch(() => ({}));
  const task = await prisma.adminTask.update({
    where: { id },
    data: {
      title: b.title,
      isDone: b.isDone,
      dueDate: b.dueDate === undefined ? undefined : b.dueDate ? new Date(b.dueDate) : null,
    },
  });
  return NextResponse.json({ task });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const auth = requireUserId();
  if ("error" in auth) return auth.error;
  const id = Number(params.id);
  if (!(await owned(auth.userId, id)))
    return NextResponse.json({ message: "찾을 수 없습니다." }, { status: 404 });

  await prisma.adminTask.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
