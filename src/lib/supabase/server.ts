import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const getSupabaseConfig = () => {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL과 NEXT_PUBLIC_SUPABASE_ANON_KEY(또는 PUBLISHABLE_KEY)를 설정해 주세요.',
    );
  }

  return { supabaseUrl, supabaseKey };
};

/**
 * Next.js 14 Server Component, Server Action, Route Handler에서 사용합니다.
 * Server Component에서는 쿠키 쓰기가 제한되므로 setAll 실패를 안전하게 무시하고,
 * 세션 갱신은 Server Action/Route Handler 또는 middleware에서 수행합니다.
 */
export const createClient = () => {
  const cookieStore = cookies();
  const config = getSupabaseConfig();

  return createServerClient(config.supabaseUrl, config.supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Component 렌더링 중에는 쿠키를 쓸 수 없습니다.
        }
      },
    },
  });
};
