import type { PhotoSpot, ShotFrame } from "../types/photoSpot";

type ApiPhotoSpot = {
  id: string;
  name: string;
  area: string;
  description: string;
  place_category: string;
  address: string;
  place_tip: string;
  latitude: number | string;
  longitude: number | string;
  status: "official" | "candidate" | "rejected";
  image_tone: string;
  like_count?: number;
  thumbnail_image_url?: string | null;
};

type ApiPhotoGuide = {
  id: string;
  title: string;
  subtitle: string | null;
  frame_type: "solo" | "couple";
  shooting_tip: string | null;
  reference_image_url: string | null;
  overlay_image_url: string | null;
  background_guide_json: ShotFrame["backgroundGuide"];
  pose_guide_json: ShotFrame["poseGuide"];
};

type ApiSpotDetail = ApiPhotoSpot & { photo_guides: ApiPhotoGuide[] };

export type PlaceSearchResult = {
  name: string;
  category: string;
  description: string;
  address: string;
  link: string;
};

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? "";
const imageTones = new Set<PhotoSpot["imageTone"]>(["grove", "lake", "stage", "plaza"]);

function toPhotoSpot(spot: ApiPhotoSpot): PhotoSpot {
  return {
    id: spot.id,
    kind: spot.status === "official" ? "official" : "candidate",
    name: spot.name,
    area: spot.area,
    description: spot.description,
    placeCategory: spot.place_category,
    address: spot.address,
    placeTip: spot.place_tip,
    thumbnailImageUrl: spot.thumbnail_image_url,
    latitude: Number(spot.latitude),
    longitude: Number(spot.longitude),
    likes: Number(spot.like_count ?? 0),
    threshold: spot.status === "candidate" ? 10 : undefined,
    imageTone: imageTones.has(spot.image_tone as PhotoSpot["imageTone"])
      ? spot.image_tone as PhotoSpot["imageTone"]
      : "plaza",
  };
}

function toShotFrame(guide: ApiPhotoGuide, tone: PhotoSpot["imageTone"]): ShotFrame {
  return {
    id: guide.id,
    title: guide.title,
    subtitle: guide.subtitle ?? (guide.frame_type === "couple" ? "커플" : "1인"),
    people: guide.frame_type,
    tone,
    guide: guide.shooting_tip ?? "예시 사진의 인물 배치와 배경선을 따라 맞춰보세요.",
    referenceImageUrl: guide.reference_image_url,
    overlayImageUrl: guide.overlay_image_url,
    backgroundGuide: guide.background_guide_json,
    poseGuide: guide.pose_guide_json,
  };
}

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`);
  if (!response.ok) throw new Error("포토스팟 데이터를 불러오지 못했어요.");
  return response.json() as Promise<T>;
}

export async function fetchOfficialSpots(): Promise<PhotoSpot[]> {
  const { items } = await request<{ items: ApiPhotoSpot[] }>("/api/photo-spots?status=official");
  return items.map(toPhotoSpot);
}

export async function fetchCandidateSpots(): Promise<PhotoSpot[]> {
  const { items } = await request<{ items: ApiPhotoSpot[] }>("/api/photo-spots?status=candidate");
  return items.map(toPhotoSpot);
}

export async function fetchSpotFrames(spotId: string): Promise<ShotFrame[]> {
  const { item } = await request<{ item: ApiSpotDetail }>(`/api/photo-spots/${spotId}`);
  const tone = toPhotoSpot(item).imageTone;
  return item.photo_guides.map((guide) => toShotFrame(guide, tone));
}

export async function searchPlaces(query: string): Promise<PlaceSearchResult[]> {
  const response = await fetch(`${apiBaseUrl}/api/places/search?q=${encodeURIComponent(query)}`);
  const payload = await response.json().catch(() => null) as { items?: PlaceSearchResult[]; message?: string } | null;
  if (!response.ok) throw new Error(payload?.message ?? "장소를 검색하지 못했어요.");
  return payload?.items ?? [];
}

export async function createCandidateSpot(payload: {
  spotName: string;
  address: string;
  latitude: number;
  longitude: number;
  frameType: "solo" | "couple";
  image: File;
  poseGuide: NonNullable<ShotFrame["poseGuide"]>;
}): Promise<{ spot: PhotoSpot; frames: ShotFrame[] }> {
  const body = new FormData();
  body.append("spotName", payload.spotName);
  body.append("address", payload.address);
  body.append("latitude", String(payload.latitude));
  body.append("longitude", String(payload.longitude));
  body.append("frameType", payload.frameType);
  body.append("poseGuide", JSON.stringify(payload.poseGuide));
  body.append("image", payload.image);

  const response = await fetch(`${apiBaseUrl}/api/candidate-spots`, { method: "POST", body });
  const result = await response.json().catch(() => null) as { item?: ApiPhotoSpot; photo_guides?: ApiPhotoGuide[]; message?: string } | null;
  if (!response.ok || !result?.item) throw new Error(result?.message ?? "후보 포토스팟을 등록하지 못했어요.");
  const spot = toPhotoSpot(result.item);
  return { spot, frames: (result.photo_guides ?? []).map((guide) => toShotFrame(guide, spot.imageTone)) };
}
