import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// 데모 계정 + 샘플 데이터. `npm run db:seed`
async function main() {
  const email = "demo@jachical.app";
  await prisma.user.deleteMany({ where: { email } }); // 재실행 대비 초기화

  const user = await prisma.user.create({
    data: {
      email,
      nickname: "서연",
      passwordHash: await bcrypt.hash("demo1234", 10),
    },
  });

  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const due = (day: number) => new Date(y, m - 1, Math.min(day, new Date(y, m, 0).getDate()));

  // 공과금 항목 + 이번 달 납부 예정
  const seedBills = [
    { category: "ELECTRIC", name: "전기요금", dueDay: 8, defaultAmount: 32000, provider: "한국전력" },
    { category: "GAS", name: "도시가스", dueDay: 11, defaultAmount: 18400, provider: "도시가스" },
    { category: "MAINT", name: "관리비", dueDay: 30, defaultAmount: null, provider: null },
    { category: "WATER", name: "수도요금", dueDay: 25, defaultAmount: 12000, provider: "상수도사업본부" },
  ];
  for (const b of seedBills) {
    const bill = await prisma.bill.create({ data: { ...b, userId: user.id } });
    await prisma.payment.create({
      data: {
        billId: bill.id,
        userId: user.id,
        periodYear: y,
        periodMonth: m,
        dueDate: due(b.dueDay),
        amount: b.defaultAmount,
        status: "PENDING",
      },
    });
  }

  // 이번 달 예산 + 샘플 지출
  await prisma.budget.create({
    data: { userId: user.id, periodYear: y, periodMonth: m, amount: 400000 },
  });
  await prisma.expense.createMany({
    data: [
      { userId: user.id, categoryLabel: "식비", amount: 74600, spentAt: due(3), memo: "장보기" },
      { userId: user.id, categoryLabel: "생활용품", amount: 30000, spentAt: due(4), memo: "세제/휴지" },
      { userId: user.id, categoryLabel: "공과금", amount: 12000, spentAt: due(2), memo: "수도요금" },
    ],
  });

  // 행정 타임라인
  await prisma.adminTask.createMany({
    data: [
      { userId: user.id, title: "전입신고 (14일 이내)", dueDate: due(9), isDone: false, sortOrder: 0 },
      { userId: user.id, title: "전기 명의 변경", isDone: true, sortOrder: 1 },
    ],
  });

  console.log(`✅ Seed 완료 — 로그인: ${email} / demo1234`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
