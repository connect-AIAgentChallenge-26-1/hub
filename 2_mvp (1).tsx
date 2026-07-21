import React, { useState, useEffect } from 'react';
import { 
  User, 
  ShieldCheck, 
  Mail, 
  Lock, 
  Calendar, 
  Plus, 
  Users, 
  Search, 
  Share2, 
  MapPin, 
  Copy, 
  Utensils, 
  Star, 
  Clock, 
  Check, 
  ArrowLeft,
  ChevronRight,
  Sparkles,
  Info
} from 'lucide-react';

// ==========================================
// 1. Mock Database & Constants
// ==========================================
const MOCK_RESTAURANTS = [
  { id: 'r1', name: '청춘 돼지불백', category: '한식/고기', rating: 4.8, distance: '정문 도보 3분', menu: '돼지불백 정식', emoji: '🥩' },
  { id: 'r2', name: '미도리 스시', category: '일식/회', rating: 4.9, distance: '서문 도보 5분', menu: '모듬초밥 10p', emoji: '🍣' },
  { id: 'r3', name: '롤링 파스타', category: '양식/파스타', rating: 4.6, distance: '동문 도보 4분', menu: '매운 크림 파스타', emoji: '🍝' },
  { id: 'r4', name: '소림 마라탕', category: '중식/마라탕', rating: 4.7, distance: '정문 도보 2분', menu: '마라탕 & 꿔바로우', emoji: '🍜' },
  { id: 'r5', name: '카페 아늑', category: '디저트/카페', rating: 4.5, distance: '서문 도보 1분', menu: '아인슈페너 & 와플', emoji: '☕' }
];

const DAYS = ['월', '화', '수', '목', '금'];
const TIME_SLOTS = [
  { id: 1, label: '1교시 (09:00 - 10:30)' },
  { id: 2, label: '2교시 (10:30 - 12:00)' },
  { id: 3, label: '3교시 (12:00 - 13:30)' }, // 주로 점심
  { id: 4, label: '4교시 (13:30 - 15:00)' },
  { id: 5, label: '5교시 (15:00 - 16:30)' },
  { id: 6, label: '6교시 (16:30 - 18:00)' }
];

