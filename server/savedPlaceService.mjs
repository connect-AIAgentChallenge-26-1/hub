export function normalizeSavedPlaceInput(place = {}) {
  const kakaoPlaceId = String(place.id || place.kakaoPlaceId || "").trim();
  const name = String(place.title || place.name || "").trim();
  if (!kakaoPlaceId || !name) throw new Error("저장할 장소 정보가 올바르지 않습니다.");
  const longitude = Number(place.x ?? place.longitude);
  const latitude = Number(place.y ?? place.latitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error("장소 좌표가 올바르지 않습니다.");
  return {
    kakao_place_id: kakaoPlaceId,
    name,
    category: String(place.fullCategory || place.category || "업체").trim(),
    address: String(place.address || place.oldAddress || "").trim(),
    road_address: String(place.roadAddress || "").trim(),
    latitude,
    longitude,
    phone: String(place.telephone || place.phone || "").trim(),
    kakao_place_url: String(place.link || place.kakaoPlaceUrl || "").trim(),
  };
}

export function toPublicSavedPlace(savedPlace) {
  const place = savedPlace.places;
  return {
    id: place.kakao_place_id,
    title: place.name,
    category: place.category || "업체",
    fullCategory: place.category || "업체",
    address: place.road_address || place.address || "",
    oldAddress: place.address || "",
    roadAddress: place.road_address || "",
    x: place.longitude,
    y: place.latitude,
    telephone: place.phone || "",
    link: place.kakao_place_url || "",
    savedAt: savedPlace.created_at,
  };
}

