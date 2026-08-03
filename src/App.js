import { useEffect, useRef, useState } from "react";
import "./App.css";
import { Badge, Button, SearchField } from "./components/ui";
import { supabase, toAppUser } from "./supabaseClient";
import { shouldLoadSuggestions } from "./searchSuggestions";

const DEFAULT_CENTER = { lat: 37.5665, lng: 126.978 };
const KAKAO_MAP_KEY = process.env.REACT_APP_KAKAO_MAP_JAVASCRIPT_KEY;
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL
  || `${window.location.protocol}//${window.location.hostname}:4000`;
const PLACE_STORAGE_KEY = "jigeum-review:selected-place";
const MAP_SCREEN_STORAGE_KEY = "jigeum-review:map-screen";
const AUTH_RETURN_STORAGE_KEY = "jigeum-review:auth-return";
const HOME_GPS_STORAGE_KEY = "jigeum-review:home-gps";
const SCANNED_RECEIPT_STORAGE_KEY = "jigeum-review:scanned-receipt";
const TEST_ANALYSIS_STORAGE_KEY = "jigeum-review:test-analyses";
const SENTIMENT_LABELS = {
  very_positive: "매우 좋음",
  positive: "좋음",
  neutral: "보통",
  negative: "아쉬움",
  very_negative: "매우 아쉬움",
};

function loadTestAnalyses(placeId) {
  try {
    const entries = JSON.parse(localStorage.getItem(TEST_ANALYSIS_STORAGE_KEY)) || [];
    return entries.filter((entry) => entry.placeId === placeId);
  } catch {
    return [];
  }
}

function loadAllTestAnalyses() {
  try { return JSON.parse(localStorage.getItem(TEST_ANALYSIS_STORAGE_KEY)) || []; } catch { return []; }
}

function saveTestAnalysis(entry) {
  let entries = [];
  try { entries = JSON.parse(localStorage.getItem(TEST_ANALYSIS_STORAGE_KEY)) || []; } catch { entries = []; }
  localStorage.setItem(TEST_ANALYSIS_STORAGE_KEY, JSON.stringify([...entries, entry]));
}

function deleteOwnTestAnalysis(reviewId, userId) {
  const entries = loadAllTestAnalyses();
  const target = entries.find((entry) => entry.id === reviewId);
  if (!target || target.userId !== userId) return false;
  localStorage.setItem(TEST_ANALYSIS_STORAGE_KEY, JSON.stringify(entries.filter((entry) => entry.id !== reviewId)));
  return true;
}

function loadMapScreenState() {
  try { return JSON.parse(sessionStorage.getItem(MAP_SCREEN_STORAGE_KEY)) || {}; } catch { return {}; }
}

function resetAndGoHome(event) {
  event?.preventDefault();
  sessionStorage.removeItem(PLACE_STORAGE_KEY);
  sessionStorage.removeItem(MAP_SCREEN_STORAGE_KEY);
  sessionStorage.removeItem(AUTH_RETURN_STORAGE_KEY);
  sessionStorage.setItem(HOME_GPS_STORAGE_KEY, "true");
  window.location.assign("/");
}

async function apiRequest(path, options = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const isFormData = options.body instanceof FormData;
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      ...(!isFormData ? { "Content-Type": "application/json" } : {}),
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      ...(options.headers || {}),
    },
    ...options,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.message || "요청을 처리하지 못했습니다.");
  return payload;
}

