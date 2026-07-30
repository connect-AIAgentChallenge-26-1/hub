type NaverMaps = {
  Map: new (element: HTMLElement, options: unknown) => {
    setCenter?: (coordinate: unknown) => void;
    setZoom?: (zoom: number) => void;
    destroy?: () => void;
  };
  LatLng: new (latitude: number, longitude: number) => unknown;
  Marker: new (options: unknown) => { setMap: (map: unknown | null) => void };
  Size: new (width: number, height: number) => unknown;
  Point: new (x: number, y: number) => unknown;
  Event: { addListener: (target: unknown, event: string, handler: (event: { coord: { lat: () => number; lng: () => number } }) => void) => unknown };
  Service: {
    Status: { OK: string };
    geocode: (options: { query: string }, callback: (status: string, response: { v2?: { addresses?: Array<{ x: string; y: string }> } }) => void) => void;
  };
};

declare global {
  interface Window {
    naver?: { maps: NaverMaps };
  }
}

let loadPromise: Promise<NaverMaps> | undefined;

export function retryLoadNaverMaps() {
  loadPromise = undefined;
  document.querySelectorAll('script[src*="oapi.map.naver.com/openapi/v3/maps.js"]').forEach((script) => script.remove());
}

export function loadNaverMaps(): Promise<NaverMaps> {
  if (window.naver?.maps) return Promise.resolve(window.naver.maps);
  if (loadPromise) return loadPromise;

  const clientId = import.meta.env.VITE_NAVER_MAPS_CLIENT_ID;
  if (!clientId) return Promise.reject(new Error("지도 Client ID가 설정되지 않았습니다."));

  loadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(clientId)}&submodules=geocoder`;
    script.async = true;
    script.onload = () => {
      if (window.naver?.maps) {
        resolve(window.naver.maps);
        return;
      }
      loadPromise = undefined;
      reject(new Error("지도 SDK를 불러오지 못했습니다."));
    };
    script.onerror = () => {
      loadPromise = undefined;
      reject(new Error("네이버 지도 SDK 요청이 실패했습니다."));
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}

export async function geocodeAddress(query: string): Promise<{ latitude: number; longitude: number }> {
  const maps = await loadNaverMaps();
  return new Promise((resolve, reject) => {
    maps.Service.geocode({ query }, (status, response) => {
      // 네이버 SDK는 인증·쿼터 오류일 때 response 없이 상태만 전달한다.
      const address = response?.v2?.addresses?.[0];
      if (status !== maps.Service.Status.OK || !address) {
        reject(new Error(`장소를 찾지 못했어요. (상태: ${status})`));
        return;
      }
      resolve({ latitude: Number(address.y), longitude: Number(address.x) });
    });
  });
}
