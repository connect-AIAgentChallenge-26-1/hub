import React, { useState, useEffect, useRef } from 'react';
import { 
  Home, 
  Search, 
  PlusSquare, 
  MessageSquare, 
  User, 
  Flame, 
  MapPin, 
  Clock, 
  Users, 
  ChevronRight, 
  Send, 
  Sparkles, 
  CheckCircle, 
  Utensils, 
  Filter, 
  Heart, 
  X, 
  ThumbsUp, 
  AlertCircle,
  Hash
} from 'lucide-react';

// 대학 목록 데이터
const UNIVERSITIES = [
  "서울대학교", "연세대학교", "고려대학교", "서강대학교", "성균관대학교", 
  "한양대학교", "중앙대학교", "경희대학교", "한국외국어대학교", "서울시립대"
];

// 초기 카테고리
const CATEGORIES = [
  { id: 'all', label: '전체' },
  { id: 'buy', label: '선배가 밥 사줄게 💸' },
  { id: 'ask', label: '밥 사주실 선배 구함 🥺' },
  { id: 'split', label: '친구끼리 엔빵 🤝' },
  { id: 'group', label: '과팅/맛집 탐방 대모집 🍕' }
];

// 초기 밥약 피드 데이터
const INITIAL_POSTS = [
  {
    id: 1,
    title: "컴공 4학년 고인물이 밥 사드립니다 (진로 상담 가능)",
    category: "buy",
    university: "연세대학교",
    dept: "컴퓨터과학과 21학번",
    author: "김선배",
    authorImage: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&auto=format&fit=crop&q=80",
    menu: "돈까스 / 일식",
    time: "오늘 18:00",
    place: "신촌 정문 근처 카츠집",
    currentGuests: 1,
    maxGuests: 2,
    desc: "취업 준비, 전공 공부 힘들죠? 따뜻한 돈까스 먹으면서 편하게 수다 떨어요. 제가 쏩니다! 부담 갖지 말고 신청해 주세요.",
    temperature: 39.5,
    likes: 12,
    status: "recruiting"
  },
  {
    id: 2,
    title: "경영학과 새내기인데 정문 앞 파스타 같이 먹을 선배님 구해요!",
    category: "ask",
    university: "연세대학교",
    dept: "경영학과 26학번",
    author: "이새내기",
    authorImage: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80",
    menu: "파스타 / 이탈리안",
    time: "내일 12:30",
    place: "이대 후문 부근 파스타집",
    currentGuests: 0,
    maxGuests: 1,
    desc: "학교 근처 맛집을 아직 잘 몰라요ㅠ 맛있는 밥 같이 먹으면서 동아리나 학과 꿀팁 알려주실 스윗한 선배님 찾아요!",
    temperature: 36.8,
    likes: 8,
    status: "recruiting"
  },
  {
    id: 3,
    title: "신촌 신상 마라탕집 도장깨기 갈 파티원 모집 (2/4)",
    category: "split",
    university: "연세대학교",
    dept: "화학과 23학번",
    author: "마라러버",
    authorImage: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80",
    menu: "마라탕 / 중식",
    time: "7월 18일(금) 13:00",
    place: "정문 앞 하오마라탕",
    currentGuests: 2,
    maxGuests: 4,
    desc: "새로 오픈한 마라탕집 꿔바로우 진짜 맛있다는데, 같이 엔빵해서 먹을 분 구합니다! 다들 마라에 진심인 분들이라 편하게 오셔도 돼요.",
    temperature: 37.2,
    likes: 5,
    status: "recruiting"
  }
];

