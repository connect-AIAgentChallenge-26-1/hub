import { useState, useEffect } from 'react';
import { 
  Mail, 
  Lock, 
  Users, 
  Copy, 
  Utensils, 
  Clock, 
  ArrowLeft,
  MapPin,
  X,
  Plus,
  Thermometer,
  Bell,
  Sparkles,
  Search,
  Loader2
} from 'lucide-react';
import { auth } from './firebase';
import { GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult } from 'firebase/auth';

// ==========================================
// 1. Types & Constants
// ==========================================
interface Restaurant {
  id: string;
  name: string;
  category: string;
  rating: number;
  distance: string;
  menu: string;
  emoji: string;
}

interface TimeSlot {
  id: number;
  label: string;
}

interface UserProfile {
  university: string;
  mbti: string;
  major: string;
  year: string;
  avatarUrl: string;
}

interface Member {
  name: string;
  major: string;
  role: string;
  schedule: Record<string, boolean>;
}

interface ConfirmedPromise {
  id: string;
  title: string;
  time: string;
  restaurant: Restaurant | null;
  members: Member[];
}

const MOCK_RESTAURANTS: Restaurant[] = [
  { id: 'r1', name: '청춘 돼지불백', category: '한식/고기', rating: 4.8, distance: '정문 도보 3분', menu: '돼지불백 정식', emoji: '🥩' },
  { id: 'r2', name: '미도리 스시', category: '일식/회', rating: 4.9, distance: '서문 도보 5분', menu: '모듬초밥 10p', emoji: '🍣' },
  { id: 'r3', name: '롤링 파스타', category: '양식/파스타', rating: 4.6, distance: '동문 도보 4분', menu: '매운 크림 파스타', emoji: '🍝' },
  { id: 'r4', name: '소림 마라탕', category: '중식/마라탕', rating: 4.7, distance: '정문 도보 2분', menu: '마라탕 & 꿔바로우', emoji: '🍜' },
  { id: 'r5', name: '카페 아늑', category: '디저트/카페', rating: 4.5, distance: '서문 도보 1분', menu: '아인슈페너 & 와플', emoji: '☕' }
];

const DAYS = ['월', '화', '수', '목', '금'];
const TIME_SLOTS: TimeSlot[] = [
  { id: 1, label: '09:00 - 10:00' },
  { id: 2, label: '10:00 - 11:00' },
  { id: 3, label: '11:00 - 12:00' },
  { id: 4, label: '12:00 - 13:00' },
  { id: 5, label: '13:00 - 14:00' },
  { id: 6, label: '14:00 - 15:00' },
  { id: 7, label: '15:00 - 16:00' },
  { id: 8, label: '16:00 - 17:00' },
  { id: 9, label: '17:00 - 18:00' }
];

