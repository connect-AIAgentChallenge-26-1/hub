import { queryDatabase } from "@/app/lib/notion";
import { kstDateString } from "@/app/lib/date";

function dateStringFromDaysAgo(daysAgo) {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return kstDateString(date);
}

// 이번 주(최근 7일, 오늘 포함) 중 완료 기록(Done=true, CompletedAt)이 있는 날이 며칠인지,
// 그리고 요일별로 어느 날 완료했는지를 계산한다(T26). 대시보드가 아니라 숫자 하나 + 점 7개.
export async function GET() {
  const databaseId = process.env.NOTION_STEPS_DB_ID;
  const sevenDaysAgo = dateStringFromDaysAgo(6);

  const rows = await queryDatabase(databaseId, {
    filter: {
      and: [
        { property: "Done", checkbox: { equals: true } },
        { property: "CompletedAt", date: { on_or_after: sevenDaysAgo } },
      ],
    },
  });

  const completedDates = new Set(
    rows
      .map((row) => row.properties?.CompletedAt?.date?.start)
      .filter(Boolean)
      .map((iso) => kstDateString(new Date(iso)))
  );

  const week = [];
  for (let i = 6; i >= 0; i--) {
    week.push(completedDates.has(dateStringFromDaysAgo(i)));
  }
  const daysCompleted = week.filter(Boolean).length;

  return Response.json({ daysCompleted, week });
}
