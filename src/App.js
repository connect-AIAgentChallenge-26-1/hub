import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { Badge, Button, SearchField } from "./components/ui";

const DEFAULT_CENTER = { lat: 37.5665, lng: 126.978 };
const KAKAO_MAP_KEY = process.env.REACT_APP_KAKAO_MAP_JAVASCRIPT_KEY;
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || "http://localhost:4000";
const PLACE_STORAGE_KEY = "pure-review:selected-place";

function loadKakaoMaps(appKey) {
  if (window.kakao?.maps) return Promise.resolve(window.kakao.maps);

  return new Promise((resolve, reject) => {
    const existingScript = document.querySelector("script[data-kakao-map]");
    const handleReady = () => {
      if (!window.kakao?.maps) {
        reject(new Error("카카오맵 객체를 불러오지 못했습니다."));
        return;
      }
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
  return {
    id: item.id,
    title: item.title,
    category: item.category,
    fullCategory: item.fullCategory,
    address: item.roadAddress || item.address,
    oldAddress: item.address,
    link: item.link,
    telephone: item.telephone,
    x: Number(item.x),
    y: Number(item.y),
  };
}

function getRoute() {
  const match = window.location.pathname.match(/^\/places\/([^/]+)$/);
  return match ? { name: "detail", placeId: decodeURIComponent(match[1]) } : { name: "map" };
}

function App() {
  const [route, setRoute] = useState(getRoute);
  const [selectedPlace, setSelectedPlace] = useState(() => {
    try {
      const stored = sessionStorage.getItem(PLACE_STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    const handlePopState = () => setRoute(getRoute());
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  function openPlace(place) {
    setSelectedPlace(place);
    sessionStorage.setItem(PLACE_STORAGE_KEY, JSON.stringify(place));
    window.history.pushState({}, "", `/places/${encodeURIComponent(place.id)}`);
    setRoute(getRoute());
  }

  function goToMap() {
    window.history.pushState({}, "", "/");
    setRoute(getRoute());
  }

  if (route.name === "detail") {
    const routePlace = selectedPlace?.id === route.placeId ? selectedPlace : null;
    return <PlaceDetailPage place={routePlace} onBack={goToMap} />;
  }

  return <MapSearchPage onOpenPlace={openPlace} />;
}

function MapSearchPage({ onOpenPlace }) {
  const mapElementRef = useRef(null);
  const mapRef = useRef(null);
  const overlaysRef = useRef([]);
  const [mapStatus, setMapStatus] = useState(KAKAO_MAP_KEY ? "loading" : "missing-key");
  const [mapError, setMapError] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [places, setPlaces] = useState([]);
  const [placeStatus, setPlaceStatus] = useState("idle");
  const [placeError, setPlaceError] = useState("");
  const [selectedPlaceId, setSelectedPlaceId] = useState("");

  const selectedPlace = useMemo(
    () => places.find((place) => place.id === selectedPlaceId) || null,
    [places, selectedPlaceId]
  );

  useEffect(() => {
    if (!KAKAO_MAP_KEY || !mapElementRef.current) return;
    let mounted = true;

    loadKakaoMaps(KAKAO_MAP_KEY)
      .then((maps) => {
        if (!mounted || !mapElementRef.current) return;
        const map = new maps.Map(mapElementRef.current, {
          center: new maps.LatLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng),
          level: 6,
        });
        map.addControl(new maps.ZoomControl(), maps.ControlPosition.RIGHT);
        mapRef.current = map;
        setMapStatus("ready");
      })
      .catch((error) => {
        if (!mounted) return;
        setMapStatus("error");
        setMapError(error.message);
      });

    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (mapStatus !== "ready" || !mapRef.current || !window.kakao?.maps) return;
    const maps = window.kakao.maps;
    overlaysRef.current.forEach((overlay) => overlay.setMap(null));
    overlaysRef.current = [];
    if (!places.length) return;

    const bounds = new maps.LatLngBounds();
    places.forEach((place) => {
      if (!Number.isFinite(place.x) || !Number.isFinite(place.y)) return;
      const position = new maps.LatLng(place.y, place.x);
      const marker = document.createElement("button");
      marker.type = "button";
      marker.className = `map-marker ${place.id === selectedPlaceId ? "is-selected" : ""}`;
      marker.textContent = place.title;
      marker.addEventListener("click", () => setSelectedPlaceId(place.id));
      const overlay = new maps.CustomOverlay({ map: mapRef.current, position, content: marker, yAnchor: 1.25 });
      overlaysRef.current.push(overlay);
      bounds.extend(position);
    });
    mapRef.current.setBounds(bounds);
  }, [places, selectedPlaceId, mapStatus]);

  async function handleSearchSubmit(event) {
    event.preventDefault();
    const query = searchInput.trim();
    if (!query) return;
    setPlaceStatus("loading");
    setPlaceError("");
    setSelectedPlaceId("");

    try {
      const response = await fetch(`${API_BASE_URL}/api/kakao/local?query=${encodeURIComponent(query)}&size=15&sort=accuracy`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.detail?.message || payload.message || "검색에 실패했습니다.");
      const nextPlaces = (payload.items || []).map(normalizePlace);
      setPlaces(nextPlaces);
      setSelectedPlaceId(nextPlaces[0]?.id || "");
      setPlaceStatus("ready");
    } catch (error) {
      setPlaces([]);
      setPlaceStatus("error");
      setPlaceError(error.message);
    }
  }

  return (
    <main className="map-screen">
      <header className="top-nav">
        <strong className="top-nav__brand">PureReview</strong>
        <span>영수증 인증 리뷰 지도</span>
      </header>

      <aside className="place-sidebar">
        <div className="sidebar-search">
          <h1>어디를 찾으세요?</h1>
          <p>카카오맵의 실제 식당과 카페를 검색합니다.</p>
          <SearchField value={searchInput} onChange={(event) => setSearchInput(event.target.value)} onSubmit={handleSearchSubmit} />
        </div>
        <div className="place-results" aria-live="polite">
          {placeStatus === "idle" && <div className="empty-search"><strong>검색 결과가 여기에 표시됩니다</strong><span>식당이나 카페 이름을 입력해 주세요.</span></div>}
          {placeStatus === "loading" && <p className="sidebar-state">카카오맵에서 검색 중...</p>}
          {placeStatus === "error" && <p className="sidebar-state sidebar-state--error">{placeError}</p>}
          {placeStatus === "ready" && places.length === 0 && <p className="sidebar-state">검색 결과가 없습니다.</p>}
          {places.map((place) => (
            <button className={`place-list-item ${selectedPlaceId === place.id ? "is-selected" : ""}`} key={place.id} onClick={() => setSelectedPlaceId(place.id)} type="button">
              <span className="place-list-item__pin">⌖</span>
              <span className="place-list-item__content">
                <strong>{place.title}</strong>
                <span>{place.category}</span>
                <small>{place.address || "주소 정보 없음"}</small>
              </span>
              <span aria-hidden="true">›</span>
            </button>
          ))}
        </div>
        {selectedPlace && <Button className="detail-button" onClick={() => onOpenPlace(selectedPlace)}>업체 상세 보기</Button>}
      </aside>

      <section className="map-canvas" aria-label="카카오맵 영역">
        <div className="kakao-map" ref={mapElementRef} aria-label="카카오맵" />
        {mapStatus !== "ready" && (
          <section className="map-state-panel">
            <h2>{mapStatus === "missing-key" ? "지도 키가 필요합니다" : "지도를 불러오는 중입니다"}</h2>
            <p>{mapError || "카카오맵 연결을 확인하고 있습니다."}</p>
          </section>
        )}
      </section>
    </main>
  );
}

function PlaceDetailPage({ place, onBack }) {
  if (!place) {
    return (
      <main className="route-empty">
        <strong>업체 정보를 찾을 수 없습니다.</strong>
        <p>지도에서 업체를 다시 검색해 주세요.</p>
        <Button onClick={onBack}>지도로 돌아가기</Button>
      </main>
    );
  }

  return (
    <main className="detail-page">
      <aside className="detail-nav">
        <div><strong>PureReview</strong><span>Verified places</span></div>
        <nav>
          <button onClick={onBack} type="button">⌖ 지도 검색</button>
          <button className="is-active" type="button">▤ 업체 리뷰</button>
        </nav>
        <Button>영수증 리뷰 등록하기</Button>
      </aside>

      <div className="detail-content">
        <header className="detail-header">
          <button onClick={onBack} type="button">← 지도</button>
          <span>업체 상세</span>
        </header>

        <section className="place-summary">
          <div>
            <Badge>{place.category || "음식점"}</Badge>
            <h1>{place.title}</h1>
            <p>{place.address || place.oldAddress || "주소 정보 없음"}</p>
          </div>
          {place.link && <a href={place.link} rel="noreferrer" target="_blank">카카오맵에서 보기 ↗</a>}
        </section>

        <section className="place-facts">
          <div><span>전화</span><strong>{place.telephone || "등록된 전화번호 없음"}</strong></div>
          <div><span>분류</span><strong>{place.fullCategory || place.category}</strong></div>
          <div><span>방문 인증 리뷰</span><strong>0개</strong></div>
        </section>

        <section className="review-insight">
          <div><span>리뷰 분석</span><h2>아직 분석할 인증 리뷰가 없습니다</h2></div>
          <p>영수증 OCR 인증을 통과한 리뷰가 등록되면 긍정·아쉬운 리뷰 비율과 가중 별점이 표시됩니다.</p>
          <div className="empty-bars" aria-hidden="true">{[1, 2, 3, 4, 5].map((item) => <span key={item} />)}</div>
        </section>

        <section className="review-section">
          <div className="review-section__header"><div><span>인증 리뷰</span><h2>방문자의 솔직한 경험</h2></div><Button>리뷰 작성</Button></div>
          <div className="review-empty"><strong>첫 번째 인증 리뷰를 기다리고 있어요</strong><p>영수증 이미지로 방문을 인증한 리뷰만 집계됩니다.</p></div>
        </section>
      </div>
    </main>
  );
}

export default App;
