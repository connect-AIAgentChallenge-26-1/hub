import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/auth";

// GET /api/admin-tasks — 행정 체크리스트 목록 (F3 Should)
export async function GET() {
  const auth = requireUserId();
  if ("error" in auth) return auth.error;

  const tasks = await prisma.adminTask.findMany({
    where: { userId: auth.userId },
    orderBy: [{ isDone: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
  });
  return NextResponse.json({ tasks });
}

// POST /api/admin-tasks — 항목 추가
export async function POST(req: Request) {
  const auth = requireUserId();
  if ("error" in auth) return auth.error;

  const b = await req.json().catch(() => ({}));
  if (!b.title?.trim()) {
    return NextResponse.json({ message: "할 일 이름을 입력해 주세요." }, { status: 400 });
  }
  const task = await prisma.adminTask.create({
    data: {
      userId: auth.userId,
      title: b.title.trim(),
      dueDate: b.dueDate ? new Date(b.dueDate) : null,
      sortOrder: b.sortOrder ?? 0,
    },
  });
  return NextResponse.json({ task });
}