function loadKakaoMaps(appKey) {
  if (window.kakao?.maps) return Promise.resolve(window.kakao.maps);
  return new Promise((resolve, reject) => {
    const existingScript = document.querySelector("script[data-kakao-map]");
    const handleReady = () => {
      if (!window.kakao?.maps) return reject(new Error("카카오맵 객체를 불러오지 못했습니다."));
      window.kakao.maps.load(() => resolve(window.kakao.maps));
    };
    if (existingScript) {
      existingScript.addEventListener("load", handleReady, { once: true });
      existingScript.addEventListener("error", () => reject(new Error("카카오맵 SDK를 불러오지 못했습니다.")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.dataset.kakaoMap = "true";
    script.async = true;
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(appKey)}&autoload=false`;
    script.onload = handleReady;
    script.onerror = () => reject(new Error("카카오맵 SDK를 불러오지 못했습니다."));
    document.head.appendChild(script);
  });
}

function normalizePlace(item) {
  return { ...item, address: item.roadAddress || item.address, oldAddress: item.address, x: Number(item.x), y: Number(item.y) };
}

function distanceInMeters(first, second) {
  const toRadians = (degree) => (degree * Math.PI) / 180;
  const earthRadius = 6371000;
  const latDelta = toRadians(second.lat - first.lat);
  const lngDelta = toRadians(second.lng - first.lng);
  const a = Math.sin(latDelta / 2) ** 2 + Math.cos(toRadians(first.lat)) * Math.cos(toRadians(second.lat)) * Math.sin(lngDelta / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getRoute() {
  if (window.location.pathname === "/login") return { name: "login" };
  if (window.location.pathname === "/mypage") return { name: "mypage" };
  if (window.location.pathname === "/saved") return { name: "saved" };
  if (window.location.pathname === "/scan") return { name: "scan" };
  const reviewMatch = window.location.pathname.match(/^\/places\/([^/]+)\/reviews\/new$/);
  if (reviewMatch) return { name: "review", placeId: decodeURIComponent(reviewMatch[1]) };
  const match = window.location.pathname.match(/^\/places\/([^/]+)$/);
  return match ? { name: "detail", placeId: decodeURIComponent(match[1]) } : { name: "map" };
}

function App() {
  const [route, setRoute] = useState(getRoute);
  const [user, setUser] = useState(null);
  const [authStatus, setAuthStatus] = useState("loading");
  const [selectedPlace, setSelectedPlace] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(PLACE_STORAGE_KEY)) || null; } catch { return null; }
  });
  const [scannedReceipt, setScannedReceipt] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(SCANNED_RECEIPT_STORAGE_KEY)) || null; } catch { return null; }
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(toAppUser(data.session?.user));
      setAuthStatus("ready");
    });
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(toAppUser(session?.user));
      setAuthStatus("ready");
    });
    const handlePopState = () => setRoute(getRoute());
    window.addEventListener("popstate", handlePopState);
    return () => {
      authListener.subscription.unsubscribe();
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  function navigate(path) {
    window.history.pushState({}, "", path);
    setRoute(getRoute());
  }

  function openPlace(place) {
    setSelectedPlace(place);
    sessionStorage.setItem(PLACE_STORAGE_KEY, JSON.stringify(place));
    navigate(`/places/${encodeURIComponent(place.id)}`);
  }

  function openReview(place) {
    setSelectedPlace(place);
    sessionStorage.setItem(PLACE_STORAGE_KEY, JSON.stringify(place));
    const reviewPath = `/places/${encodeURIComponent(place.id)}/reviews/new`;
    if (user) return navigate(reviewPath);
    sessionStorage.setItem(AUTH_RETURN_STORAGE_KEY, reviewPath);
    navigate("/login");
  }

  function openMyPage() {
    if (user) return navigate("/mypage");
    sessionStorage.setItem(AUTH_RETURN_STORAGE_KEY, "/mypage");
    navigate("/login");
  }

  function openSavedPlaces() {
    if (user) return navigate("/saved");
    sessionStorage.setItem(AUTH_RETURN_STORAGE_KEY, "/saved");
    navigate("/login");
  }

  function openReceiptScanner() {
    if (user) return navigate("/scan");
    sessionStorage.setItem(AUTH_RETURN_STORAGE_KEY, "/scan");
    navigate("/login");
  }

  function completeReceiptScan({ place, receipt }) {
    setSelectedPlace(place);
    setScannedReceipt(receipt);
    sessionStorage.setItem(PLACE_STORAGE_KEY, JSON.stringify(place));
    sessionStorage.setItem(SCANNED_RECEIPT_STORAGE_KEY, JSON.stringify(receipt));
    navigate(`/places/${encodeURIComponent(place.id)}/reviews/new`);
  }

  function handleAuthenticated(nextUser) {
    setUser(nextUser);
    const fallbackPath = route.name === "review" ? window.location.pathname : "/";
    const returnPath = sessionStorage.getItem(AUTH_RETURN_STORAGE_KEY) || fallbackPath;
    sessionStorage.removeItem(AUTH_RETURN_STORAGE_KEY);
    navigate(returnPath);
  }

  async function logout() {
    await supabase.auth.signOut();
    setUser(null);
    navigate("/");
  }

  const shared = { user, authStatus, onLogin: () => { sessionStorage.setItem(AUTH_RETURN_STORAGE_KEY, window.location.pathname); navigate("/login"); }, onLogout: logout, onProfile: openMyPage, onSavedPlaces: openSavedPlaces, onScanReceipt: openReceiptScanner };
  if (route.name === "login") return <AuthPage user={user} onAuthenticated={handleAuthenticated} onBack={() => navigate("/")} />;
  if (route.name === "mypage") {
    if (authStatus === "loading") return <main className="route-empty"><strong>로그인 상태를 확인하고 있습니다.</strong></main>;
    if (!user) return <AuthPage user={user} onAuthenticated={handleAuthenticated} onBack={() => navigate("/")} />;
    return <MyPage user={user} selectedPlace={selectedPlace} onBack={() => navigate("/")} onLogout={logout} onSavedPlaces={openSavedPlaces} onUserUpdated={setUser} />;
  }
  if (route.name === "saved") {
    if (authStatus === "loading") return <main className="route-empty"><strong>로그인 상태를 확인하고 있습니다.</strong></main>;
    if (!user) return <AuthPage user={user} onAuthenticated={handleAuthenticated} onBack={() => navigate("/")} />;
    return <SavedPlacesPage onBack={() => navigate("/")} onOpenPlace={openPlace} onProfile={openMyPage} />;
  }
  if (route.name === "scan") {
    if (authStatus === "loading") return <main className="route-empty"><strong>로그인 상태를 확인하고 있습니다.</strong></main>;
    if (!user) return <AuthPage user={user} onAuthenticated={handleAuthenticated} onBack={() => navigate("/")} />;
    return <ReceiptScanPage onBack={() => navigate("/")} onComplete={completeReceiptScan} />;
  }
  if (route.name === "review") {
    const reviewPlace = selectedPlace?.id === route.placeId ? selectedPlace : null;
    if (authStatus === "loading") return <main className="route-empty"><strong>로그인 상태를 확인하고 있습니다.</strong></main>;
    if (!user) return <AuthPage user={user} onAuthenticated={handleAuthenticated} onBack={() => navigate(`/places/${encodeURIComponent(route.placeId)}`)} />;
    return <ReviewWritePage initialReceipt={scannedReceipt} place={reviewPlace} user={user} onBack={() => navigate(`/places/${encodeURIComponent(route.placeId)}`)} />;
  }
  if (route.name === "detail") return <PlaceDetailPage {...shared} place={selectedPlace?.id === route.placeId ? selectedPlace : null} onBack={() => navigate("/")} onWriteReview={openReview} />;
  return <MapSearchPage {...shared} onOpenPlace={openPlace} />;
}

function AccountControl({ user, authStatus, onLogin, onLogout, onProfile }) {
  if (authStatus === "loading") return <span className="account-loading">확인 중</span>;
  if (!user) return <button className="account-button" onClick={onLogin} type="button">로그인</button>;
  return (
    <div className="account-menu">
      <button className="account-profile-button" onClick={onProfile} type="button"><span className="account-avatar">{user.name.slice(0, 1)}</span><span><strong>{user.name}</strong><small>{user.email}</small></span></button>
      <button onClick={onLogout} type="button">로그아웃</button>
    </div>
  );
}

function MyPage({ user, selectedPlace, onBack, onLogout, onSavedPlaces, onUserUpdated }) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(user.name);
  const [nameStatus, setNameStatus] = useState("idle");
  const [nameMessage, setNameMessage] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState("");
  const [reviewMessage, setReviewMessage] = useState("");
  const [reviewRevision, setReviewRevision] = useState(0);
  const reviews = loadAllTestAnalyses().filter((review) => review.userId === user.id);
  const sortedReviews = [...reviews].sort((first, second) => new Date(second.createdAt) - new Date(first.createdAt));
  const placeName = (review) => review.placeTitle || (selectedPlace?.id === review.placeId ? selectedPlace.title : "작성한 업체");

  async function deleteReview(reviewId) {
    const review = reviews.find((item) => item.id === reviewId);
    if (!review?.testOnly) {
      try {
        await apiRequest(`/api/reviews/${encodeURIComponent(reviewId)}`, { method: "DELETE" });
      } catch (error) {
        setReviewMessage(error.message);
        setPendingDeleteId("");
        return;
      }
    }
    if (!deleteOwnTestAnalysis(reviewId, user.id)) {
      setReviewMessage("본인이 작성한 리뷰만 삭제할 수 있습니다.");
      setPendingDeleteId("");
      return;
    }
    setPendingDeleteId("");
    setReviewMessage("리뷰가 삭제되었습니다.");
    setReviewRevision((value) => value + 1);
  }

  async function updateNickname(event) {
    event.preventDefault();
    const nextName = nameInput.trim();
    if (nextName.length < 2 || nextName.length > 30) {
      setNameStatus("error");
      setNameMessage("닉네임은 2자 이상 30자 이하로 입력해 주세요.");
      return;
    }
    if (nextName === user.name) {
      setIsEditingName(false);
      setNameStatus("idle");
      setNameMessage("");
      return;
    }
    setNameStatus("saving");
    setNameMessage("");
    try {
      const { user: updatedUser } = await apiRequest("/api/users/me", {
        method: "PATCH",
        body: JSON.stringify({ name: nextName }),
      });
      try {
        await supabase.auth.updateUser({ data: { display_name: updatedUser.name } });
      } catch {
        // profiles 저장은 완료되었으므로 현재 화면에는 서버 응답을 우선 반영한다.
      }
      onUserUpdated(updatedUser);
      setNameInput(updatedUser.name);
      setNameStatus("success");
      setNameMessage("닉네임이 변경되었습니다.");
      setIsEditingName(false);
    } catch (error) {
      setNameStatus("error");
      setNameMessage(error.message);
    }
  }

  return (
    <main className="mypage">
      <header className="mypage-topbar"><a className="brand-home-link" href="/" onClick={resetAndGoHome}>지금리뷰</a><button onClick={onLogout} type="button">로그아웃</button></header>
      <aside className="mypage-sidebar"><a href="/" onClick={resetAndGoHome}>⌂ 홈</a><button onClick={onSavedPlaces} type="button">♡ 관심 장소</button><strong>♙ 마이페이지</strong></aside>
      <div className="mypage-content">
        <section className="mypage-profile"><span className="mypage-avatar">{user.name.slice(0, 1)}</span><div className="mypage-profile-info">{isEditingName ? <form className="nickname-form" onSubmit={updateNickname}><label htmlFor="nickname">닉네임</label><div><input autoFocus id="nickname" maxLength="30" onChange={(event) => setNameInput(event.target.value)} value={nameInput} /><Button disabled={nameStatus === "saving"} type="submit">{nameStatus === "saving" ? "저장 중" : "저장"}</Button><button className="nickname-cancel" onClick={() => { setNameInput(user.name); setIsEditingName(false); setNameMessage(""); setNameStatus("idle"); }} type="button">취소</button></div></form> : <div className="mypage-name-row"><h1>{user.name}</h1><button onClick={() => setIsEditingName(true)} type="button">닉네임 변경</button></div>}<p>{user.email}</p><small>영수증 인증 리뷰로 믿을 수 있는 장소 선택을 돕고 있어요.</small>{nameMessage && <span className={`nickname-message is-${nameStatus}`} role="status">{nameMessage}</span>}</div><div className="mypage-count"><span>작성 리뷰</span><strong>{reviews.length}</strong></div></section>
        <section className="mypage-reviews" data-revision={reviewRevision}><div className="mypage-section-title"><div><span>MY REVIEWS</span><h2>작성한 리뷰</h2></div><small>최신순</small></div>{reviewMessage && <p className="mypage-review-message" role="status">{reviewMessage}</p>}{sortedReviews.length > 0 ? <div className="mypage-review-list">{sortedReviews.map((review) => <article className="mypage-review-card" key={review.id}><header><div><h3>{placeName(review)}</h3><span>{new Date(review.createdAt).toLocaleDateString("ko-KR")} 작성</span></div><div className="mypage-review-card__actions"><Badge>이미지 확인</Badge><button aria-label={`${placeName(review)} 리뷰 삭제`} onClick={() => { setPendingDeleteId(review.id); setReviewMessage(""); }} type="button">삭제</button></div></header><p>{review.content}</p><footer><strong>{SENTIMENT_LABELS[review.bucket]}</strong><span>AI 신뢰도 {Math.round(review.confidence * 100)}%</span></footer>{review.keywords?.length > 0 && <small>{review.keywords.map((keyword) => `#${keyword}`).join(" ")}</small>}{pendingDeleteId === review.id && <div className="review-delete-confirm" role="alert"><span>정말 삭제할까요?</span><div><button onClick={() => setPendingDeleteId("")} type="button">취소</button><button aria-label="삭제 확인" onClick={() => deleteReview(review.id)} type="button">삭제</button></div></div>}</article>)}</div> : <div className="mypage-empty"><strong>아직 작성한 리뷰가 없습니다</strong><p>지도에서 업체를 선택하고 첫 리뷰를 작성해 보세요.</p><Button onClick={onBack}>지도로 이동</Button></div>}</section>
      </div>
      <nav className="mypage-bottom-nav"><button onClick={onBack} type="button"><span>⌂</span><small>홈</small></button><button onClick={onSavedPlaces} type="button"><span>♡</span><small>저장</small></button><button onClick={onBack} type="button"><span>✎</span><small>리뷰작성</small></button><button className="is-active" type="button"><span>♙</span><small>내정보</small></button></nav>
    </main>
  );
}

function SavedPlacesPage({ onBack, onOpenPlace, onProfile }) {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let mounted = true;
    apiRequest("/api/saved-places")
      .then((payload) => { if (mounted) { setItems(payload.items || []); setStatus("ready"); } })
      .catch((error) => { if (mounted) { setMessage(error.message); setStatus("error"); } });
    return () => { mounted = false; };
  }, []);

  async function removeSavedPlace(place) {
    setMessage("");
    try {
      await apiRequest(`/api/saved-places/${encodeURIComponent(place.id)}`, { method: "DELETE" });
      setItems((current) => current.filter((item) => item.id !== place.id));
    } catch (error) {
      setMessage(error.message);
    }
  }

  return (
    <main className="saved-page">
      <header className="saved-topbar"><button onClick={onBack} type="button">← 홈</button><a className="brand-home-link" href="/" onClick={resetAndGoHome}>지금리뷰</a><button onClick={onProfile} type="button">내정보</button></header>
      <section className="saved-content"><div className="saved-heading"><span>SAVED PLACES</span><h1>관심 장소</h1><p>다시 방문하고 싶은 식당과 카페를 모아 볼 수 있어요.</p></div>
        {message && <p className="saved-message" role="alert">{message}</p>}
        {status === "loading" && <div className="saved-empty"><strong>관심 장소를 불러오고 있어요</strong></div>}
        {status === "ready" && items.length === 0 && <div className="saved-empty"><span>♡</span><strong>저장한 관심 장소가 없습니다</strong><p>지도에서 업체를 선택하고 관심 장소에 추가해 보세요.</p><Button onClick={onBack}>지도로 이동</Button></div>}
        {items.length > 0 && <div className="saved-list">{items.map((place) => <article className="saved-place-item" key={place.id}><button aria-label={`${place.title} 상세 보기`} onClick={() => onOpenPlace(place)} type="button"><span className="saved-place-pin">⌖</span><span><strong>{place.title}</strong><small>{place.category}</small><p>{place.address || "주소 정보 없음"}</p></span><span aria-hidden="true">›</span></button><button aria-label={`${place.title} 관심 장소 해제`} className="saved-remove" onClick={() => removeSavedPlace(place)} type="button">♥</button></article>)}</div>}
      </section>
      <nav className="saved-bottom-nav"><button onClick={onBack} type="button"><span>⌂</span><small>홈</small></button><button className="is-active" type="button"><span>♥</span><small>저장</small></button><button onClick={onBack} type="button"><span>✎</span><small>리뷰작성</small></button><button onClick={onProfile} type="button"><span>♙</span><small>내정보</small></button></nav>
    </main>
  );
}

function MapSearchPage({ onOpenPlace, ...accountProps }) {
  const restoredStateRef = useRef(loadMapScreenState());
  const mapElementRef = useRef(null);
  const mapRef = useRef(null);
  const overlaysRef = useRef([]);
  const resultsRef = useRef(null);
  const autocompleteEnabledRef = useRef(false);
  const suggestionRequestRef = useRef(0);
  const [mapStatus, setMapStatus] = useState(KAKAO_MAP_KEY ? "loading" : "missing-key");
  const [mapError, setMapError] = useState("");
  const [searchInput, setSearchInput] = useState(() => restoredStateRef.current.searchInput || "");
  const [places, setPlaces] = useState(() => restoredStateRef.current.places || []);
  const [placeStatus, setPlaceStatus] = useState(() => restoredStateRef.current.placeStatus || "idle");
  const [placeError, setPlaceError] = useState(() => restoredStateRef.current.placeError || "");
  const [selectedPlaceId, setSelectedPlaceId] = useState(() => restoredStateRef.current.selectedPlaceId || "");
  const [searchRadius, setSearchRadius] = useState(() => restoredStateRef.current.searchRadius || 5000);
  const [searchScope, setSearchScope] = useState(() => restoredStateRef.current.searchScope || "nearby");
  const [locationStatus, setLocationStatus] = useState("idle");
  const [suggestions, setSuggestions] = useState([]);

  useEffect(() => {
    if (!KAKAO_MAP_KEY || !mapElementRef.current) return;
    let mounted = true;
    loadKakaoMaps(KAKAO_MAP_KEY).then((maps) => {
      if (!mounted || !mapElementRef.current) return;
      const savedViewport = restoredStateRef.current.viewport;
      const center = savedViewport?.center || DEFAULT_CENTER;
      const map = new maps.Map(mapElementRef.current, { center: new maps.LatLng(center.lat, center.lng), level: savedViewport?.level || 5 });
      map.addControl(new maps.ZoomControl(), maps.ControlPosition.RIGHT);
      mapRef.current = map;
      setMapStatus("ready");
      if (sessionStorage.getItem(HOME_GPS_STORAGE_KEY) === "true") {
        sessionStorage.removeItem(HOME_GPS_STORAGE_KEY);
        if (navigator.geolocation) {
          setLocationStatus("loading");
          navigator.geolocation.getCurrentPosition(
            ({ coords }) => {
              map.setCenter(new maps.LatLng(coords.latitude, coords.longitude));
              map.setLevel(4);
              setLocationStatus("ready");
            },
            () => {
              setLocationStatus("error");
              setPlaceError("현재 위치 권한을 허용하면 내 주변에서 검색할 수 있습니다.");
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
          );
        }
      }
    }).catch((error) => { if (mounted) { setMapStatus("error"); setMapError(error.message); } });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (resultsRef.current) resultsRef.current.scrollTop = restoredStateRef.current.resultsScrollTop || 0;
  }, []);

  useEffect(() => {
    const query = searchInput.trim();
    if (!shouldLoadSuggestions({ enabled: autocompleteEnabledRef.current, query, mapReady: mapStatus === "ready" && Boolean(mapRef.current) })) {
      setSuggestions([]);
      return undefined;
    }
    const requestId = ++suggestionRequestRef.current;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const center = mapRef.current.getCenter();
        const params = new URLSearchParams({ query, size: "5", x: String(center.getLng()), y: String(center.getLat()), radius: "20000" });
        let payload = await apiRequest(`/api/kakao/local?${params.toString()}`);
        if (!(payload.items || []).length) payload = await apiRequest(`/api/kakao/local?${new URLSearchParams({ query, size: "5" }).toString()}`);
        if (!cancelled && requestId === suggestionRequestRef.current && autocompleteEnabledRef.current) setSuggestions((payload.items || []).map(normalizePlace));
      } catch {
        if (!cancelled && requestId === suggestionRequestRef.current) setSuggestions([]);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [searchInput, mapStatus]);

  function closeAutocomplete() {
    autocompleteEnabledRef.current = false;
    suggestionRequestRef.current += 1;
    setSuggestions([]);
  }

  function changeSearchInput(event) {
    autocompleteEnabledRef.current = true;
    setSearchInput(event.target.value);
  }

  function openPlaceAndPreserveMap(place) {
    closeAutocomplete();
    const mapCenter = mapRef.current?.getCenter();
    sessionStorage.setItem(MAP_SCREEN_STORAGE_KEY, JSON.stringify({
      searchInput,
      places,
      placeStatus,
      placeError,
      selectedPlaceId: place.id,
      searchRadius,
      searchScope,
      resultsScrollTop: resultsRef.current?.scrollTop || 0,
      viewport: mapCenter ? {
        center: { lat: mapCenter.getLat(), lng: mapCenter.getLng() },
        level: mapRef.current.getLevel(),
      } : restoredStateRef.current.viewport,
    }));
    onOpenPlace(place);
  }

  useEffect(() => {
    if (mapStatus !== "ready" || !mapRef.current || !window.kakao?.maps) return;
    const maps = window.kakao.maps;
    overlaysRef.current.forEach((overlay) => overlay.setMap(null));
    overlaysRef.current = [];
    if (!places.length) return;
    places.forEach((place) => {
      const position = new maps.LatLng(place.y, place.x);
      const marker = document.createElement("button");
      marker.type = "button";
      marker.className = `map-marker ${place.id === selectedPlaceId ? "is-selected" : ""}`;
      marker.textContent = place.title;
      marker.addEventListener("click", () => { closeAutocomplete(); setSelectedPlaceId(place.id); });
      overlaysRef.current.push(new maps.CustomOverlay({ map: mapRef.current, position, content: marker, yAnchor: 1.25 }));
    });
  }, [places, selectedPlaceId, mapStatus]);

  async function searchPlaces(queryValue) {
    const query = queryValue.trim();
    if (!query) return;
    closeAutocomplete(); setSearchInput(query); setPlaceStatus("loading"); setPlaceError(""); setSelectedPlaceId("");
    try {
      if (!mapRef.current) throw new Error("지도가 준비된 뒤 다시 검색해 주세요.");
      const center = mapRef.current.getCenter();
      const northEast = mapRef.current.getBounds().getNorthEast();
      const radius = Math.round(Math.min(20000, Math.max(500, distanceInMeters(
        { lat: center.getLat(), lng: center.getLng() },
        { lat: northEast.getLat(), lng: northEast.getLng() }
      ))));
      setSearchRadius(radius);
      const params = new URLSearchParams({ query, size: "15", x: String(center.getLng()), y: String(center.getLat()), radius: String(radius), sort: "distance" });
      let payload = await apiRequest(`/api/kakao/local?${params.toString()}`, { headers: {} });
      let nextPlaces = (payload.items || []).map(normalizePlace);
      if (!nextPlaces.length) {
        const fallbackParams = new URLSearchParams({ query, size: "15", sort: "accuracy" });
        payload = await apiRequest(`/api/kakao/local?${fallbackParams.toString()}`, { headers: {} });
        nextPlaces = (payload.items || []).map(normalizePlace);
        setSearchScope("all");
      } else {
        setSearchScope("nearby");
      }
      setPlaces(nextPlaces); setSelectedPlaceId(""); setPlaceStatus("ready");
    } catch (error) { setPlaces([]); setPlaceStatus("error"); setPlaceError(error.message); }
  }

  function handleSearchSubmit(event) {
    event.preventDefault();
    searchPlaces(searchInput);
  }

  function moveToCurrentLocation() {
    if (!navigator.geolocation) {
      setPlaceError("이 브라우저에서는 현재 위치를 사용할 수 없습니다.");
      return;
    }
    setLocationStatus("loading");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (mapRef.current && window.kakao?.maps) {
          mapRef.current.setCenter(new window.kakao.maps.LatLng(coords.latitude, coords.longitude));
          mapRef.current.setLevel(4);
        }
        setLocationStatus("ready");
      },
      () => {
        setPlaceError("현재 위치 권한을 허용하면 내 주변에서 검색할 수 있습니다.");
        setLocationStatus("error");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }

  function handleMobileReviewAction() {
    if (!accountProps.user) {
      accountProps.onLogin();
      return;
    }

    const selectedPlace = places.find((place) => place.id === selectedPlaceId);
    if (selectedPlace) {
      openPlaceAndPreserveMap(selectedPlace);
      return;
    }

    setPlaceError("리뷰를 작성할 업체를 먼저 선택해 주세요.");
  }

  return (
    <main className="map-screen">
      <header className="top-nav"><button aria-label="검색창으로 이동" className="mobile-top-action" onClick={() => document.querySelector(".ui-search input")?.focus()} type="button">⌕</button><a className="top-nav__brand brand-home-link" href="/" onClick={resetAndGoHome}>지금리뷰</a><span>영수증 인증 리뷰 지도</span><AccountControl {...accountProps} /></header>
      <aside className="place-sidebar">
        <div className="sidebar-search"><div className="sidebar-title-row"><div><h1>어디를 찾으세요?</h1><p>현재 보고 있는 지도 주변을 먼저 검색하고, 결과가 없으면 전체 지역에서 찾습니다.</p></div><button className="saved-places-link" onClick={accountProps.onSavedPlaces} type="button">♡ 관심 장소</button></div><div className="search-autocomplete"><SearchField value={searchInput} onChange={changeSearchInput} onClear={() => { closeAutocomplete(); setSearchInput(""); }} onSubmit={handleSearchSubmit} />{suggestions.length > 0 && <div aria-label="장소 자동완성" className="search-suggestions">{suggestions.map((place) => <button key={place.id} onClick={() => searchPlaces(place.title)} type="button"><strong>{place.title}</strong><span>{place.category} · {place.address || "주소 정보 없음"}</span></button>)}</div>}</div><div className="mobile-filter-chips" aria-label="빠른 검색"><button onClick={() => searchPlaces("음식점")} type="button">음식점</button><button onClick={() => searchPlaces("카페")} type="button">카페</button></div><div className="search-scope"><span>{searchScope === "all" ? "주변 결과가 없어 전체 지역에서 찾았어요" : `지도 중심에서 약 ${(searchRadius / 1000).toFixed(searchRadius < 1000 ? 1 : 0)}km 이내`}</span><button onClick={moveToCurrentLocation} type="button">{locationStatus === "loading" ? "위치 확인 중..." : "◎ 내 위치"}</button></div></div>
        <div className={`place-results place-results--${placeStatus} ${places.length ? "has-results" : ""}`} aria-live="polite" ref={resultsRef}>
          {placeStatus === "ready" && places.length > 0 && <div className="place-results__header"><strong>검색 결과</strong><span>{places.length}곳</span></div>}
          {placeStatus === "idle" && <div className="empty-search"><strong>검색 결과가 여기에 표시됩니다</strong><span>식당이나 카페 이름을 입력해 주세요.</span></div>}
          {placeStatus === "loading" && <p className="sidebar-state">카카오맵에서 검색 중...</p>}
          {placeStatus === "error" && <p className="sidebar-state sidebar-state--error">{placeError}</p>}
          {placeStatus === "ready" && !places.length && <p className="sidebar-state">검색 결과가 없습니다.</p>}
          {places.map((place) => <button aria-label={`${place.title} 상세 보기`} className={`place-list-item ${selectedPlaceId === place.id ? "is-selected" : ""}`} key={place.id} onClick={() => openPlaceAndPreserveMap(place)} type="button"><span className="place-list-item__pin">⌖</span><span className="place-list-item__content"><strong>{place.title}</strong><span>{place.category}</span><small>{place.address || "주소 정보 없음"}</small></span><span aria-hidden="true">›</span></button>)}
        </div>
      </aside>
      <section className="map-canvas" aria-label="카카오맵 영역"><div className="kakao-map" ref={mapElementRef} aria-label="카카오맵" />{mapStatus !== "ready" && <section className="map-state-panel"><h2>{mapStatus === "missing-key" ? "지도 키가 필요합니다" : "지도를 불러오는 중입니다"}</h2><p>{mapError || "카카오맵 연결을 확인하고 있습니다."}</p></section>}<button aria-label="현재 위치로 이동" className={`map-current-location${locationStatus === "loading" ? " is-loading" : ""}`} onClick={moveToCurrentLocation} type="button"><svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /><circle className="map-current-location-dot" cx="12" cy="12" r="1.5" /></svg></button><button className="map-receipt-scan" onClick={accountProps.onScanReceipt} type="button"><span>▣</span> 영수증 스캔하기</button></section>
      <nav className="mobile-bottom-nav" aria-label="모바일 메뉴"><button className="is-active" onClick={resetAndGoHome} type="button"><span>⌂</span><small>홈</small></button><button onClick={accountProps.onSavedPlaces} type="button"><span>♡</span><small>저장</small></button><button aria-label="영수증 스캔하기" className="receipt-scan-nav" onClick={accountProps.onScanReceipt} type="button"><span>▣</span><small>스캔</small></button><button onClick={handleMobileReviewAction} type="button"><span>✎</span><small>리뷰작성</small></button><button onClick={accountProps.onProfile} type="button"><span>♙</span><small>내정보</small></button></nav>
    </main>
  );
}

function AuthPage({ user, onAuthenticated, onBack }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ email: "", password: "", name: "" });
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  useEffect(() => { if (user) onBack(); }, [user, onBack]);
  async function submit(event) {
    event.preventDefault(); setStatus("loading"); setError("");
    try {
      if (mode === "login") {
        const { data, error: authError } = await supabase.auth.signInWithPassword({ email: form.email, password: form.password });
        if (authError) throw authError;
        onAuthenticated(toAppUser(data.user));
      } else {
        const { data, error: authError } = await supabase.auth.signUp({
          email: form.email,
          password: form.password,
          options: { data: { display_name: form.name.trim() } },
        });
        if (authError) throw authError;
        if (!data.session) {
          setError("가입 확인 메일을 보냈습니다. 이메일 인증 후 로그인해 주세요.");
          setStatus("idle");
          return;
        }
        onAuthenticated(toAppUser(data.user));
      }
    } catch (submitError) { setError(submitError.message); setStatus("idle"); }
  }

  return (
    <main className="auth-page">
      <button className="auth-back" onClick={onBack} type="button">← 지도로 돌아가기</button>
      <section className="auth-card">
        <div className="auth-brand"><a className="brand-home-link" href="/" onClick={resetAndGoHome}>지금리뷰</a><h1>{mode === "login" ? "다시 만나서 반가워요" : "신뢰할 수 있는 리뷰를 시작해요"}</h1><p>방문이 인증된 리뷰로 더 좋은 장소를 함께 발견합니다.</p></div>
        <div className="auth-tabs"><button className={mode === "login" ? "is-active" : ""} onClick={() => { setMode("login"); setError(""); }} type="button">로그인</button><button className={mode === "signup" ? "is-active" : ""} onClick={() => { setMode("signup"); setError(""); }} type="button">회원가입</button></div>
        <form className="auth-form" onSubmit={submit}>
          {mode === "signup" && <label><span>이름</span><input required minLength="2" maxLength="30" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="표시할 이름" /></label>}
          <label><span>이메일</span><input required type="email" autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="name@example.com" /></label>
          <label><span>비밀번호</span><input required minLength="8" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="8자 이상 입력" /></label>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <Button disabled={status === "loading"} type="submit">{status === "loading" ? "처리 중..." : mode === "login" ? "로그인" : "회원가입"}</Button>
        </form>
        <small className="auth-helper">계정과 로그인 세션은 Supabase Auth로 안전하게 관리됩니다.</small>
      </section>
    </main>
  );
}

function SavePlaceButton({ place, user, authStatus, onLogin }) {
  const [saved, setSaved] = useState(false);
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!user || !place?.id) { setSaved(false); return undefined; }
    let mounted = true;
    setStatus("loading");
    apiRequest("/api/saved-places")
      .then((payload) => { if (mounted) { setSaved((payload.items || []).some((item) => item.id === place.id)); setStatus("idle"); } })
      .catch(() => { if (mounted) setStatus("idle"); });
    return () => { mounted = false; };
  }, [user, place?.id]);

  async function toggleSaved() {
    if (!user) { onLogin(); return; }
    setStatus("saving"); setMessage("");
    try {
      if (saved) {
        await apiRequest(`/api/saved-places/${encodeURIComponent(place.id)}`, { method: "DELETE" });
        setSaved(false); setMessage("관심 장소에서 삭제했습니다.");
      } else {
        await apiRequest("/api/saved-places", { method: "POST", body: JSON.stringify({ place }) });
        setSaved(true); setMessage("관심 장소에 저장했습니다.");
      }
    } catch (error) {
      setMessage(error.message);
    } finally {
      setStatus("idle");
    }
  }

  return <div className="save-place-control"><button aria-pressed={saved} className={saved ? "is-saved" : ""} disabled={authStatus === "loading" || status !== "idle"} onClick={toggleSaved} type="button"><span>{saved ? "♥" : "♡"}</span>{status === "saving" ? "처리 중" : saved ? "관심 장소 저장됨" : "관심 장소 추가"}</button>{message && <small role="status">{message}</small>}</div>;
}

