import { createClient } from "@supabase/supabase-js";

const isTest = process.env.NODE_ENV === "test";
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || (isTest ? "http://localhost:54321" : "");
const supabasePublishableKey = process.env.REACT_APP_SUPABASE_PUBLISHABLE_KEY || (isTest ? "test-publishable-key" : "");

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error("Supabase 브라우저 환경변수가 설정되지 않았습니다.");
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true },
});

export function toAppUser(authUser) {
  if (!authUser) return null;
  return {
    id: authUser.id,
    email: authUser.email || "",
    name: authUser.user_metadata?.display_name || authUser.email?.split("@")[0] || "지금리뷰 사용자",
  };
}