export default function App() {
  // --- Navigation & Flow States ---
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [activeTab, setActiveTab] = useState<'home' | 'sync' | 'mypage'>('home');
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [roomSimulatingId, setRoomSimulatingId] = useState<string | null>(null);

  // --- Auth States ---
  const [toast, setToast] = useState({ show: false, message: '' });
  const [verificationSent, setVerificationSent] = useState(false);
  const [tempCode, setTempCode] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userPassword, setUserPassword] = useState('');
  const [verifiedEmail, setVerifiedEmail] = useState('');
  const [inputCode, setInputCode] = useState('');
  const [isVerified, setIsVerified] = useState(false);
  const [isSignUpMode, setIsSignUpMode] = useState(false);
  const [signUpEmail, setSignUpEmail] = useState('');
  const [signUpPassword, setSignUpPassword] = useState('');
  const [signUpPasswordConfirm, setSignUpPasswordConfirm] = useState('');

  // --- Profile & Onboarding States ---
  const [isOnboarding, setIsOnboarding] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [onboardingUniversity, setOnboardingUniversity] = useState('');
  const [onboardingMbti, setOnboardingMbti] = useState('ENFP');
  const [onboardingMajor, setOnboardingMajor] = useState('');
  const [onboardingYear, setOnboardingYear] = useState('새내기 (1학년)');

  // --- Sync States ---
  const [appleId, setAppleId] = useState('');
  const [appPassword, setAppPassword] = useState('');
  const [everytimeUrl, setEverytimeUrl] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isGoogleSynced, setIsGoogleSynced] = useState(false);
  const [isIcalSynced, setIsIcalSynced] = useState(false);
  const [isEverytimeSynced, setIsEverytimeSynced] = useState(false);

  // --- Manner Temperature State ---
  const [temperature, setTemperature] = useState(37.5);

  // --- Bobyak Creation Wizard States ---
  const [wizardStep, setWizardStep] = useState<number>(1);
  const [roomTitle, setRoomTitle] = useState('');
  const [foodCategory, setFoodCategory] = useState('한식/고기');
  const [hostSchedule, setHostSchedule] = useState<Record<string, boolean>>({}); 
  const [selectedRecommendedTime, setSelectedRecommendedTime] = useState('');
  const [joinedMembers, setJoinedMembers] = useState<Member[]>([]);

  // --- User input state for joining from URL ---
  const [joinName, setJoinName] = useState('');
  const [joinMajor, setJoinMajor] = useState('컴퓨터공학과');

  // --- Search & AI Recommendation States ---
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOption, setSortOption] = useState('comment');
  const [userLocation, setUserLocation] = useState('');
  const [userCoords, setUserCoords] = useState<{lat: number, lng: number} | null>(null);
  const [searchedRestList, setSearchedRestList] = useState<Restaurant[]>(MOCK_RESTAURANTS);
  const [isSearchingRest, setIsSearchingRest] = useState(false);
  const [aiRecommendation, setAiRecommendation] = useState('');
  const [aiRecommendedMenu, setAiRecommendedMenu] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);

  // Selected Restaurant
  const [selectedRest, setSelectedRest] = useState<Restaurant | null>(null);

  // --- Confirmed Promises ---
  const [confirmedPromises, setConfirmedPromises] = useState<ConfirmedPromise[]>([]);

  // --- Utility Toast ---
  const showToastMsg = (msg: string) => {
    setToast({ show: true, message: msg });
    setTimeout(() => {
      setToast({ show: false, message: '' });
    }, 3000);
  };

  // --- Google Redirect Result Handler ---
  useEffect(() => {
    getRedirectResult(auth).then((result) => {
      if (result) {
        const credential = GoogleAuthProvider.credentialFromResult(result);
        const token = credential?.accessToken;
        const user = result.user;

        showToastMsg(`반갑습니다, ${user.displayName || '사용자'}님!`);
        setUserEmail(user.email || '');
        setVerifiedEmail(user.email || '');
        setIsVerified(true);

        if (token) {
          setIsSyncing(true);
          fetchGoogleCalendarSchedules(token);
        }
        setIsOnboarding(true);
        setCurrentStep(3);
      }
    }).catch((error) => {
      if (error.code !== 'auth/popup-blocked') {
        console.error('Redirect login error:', error);
      }
    });
  }, []);

  // --- URL Query Parameter Router ---
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
      setRoomSimulatingId(roomParam);
      showToastMsg('🎫 초대장을 확인했습니다. 로그인 후 합류 페이지로 이동합니다.');
    }
  }, []);

  // --- Real-time Room Details Polling ---
  useEffect(() => {
    if (!roomSimulatingId) return;

    const fetchRoomDetails = async () => {
      try {
        const response = await fetch(`http://localhost:5050/api/rooms/${roomSimulatingId}`);
        const data = await response.json();
        if (data.success && data.room) {
          setRoomTitle(data.room.title);
          setFoodCategory(data.room.foodCategory);
          setJoinedMembers(data.room.members);

          // If confirmed by other browser/user, add to confirmed list
          if (data.room.status === 'confirmed') {
            const existingIdx = confirmedPromises.findIndex(p => p.id === data.room.id);
            if (existingIdx === -1) {
              setConfirmedPromises(prev => [
                ...prev,
                {
                  id: data.room.id,
                  title: data.room.title,
                  time: data.room.confirmedTime,
                  restaurant: data.room.confirmedRestaurant,
                  members: data.room.members
                }
              ]);
            }
            showToastMsg('🤝 밥약 약속 조율이 최종 성사되었습니다!');
            setRoomSimulatingId(null);
            setActiveTab('home');
          }
        }
      } catch (err) {
        console.error('Failed to poll room details', err);
      }
    };

    fetchRoomDetails();
    const interval = setInterval(fetchRoomDetails, 3000);
    return () => clearInterval(interval);
  }, [roomSimulatingId, confirmedPromises]);

  // --- API Integrations ---

  // 1. Restaurant Search API Call
  const handleSearchRestaurants = async (keyword: string, sort: string = sortOption) => {
    setIsSearchingRest(true);
    try {
      let finalKeyword = keyword;
      let currentLocation = userLocation;
      let currentCoords = userCoords;

      if (!currentLocation && navigator.geolocation) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
          });
          const { latitude, longitude } = pos.coords;
          currentCoords = { lat: latitude, lng: longitude };
          setUserCoords(currentCoords);

          const nominatimRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=14`);
          const nomData = await nominatimRes.json();
          const neighborhood = nomData.address?.suburb || nomData.address?.town || nomData.address?.village || nomData.address?.city || nomData.address?.borough || '';
          if (neighborhood) {
            currentLocation = neighborhood;
            setUserLocation(neighborhood);
          }
        } catch (geoErr) {
          console.error("Failed to get location:", geoErr);
        }
      }

      if (currentLocation) {
        finalKeyword = `${currentLocation} ${keyword}`;
      }

      let fetchUrl = `http://localhost:5050/api/restaurants/search?query=${encodeURIComponent(finalKeyword)}&sort=${sort}`;
      if (currentCoords) {
        fetchUrl += `&lat=${currentCoords.lat}&lng=${currentCoords.lng}`;
      }
      const response = await fetch(fetchUrl);
      const data = await response.json();
      if (data.success && data.items) {
        setSearchedRestList(data.items);
      } else {
        setSearchedRestList(MOCK_RESTAURANTS);
      }
    } catch (err) {
      console.error('Search API error, falling back to mocks.', err);
      const filtered = MOCK_RESTAURANTS.filter(r => 
        !keyword || r.name.includes(keyword) || r.category.includes(keyword) || r.menu.includes(keyword)
      );
      setSearchedRestList(filtered);
    } finally {
      setIsSearchingRest(false);
    }
  };

  // 2. Gemini AI Menu Recommendation Call
  const fetchAiRecommendation = async (category: string, time: string, membersList: Member[]) => {
    setIsAiLoading(true);
    setAiRecommendation('');
    setAiRecommendedMenu('');
    try {
      const response = await fetch('http://localhost:5050/api/restaurants/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          foodCategory: category,
          selectedTime: time,
          members: membersList
        })
      });
      const data = await response.json();
      if (data.success) {
        setAiRecommendation(data.recommendation);
        setAiRecommendedMenu(data.recommendedMenu);
      }
    } catch (err) {
      console.error('AI API error, falling back.', err);
      setAiRecommendation(`참여자 중 컴공 학생이 있고 ${time} 시간대이므로, 에너지를 북돋아 줄 ${category} 요리를 강력 추천합니다!`);
      setAiRecommendedMenu(`${category} 대표 특선 세트`);
    } finally {
      setIsAiLoading(false);
    }
  };

  // Debounced search trigger
  useEffect(() => {
    if (wizardStep === 3 || roomSimulatingId) {
      const delayDebounce = setTimeout(() => {
        handleSearchRestaurants(searchQuery, sortOption);
      }, 500);
      return () => clearTimeout(delayDebounce);
    }
  }, [searchQuery, sortOption]);

  // Initial trigger for AI recommendation
  useEffect(() => {
    if (wizardStep === 3 && selectedRecommendedTime) {
      setSearchQuery(foodCategory);
      handleSearchRestaurants(foodCategory, sortOption);
      fetchAiRecommendation(foodCategory, selectedRecommendedTime, joinedMembers);
    }
  }, [wizardStep]);

  useEffect(() => {
    if (roomSimulatingId && selectedRecommendedTime) {
      setSearchQuery(foodCategory);
      handleSearchRestaurants(foodCategory, sortOption);
      fetchAiRecommendation(foodCategory, selectedRecommendedTime, joinedMembers);
    }
  }, [selectedRecommendedTime, roomSimulatingId]);

  // --- Handlers ---
  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userEmail || !userPassword) {
      showToastMsg('⚠️ 이메일과 비밀번호를 입력해주세요.');
      return;
    }
    setCurrentStep(2);
    showToastMsg('🔐 가입 인증 단계로 이동합니다.');
  };

  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifyingCode, setIsVerifyingCode] = useState(false);

  const API_BASE = 'http://localhost:5050';

  const handleSendCode = async () => {
    const isEmailValid = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(userEmail);
    if (!isEmailValid) {
      showToastMsg('올바른 이메일 주소를 입력해 주세요.');
      return;
    }
    setIsSendingCode(true);
    try {
      const response = await fetch(`${API_BASE}/api/auth/send-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail })
      });
      const data = await response.json();
      if (data.success) {
        setVerificationSent(true);
        showToastMsg('인증 코드가 이메일로 발송되었습니다!');
      } else {
        showToastMsg(data.error || '이메일 발송에 실패했습니다.');
      }
    } catch {
      showToastMsg('서버 연결에 실패했습니다.');
    } finally {
      setIsSendingCode(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!inputCode) {
      showToastMsg('인증 코드를 입력해주세요.');
      return;
    }
    setIsVerifyingCode(true);
    try {
      const response = await fetch(`${API_BASE}/api/auth/verify-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail, code: inputCode })
      });
      const data = await response.json();
      if (data.success) {
        setIsVerified(true);
        setVerifiedEmail(userEmail);
        showToastMsg('인증 성공! 프로필을 설정해 주세요.');
        setTimeout(() => {
          setIsOnboarding(true);
          setCurrentStep(3);
        }, 1000);
      } else {
        showToastMsg(data.error || '인증에 실패했습니다.');
      }
    } catch {
      showToastMsg('서버 연결에 실패했습니다.');
    } finally {
      setIsVerifyingCode(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope('https://www.googleapis.com/auth/calendar.readonly');

      try {
        const result = await signInWithPopup(auth, provider);
        const credential = GoogleAuthProvider.credentialFromResult(result);
        const token = credential?.accessToken;
        const user = result.user;

        showToastMsg(`반갑습니다, ${user.displayName || '사용자'}님!`);
        setUserEmail(user.email || '');
        setVerifiedEmail(user.email || '');
        setIsVerified(true);

        if (token) {
          setIsSyncing(true);
          fetchGoogleCalendarSchedules(token);
        }
        setIsOnboarding(true);
        setCurrentStep(3);
      } catch (popupError: any) {
        if (popupError.code === 'auth/popup-blocked' || popupError.code === 'auth/cancelled-popup-request') {
          await signInWithRedirect(auth, provider);
        } else {
          throw popupError;
        }
      }
    } catch (error: any) {
      console.error(error);
      showToastMsg(`구글 로그인 실패: ${error.message || '인증 중 문제가 발생했습니다.'}`);
    }
  };

  const fetchGoogleCalendarSchedules = async (token: string) => {
    try {
      const response = await fetch('http://localhost:5050/api/schedule/sync/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: token })
      });
      const data = await response.json();
      if (data.success && data.freeSlots) {
        const newSched: Record<string, boolean> = {};
        data.freeSlots.forEach((slot: string) => {
          newSched[slot] = true;
        });
        setHostSchedule(newSched);
        setIsGoogleSynced(true);
        showToastMsg('📅 구글 캘린더 동기화 완료!');
      } else {
        throw new Error('Sync failed');
      }
    } catch (err) {
      setHostSchedule({ '수-3': true, '목-4': true, '월-2': true });
      setIsGoogleSynced(true);
      showToastMsg('📅 구글 캘린더 연동 완료! (Mock 데이터)');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleIcalSync = async () => {
    if (!appleId || !appPassword) {
      showToastMsg('Apple ID와 앱 암호를 입력해 주세요.');
      return;
    }
    setIsSyncing(true);
    try {
      const response = await fetch('http://localhost:5050/api/schedule/sync/ical', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appleId, appPassword })
      });
      const data = await response.json();
      if (data.success && data.freeSlots) {
        const newSched: Record<string, boolean> = {};
        data.freeSlots.forEach((slot: string) => {
          newSched[slot] = true;
        });
        setHostSchedule(newSched);
        setIsIcalSynced(true);
        showToastMsg('📅 애플 캘린더 동기화 완료!');
      } else {
        throw new Error('Sync failed');
      }
    } catch (err) {
      setHostSchedule({ '월-3': true, '수-3': true, '금-3': true });
      setIsIcalSynced(true);
      showToastMsg('📅 애플 캘린더 연동 완료! (Mock 데이터)');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleEverytimeSync = async () => {
    if (!everytimeUrl) {
      showToastMsg('⚠️ 에브리타임 URL을 입력해 주세요.');
      return;
    }
    setIsSyncing(true);
    try {
      const response = await fetch('http://localhost:5050/api/schedule/sync/everytime', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ everytimeUrl })
      });
      const data = await response.json();
      if (data.success && data.freeSlots) {
        const newSched: Record<string, boolean> = {};
        data.freeSlots.forEach((slot: string) => {
          newSched[slot] = true;
        });
        setHostSchedule(newSched);
        setIsEverytimeSynced(true);
        showToastMsg('⏱️ 에브리타임 시간표가 동기화되었습니다!');
      } else {
        throw new Error('Sync failed');
      }
    } catch (err) {
      setHostSchedule({ '화-3': true, '수-3': true, '목-3': true });
      setIsEverytimeSynced(true);
      showToastMsg('⏱️ 에브리타임 동기화 완료! (Mock 데이터)');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleLogout = async () => {
    try {
      await auth.signOut();
      setIsVerified(false);
      setUserEmail('');
      setVerifiedEmail('');
      setHostSchedule({});
      setIsGoogleSynced(false);
      setIsIcalSynced(false);
      setIsEverytimeSynced(false);
      setUserProfile(null);
      setIsOnboarding(false);
      setCurrentStep(1);
      showToastMsg('👋 성공적으로 로그아웃 되었습니다.');
    } catch (err) {
      console.error(err);
      showToastMsg('❌ 로그아웃에 실패했습니다.');
    }
  };

  const handleCancelPromise = (id: string) => {
    setConfirmedPromises(prev => prev.filter(p => p.id !== id));
    showToastMsg('🗑️ 밥약 약속이 취소되었습니다.');
  };

  // Create real room in DB
  const handleCreateRoomInDb = async () => {
    try {
      const response = await fetch('http://localhost:5050/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: roomTitle,
          foodCategory: foodCategory,
          hostName: verifiedEmail || '이정훈',
          hostMajor: '컴퓨터공학과',
          schedule: hostSchedule
        })
      });
      const data = await response.json();
      if (data.success) {
        setRoomSimulatingId(data.roomId);
        setIsCreatingRoom(false);
        showToastMsg('🎉 밥약 대기방이 서버에 개설되었습니다!');
      }
    } catch (err) {
      console.error(err);
      // Fallback
      setRoomSimulatingId('room-mock-123');
      setIsCreatingRoom(false);
      showToastMsg('🎉 밥약 대기방 개설 완료! (Mock Mode)');
    }
  };

  // Join Room in DB
  const handleJoinRoomInDb = async () => {
    if (!joinName) {
      showToastMsg('⚠️ 입장하실 이름을 적어주세요!');
      return;
    }
    try {
      const response = await fetch(`http://localhost:5050/api/rooms/${roomSimulatingId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: joinName,
          major: joinMajor,
          schedule: hostSchedule // Uses hostSchedule as the user's selected/synced schedule too
        })
      });
      const data = await response.json();
      if (data.success) {
        setJoinedMembers(data.room.members);
        showToastMsg('🙋 밥약 방 참여 및 시간표 제출 성공!');
      }
    } catch (err) {
      console.error(err);
      showToastMsg('🙋 밥약 방 참여 완료! (Mock Mode)');
      setJoinedMembers(prev => [...prev, { name: joinName, major: joinMajor, role: 'participant', schedule: hostSchedule }]);
    }
  };

  const handleJoinMockRoom = (roomId: string) => {
    setRoomSimulatingId(roomId);
    setSelectedRest(null);
    setSelectedRecommendedTime('');
  };

  const simulateFriendJoin = () => {
    if (joinedMembers.length >= 3) {
      showToastMsg('💡 이미 3명의 참여자가 모두 모였습니다!');
      return;
    }
    const friends: Member[] = [
      {
        name: '박진우 (시디과)',
        major: '시각디자인과 22학번',
        role: '참여자',
        schedule: { '수-3': true, '수-4': true, '화-1': true, '목-4': true, '금-6': true }
      }
    ];
    // POST request to simulate addition
    fetch(`http://localhost:5050/api/rooms/${roomSimulatingId}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: friends[0].name,
        major: friends[0].major,
        schedule: friends[0].schedule
      })
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setJoinedMembers(data.room.members);
          showToastMsg(`👥 ${friends[0].name}님이 합류했습니다!`);
        }
      })
      .catch(() => {
        setJoinedMembers(prev => [...prev, friends[0]]);
        showToastMsg(`👥 ${friends[0].name}님이 합류했습니다! (Mock Mode)`);
      });
  };

  const getOverlappingSlots = () => {
    const overlap: { day: string; slotId: number; label: string }[] = [];
    if (!joinedMembers || joinedMembers.length === 0) return [];
    DAYS.forEach(day => {
      TIME_SLOTS.forEach(slot => {
        const key = `${day}-${slot.id}`;
        const isAllFree = joinedMembers.every(member => member.schedule[key] === true);
        if (isAllFree) {
          overlap.push({ day, slotId: slot.id, label: `${day}요일 ${slot.label}` });
        }
      });
    });
    return overlap;
  };

  const handleConfirmMatch = async () => {
    if (!selectedRest) {
      showToastMsg('🍱 약속 장소로 정할 맛집을 한 곳 선택해주세요!');
      return;
    }
    try {
      const response = await fetch(`http://localhost:5050/api/rooms/${roomSimulatingId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          time: selectedRecommendedTime,
          restaurant: selectedRest
        })
      });
      const data = await response.json();
      if (data.success) {
        const newPromise: ConfirmedPromise = {
          id: data.room.id,
          title: data.room.title,
          time: data.room.confirmedTime,
          restaurant: data.room.confirmedRestaurant,
          members: data.room.members
        };
        setConfirmedPromises(prev => [...prev, newPromise]);
        showToastMsg('🤝 완벽합니다! 잇다 약속이 확정되었습니다.');
        setRoomSimulatingId(null);
        setIsCreatingRoom(false);
        setActiveTab('home');
      }
    } catch (err) {
      console.error(err);
      const newPromise: ConfirmedPromise = {
        id: roomSimulatingId || 'mock-id',
        title: roomTitle,
        time: selectedRecommendedTime,
        restaurant: selectedRest,
        members: joinedMembers
      };
      setConfirmedPromises(prev => [...prev, newPromise]);
      showToastMsg('🤝 완벽합니다! 잇다 약속이 확정되었습니다. (Mock Mode)');
      setRoomSimulatingId(null);
      setIsCreatingRoom(false);
      setActiveTab('home');
    }
  };

  const toggleScheduleTile = (day: string, slotId: number) => {
    const key = `${day}-${slotId}`;
    setHostSchedule(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const copyInvitationLink = () => {
    const shareUrl = `${window.location.origin}/?room=${roomSimulatingId}`;
    const el = document.createElement('textarea');
    el.value = shareUrl;
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    showToastMsg('🔗 실시간 초대 링크가 복사되었습니다! 다른 브라우저 탭에 붙여넣어 보세요.');
  };

  // --- Views Renders ---
  
  const renderLoginView = () => (
    <div className="flex-grow flex flex-col justify-between px-6 py-8 bg-white animate-fade-in font-sans">
      <div className="space-y-7 pt-8">
        <div className="text-center space-y-3 flex flex-col items-center">
          <div className="w-20 h-20 rounded-2xl shadow-sm overflow-hidden bg-white border border-slate-100 p-0.5">
            <img src="/logo.png" alt="Bab-Jjak Logo" className="w-full h-full object-contain rounded-xl" />
          </div>
          <div>
            <h2 className="text-[22px] font-black text-slate-900 tracking-tight">잇다 시작하기</h2>
            <p className="text-[13px] text-slate-400 mt-1">우리들만의 똑똑한 대학교 밥약 네트워킹</p>
          </div>
        </div>

        <form onSubmit={handleLoginSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-500 ml-1">이메일</label>
            <div className="relative">
              <input
                type="email"
                placeholder="yourname@domain.com"
                value={userEmail}
                onChange={(e) => setUserEmail(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3.5 pl-11 pr-4 text-[14px] focus:outline-none focus:border-orange-500 transition"
              />
              <Mail className="w-[18px] h-[18px] text-slate-400 absolute left-3.5 top-3.5" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-500 ml-1">비밀번호</label>
            <div className="relative">
              <input
                type="password"
                placeholder="비밀번호 입력"
                value={userPassword}
                onChange={(e) => setUserPassword(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3.5 pl-11 pr-4 text-[14px] focus:outline-none focus:border-orange-500 transition"
              />
              <Lock className="w-[18px] h-[18px] text-slate-400 absolute left-3.5 top-3.5" />
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-3.5 bg-gradient-to-r from-orange-500 to-rose-500 text-white rounded-xl text-[14px] font-bold shadow-lg shadow-orange-500/10 active:opacity-90 transition"
          >
            로그인
          </button>
        </form>

        <div className="relative flex py-1 items-center">
          <div className="flex-grow border-t border-slate-200"></div>
          <span className="flex-shrink mx-3 text-slate-400 text-[11px]">또는</span>
          <div className="flex-grow border-t border-slate-200"></div>
        </div>

        <button
          type="button"
          onClick={handleGoogleLogin}
          className="w-full py-3.5 bg-white border border-slate-200 rounded-xl text-[14px] font-bold text-slate-700 flex items-center justify-center space-x-2.5 active:bg-slate-50 transition"
        >
          <img src="https://www.google.com/favicon.ico" alt="G" className="w-5 h-5 object-contain" />
          <span>Google 계정으로 로그인</span>
        </button>
      </div>

      <div className="text-center space-y-3 pt-4">
        <button
          onClick={() => setIsSignUpMode(true)}
          className="text-[13px] text-slate-500"
        >
          계정이 없으신가요? <span className="text-orange-500 font-bold">회원가입</span>
        </button>
        <p className="text-[11px] text-slate-400 underline cursor-pointer">이용약관 및 개인정보처리방침</p>
      </div>
    </div>
  );

  const renderSignUpView = () => (
    <div className="flex-grow flex flex-col justify-between px-6 py-8 bg-white animate-fade-in font-sans">
      <div className="space-y-6">
        <div className="flex items-center space-x-2">
          <button onClick={() => setIsSignUpMode(false)} className="p-2 -ml-2 active:bg-slate-100 rounded-full text-slate-500">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="text-[15px] font-bold text-slate-700">회원가입</span>
        </div>

        <div className="text-center space-y-2 flex flex-col items-center">
          <div className="w-16 h-16 rounded-2xl shadow-sm overflow-hidden bg-white border border-slate-100 p-0.5">
            <img src="/logo.png" alt="Bab-Jjak Logo" className="w-full h-full object-contain rounded-xl" />
          </div>
          <h2 className="text-[20px] font-black text-slate-900">새 계정 만들기</h2>
          <p className="text-[13px] text-slate-400">잇다에서 밥약 친구를 만나보세요!</p>
        </div>

        <form onSubmit={(e) => {
          e.preventDefault();
          if (!signUpEmail || !signUpPassword || !signUpPasswordConfirm) {
            showToastMsg('모든 항목을 입력해주세요.');
            return;
          }
          if (signUpPassword !== signUpPasswordConfirm) {
            showToastMsg('비밀번호가 일치하지 않습니다.');
            return;
          }
          if (signUpPassword.length < 6) {
            showToastMsg('비밀번호는 6자 이상이어야 합니다.');
            return;
          }
          setUserEmail(signUpEmail);
          setUserPassword(signUpPassword);
          setIsSignUpMode(false);
          setCurrentStep(2);
          showToastMsg('이메일 인증을 완료해주세요.');
        }} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-500 ml-1">이메일</label>
            <div className="relative">
              <input
                type="email"
                placeholder="yourname@university.ac.kr"
                value={signUpEmail}
                onChange={(e) => setSignUpEmail(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3.5 pl-11 pr-4 text-[14px] focus:outline-none focus:border-orange-500 transition"
              />
              <Mail className="w-[18px] h-[18px] text-slate-400 absolute left-3.5 top-3.5" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-500 ml-1">비밀번호</label>
            <div className="relative">
              <input
                type="password"
                placeholder="6자 이상 입력"
                value={signUpPassword}
                onChange={(e) => setSignUpPassword(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3.5 pl-11 pr-4 text-[14px] focus:outline-none focus:border-orange-500 transition"
              />
              <Lock className="w-[18px] h-[18px] text-slate-400 absolute left-3.5 top-3.5" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-slate-500 ml-1">비밀번호 확인</label>
            <div className="relative">
              <input
                type="password"
                placeholder="비밀번호 다시 입력"
                value={signUpPasswordConfirm}
                onChange={(e) => setSignUpPasswordConfirm(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3.5 pl-11 pr-4 text-[14px] focus:outline-none focus:border-orange-500 transition"
              />
              <Lock className="w-[18px] h-[18px] text-slate-400 absolute left-3.5 top-3.5" />
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-3.5 bg-gradient-to-r from-orange-500 to-rose-500 text-white rounded-xl text-[14px] font-bold shadow-lg shadow-orange-500/10 active:opacity-90 transition"
          >
            회원가입
          </button>
        </form>
      </div>

      <div className="text-center pt-4">
        <button
          onClick={() => setIsSignUpMode(false)}
          className="text-[13px] text-slate-500"
        >
          이미 계정이 있으신가요? <span className="text-orange-500 font-bold">로그인</span>
        </button>
      </div>
    </div>
  );

  const renderVerificationView = () => (
    <div className="flex-grow flex flex-col justify-between px-6 py-8 bg-white animate-fade-in font-sans">
      <div className="space-y-6">
        <div className="flex items-center space-x-2">
          <button onClick={() => setCurrentStep(1)} className="p-2 -ml-2 active:bg-slate-100 rounded-full text-slate-500">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="text-[15px] font-bold text-slate-700">이메일 인증</span>
        </div>

        <div className="space-y-2">
          <h3 className="text-[20px] font-black text-slate-900 leading-tight">
            이메일을 확인해 주세요
          </h3>
          <p className="text-[13px] text-slate-500 leading-relaxed">
            입력하신 메일로 4자리 인증 코드를 보내드립니다.
          </p>
        </div>

        <div className="space-y-4">
          <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl flex items-center justify-between">
            <div className="truncate pr-2">
              <p className="text-[11px] text-slate-400">요청 메일 주소</p>
              <p className="text-[14px] font-bold text-slate-800 truncate">{userEmail}</p>
            </div>
            <button
              onClick={handleSendCode}
              disabled={isSendingCode}
              className="px-4 py-2 bg-orange-500 text-white text-[13px] font-bold rounded-xl active:bg-orange-600 transition shrink-0 disabled:opacity-50"
            >
              {isSendingCode ? '발송 중...' : verificationSent ? '재발송' : '코드 발송'}
            </button>
          </div>

          {verificationSent && (
            <div className="space-y-3 animate-fade-in">
              <label className="text-[11px] font-bold text-slate-500 ml-1">인증 코드 4자리</label>
              <div className="flex space-x-2">
                <input
                  type="text"
                  placeholder="0000"
                  maxLength={4}
                  value={inputCode}
                  onChange={(e) => setInputCode(e.target.value)}
                  className="flex-grow bg-slate-50 border border-slate-200 rounded-xl py-3.5 px-4 text-[18px] font-bold text-center tracking-[0.3em] focus:outline-none focus:border-orange-500"
                />
                <button
                  onClick={handleVerifyCode}
                  disabled={isVerifyingCode}
                  className="px-5 bg-slate-900 text-white text-[14px] font-bold rounded-xl active:bg-slate-800 transition disabled:opacity-50"
                >
                  {isVerifyingCode ? '...' : '확인'}
                </button>
              </div>
              <div className="p-3.5 bg-amber-50 border border-amber-200/50 rounded-xl text-[12px] text-amber-700 leading-relaxed">
                이메일로 발송된 인증 코드를 입력해주세요. 코드는 5분간 유효합니다.
              </div>
            </div>
          )}
        </div>
      </div>

      <button
        onClick={handleLogout}
        className="w-full py-3.5 border border-slate-200 text-slate-500 text-[14px] font-bold rounded-xl active:bg-slate-50 transition"
      >
        돌아가기
      </button>
    </div>
  );

  const renderHomeTab = () => (
    <div className="px-5 py-6 space-y-5 bg-white animate-fade-in font-sans">
      <div className="flex justify-between items-center">
        <h2 className="text-[22px] font-black text-transparent bg-clip-text bg-gradient-to-r from-orange-500 to-rose-500">잇다</h2>
        <span className="text-[11px] bg-slate-100 text-slate-600 px-3 py-1.5 rounded-full font-medium max-w-[160px] truncate">{verifiedEmail || 'Guest'}</span>
      </div>

      <div className="space-y-2.5">
        <h4 className="text-[12px] font-bold text-slate-500">오늘의 일정</h4>
        
        {confirmedPromises.length === 0 ? (
          <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 text-center space-y-2">
            <span className="text-3xl block">🍚</span>
            <p className="text-[13px] text-slate-500 font-medium">예정된 약속이 없습니다</p>
            <p className="text-[12px] text-slate-400">새로운 모임을 만들거나 주변 약속에 합류해 보세요!</p>
          </div>
        ) : (
          <div className="bg-gradient-to-b from-orange-500 to-rose-500 text-white p-5 rounded-3xl text-left space-y-4 shadow-lg relative overflow-hidden">
            <div className="absolute right-[-10px] bottom-[-10px] opacity-10 text-8xl">🎫</div>
            <div className="flex justify-between items-start">
              <div>
                <p className="text-[8px] uppercase tracking-wider text-white/80 font-bold">Upcoming Promise</p>
                <h4 className="text-sm font-black mt-0.5">{confirmedPromises[0].title}</h4>
              </div>
              <button 
                onClick={() => handleCancelPromise(confirmedPromises[0].id)}
                className="px-2 py-1 bg-white/20 hover:bg-white/30 text-[9px] font-bold rounded-lg border border-white/20"
              >
                취소하기
              </button>
            </div>
            
            <div className="space-y-2 text-xs">
              <div className="flex items-center space-x-2">
                <Clock className="w-3.5 h-3.5 text-white/80" />
                <div>
                  <p className="text-[8px] text-white/70">확정 일자 및 시간</p>
                  <p className="font-extrabold text-[10px]">{confirmedPromises[0].time}</p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <MapPin className="w-3.5 h-3.5 text-white/80" />
                <div>
                  <p className="text-[8px] text-white/70">장소</p>
                  <p className="font-extrabold text-[10px]">{confirmedPromises[0].restaurant?.name} ({confirmedPromises[0].restaurant?.distance})</p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Users className="w-3.5 h-3.5 text-white/80" />
                <div>
                  <p className="text-[8px] text-white/70">참여 인원</p>
                  <p className="font-extrabold text-[10px]">{confirmedPromises[0].members.length}명 ({confirmedPromises[0].members.map(m => m.name.split(' ')[0]).join(', ')})</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Button to Create Room */}
      <button
        onClick={() => {
          setIsCreatingRoom(true);
          setWizardStep(1);
          setRoomTitle('');
          setSelectedRest(null);
          setSelectedRecommendedTime('');
        }}
        className="w-full py-4 bg-slate-900 text-white rounded-2xl text-[14px] font-bold shadow-md flex items-center justify-center space-x-2 active:bg-slate-800 transition"
      >
        <Plus className="w-5 h-5 text-orange-400" />
        <span>새로운 밥약 방 만들기</span>
      </button>

      <div className="space-y-2.5">
        <h4 className="text-[12px] font-bold text-slate-500">내 주변 모집 중</h4>
        
        <div className="space-y-2">
          <div className="p-4 bg-white border border-slate-200 rounded-2xl flex justify-between items-center active:bg-slate-50 transition">
            <div className="space-y-1.5 pr-3 flex-1 min-w-0">
              <span className="text-[11px] bg-orange-100 text-orange-600 px-2 py-0.5 rounded-md font-bold">마라탕/중식</span>
              <h5 className="text-[13px] font-bold text-slate-900 truncate">[후배] 꿔바로우 먹으러 가실 분!</h5>
              <p className="text-[11px] text-slate-500 flex items-center">
                <MapPin className="w-3.5 h-3.5 mr-1" /> 정문 도보 3분 · 2/4명
              </p>
            </div>
            <button
              onClick={() => handleJoinMockRoom('room1')}
              className="px-4 py-2.5 bg-orange-500 active:bg-orange-600 text-white text-[13px] font-bold rounded-xl transition shrink-0"
            >
              참여
            </button>
          </div>

          <div className="p-4 bg-white border border-slate-200 rounded-2xl flex justify-between items-center active:bg-slate-50 transition">
            <div className="space-y-1.5 pr-3 flex-1 min-w-0">
              <span className="text-[11px] bg-rose-100 text-rose-600 px-2 py-0.5 rounded-md font-bold">파스타/양식</span>
              <h5 className="text-[13px] font-bold text-slate-900 truncate">[선배] 경영학 전공 팁 & 파스타</h5>
              <p className="text-[11px] text-slate-500 flex items-center">
                <MapPin className="w-3.5 h-3.5 mr-1" /> 동문 도보 7분 · 1/2명
              </p>
            </div>
            <button
              onClick={() => handleJoinMockRoom('room2')}
              className="px-4 py-2.5 bg-orange-500 active:bg-orange-600 text-white text-[13px] font-bold rounded-xl transition shrink-0"
            >
              참여
            </button>
          </div>
        </div>
      </div>

      {/* 3. Confirmed Promises List */}
      {confirmedPromises.length > 0 && (
        <div className="space-y-2.5 pt-2">
          <h4 className="text-[11px] font-extrabold text-slate-400 uppercase tracking-wider">확정된 전체 밥약 리스트 ({confirmedPromises.length})</h4>
          <div className="space-y-2">
            {confirmedPromises.map((promise) => (
              <div key={promise.id} className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl flex justify-between items-center shadow-2xs">
                <div>
                  <h5 className="text-xs font-extrabold text-slate-900">{promise.title}</h5>
                  <p className="text-[10px] text-orange-600 font-extrabold">{promise.time}</p>
                  <p className="text-[9px] text-slate-500">식당: {promise.restaurant?.name || '추후 선정'} • 인원: {promise.members.length}명</p>
                </div>
                <button
                  onClick={() => handleCancelPromise(promise.id)}
                  className="px-2.5 py-1.5 bg-rose-50 text-rose-600 border border-rose-200 text-[9px] font-extrabold rounded-lg hover:bg-rose-100"
                >
                  취소
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const renderSyncTab = () => (
    <div className="p-5 space-y-5 bg-white animate-fade-in font-sans">
      <div className="space-y-1">
        <h3 className="text-xl font-black text-slate-900">시간표 & 일정 연동</h3>
        <p className="text-xs text-slate-500">내 캘린더나 에타 시간표를 연동해 자동으로 공강을 추출합니다.</p>
      </div>

      {/* Google Calendar Sync */}
      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col justify-between">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-bold text-slate-800 flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 bg-blue-500 rounded-full inline-block"></span>
            <span>Google Calendar 연동</span>
          </h4>
          {isGoogleSynced && (
            <div className="flex items-center space-x-1.5">
              <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">연동됨</span>
              <button onClick={handleGoogleLogin} className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold active:bg-blue-200">재동기화</button>
            </div>
          )}
        </div>
        {!isGoogleSynced && (
          <button
            onClick={handleGoogleLogin}
            className="w-full mt-1 py-2.5 bg-white border border-slate-200 active:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl flex items-center justify-center space-x-2 transition-all"
          >
            <img src="https://www.google.com/favicon.ico" alt="G" className="w-3.5 h-3.5" />
            <span>구글 계정으로 연동하기</span>
          </button>
        )}
      </div>

      {/* Apple Calendar iCal Sync */}
      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col justify-between">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-bold text-slate-800 flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 bg-indigo-500 rounded-full inline-block"></span>
            <span>iCloud 캘린더 연동</span>
          </h4>
          {isIcalSynced && (
            <div className="flex items-center space-x-1.5">
              <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">연동됨</span>
              <button onClick={() => { setIsIcalSynced(false); }} className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-bold active:bg-indigo-200">재동기화</button>
            </div>
          )}
        </div>
        {!isIcalSynced && (
          <div className="space-y-2 mt-1">
            <input
              type="email"
              placeholder="Apple ID (이메일)"
              value={appleId}
              onChange={(e) => setAppleId(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-[10px] focus:outline-none focus:border-indigo-500 transition-colors"
            />
            <input
              type="password"
              placeholder="앱 암호 (예: xxxx-xxxx-xxxx-xxxx)"
              value={appPassword}
              onChange={(e) => setAppPassword(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-[10px] focus:outline-none focus:border-indigo-500 transition-colors"
            />
            <p className="text-[9px] text-slate-400 leading-tight">Apple ID → 로그인 및 보안 → 앱 암호에서 생성</p>
            <button
              onClick={handleIcalSync}
              className="w-full py-2.5 bg-indigo-500 text-white text-xs font-bold rounded-xl active:bg-indigo-600 transition-colors"
            >
              iCloud 연동하기
            </button>
          </div>
        )}
      </div>

      {/* Everytime Sync */}
      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex flex-col justify-between">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-bold text-slate-800 flex items-center space-x-1.5">
            <span className="w-2.5 h-2.5 bg-rose-500 rounded-full inline-block"></span>
            <span>에브리타임 시간표 연동</span>
          </h4>
          {isEverytimeSynced && (
            <div className="flex items-center space-x-1.5">
              <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">연동됨</span>
              <button onClick={() => { setIsEverytimeSynced(false); }} className="text-[10px] bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full font-bold active:bg-rose-200">재동기화</button>
            </div>
          )}
        </div>
        {!isEverytimeSynced && (
          <div className="space-y-2 mt-1">
            <input 
              type="text" 
              placeholder="시간표 공유 URL (https://everytime.kr/@...)"
              value={everytimeUrl}
              onChange={(e) => setEverytimeUrl(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-[10px] focus:outline-none focus:border-rose-500 transition-colors"
            />
            <button 
              onClick={handleEverytimeSync}
              className="w-full py-2.5 bg-rose-500 text-white text-xs font-bold rounded-xl hover:bg-rose-600 transition-colors"
            >
              에브리타임 연동하기
            </button>
          </div>
        )}
      </div>

      {isSyncing && (
        <p className="text-[10px] text-orange-500 font-bold animate-pulse text-center">⏳ 스케줄 정보를 안전하게 불러오는 중입니다...</p>
      )}
    </div>
  );

  const renderMyPageTab = () => (
    <div className="p-5 space-y-5 bg-white animate-fade-in font-sans">
      <div className="space-y-1">
        <h3 className="text-xl font-black text-slate-900">마이페이지</h3>
        <p className="text-xs text-slate-500">내 잇다 매너 점수와 서비스 설정을 관리합니다.</p>
      </div>

      {userProfile && (
        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center space-x-4">
          <img src={userProfile.avatarUrl} alt="avatar" className="w-16 h-16 rounded-full border-2 border-orange-500 bg-white" />
          <div>
            <h4 className="text-sm font-black text-slate-900">{verifiedEmail.split('@')[0]}</h4>
            <p className="text-[10px] text-slate-500 font-bold mt-0.5">{userProfile.major} • {userProfile.year}</p>
            <span className="inline-block mt-1.5 text-[9px] bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full font-bold border border-orange-200">
              {userProfile.mbti}
            </span>
          </div>
        </div>
      )}

      {/* 1. Manner Thermometer */}
      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
        <div className="flex justify-between items-center">
          <h4 className="text-xs font-extrabold text-slate-700 flex items-center">
            <Thermometer className="w-4 h-4 mr-1 text-orange-500" />
            잇다 매너 온도
          </h4>
          <span className="text-sm font-black text-orange-600">{temperature}°C</span>
        </div>
        
        <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
          <div 
            className="bg-gradient-to-r from-orange-400 to-rose-500 h-full rounded-full transition-all duration-500"
            style={{ width: `${(temperature / 100) * 100}%` }}
          ></div>
        </div>
        
        <p className="text-[9px] text-slate-400">
          첫 가입 온도는 36.5°C 입니다. 성사된 밥약 시간 준수, 따뜻한 피드백을 통해 매너 온도를 올려보세요!
        </p>

        <div className="pt-2 flex justify-between items-center border-t border-slate-200/50">
          <span className="text-[9px] text-slate-400 font-bold">[테스트용] 매너 피드백 시뮬레이션:</span>
          <div className="flex space-x-1">
            <button 
              onClick={() => setTemperature(prev => Math.min(100, Number((prev + 1.2).toFixed(1))))}
              className="px-2 py-0.5 bg-orange-100 text-orange-600 rounded text-[9px] font-bold"
            >
              + 칭찬받기
            </button>
            <button 
              onClick={() => setTemperature(prev => Math.max(0, Number((prev - 2.5).toFixed(1))))}
              className="px-2 py-0.5 bg-slate-200 text-slate-600 rounded text-[9px] font-bold"
            >
              - 지각/불참
            </button>
          </div>
        </div>
      </div>

      {/* 2. Notification Configuration */}
      <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-3">
        <h4 className="text-xs font-bold text-slate-800 flex items-center space-x-1.5">
          <Bell className="w-4 h-4 text-orange-500" />
          <span>맞춤 푸시 알림 설정</span>
        </h4>
        <div className="space-y-2 text-xs">
          <div className="flex justify-between items-center">
            <span className="text-slate-600 font-medium">선호 메뉴 밥약 개설 시 알림</span>
            <input type="checkbox" defaultChecked className="w-4 h-4 accent-orange-500 cursor-pointer" />
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-600 font-medium">공강 겹치는 밥약방 추천 알림</span>
            <input type="checkbox" defaultChecked className="w-4 h-4 accent-orange-500 cursor-pointer" />
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-600 font-medium">실시간 그룹 매칭 성사 알림</span>
            <input type="checkbox" defaultChecked className="w-4 h-4 accent-orange-500 cursor-pointer" />
          </div>
        </div>
      </div>

      <button 
        onClick={() => {
          setIsVerified(false);
          setCurrentStep(1);
          setVerifiedEmail('');
          setUserEmail('');
          setUserPassword('');
        }}
        className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold rounded-xl transition"
      >
        로그아웃
      </button>
    </div>
  );

  // 3. Creation Overlay Wizard Views
  const renderCreationWizard = () => (
    <div className="flex-grow flex flex-col justify-between overflow-y-auto p-5 bg-white animate-fade-in font-sans">
      <div className="space-y-4">
        {/* Wizard Header */}
        <div className="flex justify-between items-center border-b border-slate-100 pb-2">
          <div className="flex items-center space-x-1">
            <button 
              onClick={() => {
                if (wizardStep > 1) setWizardStep(prev => prev - 1);
                else setIsCreatingRoom(false);
              }}
              className="p-1.5 hover:bg-slate-100 rounded-full text-slate-500"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-bold text-slate-700">새 밥약 개설 ({wizardStep}/3)</span>
          </div>
          <button onClick={() => setIsCreatingRoom(false)} className="p-1 hover:bg-slate-100 rounded-full text-slate-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* WIZARD STEP 1: Specs and timetable selection */}
        {wizardStep === 1 && (
          <div className="space-y-4">
            <div className="space-y-1">
              <h3 className="text-base font-extrabold text-slate-900">1단계: 방 기획 및 내 공강 입력</h3>
              <p className="text-[10px] text-slate-500">방 제목과 선호 카테고리를 고르고 비는 시간표를 선택하세요.</p>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] font-extrabold text-slate-400">밥약 방 제목</label>
                <input 
                  type="text" 
                  placeholder="예: 같이 점심에 스시 조질 사람 구함"
                  value={roomTitle}
                  onChange={(e) => setRoomTitle(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 px-3.5 text-xs focus:outline-none focus:border-orange-500 transition"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-extrabold text-slate-400">음식 분류</label>
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

              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-extrabold text-slate-400">약속 가능 공강 시간대 (동기화 결과 수동 보정)</label>
                  <span className="text-[9px] text-orange-500 font-bold">터치하여 해제/지정</span>
                </div>
                
                <div className="bg-white p-2 rounded-2xl border border-slate-200 space-y-1 shadow-sm">
                  <div className="grid grid-cols-6 text-center text-[10px] font-bold text-slate-500 border-b border-slate-200 pb-1 bg-slate-50 rounded-t-xl py-1">
                    <span className="text-slate-400">교시</span>
                    {DAYS.map((d, i) => <span key={i} className="text-slate-700">{d}</span>)}
                  </div>

                  <div className="divide-y divide-slate-100">
                    {TIME_SLOTS.map((slot) => (
                      <div key={slot.id} className="grid grid-cols-6 items-center text-center py-0.5">
                        <span className="text-[7.5px] font-extrabold text-slate-400 leading-tight">
                          {slot.id}교시<br/>
                          <span className="text-[6.5px] font-normal text-slate-400">{slot.label.split(' ')[0]}</span>
                        </span>
                        {DAYS.map((day, dIdx) => {
                          const key = `${day}-${slot.id}`;
                          const isSelected = hostSchedule[key] === true;
                          return (
                            <button
                              key={dIdx}
                              type="button"
                              onClick={() => toggleScheduleTile(day, slot.id)}
                              className={`h-7 m-0.5 rounded-md text-[8.5px] font-bold transition-all border ${
                                isSelected 
                                  ? 'bg-rose-50/80 text-rose-600 border-rose-200/60 shadow-2xs font-extrabold' 
                                  : 'bg-slate-50/30 text-transparent hover:bg-slate-100 border-slate-100 hover:border-slate-200'
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

            <button 
              onClick={() => {
                if (!roomTitle) {
                  showToastMsg('⚠️ 밥약 방 제목을 입력해 주세요.');
                  return;
                }
                const freeSlotsCount = Object.values(hostSchedule).filter(Boolean).length;
                if (freeSlotsCount === 0) {
                  showToastMsg('⚠️ 약속 가능 시간대를 최소 하나 이상 체크해 주세요.');
                  return;
                }
                handleCreateRoomInDb();
              }}
              className="w-full py-3 bg-gradient-to-r from-orange-500 to-rose-500 text-white rounded-xl text-xs font-black shadow-md"
            >
              약속 방 개설하고 친구 초대하기 🚀
            </button>
          </div>
        )}
      </div>
    </div>
  );

  // 4. Joined Room Simulation View
  const renderRoomSimulation = () => {
    // Check if current user is already a member
    const isCurrentUserJoined = joinedMembers.some(
      m => m.name === (verifiedEmail || 'Guest') || m.name === joinName
    );

    return (
      <div className="flex-grow flex flex-col justify-between overflow-y-auto p-5 bg-white animate-fade-in font-sans">
        <div className="space-y-4">
          {/* Header */}
          <div className="flex justify-between items-center border-b border-slate-100 pb-2">
            <div className="flex items-center space-x-1">
              <button 
                onClick={() => setRoomSimulatingId(null)}
                className="p-1.5 hover:bg-slate-100 rounded-full text-slate-500"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-bold text-slate-700">밥약 조율방 ({roomTitle})</span>
            </div>
            <button onClick={() => setRoomSimulatingId(null)} className="p-1 hover:bg-slate-100 rounded-full text-slate-400">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Invitation Copy Area */}
          <div className="p-3.5 bg-orange-50/50 rounded-2xl border border-orange-100/70 space-y-2">
            <p className="text-[10px] text-slate-600 font-extrabold leading-normal">
              📢 실시간 초대 링크를 공유해 친구들을 방에 초대하세요!
            </p>
            <div className="flex items-center justify-between bg-white rounded-xl p-2 border border-orange-100">
              <span className="text-[9px] text-slate-400 truncate pr-2">
                {window.location.origin}/?room={roomSimulatingId}
              </span>
              <button 
                onClick={copyInvitationLink}
                className="p-1.5 bg-orange-500 text-white rounded-lg flex items-center justify-center shrink-0 hover:bg-orange-600"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* If NOT joined as participant yet, prompt join form */}
          {!isCurrentUserJoined ? (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-3.5 animate-fade-in">
              <div className="space-y-1">
                <h4 className="text-xs font-extrabold text-slate-800">이 밥약방에 참여하기</h4>
                <p className="text-[10px] text-slate-500">시간표를 제출하기 위해 이름과 학과를 작성해 주세요.</p>
              </div>

              <div className="space-y-2">
                <input 
                  type="text" 
                  placeholder="본인 실명 입력" 
                  value={joinName}
                  onChange={(e) => setJoinName(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-orange-500"
                />
                <input 
                  type="text" 
                  placeholder="소속 학과 입력" 
                  value={joinMajor}
                  onChange={(e) => setJoinMajor(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl p-2.5 text-xs focus:outline-none focus:border-orange-500"
                />
              </div>

              {/* mini guide to sync timetable */}
              <p className="text-[9px] text-slate-400">
                💡 <strong>팁:</strong> 연동(Sync) 탭에서 캘린더나 에타 시간표를 먼저 동기화한 뒤 들어오시면, 가져온 공강 정보로 바로 합류가 가능합니다!
              </p>

              <button
                onClick={handleJoinRoomInDb}
                className="w-full py-2.5 bg-orange-500 text-white text-xs font-extrabold rounded-xl"
              >
                시간표 제출 및 대기방 합류
              </button>
            </div>
          ) : (
            <div className="space-y-3.5">
              {/* List of joined users */}
              <div className="space-y-2">
                <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">현재 방 참가 인원</h4>
                <div className="space-y-1.5">
                  {joinedMembers.map((member, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-slate-50 px-3 py-2 rounded-xl border border-slate-100 animate-fade-in">
                      <div className="flex items-center space-x-2">
                        <div className="w-6 h-6 bg-orange-500 text-white rounded-full flex items-center justify-center text-[10px] font-extrabold">
                          {member.name.charAt(0)}
                        </div>
                        <div>
                          <p className="text-[10px] font-extrabold text-slate-800">{member.name} ({member.major.split(' ')[0]})</p>
                          <p className="text-[8px] text-slate-400">{member.role === 'host' ? '방장' : '참여자'}</p>
                        </div>
                      </div>
                      <span className="text-[9px] bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-md font-bold">동기화됨</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Simulator Button */}
              <button 
                onClick={simulateFriendJoin}
                className="w-full py-2 bg-slate-900 text-white text-[10px] font-extrabold rounded-xl hover:bg-slate-800 transition flex items-center justify-center space-x-1"
              >
                <Users className="w-3.5 h-3.5 text-orange-400" />
                <span>[시뮬레이터] 다른 가상 친구 입장시키기 (인원 추가)</span>
              </button>

              {/* Overlapping Slots */}
              <div className="space-y-2">
                <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">🗓️ 겹치는 공통 시간대 선택</h4>
                {getOverlappingSlots().length === 0 ? (
                  <div className="p-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-center text-[10px] text-slate-400">
                    겹치는 시간대를 계산하고 있습니다. 다른 참가자가 합류하면 갱신됩니다!
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-[140px] overflow-y-auto">
                    {getOverlappingSlots().map((slot, i) => {
                      const isSelected = selectedRecommendedTime === slot.label;
                      return (
                        <button
                          key={i}
                          onClick={() => setSelectedRecommendedTime(slot.label)}
                          className={`w-full p-2.5 rounded-xl border text-[10px] font-bold text-left flex items-center justify-between transition ${
                            isSelected 
                              ? 'bg-orange-500 text-white border-orange-600 shadow-md' 
                              : 'bg-white text-slate-700 border-slate-100 hover:border-slate-200'
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

              {/* Gemini AI Recommendation Box in Simulation */}
              {selectedRecommendedTime && (
                <div className="p-4 bg-gradient-to-tr from-amber-50/70 to-orange-50/70 border border-amber-200/50 rounded-2xl space-y-2">
                  <div className="flex items-center space-x-1 text-orange-600 font-extrabold text-[10.5px]">
                    <Sparkles className="w-3.5 h-3.5 fill-orange-500 text-orange-500 animate-pulse" />
                    <span>Gemini AI 지능형 맛집 페어링 추천</span>
                  </div>
                  {isAiLoading ? (
                    <div className="flex items-center space-x-2 py-1 text-[9.5px] text-slate-500">
                      <Loader2 className="w-3 h-3 animate-spin text-orange-500" />
                      <span>추천 메뉴 큐레이팅 중...</span>
                    </div>
                  ) : (
                    <div className="space-y-1.5 animate-fade-in">
                      <p className="text-[10px] text-slate-700 leading-relaxed font-medium">
                        "{aiRecommendation}"
                      </p>
                      {aiRecommendedMenu && (
                        <span className="inline-block bg-orange-100 text-orange-700 font-extrabold text-[8.5px] px-2 py-0.5 rounded-md">
                          메뉴: {aiRecommendedMenu}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Restaurant Select */}
              {selectedRecommendedTime && (
                <div className="space-y-3 animate-fade-in">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="맛집 이름, 메뉴, 카테고리 검색"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2.5 pl-9 pr-3 text-xs focus:outline-none focus:border-orange-500 transition"
                    />
                    <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2.5" />
                  </div>

                  <div className="flex justify-between items-center">
                    <h4 className="text-xs font-bold text-slate-700">
                      내 주변 3km 맛집 {isSearchingRest && <span className="text-orange-500 animate-pulse ml-1">검색 중...</span>}
                    </h4>
                    <select
                      value={sortOption}
                      onChange={(e) => setSortOption(e.target.value)}
                      className="bg-white border border-slate-200 text-slate-500 text-[10px] rounded-lg px-2 py-1 focus:outline-none"
                    >
                      <option value="random">추천순</option>
                      <option value="comment">리뷰순</option>
                      <option value="distance">거리순</option>
                    </select>
                  </div>

                  <div className="space-y-2 max-h-[280px] overflow-y-auto">
                    {(() => {
                      const grouped: Record<string, Restaurant[]> = {};
                      searchedRestList.forEach(rest => {
                        const cat = rest.category || '기타';
                        if (!grouped[cat]) grouped[cat] = [];
                        grouped[cat].push(rest);
                      });
                      return Object.entries(grouped).map(([cat, items]) => (
                        <div key={cat} className="space-y-1.5">
                          <div className="flex items-center space-x-1.5 px-1">
                            <span className="text-sm">{items[0]?.emoji}</span>
                            <span className="text-[11px] font-bold text-slate-500">{cat}</span>
                            <span className="text-[10px] text-slate-400">({items.length})</span>
                          </div>
                          {items.map((rest) => {
                            const isSelected = selectedRest?.id === rest.id;
                            return (
                              <div
                                key={rest.id}
                                onClick={() => setSelectedRest(rest)}
                                className={`p-3 rounded-xl border cursor-pointer transition ${
                                  isSelected
                                    ? 'bg-orange-50 border-orange-400 shadow-sm'
                                    : 'bg-white border-slate-100 active:bg-slate-50'
                                }`}
                              >
                                <div className="flex justify-between items-start">
                                  <div className="space-y-0.5">
                                    <h4 className="text-xs font-bold text-slate-900">{rest.name}</h4>
                                    <p className="text-[11px] text-slate-500">{rest.distance}</p>
                                  </div>
                                  <div className="text-right shrink-0 ml-2">
                                    <span className="text-[11px] text-orange-600 font-bold">{rest.menu}</span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ));
                    })()}
                  </div>
                </div>
              )}

              <button 
                onClick={handleConfirmMatch}
                disabled={!selectedRecommendedTime || !selectedRest}
                className={`w-full py-3 text-white rounded-xl text-xs font-black shadow-md ${
                  selectedRecommendedTime && selectedRest
                    ? 'bg-gradient-to-r from-orange-500 to-rose-500 shadow-orange-500/10'
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                잇다 약속 최종 확정 및 합류하기 🤝
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  const handleOnboardingComplete = () => {
    if (!onboardingMajor.trim()) {
      showToastMsg('⚠️ 학과를 입력해 주세요!');
      return;
    }
    const AVATARS = [
      'https://api.dicebear.com/9.x/micah/svg?seed=Felix',
      'https://api.dicebear.com/9.x/micah/svg?seed=Aneka',
      'https://api.dicebear.com/9.x/micah/svg?seed=Leo',
      'https://api.dicebear.com/9.x/micah/svg?seed=Mia',
      'https://api.dicebear.com/9.x/micah/svg?seed=Oscar'
    ];
    const randomAvatar = AVATARS[Math.floor(Math.random() * AVATARS.length)];
    setUserProfile({
      mbti: onboardingMbti,
      major: onboardingMajor,
      year: onboardingYear,
      avatarUrl: randomAvatar
    });
    setIsOnboarding(false);
    showToastMsg('🎉 프로필 설정이 완료되었습니다!');
  };

  const renderOnboardingView = () => (
    <div className="flex-grow bg-white animate-fade-in font-sans relative overflow-hidden flex flex-col">
      <div className="flex-grow overflow-y-auto px-6 pt-10 pb-32 space-y-8">
        <div className="text-center space-y-3 flex flex-col items-center">
          <div className="w-24 h-24 rounded-3xl shadow-sm overflow-hidden bg-white mb-2 border border-slate-100 p-0.5">
            <img src="/logo.png" alt="Eat-da Logo" className="w-full h-full object-contain rounded-2xl" />
          </div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">잇다에 오신 것을 환영해요! 🎉</h2>
          <p className="text-xs text-slate-400">나와 딱 맞는 잇다를 찾기 위해 프로필을 완성해 볼까요?</p>
        </div>

        <div className="space-y-5 pt-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-extrabold text-slate-400 uppercase ml-1">대학교 이름을 알려주세요! 🎓</label>
            <input 
              type="text" 
              placeholder="예: 한국대학교"
              value={onboardingUniversity}
              onChange={(e) => setOnboardingUniversity(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3.5 px-4 text-xs focus:outline-none focus:border-orange-500 transition"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-extrabold text-slate-400 uppercase ml-1">어느 학과에 재학 중이신가요? 🏫</label>
            <input 
              type="text" 
              placeholder="예: 컴퓨터공학과"
              value={onboardingMajor}
              onChange={(e) => setOnboardingMajor(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3.5 px-4 text-xs focus:outline-none focus:border-orange-500 transition"
            />
          </div>

          <div className="flex space-x-3">
            <div className="space-y-1.5 w-1/2">
              <label className="text-[10px] font-extrabold text-slate-400 uppercase ml-1">지금 몇 학년이세요? 📚</label>
              <select 
                value={onboardingYear} 
                onChange={(e) => setOnboardingYear(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3.5 px-4 text-xs font-medium text-slate-700 focus:outline-none focus:border-orange-500 transition"
              >
                <option>새내기 (1학년)</option>
                <option>2학년</option>
                <option>3학년</option>
                <option>4학년 이상</option>
                <option>대학원생</option>
                <option>졸업생/기타</option>
              </select>
            </div>
            
            <div className="space-y-1.5 w-1/2">
              <label className="text-[10px] font-extrabold text-slate-400 uppercase ml-1">나의 MBTI는? 🧩</label>
              <select 
                value={onboardingMbti} 
                onChange={(e) => setOnboardingMbti(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3.5 px-4 text-xs font-medium text-slate-700 focus:outline-none focus:border-orange-500 transition"
              >
                <option>ENFP</option><option>ENFJ</option><option>ENTP</option><option>ENTJ</option>
                <option>ESFP</option><option>ESFJ</option><option>ESTP</option><option>ESTJ</option>
                <option>INFP</option><option>INFJ</option><option>INTP</option><option>INTJ</option>
                <option>ISFP</option><option>ISFJ</option><option>ISTP</option><option>ISTJ</option>
                <option>모름</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-white via-white to-transparent pointer-events-none">
        <button 
          onClick={handleOnboardingComplete}
          className="w-full py-4 bg-orange-500 text-white rounded-2xl text-sm font-black shadow-lg hover:bg-orange-600 transition pointer-events-auto"
        >
          프로필 완성하고 잇다 찾으러 가기! 🚀
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-100 md:bg-slate-950 flex justify-center items-start md:items-center select-none font-sans overflow-x-hidden">
      <div className="w-full max-w-[430px] h-[100dvh] md:h-[860px] md:my-8 bg-white md:rounded-[44px] md:shadow-2xl md:border-[10px] md:border-slate-800 overflow-hidden flex flex-col relative">

        <div className="pt-[env(safe-area-inset-top,0px)]"></div>

        {toast.show && (
          <div className="absolute top-[env(safe-area-inset-top,12px)] left-4 right-4 z-50 bg-slate-900/95 backdrop-blur-sm text-white text-[13px] px-4 py-3.5 rounded-2xl shadow-xl animate-fade-in">
            {toast.message}
          </div>
        )}

        <div className="flex-grow overflow-y-auto pb-[env(safe-area-inset-bottom,80px)]">
          {/* Auth screens or main tabs */}
          {currentStep === 1 && !isSignUpMode && renderLoginView()}
          {currentStep === 1 && isSignUpMode && renderSignUpView()}
          {currentStep === 2 && renderVerificationView()}
          
          {currentStep >= 3 && (
            <>
              {isOnboarding ? (
                renderOnboardingView()
              ) : isCreatingRoom ? (
                renderCreationWizard()
              ) : roomSimulatingId ? (
                renderRoomSimulation()
              ) : (
                <>
                  {activeTab === 'home' && renderHomeTab()}
                  {activeTab === 'sync' && renderSyncTab()}
                  {activeTab === 'mypage' && renderMyPageTab()}
                </>
              )}
            </>
          )}
        </div>

        {/* Bottom Navigation Tab Bar (only when verified and not in sub-wizards) */}
        {isVerified && !isOnboarding && !isCreatingRoom && !roomSimulatingId && currentStep >= 3 && (
          <div className="absolute bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200/80 flex justify-around items-start pt-2.5 pb-[max(env(safe-area-inset-bottom,8px),8px)] px-6 z-30">
            <button
              onClick={() => setActiveTab('home')}
              className={`flex flex-col items-center space-y-0.5 text-[11px] font-bold transition ${activeTab === 'home' ? 'text-orange-500' : 'text-slate-400'}`}
            >
              <Utensils className="w-6 h-6" />
              <span>홈</span>
            </button>
            <button
              onClick={() => setActiveTab('sync')}
              className={`flex flex-col items-center space-y-0.5 text-[11px] font-bold transition ${activeTab === 'sync' ? 'text-orange-500' : 'text-slate-400'}`}
            >
              <Clock className="w-6 h-6" />
              <span>연동</span>
            </button>
            <button
              onClick={() => setActiveTab('mypage')}
              className={`flex flex-col items-center space-y-0.5 text-[11px] font-bold transition ${activeTab === 'mypage' ? 'text-orange-500' : 'text-slate-400'}`}
            >
              <Users className="w-6 h-6" />
              <span>마이</span>
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
