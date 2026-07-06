import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, signToken, setAuthCookie } from "@/lib/auth";

export async function POST(req: Request) {
  const { email, password, nickname } = await req.json().catch(() => ({}));

  if (!email || !password || !nickname) {
    return NextResponse.json({ message: "이메일·비밀번호·닉네임을 모두 입력해 주세요." }, { status: 400 });
  }
  if (String(password).length < 6) {
    return NextResponse.json({ message: "비밀번호는 6자 이상이어야 합니다." }, { status: 400 });
  }

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) {
    return NextResponse.json({ message: "이미 가입된 이메일입니다." }, { status: 409 });
  }

  const user = await prisma.user.create({
    data: { email, passwordHash: await hashPassword(password), nickname },
  });

  const res = NextResponse.json({ id: user.id, email: user.email, nickname: user.nickname });
  return setAuthCookie(res, signToken(user.id));
}