// 스와이프 추천 친구 데이터
const SWIPE_USERS = [
  {
    id: 1,
    name: "박서준",
    univ: "연세대학교",
    dept: "기계공학과 20학번",
    image: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=400&auto=format&fit=crop&q=80",
    keywords: ["소고기킬러", "축구동아리", "MBTI_ENFP", "가성비맛집"],
    foodPreferences: "고기, 한식, 일식 위주로 좋아합니다! 편하게 대화 나누는 거 좋아해요.",
    temp: 41.2
  },
  {
    id: 2,
    name: "이지은",
    univ: "연세대학교",
    dept: "시각디자인학과 24학번",
    image: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=400&auto=format&fit=crop&q=80",
    keywords: ["디저트필수", "카페투어", "MBTI_INFJ", "조용한식사"],
    foodPreferences: "예쁜 브런치 카페나 양식 좋아해요! 어색하지 않게 조곤조곤 얘기해요 ㅎㅎ",
    temp: 38.0
  },
  {
    id: 3,
    name: "최수민",
    univ: "연세대학교",
    dept: "심리학과 22학번",
    image: "https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=400&auto=format&fit=crop&q=80",
    keywords: ["매운음식", "떡볶이메이트", "MBTI_ENTP", "코인노래방"],
    foodPreferences: "엽떡 오리지널 단계 같이 먹을 전우 구함🔥 매운 거 진자 잘 드시는 분 환영해요!",
    temp: 36.5
  }
];

