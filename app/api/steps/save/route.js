import { z } from "zod";
import { createPage } from "@/app/lib/notion";

// skills.md 고정 셋(task_category, 7개)과 동일.
const TASK_CATEGORIES = [
  "cleaning",
  "contact",
  "paperwork",
  "errands",
  "self_care",
  "work",
  "other",
];

// 리뷰 발견: 이 라우트가 MicroStep 필드를 검증 없이 그대로 Notion에 쓰고 있었다(S1-save 입력
// 제약 위반). S1의 MicroStep 계약(title·estimatedMinutes 1~25·category·scheduledDate)과
// 동일한 스키마로 검증한다.
const microStepSchema = z.object({
  title: z.string().min(1),
  estimatedMinutes: z.number().min(1).max(25),
  category: z.enum(TASK_CATEGORIES),
  scheduledDate: z.string().min(1),
});
const saveSchema = z.object({
  microsteps: z.array(microStepSchema).min(1),
});

// T17: 검토 화면(MicrostepReview)에서 사용자가 삭제까지 반영해 확정한 목록만 이 시점에
// Notion Steps DB에 저장한다(S1-save). Brain Dump 분할 시점(S1)엔 저장하지 않는다.
async function saveMicrostep(databaseId, microstep) {
  return createPage(databaseId, {
    Title: { title: [{ text: { content: microstep.title } }] },
    EstimatedMinutes: { number: microstep.estimatedMinutes },
    Category: { select: { name: microstep.category } },
    ScheduledDate: { date: { start: microstep.scheduledDate } },
  });
}

export async function POST(request) {
  const body = await request.json();
  const parsed = saveSchema.safeParse(body);

  if (!parsed.success) {
    return Response.json(
      { error: "저장할 마이크로스텝 형식이 올바르지 않아요" },
      { status: 400 }
    );
  }

  const { microsteps } = parsed.data;
  const databaseId = process.env.NOTION_STEPS_DB_ID;
  await Promise.all(microsteps.map((step) => saveMicrostep(databaseId, step)));

  return Response.json({ saved: microsteps.length });
}
