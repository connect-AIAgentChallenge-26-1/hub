import { supabase } from '../lib/supabaseClient.js'

// CLIENT_ORIGIN을 재사용 — 카카오톡 등 메신저 크롤러가 붙는 배포 도메인과
// 실제 사람이 이동할 SPA 도메인이 로컬/운영에서 항상 같으므로 별도 env를 두지 않는다.
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? 'https://letterandco.vercel.app'
const OG_IMAGE_URL = `${CLIENT_ORIGIN}/og-image.png`
const DEFAULT_TITLE = '모임에 초대되셨어요'

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

// GET /share/:token — 카카오톡·슬랙 등 메신저 크롤러용 정적 미리보기 HTML.
// { data, error } JSON 컨벤션의 예외: 이 라우트는 API가 아니라 og 태그가 채워진
// HTML을 직접 반환해 크롤러가 그룹명이 반영된 미리보기 카드를 만들도록 한다.
// 사람이 열면 즉시 실제 초대장 화면(/scr0/join)으로 리다이렉트된다.
export async function shareRedirect(req, res) {
  const token = req.params.token

  const { data: letter } = await supabase
    .from('letters')
    .select('title')
    .eq('link_token', token)
    .single()

  const title = letter?.title ? `${letter.title} 모임에 초대되셨어요` : DEFAULT_TITLE
  const escapedTitle = escapeHtml(title)
  const escapedToken = escapeHtml(token)
  const joinUrl = `${CLIENT_ORIGIN}/scr0/join?token=${escapedToken}`

  res.type('html').send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${escapedTitle}" />
  <meta property="og:description" content="Letter&amp;Co에서 함께할 일정을 확인해보세요" />
  <meta property="og:image" content="${OG_IMAGE_URL}" />
  <meta property="og:url" content="https://letterandco.onrender.com/share/${escapedToken}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta http-equiv="refresh" content="0; url=${joinUrl}" />
</head>
<body>
  <p>잠시만 기다려주세요, 초대장으로 이동 중입니다...</p>
  <script>window.location.replace("${joinUrl}");</script>
</body>
</html>`)
}
