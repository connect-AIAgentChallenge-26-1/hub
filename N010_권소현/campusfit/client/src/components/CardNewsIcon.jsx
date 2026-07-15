const ICONS = {
  cap: (
    <>
      <path d="M2 9 12 4l10 5-10 5L2 9Z" />
      <path d="M6 11v4c0 1.7 2.7 3 6 3s6-1.3 6-3v-4" />
      <path d="M20 9v5" />
    </>
  ),
  idea: (
    <>
      <path d="M9 18h6" />
      <path d="M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.5 10.9c.5.4.8 1 .8 1.6V16h5.4v-.5c0-.6.3-1.2.8-1.6A6 6 0 0 0 12 3Z" />
    </>
  ),
  code: (
    <>
      <path d="m8 7-5 5 5 5" />
      <path d="m16 7 5 5-5 5" />
    </>
  ),
  chart: (
    <>
      <path d="M4 20V10" />
      <path d="M10 20V4" />
      <path d="M16 20v-7" />
      <path d="M2 20h20" />
    </>
  ),
  gear: <path d="M14.5 6.5a3.5 3.5 0 0 0-4.6 4.6L4 17l3 3 5.9-5.9a3.5 3.5 0 0 0 4.6-4.6l-2.5 2.5-2-2 2.5-2.5Z" />,
  palette: (
    <>
      <path d="M12 21a9 9 0 1 1 9-9c0 2-1.3 3-3 3h-1.5a1.5 1.5 0 0 0-1 2.6c.3.3.5.7.5 1.2 0 1-1 1.9-2 1.9-.7 0-1.4-.3-2-.7" />
      <circle cx="7.5" cy="10.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="11" cy="7" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="8.5" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  megaphone: (
    <>
      <path d="M3 10v4h3l8 4V6l-8 4H3Z" />
      <path d="M18 9a4 4 0 0 1 0 6" />
    </>
  ),
  rocket: (
    <>
      <path d="M12 2c3 2.5 5 6.5 5 10.5 0 2-1 4-2 5l-1-3-2 2-2-2-1 3c-1-1-2-3-2-5C7 8.5 9 4.5 12 2Z" />
      <circle cx="12" cy="10.5" r="1.3" fill="currentColor" stroke="none" />
      <path d="M9 19c-1 .5-2 1.5-2 3 1.5 0 2.5-1 3-2" />
      <path d="M15 19c1 .5 2 1.5 2 3-1.5 0-2.5-1-3-2" />
    </>
  ),
  heart: <path d="M12 21s-7-4.4-9.5-8.6C.8 9 2.3 5 6.2 5c2 0 3.5 1.3 4 2.6C10.7 6.3 12.2 5 14.2 5c3.9 0 5.4 4 3.7 7.4C19.4 16.6 12 21 12 21Z" />,
  house: (
    <>
      <path d="M4 11 12 4l8 7" />
      <path d="M6 10v10h12V10" />
      <path d="M10 20v-5h4v5" />
    </>
  ),
  bus: (
    <>
      <rect x="4" y="5" width="16" height="11" rx="2" />
      <path d="M4 11h16" />
      <circle cx="8" cy="18.5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="16" cy="18.5" r="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  briefcase: (
    <>
      <rect x="3" y="8" width="18" height="11" rx="2" />
      <path d="M9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
      <path d="M3 13h18" />
    </>
  ),
  star: <path d="m12 3 2.6 5.9 6.4.6-4.8 4.3 1.4 6.3L12 17l-5.6 3.1 1.4-6.3-4.8-4.3 6.4-.6L12 3Z" />,
  coin: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5v9" />
      <path d="M9.8 9.8c0-1.1 1-2 2.2-2s2.2.8 2.2 1.8c0 2.4-4.4 1.4-4.4 3.8 0 1 1 1.8 2.2 1.8s2.2-.9 2.2-2" />
    </>
  ),
  pulse: <path d="M3 12h4l2-5 3 10 2-7 2 2h5" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.5 2.5 2.5 15.5 0 18" />
      <path d="M12 3c-2.5 2.5-2.5 15.5 0 18" />
    </>
  ),
  vote: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3" />
      <path d="m8 12.5 2.5 2.5L16 9" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m15 9-2 6-6 2 2-6 6-2Z" />
    </>
  ),
  factory: (
    <>
      <path d="M3 20V11l4 3v-3l4 3V8l6 4v8Z" />
      <path d="M17 12V8h2v4" />
    </>
  ),
  trend: (
    <>
      <path d="M3 17 9 11l4 4 8-8" />
      <path d="M17 7h4v4" />
    </>
  ),
  columns: (
    <>
      <path d="M4 21h16" />
      <path d="M5 21V10l7-6 7 6v11" />
      <path d="M9 21v-7h6v7" />
    </>
  ),
};

// 관심분야(카테고리별 관심분야 필터와 동일한 값) → 아이콘. 관심분야가 없는 장학금만 카테고리로 대체한다.
const INTEREST_ICON = {
  기획: "idea",
  개발: "code",
  "데이터/AI": "chart",
  "이공계/공학": "gear",
  "이공계/기술": "gear",
  디자인: "palette",
  마케팅: "megaphone",
  창업: "rocket",
  사회공헌: "heart",
  주거: "house",
  교통: "bus",
  취업: "briefcase",
  문화: "star",
  금융: "coin",
  복지: "pulse",
  교육: "compass",
  봉사: "heart",
  "홍보/서포터즈": "megaphone",
  국제교류: "globe",
  정책참여: "vote",
  "탐방/체험": "compass",
  "엔지니어링/제조": "factory",
  "경영/기획": "trend",
  "공공/행정": "columns",
};

export function resolveCardNewsIcon(categoryId, interest) {
  if (interest && INTEREST_ICON[interest]) return INTEREST_ICON[interest];
  if (categoryId === "scholarship") return "cap";
  return "columns";
}

export default function CardNewsIcon({ iconKey, ...props }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {ICONS[iconKey] || ICONS.columns}
    </svg>
  );
}
