import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";

export default function RootPage() {
  // 인증 여부에 따라 진입점 분기 (screen-spec S0)
  const userId = getUserId();
  redirect(userId ? "/home" : "/login");
}
