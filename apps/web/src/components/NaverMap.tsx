import { MapPin } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DURYU_CENTER } from "../data/photoSpots";
import { loadNaverMaps, retryLoadNaverMaps } from "../services/naverMaps";
import type { PhotoSpot, SpotKind } from "../types/photoSpot";

type Props = {
  spots: PhotoSpot[];
  selectedId?: string;
  focusKey?: number;
  sheetExpanded?: boolean;
  mode: SpotKind;
  isActive?: boolean;
  selectable?: boolean;
  locateOnMount?: boolean;
  selectedCoordinate?: { latitude: number; longitude: number };
  onSelect: (spot: PhotoSpot) => void;
  onCoordinateSelect?: (coordinate: { latitude: number; longitude: number }) => void;
};

type NaverMapInstance = {
  setCenter?: (coordinate: unknown) => void;
  panTo?: (coordinate: unknown) => void;
  setZoom?: (zoom: number) => void;
  destroy?: () => void;
};

type NaverMarker = { setMap: (map: unknown | null) => void; setPosition?: (position: unknown) => void };

export function NaverMap({ spots, selectedId, focusKey = 0, sheetExpanded = false, mode, isActive = true, selectable = false, locateOnMount = false, selectedCoordinate, onSelect, onCoordinateSelect }: Props) {
  const elementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);
  const markerRefs = useRef<NaverMarker[]>([]);
  const selectedMarkerRef = useRef<NaverMarker | null>(null);
  const currentLocationMarkerRef = useRef<NaverMarker | null>(null);
  const onSelectRef = useRef(onSelect);
  const onCoordinateSelectRef = useRef(onCoordinateSelect);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    onCoordinateSelectRef.current = onCoordinateSelect;
  }, [onCoordinateSelect]);

  useEffect(() => {
    let mounted = true;
    loadNaverMaps()
      .then((maps) => {
        if (!mounted || !elementRef.current) return;
        const map = new maps.Map(elementRef.current, {
          center: new maps.LatLng(DURYU_CENTER.latitude, DURYU_CENTER.longitude),
          zoom: 15,
          zoomControl: false,
          mapDataControl: false,
        });
        mapRef.current = map;
        if (selectable) {
          maps.Event.addListener(map, "click", (event) => {
            onCoordinateSelectRef.current?.({ latitude: event.coord.lat(), longitude: event.coord.lng() });
          });
        }
        setStatus("ready");
      })
      .catch(() => mounted && setStatus("error"));
    return () => {
      mounted = false;
      // Map.destroy() safely releases its overlays and DOM before React removes
      // the map container. Calling Marker.setMap(null) after removal can make
      // the Maps SDK access an already-null internal map instance.
      (mapRef.current as NaverMapInstance | null)?.destroy?.();
      markerRefs.current = [];
      selectedMarkerRef.current = null;
      currentLocationMarkerRef.current = null;
      mapRef.current = null;
    };
  }, [selectable, loadAttempt]);

  useEffect(() => {
    if (status !== "ready" || !mapRef.current) return;
    let cancelled = false;
    loadNaverMaps().then((maps) => {
      if (cancelled || !mapRef.current) return;
      markerRefs.current.forEach((marker) => marker.setMap(null));
      markerRefs.current = spots.map((spot) => {
        const marker = new maps.Marker({
          position: new maps.LatLng(spot.latitude, spot.longitude),
          map: mapRef.current,
          title: spot.name,
        });
        maps.Event.addListener(marker, "click", () => onSelectRef.current(spot));
        return marker;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [spots, status, mode]);

  useEffect(() => {
    if (status !== "ready" || !mapRef.current || !selectedId) return;
    const selectedSpot = spots.find((spot) => spot.id === selectedId);
    if (!selectedSpot) return;

    void loadNaverMaps().then((maps) => {
      const map = mapRef.current as NaverMapInstance | null;
      const coordinate = new maps.LatLng(selectedSpot.latitude, selectedSpot.longitude);
      if (typeof map?.panTo === "function") map.panTo(coordinate);
      else map?.setCenter?.(coordinate);
      map?.setZoom?.(16);
    });
  }, [selectedId, spots, status, focusKey]);

  const moveToCurrentLocation = (selectCoordinate = false) => {
    if (!navigator.geolocation) {
      setLocationMessage("이 브라우저에서는 현재 위치를 사용할 수 없어요.");
      return;
    }
    setLocationMessage("현재 위치를 확인하고 있어요.");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        void loadNaverMaps().then((maps) => {
          const map = mapRef.current as NaverMapInstance | null;
          if (!mapRef.current) return;
          const coordinate = new maps.LatLng(coords.latitude, coords.longitude);
          if (typeof map?.panTo === "function") map.panTo(coordinate);
          else map?.setCenter?.(coordinate);
          map?.setZoom?.(16);
          if (currentLocationMarkerRef.current?.setPosition) {
            currentLocationMarkerRef.current.setPosition(coordinate);
          } else {
            currentLocationMarkerRef.current?.setMap(null);
            currentLocationMarkerRef.current = new maps.Marker({
              position: coordinate,
              map: mapRef.current,
              title: "내 위치",
              icon: { content: '<div class="current-location-marker"></div>' },
            });
          }
          if (selectCoordinate) onCoordinateSelectRef.current?.({ latitude: coords.latitude, longitude: coords.longitude });
          setLocationMessage(null);
        });
      },
      () => setLocationMessage("현재 위치 권한을 허용하면 이동할 수 있어요."),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  };

  useEffect(() => {
    if (selectable && locateOnMount && status === "ready") moveToCurrentLocation(true);
  }, [locateOnMount, selectable, status]);

  useEffect(() => {
    if (!selectable || !selectedCoordinate || status !== "ready" || !mapRef.current) return;
    let cancelled = false;
    void loadNaverMaps().then((maps) => {
      if (cancelled || !mapRef.current) return;
      const position = new maps.LatLng(selectedCoordinate.latitude, selectedCoordinate.longitude);
      selectedMarkerRef.current?.setMap(null);
      selectedMarkerRef.current = new maps.Marker({
        position,
        map: mapRef.current,
        title: "선택한 촬영 위치",
        icon: { content: '<div class="proposal-photo-marker"><span>&#128247;</span></div>' },
      });
      (mapRef.current as NaverMapInstance).panTo?.(position);
    });
    return () => { cancelled = true; };
  }, [selectedCoordinate?.latitude, selectedCoordinate?.longitude, selectable, status]);

  return (
    <div className={`map-canvas ${sheetExpanded ? "sheet-expanded" : ""}`} aria-label="네이버 지도">
      <div ref={elementRef} className="map-element" />
      {status !== "ready" && (
        <div className="map-status">
          {status === "loading" ? "네이버 지도를 불러오는 중..." : <><span>지도를 불러오지 못했어요. Client ID와 허용 URL을 확인해 주세요.</span><button type="button" onClick={() => { retryLoadNaverMaps(); setStatus("loading"); setLoadAttempt((current) => current + 1); }}>지도 다시 불러오기</button></>}
        </div>
      )}
      {locationMessage && <div className="location-status">{locationMessage}</div>}
      <div className="map-controls">
        <button type="button" className="map-control" onClick={() => moveToCurrentLocation()} aria-label="현재 위치로 이동"><MapPin size={21} /></button>
      </div>
    </div>
  );
}
