import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import BottomTab from "@/components/BottomTab";

// 인증 필수 영역 — 하단 탭바가 있는 4개 메인 화면 공통 레이아웃
export default function AppLayout({ children }: { children: React.ReactNode }) {
  if (!getUserId()) redirect("/login");
  return (
    <div className="app-shell">
      <main className="app-main">{children}</main>
      <BottomTab />
    </div>
  );
}
