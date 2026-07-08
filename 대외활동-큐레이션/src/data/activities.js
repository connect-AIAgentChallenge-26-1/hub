// 대외활동 데이터 스키마 + 샘플 데이터
//
// eligibility(자격요건)는 "이 조건들을 모두 만족해야 지원 가능"을 뜻한다.
// 빈 배열([]) 또는 null 은 "무관(누구나 가능)"으로 해석한다.
//
// @typedef Activity
// @property {string} id
// @property {string} title      공고명
// @property {string} org        주최
// @property {'대외활동'|'공모전'|'장학'|'봉사'} category
// @property {'activity'|'scholarship'} track  자격 성격에 따른 트랙
// @property {string} source     수집 출처
// @property {string} url
// @property {string} deadline   마감일 (YYYY-MM-DD)
// @property {object} eligibility
// @property {number[]} eligibility.grades       허용 학년, [] = 무관
// @property {string[]} eligibility.majors       허용 전공계열, [] = 무관
// @property {string[]} eligibility.regions      허용 지역, [] = 무관
// @property {string[]} eligibility.enrollment   허용 재학상태, [] = 무관
// @property {number|null} eligibility.incomeMax 소득분위 상한(이하), null = 무관
// @property {number|null} eligibility.gpaMin    최소 학점(이상), null = 무관

export const MAJORS = ["공학", "자연", "인문", "사회", "예체능"];
export const REGIONS = ["수도권", "부산", "대구", "광주", "대전"];
export const ENROLLMENTS = ["재학", "휴학", "졸업예정"];

const base = { grades: [], majors: [], regions: [], enrollment: [], incomeMax: null, gpaMin: null };

/** @type {Activity[]} */
export const ACTIVITIES = [
  {
    id: "a1",
    title: "대학생 IT 서포터즈 12기",
    org: "OO소프트",
    category: "대외활동",
    track: "activity",
    source: "링커리어",
    url: "https://example.com/a1",
    deadline: "2026-07-20",
    eligibility: { ...base, majors: ["공학"], enrollment: ["재학"] },
  },
  {
    id: "a2",
    title: "청년 창업 아이디어 공모전",
    org: "△△진흥원",
    category: "공모전",
    track: "activity",
    source: "위비티",
    url: "https://example.com/a2",
    deadline: "2026-08-05",
    eligibility: { ...base },
  },
  {
    id: "a3",
    title: "저소득층 대학생 장학금",
    org: "◇◇장학재단",
    category: "장학",
    track: "scholarship",
    source: "장학재단",
    url: "https://example.com/a3",
    deadline: "2026-07-15",
    eligibility: { ...base, enrollment: ["재학"], incomeMax: 4 },
  },
  {
    id: "a4",
    title: "수도권 지역아동센터 교육봉사",
    org: "지역아동센터",
    category: "봉사",
    track: "activity",
    source: "1365",
    url: "https://example.com/a4",
    deadline: "2026-07-31",
    eligibility: { ...base, regions: ["수도권"] },
  },
  {
    id: "a5",
    title: "고학년 전공심화 학회 지원사업",
    org: "□□대학교",
    category: "대외활동",
    track: "activity",
    source: "대학공지",
    url: "https://example.com/a5",
    deadline: "2026-07-25",
    eligibility: { ...base, grades: [3, 4], majors: ["공학", "자연"], enrollment: ["재학"] },
  },
  {
    id: "a6",
    title: "부산 청년 문화기획단",
    org: "부산광역시",
    category: "대외활동",
    track: "activity",
    source: "지자체",
    url: "https://example.com/a6",
    deadline: "2026-08-10",
    eligibility: { ...base, regions: ["부산"] },
  },
  {
    id: "a7",
    title: "이공계 국가우수장학금",
    org: "한국장학재단",
    category: "장학",
    track: "scholarship",
    source: "장학재단",
    url: "https://example.com/a7",
    deadline: "2026-07-18",
    eligibility: { ...base, grades: [1, 2], majors: ["공학", "자연"], incomeMax: 8, gpaMin: 3.5 },
  },
  {
    id: "a8",
    title: "성적우수 재학생 장학금",
    org: "◎◎재단",
    category: "장학",
    track: "scholarship",
    source: "장학재단",
    url: "https://example.com/a8",
    deadline: "2026-08-01",
    eligibility: { ...base, enrollment: ["재학"], gpaMin: 4.0 },
  },
];
