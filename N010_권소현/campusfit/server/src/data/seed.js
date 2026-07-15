// 더미 시드 데이터 — prototype.html 화면에 나온 예시 그대로. 2주차에 실제 DB로 교체.

export const categories = [
  { id: "scholarship", label: "장학금", desc: "국가·교내 장학금 모아보기" },
  { id: "contest", label: "공모전", desc: "팀 단위 공모전, 팀원모집까지" },
  { id: "local-benefit", label: "지자체 혜택", desc: "거주·소속 지역 혜택 확인" },
  { id: "activity", label: "대외활동", desc: "서포터즈·홍보대사 모집 정보" },
  { id: "internship", label: "인턴십", desc: "공공·민간 인턴십 채용 공고" },
];

export const listings = [
  {
    id: "l1",
    categoryId: "contest",
    title: "청년 아이디어 공모전",
    subtitle: "팀 단위 지원 · 3인 이내",
    dDay: 3,
    teamBoardCount: 2,
  },
  {
    id: "l2",
    categoryId: "contest",
    title: "교내 캡스톤 경진대회",
    subtitle: "개인 지원 가능",
    dDay: 14,
    teamBoardCount: 0,
  },
  {
    id: "l3",
    categoryId: "contest",
    title: "지역 해커톤",
    subtitle: "팀 단위 지원",
    dDay: 21,
    teamBoardCount: 1,
  },
];

export const boardPosts = [
  {
    id: "p1",
    listingId: "l1",
    title: "디자이너 1명 구해요",
    meta: "기획·개발 2명 확정 · UI/UX 담당자 모집",
    dDay: 3,
    body: "기획·개발 각 1명 확정됐고, UI/UX 디자인 맡아주실 분 찾습니다. Figma 다룰 줄 아시면 좋아요. 주 2회 온라인 미팅, 마감까지 같이 갑니다.",
    comments: [
      { who: "공모전러버", text: "저 포트폴리오 있어요! 지원할게요" },
      { who: "디자이너지망생", text: "주제 방향 조금만 더 알 수 있을까요?" },
      { who: "글쓴이", text: "위 댓글에 답장 남겼어요, 확인해주세요!" },
    ],
  },
  {
    id: "p2",
    listingId: "l1",
    title: "기획 같이 하실 분",
    meta: "1인 팀 · 아이디어부터 같이 짤 팀원 구함",
    dDay: 6,
    body: "아직 주제도 확정 안 된 1인 팀입니다. 같이 아이디어부터 짤 분 구해요.",
    comments: [],
  },
];
