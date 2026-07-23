import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { 
  Bot, User, Send, Upload, RefreshCw, CheckCircle2, AlertTriangle, 
  X, HelpCircle, PlusCircle, Check, Info, FileText, ArrowLeft, Loader2,
  Calendar, History, Plus, Search, BookOpen
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// Predefined Course Catalog Database (Real-world University 2026-2 Curriculum)
const COURSE_CATALOG = {
  // --- 컴퓨터공학과 전공 ---
  'data-struct': {
    id: 'data-struct',
    title: '자료구조 및 실습',
    category: 'major-req',
    categoryName: '컴공전공필수',
    prof: '김철수 교수',
    room: '공학4호관 301호',
    credits: 3,
    eval: '자료구조 설계 능력을 키우는 과목. 과제 3개가 존재하지만 교수님이 친절하십니다.',
    slots: [
      { day: 1, start: 13, end: 15 },
      { day: 3, start: 13, end: 14 }
    ]
  },
  'db': {
    id: 'db',
    title: '데이터베이스 시스템',
    category: 'major-req',
    categoryName: '컴공전공필수',
    prof: '박영희 교수',
    room: '공학4호관 405호',
    credits: 3,
    eval: 'SQL 실습 및 DB 정규화 개념을 배움. 기말 프로젝트로 웹 서비스 구축이 포함됩니다.',
    slots: [
      { day: 2, start: 14, end: 16 },
      { day: 4, start: 14, end: 15 }
    ]
  },
  'comp-arch': {
    id: 'comp-arch',
    title: '컴퓨터 구조',
    category: 'major-req',
    categoryName: '컴공전공필수',
    prof: '최성훈 교수',
    room: '공학4호관 201호',
    credits: 3,
    eval: '파이프라이닝, 캐시 메모리 구조 및 CPU 명령어 집합 구조(ISA) 심화 학습.',
    slots: [
      { day: 1, start: 9, end: 10 },
      { day: 3, start: 9, end: 11 }
    ]
  },
  'algorithm': {
    id: 'algorithm',
    title: '알고리즘 및 실습',
    category: 'major-req',
    categoryName: '컴공전공필수',
    prof: '홍길동 교수',
    room: '공학4호관 402호',
    credits: 3,
    eval: '시간 복잡도, 탐욕법, 동적 계획법 기초 습득. 코딩 연습 플랫폼 매주 실습.',
    slots: [
      { day: 2, start: 9, end: 10 },
      { day: 4, start: 9, end: 11 }
    ]
  },
  'os': {
    id: 'os',
    title: '운영체제 시스템',
    category: 'major-req',
    categoryName: '컴공전공필수',
    prof: '백지훈 교수',
    room: '공학4호관 203호',
    credits: 3,
    eval: '프로세스 관리, 세마포어, 메모리 가상화 학습. 난이도는 높지만 면접 필수 강의.',
    slots: [
      { day: 3, start: 14, end: 16 },
      { day: 5, start: 14, end: 15 }
    ]
  },
  'compiler': {
    id: 'compiler',
    title: '컴파일러 개론',
    category: 'major-req',
    categoryName: '컴공전공필수',
    prof: '조민석 교수',
    room: '공학4호관 302호',
    credits: 3,
    eval: '어휘 분석, 파싱, 구문 해석기(Parser) 제작 및 중간 코드 생성 실무.',
    slots: [
      { day: 1, start: 16, end: 18 },
      { day: 3, start: 16, end: 17 }
    ]
  },
  'network': {
    id: 'network',
    title: '컴퓨터네트워크',
    category: 'major-opt',
    categoryName: '컴공전공선택',
    prof: '이민수 교수',
    room: '공학4호관 102호',
    credits: 3,
    eval: 'TCP/IP 프로토콜 분석 실습 위주. 이론은 다소 어려우나 시험 족보 제공.',
    slots: [
      { day: 1, start: 10, end: 12 },
      { day: 3, start: 11, end: 12 }
    ]
  },
  'software-eng': {
    id: 'software-eng',
    title: '소프트웨어공학',
    category: 'major-opt',
    categoryName: '컴공전공선택',
    prof: '정혜원 교수',
    room: '공학4호관 303호',
    credits: 3,
    eval: '애자일 방법론과 디자인 패턴 적용 실무. 조별 과제 발표 비중이 높음.',
    slots: [
      { day: 2, start: 10, end: 12 },
      { day: 4, start: 11, end: 12 }
    ]
  },
  'ai-intro': {
    id: 'ai-intro',
    title: '인공지능 개론 및 실습',
    category: 'major-opt',
    categoryName: '컴공전공선택',
    prof: '강현우 교수',
    room: '공학4호관 501호',
    credits: 3,
    eval: '머신러닝 기초 알고리즘부터 PyTorch 딥러닝 실습까지 다루는 인기 전공 과목.',
    slots: [
      { day: 1, start: 15, end: 17 },
      { day: 3, start: 15, end: 16 }
    ]
  },
  'machine-learning': {
    id: 'machine-learning',
    title: '머신러닝 실무',
    category: 'major-opt',
    categoryName: '컴공전공선택',
    prof: '한상우 교수',
    room: '공학4호관 502호',
    credits: 3,
    eval: '회귀 분석, 분류 모델, Scikit-learn 모델 튜닝 및 데이터 바인딩 실습.',
    slots: [
      { day: 2, start: 15, end: 17 },
      { day: 4, start: 15, end: 16 }
    ]
  },
  'cloud-comp': {
    id: 'cloud-comp',
    title: '클라우드 컴퓨팅',
    category: 'major-opt',
    categoryName: '컴공전공선택',
    prof: '오승민 교수',
    room: '공학4호관 205호',
    credits: 3,
    eval: 'AWS, Docker, Kubernetes 데브옵스 인프라 구축 및 가상화 실무.',
    slots: [
      { day: 5, start: 15, end: 18 }
    ]
  },
  'security': {
    id: 'security',
    title: '정보보안 개론',
    category: 'major-req',
    categoryName: '컴공전공필수',
    prof: '김철수 교수',
    room: '공학4호관 402호',
    credits: 3,
    eval: '암호학 기초 및 네트워크 보안 실무. 전년 대비 난이도가 쉬워 평점 양호.',
    slots: [
      { day: 4, start: 15, end: 17 }
    ]
  },

  // --- 경영정보학과 전공 ---
  'intro-mis': {
    id: 'intro-mis',
    title: '경영정보시스템(MIS)',
    category: 'major-req',
    categoryName: '경영정보전필',
    prof: '서지현 교수',
    room: '경영관 101호',
    credits: 3,
    eval: '기업 경영에서 정보기술(IT) 인프라의 가치와 비즈니스 모델 활용 방안 개론.',
    slots: [
      { day: 1, start: 10, end: 12 },
      { day: 3, start: 11, end: 12 }
    ]
  },
  'bus-processing': {
    id: 'bus-processing',
    title: '비즈니스프로세스관리(BPM)',
    category: 'major-opt',
    categoryName: '경영정보전선',
    prof: '박성진 교수',
    room: '경영관 202호',
    credits: 3,
    eval: '기업 업무 프로세스의 가시화, 분석, 모델링 기법 실습 위주 강의.',
    slots: [
      { day: 4, start: 16, end: 18 }
    ]
  },
  'marketing': {
    id: 'marketing',
    title: '마케팅 원론',
    category: 'major-req',
    categoryName: '경영정보전필',
    prof: '이지은 교수',
    room: '경영관 301호',
    credits: 3,
    eval: 'STP 및 마케팅 믹스 4P 전략. 마케팅 기획서 작성 실습 발표.',
    slots: [
      { day: 3, start: 15, end: 17 }
    ]
  },
  'accounting': {
    id: 'accounting',
    title: '회계원리',
    category: 'major-req',
    categoryName: '경영정보전필',
    prof: '김지훈 교수',
    room: '경영관 104호',
    credits: 3,
    eval: '복식 부기, 대차대조표 및 손익계산서 작성법 기초 회계 지식 습득.',
    slots: [
      { day: 2, start: 10, end: 12 }
    ]
  },
  'sys-analysis': {
    id: 'sys-analysis',
    title: '시스템 분석 및 설계',
    category: 'major-opt',
    categoryName: '경영정보전선',
    prof: '윤상현 교수',
    room: '경영관 205호',
    credits: 3,
    eval: 'UML 설계를 기반으로 비즈니스 정보시스템 설계 명세서 제작 프로젝트.',
    slots: [
      { day: 5, start: 13, end: 15 }
    ]
  },

  // --- 통계학과 전공 ---
  'intro-stats': {
    id: 'intro-stats',
    title: '통계학개론',
    category: 'major-req',
    categoryName: '통계전공필수',
    prof: '송명호 교수',
    room: '자연과학관 104호',
    credits: 3,
    eval: '가설 검정, 확률 분포, 기술 통계학 등 기초 통계 분석 입문.',
    slots: [
      { day: 2, start: 13, end: 15 }
    ]
  },
  'probability': {
    id: 'probability',
    title: '확률론',
    category: 'major-req',
    categoryName: '통계전공필수',
    prof: '권태우 교수',
    room: '자연과학관 201호',
    credits: 3,
    eval: '조건부 확률, 베이즈 정리, 확률 변수 및 분포 함수 이론적 탐색.',
    slots: [
      { day: 1, start: 13, end: 15 }
    ]
  },
  'regression': {
    id: 'regression',
    title: '회귀분석 및 실습',
    category: 'major-opt',
    categoryName: '통계전공선택',
    prof: '김경상 교수',
    room: '자연과학관 301호',
    credits: 3,
    eval: 'R 언어를 활용한 선형 회귀 모형 추정, 잔차 분석 및 다중공선성 검정.',
    slots: [
      { day: 3, start: 13, end: 15 }
    ]
  },
  'math-stats': {
    id: 'math-stats',
    title: '수리통계학',
    category: 'major-req',
    categoryName: '통계전공필수',
    prof: '최은정 교수',
    room: '자연과학관 203호',
    credits: 3,
    eval: '추정과 검정의 수리적 유도, 최대우도추정량(MLE) 및 통계량 성질 연구.',
    slots: [
      { day: 4, start: 13, end: 15 }
    ]
  },
  'time-series': {
    id: 'time-series',
    title: '시계열분석',
    category: 'major-opt',
    categoryName: '통계전공선택',
    prof: '이민수 교수',
    room: '자연과학관 304호',
    credits: 3,
    eval: 'ARIMA 모형, 지수평활법 등 시계열 데이터 분석 및 예측 실습.',
    slots: [
      { day: 5, start: 9, end: 12 }
    ]
  },

  // --- 융합교양 영역별 교과목 ---
  'oriental-phil-converge': {
    id: 'oriental-phil-converge',
    title: '동양 사상과 현대사회',
    category: 'converge-edu',
    categoryName: '융합교양 (1영역)',
    prof: '하늘 교수',
    room: '교양학관 101호',
    credits: 3,
    eval: '역사와 사상 융합교양 1영역 이수 인정. 인문학 성찰 글쓰기 대체.',
    slots: [
      { day: 3, start: 10, end: 12 }
    ]
  },
  'universe-life': {
    id: 'universe-life',
    title: '우주와 지구환경',
    category: 'converge-edu',
    categoryName: '융합교양 (2영역)',
    prof: '윤아름 교수',
    room: '자연과학관 102호',
    credits: 3,
    eval: '우주와 생명 융합교양 2영역 이수 인정. 지구 온난화 및 우주 환경 학습.',
    slots: [
      { day: 4, start: 15, end: 17 }
    ]
  },
  'tech-society': {
    id: 'tech-society',
    title: '기술과 현대사회',
    category: 'converge-edu',
    categoryName: '융합교양 (3영역)',
    prof: '최은정 교수',
    room: '교양학관 201호',
    credits: 3,
    eval: '기술과 사회 융합교양 3영역 이수 인정. 에세이 제출 대체.',
    slots: [
      { day: 5, start: 10, end: 12 }
    ]
  },
  'culture-art-converge': {
    id: 'culture-art-converge',
    title: '현대 사회와 미디어 아트',
    category: 'converge-edu',
    categoryName: '융합교양 (4영역)',
    prof: '장기하 교수',
    room: '예술관 102호',
    credits: 3,
    eval: '문화와 예술 융합교양 4영역 이수 인정. 미디어 아트 실습 감상.',
    slots: [
      { day: 1, start: 15, end: 17 }
    ]
  },

  // --- 균형교양 및 기초교양 ---
  'art-life': {
    id: 'art-life',
    title: '예술과 현대생활',
    category: 'balance-edu',
    categoryName: '균형교양 (4영역)',
    prof: '홍길동 교수',
    room: '미술관 310호',
    credits: 3,
    eval: '미술사 및 생활 디자인 접목 교양. 미술관 관람기 제출.',
    slots: [
      { day: 1, start: 15, end: 17 }
    ]
  },
  'college-eng': {
    id: 'college-eng',
    title: '대학영어',
    category: 'general',
    categoryName: '기초교양',
    prof: 'Smith 교수',
    room: '교양학관 301호',
    credits: 3,
    eval: '글로벌 회화 및 원어민 프리젠테이션 실무 실습.',
    slots: [
      { day: 2, start: 13, end: 15 }
    ]
  },
  'dream-future': {
    id: 'dream-future',
    title: '꿈·미래개척',
    category: 'general',
    categoryName: '기초교양 (0.5학점)',
    prof: '학과지도 교수',
    room: '온라인 강의실',
    credits: 0.5,
    eval: '학과 지도교수 1:1 진로 상담 이수 과목.',
    slots: [
      { day: 5, start: 17, end: 18 }
    ]
  }
};

// Student Profile Settings Templates
const STUDENT_PROFILE_TEMPLATES = {
  '2025080081': {
    name: '김민성',
    badge: '편입생',
    major: '경영정보학과 | 4학년',
    credits: {
      total: 124.5,
      totalGoal: 130,
      majorReq: 15,
      majorReqGoal: 18,
      majorOpt: 57,
      majorOptGoal: 60,
      coreEdu: 9,
      coreEduGoal: 9,
      balanceEdu: 12,
      balanceEduGoal: 12,
      convergeEdu: 18,
      convergeEduGoal: 18
    },
    initialCourses: ['db', 'management-bigdata'],
    warningText: '졸업학점 부족(2.5)',
    diagnosticBrief: '김민성님, 현재 총 취득학점은 124.5학점이며 졸업 요건(130학점) 충족을 위해 2.5학점 취득 및 졸업평가 통과가 필요합니다.',
    diagnosticBullets: [
      { type: 'red', text: '졸업학점 부족(2.5)' },
      { type: 'red', text: '졸업평가 불합격(경영정보학과)' },
      { type: 'yellow', text: '교양합계로만 체크(40)' },
      { type: 'yellow', text: '마이크로디그리 대상자' },
      { type: 'yellow', text: '트랙제 대상자' }
    ],
    welcomeMsg: '안녕하세요 김민성님! 경영정보학과 편입생 AI 네비게이터입니다. 현재 졸업을 위해 2.5학점 이수와 졸업평가 응시가 필요합니다. 수강 및 졸업 전략 추천을 시작할까요?',
    chips: [
      { label: '졸업 예시 시간표 보기', id: 'auto-schedule' },
      { label: '전공선택 3학점 추천 과목 보기', id: 'major-req-list' },
      { label: '교양 영역 이수 상태 확인', id: 'converge-list' }
    ]
  },
  'transfer': {
    name: '김경상',
    badge: '편입생',
    major: '컴퓨터공학과 | 3학년',
    credits: {
      total: 84,
      totalGoal: 130,
      majorReq: 12,
      majorReqGoal: 24,
      majorOpt: 30,
      majorOptGoal: 36,
      coreEdu: 9,
      coreEduGoal: 9,
      balanceEdu: 12,
      balanceEduGoal: 12,
      convergeEdu: 3,
      convergeEduGoal: 6
    },
    initialCourses: ['data-struct', 'db', 'network', 'software-eng'],
    warningText: '융합교양 1영역 3학점 미이수',
    diagnosticBrief: '김경상님, 졸업 요건을 충족하기 위해 이번 학기에 컴퓨터공학과 전공필수(자료구조, 데이터베이스 등) 및 융합교양 1영역 이수가 필요합니다.',
    diagnosticBullets: [
      { type: 'red', text: '융합교양 1영역 누락 (3학점)' },
      { type: 'yellow', text: '전공 필수 이수 요건 미달 (잔여 12학점 필요)' }
    ],
    welcomeMsg: '안녕하세요 김경상님! 컴퓨터공학과 편입생 AI 네비게이터입니다. 현재 졸업을 위해 잔여 전공필수 12학점과 융합교양 1영역 미이수 요건이 확인됩니다. 무엇을 도와드릴까요?',
    chips: [
      { label: '융합교양 1영역 추천 과목 보기', id: 'converge-list' },
      { label: '전공필수 미이수 과목 자동배정', id: 'auto-schedule' },
      { label: '컴공 전필 과목 추천해줘', id: 'major-req-list' }
    ]
  },
  'general': {
    name: '박경상',
    badge: '재학생',
    major: '경영정보학과 | 3학년',
    credits: {
      total: 96,
      totalGoal: 130,
      majorReq: 18,
      majorReqGoal: 24,
      majorOpt: 24,
      majorOptGoal: 36,
      coreEdu: 9,
      coreEduGoal: 9,
      balanceEdu: 9,
      balanceEduGoal: 12,
      convergeEdu: 6,
      convergeEduGoal: 6
    },
    initialCourses: ['intro-mis', 'bus-processing', 'marketing'],
    warningText: '융합교양 2영역 3학점 미이수',
    diagnosticBrief: '박경상님, 경영정보학과 졸업 요건 충족을 위해 전공필수 경영정보시스템(MIS) 및 융합교양 2영역 이수가 반드시 필요합니다.',
    diagnosticBullets: [
      { type: 'red', text: '융합교양 2영역 누락 (3학점)' },
      { type: 'yellow', text: '경영정보전공 필수 누락 (잔여 6학점 필요)' }
    ],
    welcomeMsg: '안녕하세요 박경상님! 경영정보학과 재학생 AI 네비게이터입니다. 현재 3학년 2학기 진입 기준, 경영정보시스템(MIS)과 융합교양 2영역 이수가 필요합니다. 원하시는 추천 방향을 말씀해주세요.',
    chips: [
      { label: '융합교양 2영역 추천 과목 보기', id: 'balance-list' },
      { label: '경영정보전필 포함 18학점 시간표 짜줘', id: 'general-schedule' },
      { label: '경영정보학과 전필 미이수 과목 확인', id: 'general-major-req' }
    ]
  },
  'double-major': {
    name: '이경상',
    badge: '다전공자',
    major: '통계학과+컴퓨터공학 | 3학년',
    credits: {
      total: 78,
      totalGoal: 150,
      majorReq: 15,
      majorReqGoal: 30,
      majorOpt: 18,
      majorOptGoal: 30,
      coreEdu: 9,
      coreEduGoal: 9,
      balanceEdu: 12,
      balanceEduGoal: 12,
      convergeEdu: 3,
      convergeEduGoal: 6
    },
    initialCourses: ['intro-stats', 'probability', 'data-struct'],
    warningText: '통계전필 및 융합교양 4영역 미이수',
    diagnosticBrief: '이경상님, 통계학과 주전공 및 컴퓨터공학 다전공 졸업 요건을 충족하기 위해 통계전필 수리통계학(3학점)과 융합교양 4영역 이수가 필요합니다.',
    diagnosticBullets: [
      { type: 'red', text: '수리통계학 누락 (3학점)' },
      { type: 'yellow', text: '융합교양 4영역 누락 (3학점)' }
    ],
    welcomeMsg: '안녕하세요 이경상님! 통계학과 및 컴퓨터공학 다전공 AI 네비게이터입니다. 주전공(통계)과 다전공(컴공) 졸업 요건을 모두 충족시킬 수 있는 시뮬레이션을 도와드리겠습니다.',
    chips: [
      { label: '통계학과 전공필수 리스트 보여줘', id: 'double-major-list' },
      { label: '융합교양 4영역 + 통계전필 포함 18학점 설계해줘', id: 'double-schedule' }
    ]
  }
};

function TimetableGenerator({ user, initialStudentType }) {
  const navigate = useNavigate();
  const [studentType, setStudentType] = useState(() => {
    if (user && user.studentId === '2025080081') return '2025080081';
    return initialStudentType || 'transfer';
  });
  
  // Clone profile templates so we can mutate state locally
  const [profiles, setProfiles] = useState(() => JSON.parse(JSON.stringify(STUDENT_PROFILE_TEMPLATES)));
  const currentProfile = profiles[studentType] || profiles['transfer'];

  const studentName = user ? user.name : currentProfile.name;
  const studentMajor = user && user.studentId === '2025080081' ? '경영정보학과 | 4학년' : user && user.department ? `${user.department} | 3학년` : currentProfile.major;

  const getDynamicText = (text) => {
    if (!text) return '';
    return text
      .replace(/김경상/g, studentName)
      .replace(/박경상/g, studentName)
      .replace(/이경상/g, studentName);
  };

  const [activeCourses, setActiveCourses] = useState([]);
  
  // Multi-Timetable Drafts & History State
  const [savedTimetables, setSavedTimetables] = useState(() => {
    const cached = localStorage.getItem('gnu_saved_timetables_list');
    if (cached) {
      try { return JSON.parse(cached); } catch (e) {}
    }
    return [
      { id: 'draft-1', name: '시간표 1 (컴퓨터공학 전필 중심안)', semester: '2026-2학기', courses: ['data-struct', 'db', 'network', 'software-eng', 'tech-society'] },
      { id: 'draft-2', name: '시간표 2 (경영정보학 전필 중심안)', semester: '2026-2학기', courses: ['intro-mis', 'marketing', 'accounting', 'oriental-phil-converge'] },
      { id: 'draft-3', name: '시간표 3 (통계학 전필 중심안)', semester: '2026-2학기', courses: ['intro-stats', 'probability', 'regression', 'universe-life'] },
      { id: 'past-2026-1', name: '과거 시간표 (2026-1학기 이수)', semester: '2026-1학기', isPast: true, courses: ['comp-arch', 'college-eng'] }
    ];
  });
  const [activeTimetableId, setActiveTimetableId] = useState('draft-1');
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogCategory, setCatalogCategory] = useState('all');

  // Remove course from active timetable
  const handleRemoveCourse = (courseId) => {
    setActiveCourses(prev => prev.filter(c => c.id !== courseId));
    const course = COURSE_CATALOG[courseId];
    if (course) {
      addMessage('bot', `🗑️ <strong>${course.title}</strong> 과목을 수강 목록에서 제외했습니다.`);
    }
  };

  // Save timetables list to localStorage when changed
  useEffect(() => {
    try {
      localStorage.setItem('gnu_saved_timetables_list', JSON.stringify(savedTimetables));
    } catch (e) {}
  }, [savedTimetables]);

  // Handler to switch active timetable draft / past history
  const handleSelectTimetable = (targetId) => {
    setSavedTimetables(prev => prev.map(t => {
      if (t.id === activeTimetableId && !t.isPast) {
        return { ...t, courses: activeCourses.map(c => c.id) };
      }
      return t;
    }));

    setActiveTimetableId(targetId);

    const target = savedTimetables.find(t => t.id === targetId);
    if (target) {
      const loadedCourses = target.courses
        .map(id => COURSE_CATALOG[id])
        .filter(Boolean)
        .map(course => JSON.parse(JSON.stringify(course)));
      setActiveCourses(loadedCourses);
      setIsConfirmed(false);

      if (target.isPast) {
        addMessage('bot', `📂 <strong>[${target.name}]</strong> 이력을 불러왔습니다. (2026학년도 1학기에 이미 이수한 확정 성적 기록입니다.)`);
      } else {
        addMessage('bot', `📌 <strong>[${target.name}]</strong>(으)로 시간표 플랜을 변경했습니다.`);
      }
    }
  };

  // Handler to create a new timetable draft
  const handleAddTimetable = () => {
    const draftCount = savedTimetables.filter(t => !t.isPast).length + 1;
    const newId = `draft-${Date.now()}`;
    const newDraft = {
      id: newId,
      name: `시간표 ${draftCount} (새 수강플랜)`,
      semester: '2026-2학기',
      courses: ['data-struct', 'db']
    };

    setSavedTimetables(prev => [...prev, newDraft]);
    setActiveTimetableId(newId);

    const initialCourses = newDraft.courses
      .map(id => COURSE_CATALOG[id])
      .filter(Boolean)
      .map(course => JSON.parse(JSON.stringify(course)));
    setActiveCourses(initialCourses);
    setIsConfirmed(false);

    addMessage('bot', `✨ 새로운 시간표 **[${newDraft.name}]**이(가) 추가되었습니다. 자유롭게 수강 과목을 조합해 보세요!`);
  };
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState(null);
  
  const chatEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const [isOcrUploading, setIsOcrUploading] = useState(false);

  // Initialize profile data and chat when profile changes
  useEffect(() => {
    // Reset confirmation
    setIsConfirmed(false);

    // Load initial courses
    const initialCourseIds = currentProfile.initialCourses;
    const initialCoursesList = initialCourseIds
      .map(id => COURSE_CATALOG[id])
      .filter(Boolean)
      .map(course => JSON.parse(JSON.stringify(course)));
    setActiveCourses(initialCoursesList);

    // Reset and load Chat Messages from Backend / Supabase
    axios.get('http://localhost:5000/api/chat')
      .then(res => {
        if (res.data && res.data.success && res.data.messages && res.data.messages.length > 0) {
          const mapped = res.data.messages.map((m, index) => ({
            id: m.id || index,
            sender: m.role === 'user' ? 'user' : 'bot',
            text: m.content
          }));
          setChatMessages(mapped);
        } else {
          setChatMessages([
            { id: 1, sender: 'bot', text: currentProfile.welcomeMsg }
          ]);
        }
      })
      .catch(() => {
        setChatMessages([
          { id: 1, sender: 'bot', text: currentProfile.welcomeMsg }
        ]);
      });
  }, [studentType]);

  // Scroll to bottom of chat
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, isTyping]);

  // Helper to add a message to chat
  const addMessage = (sender, text, htmlContent = null) => {
    setChatMessages(prev => [
      ...prev,
      { id: Date.now(), sender, text, htmlContent }
    ]);
  };

  // Add course to timetable
  const handleAddCourse = (courseId) => {
    if (activeCourses.some(c => c.id === courseId)) {
      addMessage('bot', '이미 시간표에 등록된 과목입니다.');
      return;
    }

    const course = COURSE_CATALOG[courseId];
    if (course) {
      setActiveCourses(prev => [...prev, JSON.parse(JSON.stringify(course))]);
      addMessage('bot', `<strong>${course.title}</strong> 과목을 시간표에 성공적으로 등록했습니다!`);
    }
  };

  // Highlight blocks of the same course ID
  const [hoveredCourseId, setHoveredCourseId] = useState(null);

  // Trigger quick action chips
  const handleQuickChip = (promptId, label) => {
    addMessage('user', label);
    setIsTyping(true);

    setTimeout(() => {
      setIsTyping(false);

      if (studentType === 'transfer') {
        if (promptId === 'converge-list') {
          const html = (
            <div>
              <p>융합교양 1영역(역사와 사상) 추천 리스트입니다. 클릭 시 시간표에 등록됩니다:</p>
              <div className="msg-course-list">
                <div className="msg-course-card" onClick={() => handleAddCourse('oriental-phil-converge')}>
                  <div className="c-info">
                    <h5>동양 사상과 현대사회 (수 10-12)</h5>
                    <span>3학점 | 하늘 교수</span>
                  </div>
                  <PlusCircle size={18} />
                </div>
              </div>
            </div>
          );
          addMessage('bot', '', html);
        }
        else if (promptId === 'auto-schedule') {
          setActiveCourses(prev => {
            const filtered = prev.filter(c => c.id !== 'algorithm' && c.id !== 'os');
            return [
              ...filtered,
              JSON.parse(JSON.stringify(COURSE_CATALOG['algorithm'])),
              JSON.parse(JSON.stringify(COURSE_CATALOG['os']))
            ];
          });

          const html = (
            <div>
              <p>김경상님의 요구사항을 충족하는 <strong>컴공 전공필수 보충 수강 계획안</strong>을 자동 시뮬레이션했습니다.</p>
              <p><strong>추천 추가 과목:</strong></p>
              <p>1. <strong>알고리즘 및 실습</strong> (전필, 3학점) [화9-10, 목9-11]<br/>
                 2. <strong>운영체제 시스템</strong> (전필, 3학점) [수14-16, 금14-15]</p>
              <p>전공 필수 요건이 자동으로 추가되었습니다. 시간표를 확인해 보세요!</p>
            </div>
          );
          addMessage('bot', '', html);
        }
        else if (promptId === 'major-req-list') {
          const html = (
            <div>
              <p>미이수 컴퓨터공학 전공 필수 과목 리스트입니다. 수강할 과목을 클릭해 추가하세요:</p>
              <div className="msg-course-list">
                <div className="msg-course-card" onClick={() => handleAddCourse('algorithm')}>
                  <div className="c-info">
                    <h5>알고리즘 및 실습 (화9-10, 목9-11)</h5>
                    <span>3학점 | 홍길동 교수</span>
                  </div>
                  <PlusCircle size={18} />
                </div>
                <div className="msg-course-card" onClick={() => handleAddCourse('os')}>
                  <div className="c-info">
                    <h5>운영체제 시스템 (수14-16, 금14-15)</h5>
                    <span>3학점 | 백지훈 교수</span>
                  </div>
                  <PlusCircle size={18} />
                </div>
              </div>
            </div>
          );
          addMessage('bot', '', html);
        }
      }
      else if (studentType === 'general') {
        if (promptId === 'balance-list') {
          const html = (
            <div>
              <p>융합교양 2영역(우주와 생명) 추천 과목입니다:</p>
              <div className="msg-course-list">
                <div className="msg-course-card" onClick={() => handleAddCourse('universe-life')}>
                  <div className="c-info">
                    <h5>우주와 지구환경 (목 15-17)</h5>
                    <span>3학점 | 윤아름 교수</span>
                  </div>
                  <PlusCircle size={18} />
                </div>
              </div>
            </div>
          );
          addMessage('bot', '', html);
        }
        else if (promptId === 'general-schedule') {
          setActiveCourses(prev => {
            const filtered = prev.filter(c => c.id !== 'intro-mis' && c.id !== 'marketing' && c.id !== 'accounting');
            return [
              ...filtered,
              JSON.parse(JSON.stringify(COURSE_CATALOG['intro-mis'])),
              JSON.parse(JSON.stringify(COURSE_CATALOG['marketing'])),
              JSON.parse(JSON.stringify(COURSE_CATALOG['accounting']))
            ];
          });
          addMessage('bot', `경영정보전공 필수 과목인 '경영정보시스템(MIS)', '마케팅 원론', '회계원리'를 포함한 18학점 최적화 시간표 설계를 완성했습니다. 시간표를 확인해주세요!`);
        }
        else if (promptId === 'general-major-req') {
          const html = (
            <div>
              <p>미이수 경영정보전공 필수 교과목 목록입니다:</p>
              <div className="msg-course-list">
                <div className="msg-course-card" onClick={() => handleAddCourse('intro-mis')}>
                  <div className="c-info">
                    <h5>경영정보시스템(MIS) (월 10-12, 수 11-12)</h5>
                    <span>3학점 | 서지현 교수</span>
                  </div>
                  <PlusCircle size={18} />
                </div>
                <div className="msg-course-card" onClick={() => handleAddCourse('marketing')}>
                  <div className="c-info">
                    <h5>마케팅 원론 (수 15-17)</h5>
                    <span>3학점 | 이지은 교수</span>
                  </div>
                  <PlusCircle size={18} />
                </div>
                <div className="msg-course-card" onClick={() => handleAddCourse('accounting')}>
                  <div className="c-info">
                    <h5>회계원리 (화 10-12)</h5>
                    <span>3학점 | 김지훈 교수</span>
                  </div>
                  <PlusCircle size={18} />
                </div>
              </div>
            </div>
          );
          addMessage('bot', '', html);
        }
      }
      else if (studentType === 'double-major') {
        if (promptId === 'double-major-list') {
          const html = (
            <div>
              <p>미이수 통계학과 전공필수 교과목 리스트입니다:</p>
              <div className="msg-course-list">
                <div className="msg-course-card" onClick={() => handleAddCourse('math-stats')}>
                  <div className="c-info">
                    <h5>수리통계학 (목 13-15)</h5>
                    <span>3학점 | 최은정 교수</span>
                  </div>
                  <PlusCircle size={18} />
                </div>
              </div>
            </div>
          );
          addMessage('bot', '', html);
        }
        else if (promptId === 'double-schedule') {
          setActiveCourses(prev => {
            const filtered = prev.filter(c => c.id !== 'math-stats' && c.id !== 'culture-art-converge');
            return [
              ...filtered,
              JSON.parse(JSON.stringify(COURSE_CATALOG['math-stats'])),
              JSON.parse(JSON.stringify(COURSE_CATALOG['culture-art-converge']))
            ];
          });
          addMessage('bot', `통계전필 요건인 '수리통계학'과 융합교양 4영역인 '현대 사회와 미디어 아트'를 포함한 18학점 다전공 융합 설계 배정을 완료했습니다!`);
        }
      }
    }, 800);
  };

  // Text Chat submit
  const handleChatSend = async (e) => {
    e.preventDefault();
    const text = chatInput.trim();
    
    if (!text) {
      console.warn('400 Bad Request: Empty input submitted.');
      addMessage('bot', '⚠️ <strong>400 Bad Request:</strong> 전송할 메시지 내용을 입력해주세요.');
      return;
    }

    addMessage('user', text);
    setChatInput('');
    setIsTyping(true);

    let botResponseText = '';
    const lowerText = text.toLowerCase();

    if (lowerText.includes('금공강') || lowerText.includes('공강')) {
      botResponseText = '금요일 전체 수업을 배제하고 융합교양을 채울 수 있는 최적의 15학점 금공강 설계안을 모의 격자에 세팅해 두었습니다. 확인해 보세요!';
      setTimeout(() => {
        handleQuickChip(studentType === 'transfer' ? 'auto-schedule' : 'general-schedule', '금공강 시간표 추천');
      }, 400);
    } else if (lowerText.includes('융합교양') || lowerText.includes('교양')) {
      botResponseText = '융합교양 3영역(기술과 현대사회 등) 개설 교과목 추천 리스트입니다. 아래 목록 카드의 담기 단추를 누르시면 시간표에 즉시 반영됩니다.';
      setTimeout(() => {
        handleQuickChip('converge-list', '융합교양 목록 요청');
      }, 400);
    } else if (lowerText.includes('전공') || lowerText.includes('전필')) {
      botResponseText = '현재 학적 기준 미이수 전공 필수 교과목 목록입니다. 아래 리스트 카드를 활용해 수강신청을 완성해 보세요.';
      setTimeout(() => {
        handleQuickChip('major-req-list', '전공필수 추천 요청');
      }, 400);
    } else {
      botResponseText = '안녕하세요! 현재 경상국립대학교 통합 수강신청 AI 네비게이터 모드입니다. "금공강 시간표 추천", "융합교양 추천", "전공필수 추천" 등 수강 신청 요건과 관련된 내용을 문의하시면 즉시 맞춤형 설계 및 격자 자동 배정을 도와드립니다.';
    }

    try {
      await axios.post('http://localhost:5000/api/chat', {
        userMessage: text,
        aiResponse: botResponseText
      });
    } catch (err) {
      console.warn('Backend server offline. Message saved locally.', err);
      setTimeout(() => {
        addMessage('bot', '💡 <strong>알림:</strong> 백엔드 서버가 오프라인 상태이거나 네트워크 연결이 원활하지 않습니다. 대화 내역은 브라우저 로컬 세션에 임시 보관됩니다.');
      }, 200);
    }

    setTimeout(() => {
      setIsTyping(false);
      addMessage('bot', botResponseText);
    }, 800);
  };

  // Handle OCR Transcript File Upload
  const handleFileUploadTrigger = () => {
    fileInputRef.current.click();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Show image preview in chat
    const reader = new FileReader();
    reader.onload = async (event) => {
      const imgHtml = (
        <div>
          <p>📎 성적표 이미지를 전송했습니다.</p>
          <img src={event.target.result} className="uploaded-image" alt="Uploaded Transcript" style={{ maxWidth: '100%', borderRadius: '8px', marginTop: '8px' }} />
        </div>
      );
      addMessage('user', '', imgHtml);
      setIsTyping(true);
      setIsOcrUploading(true);

      // Create Form Data to send to Backend API
      const formData = new FormData();
      formData.append('transcript', file);

      try {
        // Express Backend API Call
        const response = await axios.post('/api/credits/analyze-image', formData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        });

        setIsTyping(false);
        setIsOcrUploading(false);

        if (response.data?.success) {
          // Success response
          const ocrData = response.data.data;
          
          // Modify profile states based on actual backend response or student type mapping
          setProfiles(prev => {
            const nextProfiles = { ...prev };
            const prof = nextProfiles[studentType];
            
            if (studentType === 'transfer') {
              prof.credits.majorReq = 24;
              prof.credits.convergeEdu = 6;
              prof.credits.total = 93;
              prof.warningText = '융합교양 요건 충족됨';
              prof.diagnosticBrief = '김경상님, 성적표 분석 결과 융합교양 3영역(기술과 인류) 및 전공필수 12학점이 소급 적용되어 이수가 인정되었습니다!';
              prof.diagnosticBullets = [
                { type: 'success', text: '융합교양 3영역 이수 인정 완료 (3학점)' },
                { type: 'success', text: '전공 필수 이수 요건 충족 (24학점 달성)' }
              ];
            } 
            else if (studentType === 'general') {
              prof.credits.balanceEdu = 12;
              prof.credits.majorReq = 24;
              prof.credits.total = 105;
              prof.warningText = '균형교양 요건 충족됨';
              prof.diagnosticBrief = '박경상님, 성적표 분석 결과 균형교양 4영역 및 전공필수 6학점 이수가 승인되었습니다!';
              prof.diagnosticBullets = [
                { type: 'success', text: '균형교양 4영역 이수 인정 완료 (3학점)' },
                { type: 'success', text: '전공필수 이수 요건 충족 (24학점 달성)' }
              ];
            }
            else if (studentType === 'double-major') {
              prof.credits.convergeEdu = 6;
              prof.credits.total = 81;
              prof.diagnosticBrief = '이경상님, 성적표 분석 결과 융합교양 3영역(3학점) 대체 이수가 인정되었습니다!';
              prof.diagnosticBullets = [
                { type: 'success', text: '융합교양 3영역 이수 인정 완료' },
                { type: 'yellow', text: '다전공 경영 필수 마케팅원론(3학점) 미이수 상태' }
              ];
            }
            return nextProfiles;
          });

          // Print bot message
          const botHtml = (
            <div>
              <p>🔍 <strong>성적표 캡처본 자동 분석 결과 (Express API 연동):</strong></p>
              <p>1. <strong>전필 전적대 학점 인정</strong>: 전공필수 과목 {ocrData.extractedCredits.majorReq}학점이 전적대 이수로 정식 승인되었습니다.</p>
              <p>2. <strong>교양 인정</strong>: '기술과 현대사회'가 {ocrData.extractedCredits.convergeEdu === 3 ? '융합교양 3영역' : '교양 영역'}으로 매핑되어 대체 처리되었습니다.</p>
              <p>🎉 학적 데이터베이스가 갱신되었습니다. 확인해 보세요!</p>
            </div>
          );
          addMessage('bot', '', botHtml);
        } else {
          addMessage('bot', '성적표 이미지 분석 중 오류가 발생했습니다.');
        }

      } catch (err) {
        console.error('OCR Upload Error:', err);
        setIsTyping(false);
        setIsOcrUploading(false);
        addMessage('bot', '서버와 통신하는 과정에서 에러가 발생했습니다. 로컬 Express 서버(Port 5000)가 기동 중인지 확인해 주세요.');
      }
    };
    reader.readAsDataURL(file);
    // Clear input
    e.target.value = '';
  };

  // Reset timetable
  const handleReset = () => {
    setIsConfirmed(false);
    
    // Restore default template
    setProfiles(prev => {
      const freshTemplates = JSON.parse(JSON.stringify(STUDENT_PROFILE_TEMPLATES));
      return {
        ...prev,
        [studentType]: freshTemplates[studentType]
      };
    });

    const initialCourseIds = STUDENT_PROFILE_TEMPLATES[studentType].initialCourses;
    const initialCoursesList = initialCourseIds
      .map(id => COURSE_CATALOG[id])
      .filter(Boolean)
      .map(course => JSON.parse(JSON.stringify(course)));
    setActiveCourses(initialCoursesList);

    setChatMessages(prev => [
      ...prev,
      { id: Date.now(), sender: 'bot', text: '시간표 수강 계획이 초기화되었습니다. 학과 기본 수강 과목만 남겨 두었으니 다시 설계해 보세요.' }
    ]);
  };

  // Confirm sugang plans
  const handleConfirmPlan = () => {
    setIsConfirmed(true);
    addMessage('bot', '🎉 축하합니다! <strong>수강 계획이 성공적으로 확정되었습니다.</strong> 대시보드의 총 달성 학점 진행도에 계획된 학점이 누적 반영되었습니다. 이번 학기를 차질없이 이수하시면 졸업 자격이 충족됩니다.');
  };

  // Calculations for dashboard
  const currentSemesterCredits = activeCourses.reduce((sum, c) => sum + c.credits, 0);
  const baseCredits = currentProfile.credits.total;
  const finalCredits = baseCredits + (isConfirmed ? currentSemesterCredits : 0);
  const totalGoal = currentProfile.credits.totalGoal;
  
  // Percentages
  const displayCredits = isConfirmed ? finalCredits : baseCredits;
  const totalPercent = Math.round((displayCredits / totalGoal) * 100);
  const totalDegrees = (displayCredits / totalGoal) * 360;

  // Active courses credit filters
  const activeMajorReq = activeCourses.filter(c => c.category === 'major-req').reduce((sum, c) => sum + c.credits, 0);
  const activeMajorOpt = activeCourses.filter(c => c.category === 'major-opt').reduce((sum, c) => sum + c.credits, 0);
  const activeConverge = activeCourses.filter(c => c.category === 'converge-edu').reduce((sum, c) => sum + c.credits, 0);
  const activeBalance = activeCourses.filter(c => c.category === 'balance-edu').reduce((sum, c) => sum + c.credits, 0);

  const displayMajorReq = currentProfile.credits.majorReq + (isConfirmed ? activeMajorReq : 0);
  const displayMajorOpt = currentProfile.credits.majorOpt + (isConfirmed ? activeMajorOpt : 0);
  const displayCoreEdu = currentProfile.credits.coreEdu;
  const displayBalanceEdu = currentProfile.credits.balanceEdu + (isConfirmed ? activeBalance : 0);
  const displayConvergeEdu = currentProfile.credits.convergeEdu + (isConfirmed ? activeConverge : 0);

  const majorReqPercent = Math.min((displayMajorReq / currentProfile.credits.majorReqGoal) * 100, 100);
  const majorOptPercent = Math.min((displayMajorOpt / currentProfile.credits.majorOptGoal) * 100, 100);
  const balanceEduPercent = Math.min((displayBalanceEdu / currentProfile.credits.balanceEduGoal) * 100, 100);
  const convergeEduPercent = Math.min((displayConvergeEdu / currentProfile.credits.convergeEduGoal) * 100, 100);

  return (
    <div className="timetable-portal">
      {/* Top Navigator */}
      <header className="portal-header card-glass">
        <div className="portal-logo" onClick={() => navigate('/portal')}>
          <ArrowLeft size={18} className="logo-icon text-indigo" />
          <span className="logo-text">GNU AI PORTAL</span>
        </div>
        
        <div className="portal-user-menu">
          {!(user && user.studentId === '2025080081') && (
            <div className="profile-switcher-wrapper">
              <span className="switcher-label">시뮬레이션 학적: </span>
              <select 
                value={studentType} 
                onChange={(e) => setStudentType(e.target.value)}
                className="student-type-select"
              >
                <option value="transfer">편입생</option>
                <option value="general">재학생</option>
                <option value="double-major">다전공자</option>
              </select>
            </div>
          )}
          
          <button onClick={() => navigate('/portal')} className="btn-logout">
            <span>메인 포털</span>
          </button>
        </div>
      </header>

      {/* Portal Layout Grid */}
      <div className="navigator-grid">
        {/* LEFT PANEL: Student Profile & Diagnostic Graduation Dashboard */}
        <section className="left-panel">
          {/* Student Profile Card */}
          <div className="student-profile-card card-glass animate-fade-in-up">
            <div className="profile-avatar-wrapper">
              <div className="profile-avatar">
                <User size={30} />
              </div>
            </div>
            <div className="profile-info">
              <h3>
                {studentName} 
                <span className="badge">{currentProfile.badge}</span>
              </h3>
              <p>{studentMajor}</p>
            </div>
          </div>

          {/* Credits Summary Dashboard Card */}
          <div className="credits-dashboard-card card-glass animate-fade-in-up" style={{ animationDelay: '50ms' }}>
            <h4>졸업 요건 충족도</h4>
            
            <div className="circular-progress-section">
              <div 
                className="progress-circle" 
                style={{ 
                  background: `conic-gradient(var(--color-primary) 0deg, var(--color-secondary) ${totalDegrees}deg, rgba(255, 255, 255, 0.05) ${totalDegrees}deg 360deg)` 
                }}
              >
                <div className="progress-inner">
                  <span className="percent-text">{totalPercent}%</span>
                  <span className="credits-text">{displayCredits} / {totalGoal}학점</span>
                </div>
              </div>
            </div>

            <div className="category-bars-section">
              {/* Major Required */}
              <div className="bar-item">
                <div className="bar-header">
                  <span>전공필수</span>
                  <span className="bar-value">{displayMajorReq} / {currentProfile.credits.majorReqGoal}학점</span>
                </div>
                <div className="progress-bar-bg">
                  <div className="progress-bar-fill primary" style={{ width: `${majorReqPercent}%` }}></div>
                </div>
              </div>

              {/* Major Optional */}
              <div className="bar-item">
                <div className="bar-header">
                  <span>전공선택</span>
                  <span className="bar-value">{displayMajorOpt} / {currentProfile.credits.majorOptGoal}학점</span>
                </div>
                <div className="progress-bar-bg">
                  <div className="progress-bar-fill secondary" style={{ width: `${majorOptPercent}%` }}></div>
                </div>
              </div>

              {/* Core Edu */}
              <div className="bar-item">
                <div className="bar-header">
                  <span>기초교양</span>
                  <span className="bar-value">{displayCoreEdu} / {currentProfile.credits.coreEduGoal}학점</span>
                </div>
                <div className="progress-bar-bg success">
                  <div className="progress-bar-fill success" style={{ width: '100%' }}></div>
                </div>
              </div>

              {/* Balance Edu */}
              <div className="bar-item">
                <div className="bar-header">
                  <span>균형교양</span>
                  <span className="bar-value">{displayBalanceEdu} / {currentProfile.credits.balanceEduGoal}학점</span>
                </div>
                <div className={`progress-bar-bg ${balanceEduPercent >= 100 ? 'success' : ''}`}>
                  <div className="progress-bar-fill success" style={{ width: `${balanceEduPercent}%` }}></div>
                </div>
              </div>

              {/* Converge Edu */}
              <div className="bar-item">
                <div className="bar-header">
                  <span>융합교양</span>
                  <span className="bar-value">{displayConvergeEdu} / {currentProfile.credits.convergeEduGoal}학점</span>
                </div>
                <div className={`progress-bar-bg ${convergeEduPercent >= 100 ? 'success' : 'warning'}`}>
                  <div className="progress-bar-fill warning" style={{ width: `${convergeEduPercent}%` }}></div>
                </div>
                {convergeEduPercent < 100 && (
                  <div className="warning-label-bubble">
                    ⚠️ {currentProfile.warningText}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Real-time Diagnostics widget */}
          <div 
            className={`diagnostic-card card-glass animate-fade-in-up ${isConfirmed ? 'resolved-state' : 'warning-state'}`} 
            style={{ animationDelay: '100ms' }}
          >
            <div className="diagnostic-header">
              <div className={`pulse-icon ${isConfirmed ? 'success' : 'warning'}`}>
                {isConfirmed ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
              </div>
              <h4>실시간 졸업 진단 리포트</h4>
            </div>
            
            <p className="diagnostic-desc">
              {isConfirmed ? (
                <span>{studentName}님, 분석 완료! <strong>이번 학기 학업 계획 수립이 졸업 기준에 완벽히 부합합니다.</strong> 수강 누락 요건이 없습니다.</span>
              ) : (
                <span dangerouslySetInnerHTML={{ __html: getDynamicText(currentProfile.diagnosticBrief) }}></span>
              )}
            </p>

            <div className="diagnostic-bullets">
              {isConfirmed ? (
                <>
                  <div className="bullet-item">
                    <span className="indicator success"></span>
                    <span>모든 졸업 누락 영역 이수 계획 반영됨</span>
                  </div>
                  <div className="bullet-item">
                    <span className="indicator success"></span>
                    <span>총 {finalCredits}학점 달성 예정</span>
                  </div>
                </>
              ) : (
                currentProfile.diagnosticBullets.map((bullet, idx) => (
                  <div key={idx} className={`bullet-item ${bullet.type}-alert`}>
                    <span className="indicator"></span>
                    <span>{bullet.text}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        {/* MIDDLE PANEL: Interactive Timetable Grid */}
        <section className="middle-panel card-glass animate-fade-in-up">
          <div className="timetable-header">
            <h3>2026학년도 2학기 모의 시간표</h3>
            <div className="timetable-actions">
              <button 
                onClick={handleReset} 
                className="btn-action reset"
                title="시간표 초기화"
              >
                <RefreshCw size={14} />
                <span>초기화</span>
              </button>
              
              <button 
                onClick={handleConfirmPlan} 
                className={`btn-action confirm ${isConfirmed ? 'confirmed' : ''}`}
                disabled={isConfirmed}
              >
                {isConfirmed ? <Check size={14} /> : <CheckCircle2 size={14} />}
                <span>{isConfirmed ? '계획 확정됨' : '계획 확정'}</span>
              </button>
            </div>
          </div>

          {/* Multi-Timetable Selector Bar */}
          <div className="timetable-tabs-bar">
            <div className="tabs-scroll-area">
              {savedTimetables.map(t => (
                <button
                  key={t.id}
                  onClick={() => handleSelectTimetable(t.id)}
                  className={`timetable-tab-chip ${t.id === activeTimetableId ? 'active' : ''} ${t.isPast ? 'past-history' : ''}`}
                >
                  {t.isPast ? <History size={13} /> : <Calendar size={13} />}
                  <span>{t.name}</span>
                  {t.isPast && <span className="past-badge">이수이력</span>}
                </button>
              ))}
            </div>

            <button onClick={handleAddTimetable} className="btn-add-timetable" title="새 수강 시간표 추가">
              <Plus size={13} />
              <span>새 시간표</span>
            </button>
          </div>

          <div className="timetable-wrapper">
            <div className="timetable-container">
              {/* Header Days */}
              <div className="time-col-header" style={{ gridRow: 1, gridColumn: 1 }}>시간</div>
              <div className="day-col-header" style={{ gridRow: 1, gridColumn: 2 }}>월</div>
              <div className="day-col-header" style={{ gridRow: 1, gridColumn: 3 }}>화</div>
              <div className="day-col-header" style={{ gridRow: 1, gridColumn: 4 }}>수</div>
              <div className="day-col-header" style={{ gridRow: 1, gridColumn: 5 }}>목</div>
              <div className="day-col-header" style={{ gridRow: 1, gridColumn: 6 }}>금</div>

              {/* Time axis rows (9 AM to 6 PM) */}
              {Array.from({ length: 9 }).map((_, hourIdx) => {
                const hour = hourIdx + 9;
                const timeString = `${hour.toString().padStart(2, '0')}:00`;
                return (
                  <React.Fragment key={hour}>
                    <div className="time-row-label" style={{ gridRow: `${hourIdx + 2}` }}>
                      <span className="period-name">{hourIdx + 1}교시</span>
                      <span className="period-time">{timeString}</span>
                    </div>
                    {/* Background rows for grid borders */}
                    <div className="grid-cell-bg" style={{ gridRow: `${hourIdx + 2}`, gridColumn: '2' }}></div>
                    <div className="grid-cell-bg" style={{ gridRow: `${hourIdx + 2}`, gridColumn: '3' }}></div>
                    <div className="grid-cell-bg" style={{ gridRow: `${hourIdx + 2}`, gridColumn: '4' }}></div>
                    <div className="grid-cell-bg" style={{ gridRow: `${hourIdx + 2}`, gridColumn: '5' }}></div>
                    <div className="grid-cell-bg" style={{ gridRow: `${hourIdx + 2}`, gridColumn: '6' }}></div>
                  </React.Fragment>
                );
              })}

              {/* Course Blocks Overlay */}
              <div className="course-overlay">
                {activeCourses.map((course) => (
                  course.slots.map((slot, slotIdx) => {
                    const startRow = slot.start - 7;
                    const endRow = slot.end - 7;
                    const durationHours = slot.end - slot.start;
                    const isSingleHour = durationHours === 1;
                    const isHovered = hoveredCourseId === course.id;

                    return (
                      <div 
                        key={`${course.id}-${slot.day}-${slotIdx}`}
                        className={`course-block ${course.category} ${isSingleHour ? 'single-hour' : 'multi-hour'} ${isHovered ? 'hovered' : ''}`}
                        style={{
                          gridColumn: slot.day + 1,
                          gridRow: `${startRow} / ${endRow}`
                        }}
                        onClick={() => setSelectedCourse(course)}
                        onMouseEnter={() => setHoveredCourseId(course.id)}
                        onMouseLeave={() => setHoveredCourseId(null)}
                        title={`${course.title} (${course.categoryName}) - ${course.prof} [${course.room}]`}
                      >
                        {isSingleHour ? (
                          <div className="single-hour-content">
                            <h4 className="course-title-single">{course.title}</h4>
                            <p className="course-sub-single">{course.prof} · {course.room}</p>
                          </div>
                        ) : (
                          <>
                            <div className="course-info-top">
                              <h4>{course.title}</h4>
                              <span>{course.categoryName}</span>
                            </div>
                            <div className="course-info-bottom">
                              <span className="course-prof-room">{course.prof} | {course.room}</span>
                              <span className="course-time-badge">{slot.start}:00~{slot.end}:00</span>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })
                ))}
              </div>
            </div>
          </div>

          {/* 2026-2 Course Catalog List & Search Drawer */}
          <div className="catalog-section">
            <div className="catalog-header-row">
              <div className="catalog-title">
                <BookOpen size={16} className="text-indigo" />
                <span>2026학년도 2학기 전체 개설 교과목 목록</span>
                <span className="badge" style={{ fontSize: '0.68rem', background: 'rgba(99,102,241,0.15)', color: '#818CF8', padding: '2px 8px', borderRadius: '10px' }}>
                  총 {Object.keys(COURSE_CATALOG).length}개 과목
                </span>
              </div>

              <div className="catalog-search-box">
                <Search size={14} className="text-muted" />
                <input 
                  type="text" 
                  placeholder="과목명, 교수명, 강의실 검색..."
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                />
                {catalogSearch && (
                  <X size={13} style={{ cursor: 'pointer' }} onClick={() => setCatalogSearch('')} />
                )}
              </div>
            </div>

            {/* Category Filter Chips */}
            <div className="catalog-category-filters">
              {[
                { id: 'all', label: '전체 보기' },
                { id: 'major-req', label: '전공필수' },
                { id: 'major-opt', label: '전공선택' },
                { id: 'converge-edu', label: '융합교양' },
                { id: 'balance-edu', label: '균형교양' },
                { id: 'general', label: '기초교양' }
              ].map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setCatalogCategory(cat.id)}
                  className={`cat-filter-btn ${catalogCategory === cat.id ? 'active' : ''}`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {/* Catalog Course Cards Grid */}
            <div className="catalog-cards-list">
              {Object.values(COURSE_CATALOG)
                .filter(course => {
                  const matchCat = catalogCategory === 'all' || course.category === catalogCategory;
                  const matchSearch = !catalogSearch || 
                    course.title.toLowerCase().includes(catalogSearch.toLowerCase()) ||
                    course.prof.toLowerCase().includes(catalogSearch.toLowerCase()) ||
                    course.room.toLowerCase().includes(catalogSearch.toLowerCase());
                  return matchCat && matchSearch;
                })
                .map(course => {
                  const isAdded = activeCourses.some(c => c.id === course.id);
                  const timeText = course.slots.map(s => {
                    const days = ['월', '화', '수', '목', '금'];
                    return `${days[s.day - 1]} ${s.start}:00~${s.end}:00`;
                  }).join(', ');

                  return (
                    <div key={course.id} className="catalog-card-item">
                      <div className="catalog-card-top">
                        <span className="catalog-card-title">{course.title}</span>
                        <span className={`catalog-card-cat ${course.category}`}>{course.categoryName}</span>
                      </div>

                      <p className="catalog-card-body">
                        {course.prof} · {course.room} ({course.credits}학점)<br />
                        <span style={{ fontSize: '0.64rem', opacity: 0.75 }}>{course.eval}</span>
                      </p>

                      <div className="catalog-card-footer">
                        <span className="catalog-card-time">🕒 {timeText}</span>
                        <button
                          onClick={() => {
                            if (isAdded) {
                              handleRemoveCourse(course.id);
                            } else {
                              handleAddCourse(course.id);
                            }
                          }}
                          className={`btn-catalog-add ${isAdded ? 'added' : 'add'}`}
                        >
                          {isAdded ? '✓ 담김' : '+ 담기'}
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </section>

        {/* RIGHT PANEL: AI Advisor Assistant Chat */}
        <section className="right-panel card-glass animate-fade-in-up">
          <div className="chat-header">
            <div className="avatar-bot animate-pulse-slow">
              <Bot size={18} />
            </div>
            <div>
              <h3>AI 학업 어드바이저</h3>
              <p className="status-online">실시간 추천 엔진 가동 중</p>
            </div>
          </div>

          <div className="chat-messages-container">
            {chatMessages.map((msg) => (
              <div key={msg.id} className={`message-wrapper ${msg.sender}`}>
                <div className="msg-avatar">
                  {msg.sender === 'bot' ? <Bot size={14} /> : <User size={14} />}
                </div>
                <div className="message-bubble">
                  {msg.htmlContent ? (
                    msg.htmlContent
                  ) : (
                    <p dangerouslySetInnerHTML={{ __html: msg.text }}></p>
                  )}
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="message-wrapper bot">
                <div className="msg-avatar">
                  <Bot size={14} />
                </div>
                <div className="message-bubble">
                  <div className="typing-indicator">
                    {isOcrUploading ? (
                      <div className="ocr-upload-loading">
                        <Loader2 className="animate-spin" size={16} />
                        <span>성적표 OCR 분석 중...</span>
                      </div>
                    ) : (
                      <>
                        <span></span>
                        <span></span>
                        <span></span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
            
            <div ref={chatEndRef} />
          </div>

          {/* Quick Action Helper Chips */}
          <div className="quick-action-chips">
            {currentProfile.chips.map((chip) => (
              <button 
                key={chip.id} 
                onClick={() => handleQuickChip(chip.id, chip.label)} 
                className="chip"
              >
                {chip.label}
              </button>
            ))}
          </div>

          {/* Input & Upload Bar */}
          <div className="chat-input-bar">
            <input 
              type="file" 
              ref={fileInputRef} 
              style={{ display: 'none' }} 
              accept="image/*"
              onChange={handleFileChange}
            />
            
            <button 
              onClick={handleFileUploadTrigger} 
              className="btn-image-upload"
              title="성적표 파일 업로드"
              disabled={isOcrUploading}
            >
              <Upload size={18} />
            </button>

            <form onSubmit={handleChatSend} className="chat-input-form">
              <input 
                type="text" 
                value={chatInput} 
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="예: '금공강 시간표 짜줘', '융합교양 추천'" 
                disabled={isOcrUploading}
              />
              <button type="submit" className="btn-chat-send" disabled={isOcrUploading}>
                <Send size={16} />
              </button>
            </form>
          </div>
        </section>
      </div>

      {/* Course Detail Modal */}
      {selectedCourse && (
        <div className="detail-modal-overlay" onClick={() => setSelectedCourse(null)}>
          <div className="detail-modal card-glass" onClick={(e) => e.stopPropagation()}>
            <button className="btn-close-modal" onClick={() => setSelectedCourse(null)}>
              <X size={18} />
            </button>
            
            <div className="modal-header-section">
              <span className={`category-tag ${selectedCourse.category}`}>
                {selectedCourse.categoryName}
              </span>
              <h2>{selectedCourse.title}</h2>
            </div>

            <div className="modal-grid-info">
              <div className="info-cell">
                <span className="label">담당교수</span>
                <span className="val">{selectedCourse.prof}</span>
              </div>
              <div className="info-cell">
                <span className="label">학점</span>
                <span className="val">{selectedCourse.credits}학점</span>
              </div>
              <div className="info-cell">
                <span className="label">강의 시간</span>
                <span className="val">
                  {selectedCourse.slots.map(s => {
                    const days = ['', '월요일', '화요일', '수요일', '목요일', '금요일'];
                    return `${days[s.day]} ${s.start}:00 - ${s.end}:00`;
                  }).join(', ')}
                </span>
              </div>
              <div className="info-cell">
                <span className="label">강의실</span>
                <span className="val">{selectedCourse.room}</span>
              </div>
            </div>

            <div className="modal-evaluation">
              <h4>선배들의 한줄 평</h4>
              <p>{selectedCourse.eval}</p>
            </div>
            
            <div className="modal-actions-bar">
              <button 
                onClick={() => {
                  handleAddCourse(selectedCourse.id);
                  setSelectedCourse(null);
                }} 
                className="btn-modal-add"
                disabled={activeCourses.some(c => c.id === selectedCourse.id)}
              >
                {activeCourses.some(c => c.id === selectedCourse.id) ? (
                  <>
                    <Check size={16} />
                    <span>이미 등록됨</span>
                  </>
                ) : (
                  <>
                    <PlusCircle size={16} />
                    <span>시간표에 추가</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TimetableGenerator;