export default function App() {
  // --- Global States ---
  const [currentStep, setCurrentStep] = useState(1); // 1: Login, 2: Verification, 3: Create, 4: Invite, 5: Search
  const [toast, setToast] = useState({ show: false, message: '' });
  const [verificationSent, setVerificationSent] = useState(false);
  const [tempCode, setTempCode] = useState('');

  // --- Form & Data States ---
  const [userEmail, setUserEmail] = useState('');
  const [userPassword, setUserPassword] = useState('');
  const [verifiedEmail, setVerifiedEmail] = useState('');
  const [inputCode, setInputCode] = useState('');
  const [isVerified, setIsVerified] = useState(false);

  // Bobyak Room Spec
  const [roomTitle, setRoomTitle] = useState('');
  const [foodCategory, setFoodCategory] = useState('한식/고기');
  const [hostSchedule, setHostSchedule] = useState({}); // e.g. { "월-3": true, "수-3": true } (True means FREE/공강)
  const [selectedRecommendedTime, setSelectedRecommendedTime] = useState('');

  // Simulated Members joining and their schedules
  const [joinedMembers, setJoinedMembers] = useState([
    { name: '나 (이정훈)', major: '컴퓨터공학과', role: '방장', schedule: {} }
  ]);

  // Selected Restaurant
  const [selectedRest, setSelectedRest] = useState(null);
  const [isMatchConfirmed, setIsMatchConfirmed] = useState(false);

  // Utility toast trigger
  const showToastMsg = (msg) => {
    setToast({ show: true, message: msg });
    setTimeout(() => {
      setToast({ show: false, message: '' });
    }, 3000);
  };

  // --- Handlers ---
  
  // Step 1: Login Handler
  const handleLoginSubmit = (e) => {
    e.preventDefault();
    if (!userEmail || !userPassword) {
      showToastMsg('⚠️ 이메일과 비밀번호를 입력해주세요.');
      return;
    }
    // Proceed to Email Verification Step
    setCurrentStep(2);
    showToastMsg('🔐 대학생 인증 단계로 이동합니다.');
  };

  // Step 2: Email Send & Code Check
  const handleSendCode = () => {
    const isCollegeEmail = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.(ac\.kr|edu)$/.test(userEmail);
    if (!isCollegeEmail) {
      showToastMsg('⚠️ ac.kr 혹은 edu로 끝나는 대학 계정이어야 합니다.');
      return;
    }
    const generatedCode = Math.floor(1000 + Math.random() * 9000).toString();
    setTempCode(generatedCode);
    setVerificationSent(true);
    // Dev helper log and onscreen popup
    showToastMsg(`📧 메일이 발송되었습니다! (인증번호: ${generatedCode})`);
  };

  const handleVerifyCode = () => {
    if (inputCode === tempCode) {
      setIsVerified(true);
      setVerifiedEmail(userEmail);
      showToastMsg('🎓 학생인증 성공! 밥약을 만들어봅시다.');
      setTimeout(() => {
        setCurrentStep(3);
      }, 1000);
    } else {
      showToastMsg('❌ 인증코드가 다릅니다. 이메일 전송함을 확인해 주세요.');
    }
  };

  // Step 3: Interactive Free Time / Timetable grid toggle
  const toggleScheduleTile = (day, slotId) => {
    const key = `${day}-${slotId}`;
    setHostSchedule(prev => ({
      ...prev,
      [key]: !prev[key] // toggle state
    }));
  };

  const handleCreateRoom = (e) => {
    e.preventDefault();
    if (!roomTitle) {
      showToastMsg('⚠️ 밥약 방 제목을 입력해 주세요.');
      return;
    }

    // Count how many free slots selected
    const freeSlotsCount = Object.values(hostSchedule).filter(Boolean).length;
    if (freeSlotsCount === 0) {
      showToastMsg('⚠️ 자신이 비어있는 공강 시간대를 최소 하나 이상 선택해주세요!');
      return;
    }

    // Sync host schedule to joinedMembers[0]
    const updatedMembers = [...joinedMembers];
    updatedMembers[0].schedule = hostSchedule;
    setJoinedMembers(updatedMembers);

    setCurrentStep(4);
    showToastMsg('🎉 밥약방이 정상 개설되었습니다! 친구들을 초대해 보세요.');
  };

  // Step 4: Simulate adding virtual friends and calculate overlapping free times
  const simulateFriendJoin = () => {
    if (joinedMembers.length >= 3) {
      showToastMsg('💡 이미 3명의 참여자가 모두 모였습니다!');
      return;
    }

    // Define mock friends
    const friends = [
      {
        name: '김서연 (경영과)',
        major: '경영학과 24학번',
        role: '참여자',
        // Common overlap with host will be on '수-3' (Wednesday Lunch) and '목-4'
        schedule: { '수-3': true, '목-4': true, '월-2': true, '금-5': true }
      },
      {
        name: '박진우 (시디과)',
        major: '시각디자인과 22학번',
        role: '참여자',
        schedule: { '수-3': true, '화-1': true, '목-4': true, '금-6': true }
      }
    ];

    const nextFriend = friends[joinedMembers.length - 1];
    setJoinedMembers(prev => [...prev, nextFriend]);
    showToastMsg(`👥 ${nextFriend.name}님이 초대장을 통해 밥약에 입장했습니다!`);
  };

  // Dynamic overlap scheduling recommendation calculation
  const getOverlappingSlots = () => {
    // Collect keys where ALL joined members have schedule === true
    const overlap = [];
    DAYS.forEach(day => {
      TIME_SLOTS.forEach(slot => {
        const key = `${day}-${slot.id}`;
        // Check if everyone currently in the room is free
        const isAllFree = joinedMembers.every(member => member.schedule[key] === true);
        if (isAllFree) {
          overlap.push({ day, slotId: slot.id, label: `${day}요일 ${slot.label}` });
        }
      });
    });
    return overlap;
  };

  const copyInvitationLink = () => {
    const dummyUrl = `https://babjjak.ac.kr/invite/room-temp-9999`;
    // Fallback document copy for frame compatibility
    const el = document.createElement('textarea');
    el.value = dummyUrl;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);

    showToastMsg('🔗 초대 링크가 클립보드에 복사되었습니다! 카톡방에 전달해보세요.');
  };

  // Proceed from scheduling to restaurant choice
  const handleProceedToRestaurants = () => {
    if (!selectedRecommendedTime) {
      showToastMsg('⚠️ 최종 약속을 잡을 최적 공강 시간대를 목록에서 하나 선택해 주세요.');
      return;
    }
    setCurrentStep(5);
  };

  // Step 5: Select Restaurant and finalize
  const handleConfirmMatch = () => {
    if (!selectedRest) {
      showToastMsg('🍱 약속 장소로 정할 맛집을 한 곳 선택해주세요!');
      return;
    }
    setIsMatchConfirmed(true);
    showToastMsg('🤝 완벽합니다! 밥짝 약속이 매칭 확정되었습니다.');
  };

  const restartProcess = () => {
    setCurrentStep(1);
    setVerificationSent(false);
    setInputCode('');
    setRoomTitle('');
    setHostSchedule({});
    setJoinedMembers([{ name: '나 (이정훈)', major: '컴퓨터공학과', role: '방장', schedule: {} }]);
    setSelectedRest(null);
    setIsMatchConfirmed(false);
    setSelectedRecommendedTime('');
  };

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col md:flex-row justify-center items-center p-4 gap-8 select-none font-sans overflow-x-hidden">
      
      {/* LEFT: 2-Week Explanations */}
      <div className="max-w-md text-white space-y-4 px-4">
        <div className="inline-flex items-center space-x-2 px-3 py-1 bg-orange-500/20 text-orange-400 border border-orange-500/30 rounded-full text-xs font-semibold">
          <Sparkles className="w-3.5 h-3.5" />
          <span>2주 초고속 런칭 기획 검증기</span>
        </div>
        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight leading-tight">
          밥짝 5단계 핵심 루프 <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 to-rose-400">
            인터랙션 시뮬레이터
          </span>
        </h1>
        <p className="text-slate-400 text-sm leading-relaxed">
          이 프로토타입은 회원가입부터 대학인증, 공강 시간표 매칭, 초대, 맛집 연동까지의 선형적인 유저 여정을 완벽히 복제한 웹앱 시뮬레이터입니다. 우측 스마트폰의 단계를 따라가며 2주 만에 출시할 MVP의 핵심 로직을 테스트해 보세요!
        </p>
        <div className="bg-slate-800/80 p-4 rounded-2xl border border-slate-700/60 space-y-2.5 text-xs text-slate-300">
          <h4 className="font-bold text-white flex items-center">
            <Info className="w-4 h-4 mr-1 text-orange-400" />
            시뮬레이션 가이드
          </h4>
          <ol className="list-decimal list-inside space-y-1 text-slate-400">
            <li><strong className="text-white">이메일 인증:</strong> 임의의 이메일 입력 시 디버그 코드가 출력됩니다.</li>
            <li><strong className="text-white">시간표 기입:</strong> 달력 그리드에서 내가 비는 시간을 터치하여 지정합니다.</li>
            <li><strong className="text-white">초대 시뮬레이션:</strong> 가상의 친구들이 내 방에 들어와 비는 공강 시간이 자동으로 겹쳐 분석되는 마법을 경험하세요.</li>
          </ol>
        </div>
      </div>

      {/* RIGHT: Smartphone Simulator */}
      <div className="relative w-full max-w-[390px] h-[780px] bg-black rounded-[50px] p-3 shadow-2xl shadow-slate-950 border-4 border-slate-800 flex flex-col shrink-0">
        
        {/* Dynamic Island style Notch */}
        <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-32 h-6 bg-black rounded-b-2xl z-50 flex items-center justify-center">
          <div className="w-12 h-1 bg-slate-800 rounded-full mb-1"></div>
          <div className="w-2 h-2 bg-slate-900 rounded-full ml-2 mb-1"></div>
        </div>

        {/* Screen Display */}
        <div className="w-full h-full bg-slate-50 rounded-[40px] overflow-hidden flex flex-col relative bg-white">
          
          {/* Header Status Bar Area */}
          <div className="pt-6 px-6 pb-2 flex justify-between items-center text-[11px] text-slate-600 font-bold bg-white z-20">
            <span>15:37</span>
            <div className="flex items-center space-x-1">
              <span>LTE</span>
              <div className="w-5 h-2.5 border border-slate-500 rounded-xs p-0.5 flex items-center">
                <div className="w-3.5 h-full bg-slate-600 rounded-2xs"></div>
              </div>
            </div>
          </div>

          {/* Toast Notification */}
          {toast.show && (
            <div className="absolute top-16 left-4 right-4 z-50 bg-slate-900 text-white text-xs px-4 py-3 rounded-2xl shadow-xl flex items-center space-x-2 animate-bounce">
              <span>{toast.message}</span>
            </div>
          )}

          {/* STEP 1: LOGIN */}
          {currentStep === 1 && (
            <div className="flex-grow flex flex-col justify-between p-6 bg-white animate-fade-in">
              <div className="space-y-6 pt-6">
                <div className="text-center space-y-2">
                  <span className="p-3 bg-gradient-to-tr from-orange-500 to-rose-500 rounded-2xl text-white inline-block shadow-md">
                    <Utensils className="w-8 h-8" />
                  </span>
                  <h2 className="text-2xl font-black text-slate-900 tracking-tight">밥짝 시작하기</h2>
                  <p className="text-xs text-slate-400">우리들만의 똑똑한 대학교 밥약 네트워킹</p>
                </div>

                <form onSubmit={handleLoginSubmit} className="space-y-3.5">
                  <div className="space-y-1">
                    <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">학교 이메일 계정</label>
                    <div className="relative">
                      <input 
                        type="email" 
                        placeholder="yourname@univ.ac.kr"
                        value={userEmail}
                        onChange={(e) => setUserEmail(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-xs focus:outline-none focus:border-orange-500 transition"
                      />
                      <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">비밀번호</label>
                    <div className="relative">
                      <input 
                        type="password" 
                        placeholder="••••••••"
                        value={userPassword}
                        onChange={(e) => setUserPassword(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-xs focus:outline-none focus:border-orange-500 transition"
                      />
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                    </div>
                  </div>

                  <button 
                    type="submit"
                    className="w-full py-3.5 bg-gradient-to-r from-orange-500 to-rose-500 text-white rounded-xl text-xs font-black shadow-lg shadow-orange-500/10 hover:opacity-95 transition"
                  >
                    로그인 및 가입 시작
                  </button>
                </form>
              </div>

              <div className="text-center text-[10px] text-slate-400 space-y-1">
                <p>본 서비는 대학생 전용 밥매칭 도구입니다.</p>
                <p className="underline cursor-pointer">이용약관 및 개인정보처리방침</p>
              </div>
            </div>
          )}

          {/* STEP 2: EMAIL VERIFICATION */}
          {currentStep === 2 && (
            <div className="flex-grow flex flex-col justify-between p-6 bg-white animate-fade-in">
              <div className="space-y-6 pt-4">
                <div className="flex items-center space-x-1">
                  <button onClick={() => setCurrentStep(1)} className="p-1.5 hover:bg-slate-100 rounded-full text-slate-500">
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs font-bold text-slate-500">대학 이메일 인증</span>
                </div>

                <div className="space-y-2">
                  <h3 className="text-xl font-extrabold text-slate-900 leading-tight">
                    진짜 학생이 맞는지 <br />간편하게 확인해 주세요 🎓
                  </h3>
                  <p className="text-xs text-slate-500 leading-normal">
                    안전한 선후배 만남을 위해 대학 공식 메일 주소인 <strong className="text-slate-800">ac.kr</strong> 계정으로만 활동할 수 있습니다.
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl flex items-center justify-between">
                    <div>
                      <p className="text-[10px] text-slate-400">가입 요청 메일</p>
                      <p className="text-xs font-bold text-slate-800">{userEmail || 'student@univ.ac.kr'}</p>
                    </div>
                    <button 
                      onClick={handleSendCode}
                      className="px-3 py-1.5 bg-orange-500 text-white text-[10px] font-extrabold rounded-lg hover:bg-orange-600 transition"
                    >
                      {verificationSent ? '재발송' : '인증번호 발송'}
                    </button>
                  </div>

                  {verificationSent && (
                    <div className="space-y-2 animate-fade-in">
                      <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">발송된 4자리 코드 입력</label>
                      <div className="flex space-x-2">
                        <input 
                          type="text" 
                          placeholder="인증코드를 입력하세요"
                          maxLength="4"
                          value={inputCode}
                          onChange={(e) => setInputCode(e.target.value)}
                          className="flex-grow bg-slate-50 border border-slate-200 rounded-xl py-3 px-4 text-xs font-bold text-center tracking-widest focus:outline-none focus:border-orange-500"
                        />
                        <button 
                          onClick={handleVerifyCode}
                          className="px-4 bg-slate-900 text-white text-xs font-extrabold rounded-xl hover:bg-slate-800 transition"
                        >
                          확인
                        </button>
                      </div>
                      <div className="p-3 bg-amber-50 border border-amber-200/50 rounded-xl text-[10px] text-amber-700 leading-relaxed flex items-start space-x-1">
                        <span>💡</span>
                        <span>
                          <strong>디버깅 헬퍼:</strong> 테스트를 위해 임시로 발송된 인증코드는 <strong>[{tempCode}]</strong> 입니다! 이 값을 입력하세요.
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="text-center text-[10px] text-slate-400 flex items-center justify-center space-x-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                <span>학생 인증 정보는 암호화되어 보호됩니다.</span>
              </div>
            </div>
          )}

          {/* STEP 3: CREATE BOBYAK ROOM & INPUT HOST FREE TIME */}
          {currentStep === 3 && (
            <div className="flex-grow flex flex-col justify-between overflow-y-auto p-5 bg-white animate-fade-in">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-black text-orange-500 bg-orange-50 px-2.5 py-1 rounded-full">Step 3. 밥약 생성</span>
                  <span className="text-[10px] text-slate-400">2주 MVP 테스트 중</span>
                </div>

                <div className="space-y-1">
                  <h3 className="text-base font-extrabold text-slate-900">새로운 밥약 약속 만들기</h3>
                  <p className="text-[10px] text-slate-500">내가 먹고 싶은 메뉴와 비는 공강 시간을 고르세요.</p>
                </div>

                {/* Spec Inputs */}
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-extrabold text-slate-400">1. 한 줄 방 제목</label>
                    <input 
                      type="text" 
                      placeholder="예: 컴공 새내기들 고기 사드림! 전공 꿀팁 방출"
                      value={roomTitle}
                      onChange={(e) => setRoomTitle(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3.5 text-xs focus:outline-none focus:border-orange-500 transition"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-extrabold text-slate-400">2. 대표 먹거리 분류</label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {['한식/고기', '일식/회', '양식/파스타', '중식/마라탕', '카페/수다'].map((cat, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setFoodCategory(cat)}
                          className={`py-2 rounded-xl text-[10px] font-bold border transition ${
                            foodCategory === cat 
                              ? 'bg-orange-50 text-orange-600 border-orange-200' 
                              : 'bg-slate-50 text-slate-500 border-transparent hover:bg-slate-100'
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Interative Scheduler Block */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <label className="text-[10px] font-extrabold text-slate-400">3. 나의 공강(약속 가능) 시간 선택</label>
                      <span className="text-[9px] text-orange-500 font-bold">터치하여 지정</span>
                    </div>
                    
                    {/* Time slots scheduler mini grid */}
                    <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-100 space-y-2">
                      {/* Days Header */}
                      <div className="grid grid-cols-6 text-center text-[10px] font-bold text-slate-500">
                        <span>교시</span>
                        {DAYS.map((d, i) => <span key={i}>{d}</span>)}
                      </div>

                      {/* Grid Body */}
                      <div className="space-y-1">
                        {TIME_SLOTS.slice(1, 5).map((slot, sIdx) => (
                          <div key={sIdx} className="grid grid-cols-6 items-center text-center">
                            <span className="text-[8px] font-bold text-slate-400 leading-tight">
                              {slot.id}교시<br/>{slot.id === 3 ? '점심' : ''}
                            </span>
                            {DAYS.map((day, dIdx) => {
                              const key = `${day}-${slot.id}`;
                              const isSelected = hostSchedule[key] === true;
                              return (
                                <button
                                  key={dIdx}
                                  type="button"
                                  onClick={() => toggleScheduleTile(day, slot.id)}
                                  className={`h-6 m-0.5 rounded-lg text-[9px] font-bold transition-all ${
                                    isSelected 
                                      ? 'bg-gradient-to-tr from-orange-500 to-rose-400 text-white shadow-xs' 
                                      : 'bg-white text-slate-300 hover:bg-slate-100 border border-slate-200/50'
                                  }`}
                                >
                                  {isSelected ? '공강' : ''}
                                </button>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <button 
                onClick={handleCreateRoom}
                className="w-full mt-4 py-3 bg-gradient-to-r from-orange-500 to-rose-500 text-white rounded-xl text-xs font-black shadow-md shadow-orange-500/10"
              >
                약속 방 만들고 초대하기 🚀
              </button>
            </div>
          )}

          {/* STEP 4: INVITATION & AUTO SCHEDULER ALGORITHM VIEW */}
          {currentStep === 4 && (
            <div className="flex-grow flex flex-col justify-between overflow-y-auto p-5 bg-white animate-fade-in">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-black text-rose-500 bg-rose-50 px-2.5 py-1 rounded-full">Step 4. 초대 및 분석</span>
                  <span className="text-[10px] text-slate-400">{joinedMembers.length}명 대기중</span>
                </div>

                <div className="space-y-1.5">
                  <h3 className="text-base font-extrabold text-slate-900 leading-tight">
                    방에 친구들을 모으고 <br />공강을 실시간 비교해보세요 ⏱️
                  </h3>
                  <p className="text-[10px] text-slate-500 leading-normal">
                    링크를 보내 친구가 참가하면, 각자의 공강을 종합해 시스템이 겹치는 최적의 시간을 자동으로 찾습니다.
                  </p>
                </div>

                {/* Copy Invite Link Panel */}
                <div className="p-3 bg-orange-50/50 rounded-2xl border border-orange-100/70 flex items-center justify-between">
                  <div className="truncate pr-2">
                    <p className="text-[8px] text-slate-400 font-bold uppercase">카카오톡 전용 초대 주소</p>
                    <p className="text-[10px] font-bold text-slate-700 truncate">https://babjjak.ac.kr/invite/room-temp-9999</p>
                  </div>
                  <button 
                    onClick={copyInvitationLink}
                    className="p-2 bg-white text-slate-600 hover:text-orange-500 rounded-xl shadow-xs border border-slate-100 flex items-center justify-center shrink-0"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>

                {/* Developer Simulator Button */}
                <button 
                  onClick={simulateFriendJoin}
                  className="w-full py-2 bg-slate-900 text-white text-[10px] font-extrabold rounded-xl hover:bg-slate-800 transition flex items-center justify-center space-x-1 shadow-sm"
                >
                  <Users className="w-3.5 h-3.5 text-orange-400" />
                  <span>[시뮬레이터] 가상 친구 입장시키기</span>
                </button>

                {/* List of joined users */}
                <div className="space-y-2">
                  <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">현재 방 참가 대기인원</h4>
                  <div className="space-y-1.5">
                    {joinedMembers.map((member, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-slate-50 px-3 py-2 rounded-xl border border-slate-100">
                        <div className="flex items-center space-x-2">
                          <div className="w-6 h-6 bg-orange-500 text-white rounded-full flex items-center justify-center text-[10px] font-extrabold">
                            {member.name.charAt(0)}
                          </div>
                          <div>
                            <p className="text-[10px] font-extrabold text-slate-800">{member.name}</p>
                            <p className="text-[8px] text-slate-400">{member.role} • 시간표 연동완료</p>
                          </div>
                        </div>
                        <span className="text-[9px] bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-md font-bold">연동됨</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* OVERLAPPING RESULTS SECTION */}
                <div className="space-y-2">
                  <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">🗓️ 알고리즘 분석: 모두 비어있는 최적 시간대</h4>
                  
                  {getOverlappingSlots().length === 0 ? (
                    <div className="p-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-center text-[10px] text-slate-400">
                      아직 모두 비어있는 공통 시간이 검출되지 않았습니다. (가상 친구를 가입시켜 교집합을 생성해 보세요!)
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {getOverlappingSlots().map((slot, i) => {
                        const isSelected = selectedRecommendedTime === slot.label;
                        return (
                          <button
                            key={i}
                            onClick={() => setSelectedRecommendedTime(slot.label)}
                            className={`w-full p-2.5 rounded-xl border text-[10px] font-bold text-left flex items-center justify-between transition ${
                              isSelected 
                                ? 'bg-orange-500 text-white border-orange-600 shadow-md shadow-orange-500/10' 
                                : 'bg-white text-slate-700 border-slate-100 hover:border-slate-200 shadow-xs'
                            }`}
                          >
                            <div className="flex items-center space-x-1.5">
                              <Clock className="w-3.5 h-3.5 text-orange-400" />
                              <span>{slot.label}</span>
                            </div>
                            <span className={`px-1.5 py-0.5 rounded text-[8px] ${isSelected ? 'bg-white text-orange-600' : 'bg-emerald-50 text-emerald-600'}`}>
                              인원 전원 가능
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

              </div>

              <button 
                onClick={handleProceedToRestaurants}
                className="w-full mt-4 py-3 bg-gradient-to-r from-orange-500 to-rose-500 text-white rounded-xl text-xs font-black shadow-md shadow-orange-500/10"
              >
                장소(맛집) 조율하러 가기 🥩
              </button>
            </div>
          )}

          {/* STEP 5: RESTAURANT SEARCH & FINAL CONFIRMATION */}
          {currentStep === 5 && (
            <div className="flex-grow flex flex-col justify-between overflow-y-auto p-5 bg-white animate-fade-in">
              <div className="space-y-4">
                
                {/* Header Back Button */}
                <div className="flex justify-between items-center">
                  <button onClick={() => setCurrentStep(4)} className="p-1.5 hover:bg-slate-100 rounded-full text-slate-500">
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs font-black text-amber-500 bg-amber-50 px-2.5 py-1 rounded-full">Step 5. 맛집 선정</span>
                </div>

                {!isMatchConfirmed ? (
                  <>
                    <div className="space-y-1">
                      <h3 className="text-base font-extrabold text-slate-900 leading-tight">선호 메뉴 기반 맛집 선정</h3>
                      <p className="text-[10px] text-slate-500">선택된 시간: <strong className="text-orange-500">{selectedRecommendedTime}</strong></p>
                    </div>

                    {/* Integrated Search Bar */}
                    <div className="relative">
                      <input 
                        type="text" 
                        placeholder="정문 앞 삼겹살, 스시, 돈까스..." 
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-8 pr-3 text-[10px] focus:outline-none focus:border-orange-500"
                        readOnly
                      />
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                    </div>

                    {/* Restaurant Cards list */}
                    <div className="space-y-2">
                      <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">추천 맛집 데이터 (제휴점)</h4>
                      
                      <div className="space-y-2">
                        {MOCK_RESTAURANTS.map((rest) => {
                          const isSelected = selectedRest?.id === rest.id;
                          return (
                            <div 
                              key={rest.id}
                              onClick={() => setSelectedRest(rest)}
                              className={`p-3 rounded-2xl border text-left cursor-pointer transition flex justify-between items-center ${
                                isSelected 
                                  ? 'bg-orange-50/70 border-orange-400 shadow-md' 
                                  : 'bg-white border-slate-100 hover:border-slate-200 shadow-xs'
                              }`}
                            >
                              <div className="flex items-center space-x-2.5">
                                <span className="text-2xl shrink-0">{rest.emoji}</span>
                                <div>
                                  <h4 className="text-[11px] font-bold text-slate-900">{rest.name}</h4>
                                  <p className="text-[9px] text-slate-400">{rest.category} • {rest.distance}</p>
                                  <p className="text-[9px] text-orange-600 font-extrabold">대표메뉴: {rest.menu}</p>
                                </div>
                              </div>
                              <div className="flex items-center space-x-1 bg-amber-50 px-2 py-0.5 rounded-lg text-amber-600 text-[9px] font-extrabold shrink-0">
                                <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                                <span>{rest.rating}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                ) : (
                  /* FINAL TICKET CARD (Success) */
                  <div className="py-4 space-y-4 text-center animate-scale-up">
                    <span className="text-4xl">🎉</span>
                    <h3 className="text-lg font-black text-slate-900">밥짝 매칭이 성사되었습니다!</h3>
                    <p className="text-xs text-slate-500 leading-normal">
                      확정된 시간표와 식당 정보가 그룹 채팅방과 알림에 즉시 등록되었습니다. 약속을 지켜 따뜻한 캠퍼스 한 끼를 즐기세요!
                    </p>

                    {/* Invitation Ticket Card rendering */}
                    <div className="bg-gradient-to-b from-orange-500 to-rose-500 text-white p-5 rounded-3xl text-left space-y-4 shadow-xl relative overflow-hidden">
                      <div className="absolute right-[-15px] bottom-[-15px] opacity-10 text-9xl">🎫</div>
                      
                      <div className="border-b border-white/20 pb-2.5">
                        <p className="text-[8px] uppercase tracking-wider text-white/80 font-bold">Bab-Jjak Promise Ticket</p>
                        <h4 className="text-sm font-black mt-1">{roomTitle || '행복한 밥한끼 약속'}</h4>
                      </div>

                      <div className="space-y-2 text-xs">
                        <div className="flex items-center space-x-2">
                          <Clock className="w-3.5 h-3.5 text-white/80" />
                          <div>
                            <p className="text-[8px] text-white/70">확정 일자 및 시간</p>
                            <p className="font-extrabold text-[10px]">{selectedRecommendedTime}</p>
                          </div>
                        </div>

                        <div className="flex items-center space-x-2">
                          <MapPin className="w-3.5 h-3.5 text-white/80" />
                          <div>
                            <p className="text-[8px] text-white/70">약속 장소</p>
                            <p className="font-extrabold text-[10px]">{selectedRest?.name || '추후 선정'} ({selectedRest?.distance})</p>
                          </div>
                        </div>

                        <div className="flex items-center space-x-2">
                          <Users className="w-3.5 h-3.5 text-white/80" />
                          <div>
                            <p className="text-[8px] text-white/70">밥약 참여 인원</p>
                            <p className="font-extrabold text-[10px]">{joinedMembers.length}명 ({joinedMembers.map(m => m.name.split(' ')[0]).join(', ')})</p>
                          </div>
                        </div>
                      </div>

                      <div className="bg-white/15 p-2 rounded-xl text-[9px] text-white/90 text-center font-bold">
                        수요일 점심, 정문에서 만나요! 🤝
                      </div>
                    </div>
                  </div>
                )}

              </div>

              {!isMatchConfirmed ? (
                <button 
                  onClick={handleConfirmMatch}
                  className="w-full mt-4 py-3 bg-gradient-to-r from-orange-500 to-rose-500 text-white rounded-xl text-xs font-black shadow-md shadow-orange-500/10"
                >
                  최종 밥약 약속 확정하기 🤝
                </button>
              ) : (
                <button 
                  onClick={restartProcess}
                  className="w-full mt-4 py-3 bg-slate-900 text-white rounded-xl text-xs font-black shadow-md"
                >
                  새로운 밥약 설계해보기
                </button>
              )}
            </div>
          )}

        </div>
      </div>

    </div>
  );
}