export default function App() {
  const [activeTab, setActiveTab] = useState('home'); // home, swipe, create, chat, profile
  const [selectedUniv, setSelectedUniv] = useState("연세대학교");
  const [showUnivSelector, setShowUnivSelector] = useState(false);
  const [posts, setPosts] = useState(INITIAL_POSTS);
  const [filteredCategory, setFilteredCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // 모달 및 알림 관련 상태
  const [selectedPost, setSelectedPost] = useState(null);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  
  // 새 글 등록 상태
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('buy');
  const [newMenu, setNewMenu] = useState('');
  const [newTime, setNewTime] = useState('');
  const [newPlace, setNewPlace] = useState('');
  const [newMaxGuests, setNewMaxGuests] = useState(2);
  const [newDesc, setNewDesc] = useState('');

  // 스와이프 기능 관련 상태
  const [swipeIndex, setSwipeIndex] = useState(0);
  const [swipedAction, setSwipedAction] = useState(null); // 'like' or 'dislike' or null

  // 마이페이지 설정 상태
  const [myProfile, setMyProfile] = useState({
    name: "정윤민",
    univ: "연세대학교",
    dept: "의류환경학과 25학번",
    tags: ["일식최애", "민초단", "MBTI_ISFP", "학식메이트"],
    temp: 37.5,
    joinedCount: 4,
    hostedCount: 2
  });

  // 채팅 상태
  const [chatRooms, setChatRooms] = useState([
    {
      id: 1,
      partner: "김선배 (컴공)",
      partnerImage: "https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=150&auto=format&fit=crop&q=80",
      lastMessage: "안녕하세요 윤민님! 돈까스 약속 신청해주셔서 감사해요.",
      time: "오후 2:30",
      unread: 1,
      messages: [
        { sender: 'them', text: '안녕하세요! 돈까스 밥약 신청 글 보고 톡 드려요.' },
        { sender: 'me', text: '헉 네 선배님! 신청 수락해주셔서 감사합니다!' },
        { sender: 'them', text: '안녕하세요 윤민님! 돈까스 약속 신청해주셔서 감사해요. 혹시 오늘 저녁 6시 괜찮으신가요?' }
      ]
    },
    {
      id: 2,
      partner: "이지은 (시디)",
      partnerImage: "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80",
      lastMessage: "좋아요! 내일 브런치 카페에서 뵈어요~",
      time: "어제",
      unread: 0,
      messages: [
        { sender: 'me', text: '안녕하세요 지은님! 스와이프에서 매치되어 인사드려요.' },
        { sender: 'them', text: '아 안녕하세요! 반가워요 ㅎㅎ' },
        { sender: 'me', text: '혹시 브런치 좋아하신다고 적혀있던데, 내일 점심 어떠세요?' },
        { sender: 'them', text: '좋아요! 내일 브런치 카페에서 뵈어요~' }
      ]
    }
  ]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [typedMessage, setTypedMessage] = useState('');
  const chatEndRef = useRef(null);

  // 채팅방 자동 스크롤
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeChatId, chatRooms]);

  // 토스트 띄우기 유틸
  const triggerToast = (msg) => {
    setToastMessage(msg);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3000);
  };

  // 밥약 신청 처리
  const handleApplyPost = (post) => {
    if (post.currentGuests >= post.maxGuests) {
      triggerToast("이미 정원이 찬 밥약입니다 😢");
      return;
    }
    
    // 로컬 데이터 업데이트
    setPosts(prev => prev.map(p => {
      if (p.id === post.id) {
        return { ...p, currentGuests: p.currentGuests + 1 };
      }
      return p;
    }));

    // 새로운 채팅방 생성 혹은 활성화
    const exists = chatRooms.find(room => room.partner.includes(post.author));
    if (!exists) {
      const newRoom = {
        id: Date.now(),
        partner: `${post.author} (${post.dept.split(' ')[0]})`,
        partnerImage: post.authorImage,
        lastMessage: "안녕하세요! 제가 방금 밥약 신청을 보냈습니다. 반가워요!",
        time: "방금",
        unread: 0,
        messages: [
          { sender: 'me', text: `안녕하세요! 방금 작성하신 밥약 [${post.title}]에 매칭 신청 드렸습니다!` },
          { sender: 'them', text: '와! 신청해주셔서 감사해요 😊 구체적인 시간과 메뉴 정해봐요!' }
        ]
      };
      setChatRooms([newRoom, ...chatRooms]);
    }

    triggerToast("🎉 성공적으로 밥약을 신청했습니다! 채팅방을 확인해 보세요.");
    setSelectedPost(null);
  };

  // 밥약 만들기 등록 처리
  const handleCreatePost = (e) => {
    e.preventDefault();
    if (!newTitle || !newMenu || !newTime || !newPlace) {
      triggerToast("모든 항목을 입력해 주세요! ✍️");
      return;
    }

    const createdPost = {
      id: Date.now(),
      title: newTitle,
      category: newCategory,
      university: selectedUniv,
      dept: myProfile.dept,
      author: myProfile.name,
      authorImage: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
      menu: newMenu,
      time: newTime,
      place: newPlace,
      currentGuests: 0,
      maxGuests: Number(newMaxGuests),
      desc: newDesc,
      temperature: myProfile.temp,
      likes: 0,
      status: "recruiting"
    };

    setPosts([createdPost, ...posts]);
    triggerToast("🚀 따끈따끈한 밥약이 등록되었습니다!");
    
    // 입력창 초기화
    setNewTitle('');
    setNewMenu('');
    setNewTime('');
    setNewPlace('');
    setNewDesc('');
    
    // 홈 탭으로 이동
    setActiveTab('home');
  };

  // 스와이프 액션 처리
  const handleSwipe = (action) => {
    if (swipeIndex >= SWIPE_USERS.length) return;
    setSwipedAction(action);
    
    setTimeout(() => {
      if (action === 'like') {
        // 하트 클릭 시 바로 채팅 매칭 가능
        const swipedUser = SWIPE_USERS[swipeIndex];
        const newRoom = {
          id: Date.now(),
          partner: `${swipedUser.name} (${swipedUser.dept.split(' ')[0]})`,
          partnerImage: swipedUser.image,
          lastMessage: "프로필 하트를 보냈어요! 우리 같이 밥 먹어요 😋",
          time: "방금",
          unread: 1,
          messages: [
            { sender: 'me', text: '프로필 마음에 들어서 하트 눌렀어요! 우리 맛집 같이 가요!' },
            { sender: 'them', text: '우와 매칭됐네요! 반가워요 ㅎㅎ 무엇부터 같이 먹을까요?' }
          ]
        };
        setChatRooms([newRoom, ...chatRooms]);
        triggerToast(`❤️ ${swipedUser.name}님과 밥약 매칭 성공! 톡방이 생성되었습니다.`);
      }
      setSwipeIndex(prev => prev + 1);
      setSwipedAction(null);
    }, 400);
  };

  // 실시간 모의 채팅 응답
  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!typedMessage.trim() || !activeChatId) return;

    // 내 메시지 전송
    setChatRooms(prev => prev.map(room => {
      if (room.id === activeChatId) {
        return {
          ...room,
          lastMessage: typedMessage,
          time: "오후 2:32",
          messages: [...room.messages, { sender: 'me', text: typedMessage }]
        };
      }
      return room;
    }));

    const currentTyped = typedMessage;
    setTypedMessage('');

    // 1.5초 뒤 상대방의 스마트한 귀여운 자동 응답
    setTimeout(() => {
      setChatRooms(prev => prev.map(room => {
        if (room.id === activeChatId) {
          let responseText = "좋아요! 그럼 그때 뵙겠습니다 👍";
          if (currentTyped.includes('메뉴') || currentTyped.includes('뭐')) {
            responseText = "저는 일식이랑 양식 다 좋아요! 윤민님은 선호하시는 거 있으신가요? 🍱";
          } else if (currentTyped.includes('어디') || currentTyped.includes('장소')) {
            responseText = "학교 정문 앞에 있는 아기자기한 맛집 추천해요! 거기가 분위기 좋거든요!";
          } else if (currentTyped.includes('시간') || currentTyped.includes('언제')) {
            responseText = "저는 오후 수업 마치는 4시 이후면 언제든 프리합니다!";
          }

          return {
            ...room,
            lastMessage: responseText,
            time: "오후 2:32",
            messages: [...room.messages, { sender: 'them', text: responseText }]
          };
        }
        return room;
      }));
    }, 1500);
  };

  // 카테고리 필터링된 게시글들
  const displayPosts = posts
    .filter(post => filteredCategory === 'all' || post.category === filteredCategory)
    .filter(post => 
      post.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      post.menu.toLowerCase().includes(searchQuery.toLowerCase()) ||
      post.desc.toLowerCase().includes(searchQuery.toLowerCase())
    );

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center font-sans py-0 sm:py-8">
      
      {/* 스마트폰 프레임 디자인 (트렌디한 모바일-퍼스트 앱 시각화) */}
      <div className="w-full max-w-md bg-white sm:rounded-[40px] sm:shadow-2xl overflow-hidden flex flex-col relative sm:border-[8px] sm:border-slate-800 h-screen sm:h-[840px]">
        
        {/* 상단 노치 & 인디케이터 (모바일 디테일 극대화) */}
        <div className="hidden sm:flex bg-slate-900 text-white h-7 px-6 items-center justify-between text-xs select-none">
          <span>14:38</span>
          <div className="w-16 h-4 bg-black rounded-full absolute left-1/2 -translate-x-1/2 top-1.5 flex justify-center items-center">
            <span className="w-2.5 h-2.5 bg-neutral-900 rounded-full block border border-neutral-700"></span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[9px]">LTE</span>
            <div className="w-4 h-2.5 border border-white/80 rounded-sm p-0.5 flex items-center">
              <div className="h-full w-3 bg-white"></div>
            </div>
          </div>
        </div>

        {/* 메인 서비스 헤더 */}
        <header className="bg-white border-b border-slate-100 px-5 py-4 flex items-center justify-between sticky top-0 z-30 shadow-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-2xl">🍚</span>
            <h1 className="text-2xl font-black bg-gradient-to-r from-orange-500 to-rose-500 bg-clip-text text-transparent tracking-tight">
              밥약
            </h1>
          </div>
          
          {/* 대학교 빠른 변경 토글 버튼 */}
          <div className="relative">
            <button 
              onClick={() => setShowUnivSelector(!showUnivSelector)}
              className="flex items-center gap-1 bg-rose-50 hover:bg-rose-100 transition text-rose-600 px-3 py-1.5 rounded-full text-xs font-semibold"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{selectedUniv}</span>
              <ChevronRight className="w-3 h-3 rotate-90" />
            </button>

            {showUnivSelector && (
              <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-100 rounded-2xl shadow-xl z-50 p-2 max-h-48 overflow-y-auto">
                {UNIVERSITIES.map((univ) => (
                  <button
                    key={univ}
                    onClick={() => {
                      setSelectedUniv(univ);
                      setShowUnivSelector(false);
                      triggerToast(`🏫 ${univ}로 대학이 변경되었습니다.`);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs transition ${selectedUniv === univ ? 'bg-rose-50 text-rose-600 font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}
                  >
                    {univ}
                  </button>
                ))}
              </div>
            )}
          </div>
        </header>

        {/* 중앙 인터랙티브 콘텐츠 공간 */}
        <main className="flex-1 overflow-y-auto bg-slate-50 relative pb-20">
          
          {/* [홈 탭] 밥