function PlaceDetailPage({ place, user, authStatus, onLogin, onLogout, onProfile, onSavedPlaces, onBack, onWriteReview }) {
  if (!place) return <main className="route-empty"><strong>업체 정보를 찾을 수 없습니다.</strong><p>지도에서 업체를 다시 검색해 주세요.</p><Button onClick={onBack}>지도로 돌아가기</Button></main>;
  const reviewAction = () => onWriteReview(place);
  const testAnalyses = loadTestAnalyses(place.id);
  const sentimentBuckets = Object.keys(SENTIMENT_LABELS);
  const sentimentCounts = Object.fromEntries(sentimentBuckets.map((bucket) => [bucket, testAnalyses.filter((entry) => entry.bucket === bucket).length]));
  const testTotal = testAnalyses.length;
  return (
    <main className="detail-page">
      <aside className="detail-nav"><div><a className="detail-nav__brand brand-home-link" href="/" onClick={resetAndGoHome}>지금리뷰</a><span>Verified places</span></div><nav><button onClick={onBack} type="button">⌂ 홈</button><button className="is-active" type="button">▤ 업체 리뷰</button></nav><Button onClick={reviewAction}>{user ? "영수증 리뷰 등록하기" : "로그인하고 리뷰 쓰기"}</Button></aside>
      <div className="detail-content"><header className="detail-header"><button onClick={onBack} type="button">← 지도</button><a className="detail-header__brand brand-home-link" href="/" onClick={resetAndGoHome}>지금리뷰</a><AccountControl user={user} authStatus={authStatus} onLogin={onLogin} onLogout={onLogout} onProfile={onProfile} /></header>
        <section className="place-summary"><div><Badge>{place.category || "음식점"}</Badge><h1>{place.title}</h1><p>{place.address || place.oldAddress || "주소 정보 없음"}</p></div><div className="place-summary-actions"><SavePlaceButton authStatus={authStatus} onLogin={onLogin} place={place} user={user} />{place.link && <a href={place.link} rel="noreferrer" target="_blank">카카오맵에서 보기 ↗</a>}</div></section>
        <section className="place-facts"><div><span>전화</span><strong>{place.telephone || "등록된 전화번호 없음"}</strong></div><div><span>분류</span><strong>{place.fullCategory || place.category}</strong></div><div><span>등록 리뷰</span><strong>{testTotal}개</strong></div></section>
        <h2 className="mobile-review-heading">리뷰</h2>
        <section className="review-insight"><div><span>✦ AI 분석 요약</span><h2>{testTotal > 0 ? `리뷰 ${testTotal}건의 경험 분포` : "아직 분석할 리뷰가 없습니다"}</h2></div><p>{testTotal > 0 ? "작성된 리뷰를 분석해 방문 경험을 다섯 단계로 정리했습니다." : "리뷰가 등록되면 경험 분포와 주요 의견이 표시됩니다."}</p>{testTotal > 0 ? <div className="sentiment-chart">{sentimentBuckets.map((bucket) => { const percentage = Math.round((sentimentCounts[bucket] / testTotal) * 100); return <div className="sentiment-chart__item" key={bucket}><div className="sentiment-chart__track"><span style={{ height: `${Math.max(percentage, sentimentCounts[bucket] ? 8 : 0)}%` }} /></div><strong>{percentage}%</strong><small>{SENTIMENT_LABELS[bucket]}</small></div>; })}</div> : <div className="empty-bars" aria-hidden="true">{[1,2,3,4,5].map((item) => <span key={item} />)}</div>}</section>
        <section className="review-section"><div className="review-section__header"><div><span>등록 리뷰</span><h2>방문자의 솔직한 경험</h2></div><Button onClick={reviewAction}>{user ? "리뷰 작성" : "로그인"}</Button></div>{testTotal > 0 ? <div className="test-review-list">{[...testAnalyses].reverse().map((review) => <article className="test-review-item" key={review.id}><div><span className="test-review-avatar">리</span><span className="test-review-author"><strong>지금리뷰 방문자</strong><small>{new Date(review.createdAt).toLocaleDateString("ko-KR")} 작성</small></span><Badge>이미지 확인</Badge><strong>{SENTIMENT_LABELS[review.bucket]}</strong><span>신뢰도 {Math.round(review.confidence * 100)}%</span></div><p>{review.content}</p>{review.keywords?.length > 0 && <small>{review.keywords.map((keyword) => `#${keyword}`).join(" ")}</small>}</article>)}</div> : <div className="review-empty"><strong>첫 번째 리뷰를 기다리고 있어요</strong><p>영수증 이미지를 확인한 리뷰가 표시됩니다.</p></div>}</section>
      </div>
      <nav className="detail-mobile-bottom-nav" aria-label="리뷰 화면 메뉴"><button onClick={onBack} type="button"><span>⌂</span><small>홈</small></button><button onClick={onSavedPlaces} type="button"><span>♡</span><small>저장</small></button><button className="is-active" onClick={reviewAction} type="button"><span>✎</span><small>리뷰작성</small></button><button onClick={onProfile} type="button"><span>♙</span><small>내정보</small></button></nav>
    </main>
  );
}

