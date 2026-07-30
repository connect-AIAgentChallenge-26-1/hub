import { MapPin, Search } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { geocodeAddress, loadNaverMaps } from "../services/naverMaps";

const initialCenter = { latitude: 35.8713, longitude: 128.6018 };

type MapInstance = {
  setCenter?: (coordinate: unknown) => void;
  setZoom?: (zoom: number) => void;
  destroy?: () => void;
};

export function CoordinatePicker() {
  const mapElementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapInstance | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("장소명을 검색하거나 지도에서 촬영 지점을 클릭하세요.");
  const [coordinate, setCoordinate] = useState(initialCenter);
  const [latitudeInput, setLatitudeInput] = useState(String(initialCenter.latitude));
  const [longitudeInput, setLongitudeInput] = useState(String(initialCenter.longitude));

  useEffect(() => {
    let disposed = false;
    void loadNaverMaps().then((maps) => {
      if (disposed || !mapElementRef.current) return;
      const map = new maps.Map(mapElementRef.current, {
        center: new maps.LatLng(initialCenter.latitude, initialCenter.longitude),
        zoom: 14,
        zoomControl: true,
      });
      mapRef.current = map;
      maps.Event.addListener(map, "click", (event) => {
        const next = { latitude: event.coord.lat(), longitude: event.coord.lng() };
        setCoordinate(next);
        setLatitudeInput(String(next.latitude));
        setLongitudeInput(String(next.longitude));
        setStatus("촬영 지점을 선택했어요. 아래 좌표를 DB에 저장하면 됩니다.");
      });
    }).catch(() => setStatus("지도를 불러오지 못했어요. Client ID와 허용 URL을 확인해 주세요."));

    return () => {
      disposed = true;
      mapRef.current?.destroy?.();
      mapRef.current = null;
    };
  }, []);

  const search = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!query.trim()) return;
    try {
      setStatus("장소를 찾는 중이에요.");
      const next = await geocodeAddress(query.trim());
      setCoordinate(next);
      setLatitudeInput(String(next.latitude));
      setLongitudeInput(String(next.longitude));
      const maps = await loadNaverMaps();
      mapRef.current?.setCenter?.(new maps.LatLng(next.latitude, next.longitude));
      mapRef.current?.setZoom?.(18);
      setStatus("장소 중심으로 이동했어요. 실제 촬영 지점을 한 번 더 클릭하세요.");
    } catch {
      setStatus("주소나 장소명을 찾지 못했어요. 더 구체적인 주소로 다시 검색해 주세요.");
    }
  };

  const applyCoordinate = () => {
    const latitude = Number(latitudeInput);
    const longitude = Number(longitudeInput);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      setStatus("위도는 -90~90, 경도는 -180~180 범위의 숫자로 입력해 주세요.");
      return;
    }

    setCoordinate({ latitude, longitude });
    void loadNaverMaps().then((maps) => {
      mapRef.current?.setCenter?.(new maps.LatLng(latitude, longitude));
      mapRef.current?.setZoom?.(18);
    });
    setStatus("입력한 좌표로 이동했어요. 필요하면 지도에서 한 번 더 클릭해 미세 조정하세요.");
  };

  return (
    <main className="coordinate-picker-page">
      <section className="coordinate-picker-panel">
        <header>
          <span>관리자 도구</span>
          <h1>촬영 지점 좌표 선택</h1>
          <p>검색으로 장소로 이동한 뒤, 실제 사진을 찍는 지점을 지도에서 클릭합니다.</p>
        </header>
        <form onSubmit={search}>
          <label>
            <Search size={19} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="예: 대구 중구 경상감영길 67" />
          </label>
          <button type="submit">장소 찾기</button>
        </form>
        <div className="coordinate-map" ref={mapElementRef} />
        <div className="coordinate-result">
          <MapPin size={22} />
          <div>
            <strong>선택 좌표</strong>
            <code>latitude: {coordinate.latitude.toFixed(6)}</code>
            <code>longitude: {coordinate.longitude.toFixed(6)}</code>
          </div>
        </div>
        <div className="coordinate-manual-inputs">
          <label>
            위도
            <input value={latitudeInput} onChange={(event) => setLatitudeInput(event.target.value)} inputMode="decimal" />
          </label>
          <label>
            경도
            <input value={longitudeInput} onChange={(event) => setLongitudeInput(event.target.value)} inputMode="decimal" />
          </label>
          <button type="button" onClick={applyCoordinate}>좌표로 이동</button>
        </div>
        <p className="coordinate-status">{status}</p>
      </section>
    </main>
  );
}