function ReceiptScanPage({ onBack, onComplete }) {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  useEffect(() => () => {
    if (previewUrl.startsWith("blob:") && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  function selectFile(event) {
    const nextFile = event.target.files?.[0];
    setError("");
    if (!nextFile) return;
    if (!["image/jpeg", "image/png"].includes(nextFile.type)) return setError("JPG 또는 PNG 영수증 이미지를 선택해 주세요.");
    if (nextFile.size > 10 * 1024 * 1024) return setError("영수증 이미지는 10MB 이하만 사용할 수 있습니다.");
    if (previewUrl.startsWith("blob:") && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(previewUrl);
    setFile(nextFile);
    setPreviewUrl(URL.createObjectURL(nextFile));
  }

  async function scanReceipt(event) {
    event.preventDefault();
    if (!file) return setError("영수증 이미지를 먼저 선택해 주세요.");
    setStatus("processing");
    setError("");
    try {
      const formData = new FormData();
      formData.append("receipt", file);
      const payload = await apiRequest("/api/receipts/scan", { method: "POST", body: formData });
      onComplete(payload);
    } catch (scanError) {
      setError(scanError.message);
      setStatus("idle");
    }
  }

  return <main className="receipt-scan-page"><header><button onClick={onBack} type="button">← 홈</button><strong>영수증 스캔</strong><span /></header><form onSubmit={scanReceipt}><div className="receipt-scan-intro"><span className="receipt-scan-icon">▣</span><h1>영수증으로 장소 찾기</h1><p>상호명과 결제일이 잘 보이는 사진을 올리면 방문한 업체를 찾아 리뷰 작성 화면으로 이동합니다.</p></div><label className={`receipt-scan-upload ${previewUrl ? "has-preview" : ""}`}><input accept="image/jpeg,image/png" aria-label="스캔할 영수증 선택" onChange={selectFile} type="file" />{previewUrl ? <img alt="스캔할 영수증 미리보기" src={previewUrl} /> : <span>카메라로 촬영하거나 사진 선택</span>}</label>{error && <p className="review-form-message is-error" role="alert">{error}</p>}<Button disabled={status === "processing" || !file} type="submit">{status === "processing" ? "상호명과 장소를 찾는 중..." : "영수증 스캔하기"}</Button></form></main>;
}

function ReviewWritePage({ place, user, onBack, initialReceipt }) {
  const draftKey = place ? `jigeum-review:review-draft:${place.id}` : "";
  const [content, setContent] = useState(() => {
    if (!draftKey) return "";
    try { return JSON.parse(sessionStorage.getItem(draftKey))?.content || ""; } catch { return ""; }
  });
  const [receiptFile, setReceiptFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState(initialReceipt ? "verified" : "idle");
  const [verificationResult, setVerificationResult] = useState(initialReceipt || null);
  const [verifiedReceiptId, setVerifiedReceiptId] = useState(initialReceipt?.id || "");

  useEffect(() => () => { if (previewUrl.startsWith("blob:") && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  if (!place) return <main className="route-empty"><strong>업체 정보를 찾을 수 없습니다.</strong><p>지도에서 업체를 다시 선택해 주세요.</p><Button onClick={onBack}>업체 상세로 돌아가기</Button></main>;

  function selectReceipt(event) {
    const file = event.target.files?.[0];
    setError(""); setSaved(false);
    if (!file) return;
    const acceptedTypes = ["image/jpeg", "image/png"];
    if (!acceptedTypes.includes(file.type.toLowerCase())) { setError("영수증은 JPG 또는 PNG 이미지로 선택해 주세요."); event.target.value = ""; return; }
    if (file.size > 10 * 1024 * 1024) { setError("영수증 이미지는 10MB 이하만 사용할 수 있습니다."); event.target.value = ""; return; }
    if (previewUrl.startsWith("blob:") && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(previewUrl);
    setReceiptFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setVerificationStatus("selected");
    setVerificationResult(null);
    setVerifiedReceiptId("");
  }

  async function verifyReceipt() {
    setError("");
    setVerificationStatus("processing");
    try {
      const formData = new FormData();
      formData.append("receipt", receiptFile);
      formData.append("place", JSON.stringify(place));
      const payload = await apiRequest("/api/receipts/verify", { method: "POST", body: formData });
      setVerificationResult(payload.receipt);
      setVerifiedReceiptId(payload.receipt.id);
      setVerificationStatus("verified");
    } catch (verificationError) {
      setVerificationStatus("rejected");
      setError(verificationError.message);
    }
  }

  async function saveDraft(event) {
    event.preventDefault(); setError(""); setSaved(null);
    if (verificationStatus !== "verified") return setError("영수증 인증을 먼저 완료해 주세요.");
    if (content.trim().length < 10) return setError("리뷰 내용을 10자 이상 작성해 주세요.");
    setSubmitting(true);
    try {
      const payload = await apiRequest("/api/reviews", { method: "POST", body: JSON.stringify({ receiptId: verifiedReceiptId, content: content.trim() }) });
      const entry = {
        ...payload.review,
        placeId: place.id,
        placeTitle: place.title,
        userId: user.id,
      };
      saveTestAnalysis(entry);
      sessionStorage.removeItem(draftKey);
      sessionStorage.removeItem(SCANNED_RECEIPT_STORAGE_KEY);
      setSaved(entry);
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="review-write-page">
      <header className="review-write-header"><button onClick={onBack} type="button">← 업체 상세</button><strong>영수증 리뷰 작성</strong><span aria-hidden="true" /></header>
      <form className="review-write-card" onSubmit={saveDraft}>
        <div className="review-write-intro"><Badge>방문 인증</Badge><h1>{place.title}</h1><p>영수증으로 실제 방문을 확인한 뒤 리뷰가 등록됩니다.</p></div>
        <section className="receipt-step">
          <div><span className="step-number">1</span><div><h2>영수증 이미지</h2><p>상호명과 결제일이 잘 보이도록 촬영해 주세요.</p></div></div>
          <label className={`receipt-upload ${previewUrl ? "has-preview" : ""}`}><input aria-label="영수증 이미지 업로드" accept="image/jpeg,image/png" onChange={selectReceipt} type="file" /><span>{previewUrl ? "다른 이미지 선택" : "촬영하거나 이미지 선택"}</span>{previewUrl && <img alt="선택한 영수증 미리보기" src={previewUrl} />}</label>
          <div className="receipt-demo-actions">{receiptFile && <Button disabled={verificationStatus === "processing" || verificationStatus === "verified"} onClick={verifyReceipt} type="button">{verificationStatus === "processing" ? "OCR 분석 중..." : verificationStatus === "verified" ? "인증 완료" : "영수증 인증"}</Button>}</div>
          <div className={`receipt-readiness is-${verificationStatus}`} aria-live="polite" role={verificationStatus === "processing" ? "status" : undefined}><div><strong>{verificationStatus === "processing" ? "영수증을 분석하고 있어요" : verificationStatus === "verified" ? "방문 인증이 완료됐어요" : receiptFile ? "이미지 사전 확인 완료" : "영수증 인증 준비"}</strong><Badge>{verificationStatus === "verified" ? "인증 완료" : verificationStatus === "processing" ? "OCR 분석 중" : receiptFile ? "OCR 연결 대기" : "업로드 필요"}</Badge></div><p>{receiptFile ? `${receiptFile.name} · ${(receiptFile.size / 1024 / 1024).toFixed(1)}MB` : "JPG, PNG, WEBP, HEIC · 최대 10MB"}</p><ul><li className={receiptFile ? "is-complete" : ""}>이미지 형식과 용량 확인</li><li className={["processing", "verified"].includes(verificationStatus) ? "is-complete" : ""}>OCR로 상호명·결제일 추출</li><li className={verificationStatus === "verified" ? "is-complete" : ""}>업체 일치·30일 이내·중복 영수증 검증</li></ul>{receiptFile && verificationStatus === "selected" && <small>선택한 이미지로 영수증 인증을 시작해 주세요.</small>}</div>
          {verificationStatus === "verified" && verificationResult && <div className="receipt-result"><div><strong>인식 결과</strong><Badge>확인 완료</Badge></div><dl><div><dt>상호명</dt><dd>{verificationResult.merchantName}</dd></div><div><dt>결제일</dt><dd>{new Date(verificationResult.paidAt).toLocaleString("ko-KR")}</dd></div><div><dt>결제 금액</dt><dd>{verificationResult.totalAmount == null ? "확인되지 않음" : `${verificationResult.totalAmount.toLocaleString()}원`}</dd></div><div><dt>승인번호</dt><dd>{verificationResult.approvalNumber}</dd></div></dl></div>}
        </section>
        <section className="review-text-step"><div><span className="step-number">2</span><div><h2>방문 경험</h2><p>메뉴, 서비스, 분위기처럼 직접 경험한 내용을 알려주세요.</p></div></div><label><span className="sr-only">리뷰 내용</span><textarea maxLength="1000" onChange={(event) => { setContent(event.target.value); setSaved(false); }} placeholder="이 장소에서 어떤 경험을 하셨나요?" value={content} /></label><small>{content.length}/1000자 · 최소 10자</small></section>
        {error && <p className="review-form-message is-error" role="alert">{error}</p>}
        {saved && <p className="review-form-message is-saved" role="status">리뷰 분석 완료: <strong>{SENTIMENT_LABELS[saved.bucket]}</strong> ({Math.round(saved.confidence * 100)}%). 리뷰 그래프에 반영했습니다.</p>}
        <div className="review-write-actions"><button onClick={onBack} type="button">{saved ? "그래프 보러 가기" : "취소"}</button><Button disabled={submitting || verificationStatus !== "verified"} type="submit">{submitting ? "AI 분석 중..." : verificationStatus === "verified" ? "리뷰 등록하기" : "영수증 인증 후 등록"}</Button></div>
      </form>
    </main>
  );
}

export default App;
