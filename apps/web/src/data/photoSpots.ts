import type { PhotoSpot } from "../types/photoSpot";
import type { ShotFrame } from "../types/photoSpot";

export const DURYU_CENTER = { latitude: 35.8547, longitude: 128.5663 };

export const photoSpots: PhotoSpot[] = [
  {
    id: "candidate-modern-history-alley",
    kind: "candidate",
    name: "근대역사관 골목 창문",
    area: "대구 근대역사관 주변",
    description: "벽돌 창문과 골목 원근감을 함께 담는 1인 전신 구도",
    placeCategory: "골목 · 근대건축",
    address: "대구광역시 중구 경상감영길 67",
    placeTip: "오후 빛이 벽돌 벽에 닿을 때 인물을 창문 아래에 맞춰보세요.",
    thumbnailImageUrl: "/candidate-spots/modern-history-alley.png",
    latitude: 35.87353,
    longitude: 128.59674,
    likes: 7,
    threshold: 10,
    imageTone: "plaza",
  },
  {
    id: "candidate-sparkland-rooftop",
    kind: "candidate",
    name: "스파크랜드 루프탑 야경",
    area: "동성로 스파크랜드",
    description: "도심 불빛을 배경으로 난간 옆에 서는 야경 인물 구도",
    placeCategory: "루프탑 · 야경",
    address: "대구광역시 중구 동성로6길 61",
    placeTip: "야간에는 화면 밝기를 낮추고 도시 불빛이 인물 오른쪽에 오게 맞춰보세요.",
    thumbnailImageUrl: "/candidate-spots/sparkland-rooftop.png",
    latitude: 35.87086,
    longitude: 128.59766,
    likes: 9,
    threshold: 10,
    imageTone: "stage",
  },
  {
    id: "candidate-naver-1784-garden",
    kind: "candidate",
    name: "NAVER 1784 수공간",
    area: "NAVER 1784 야외 정원",
    description: "건물 반사와 수공간을 함께 담는 커플 반신 구도",
    placeCategory: "정원 · 건축",
    address: "경기도 성남시 분당구 정자일로 95",
    placeTip: "두 사람을 물가 왼쪽에 두고 건물 반사가 화면 중앙에 오게 맞춰보세요.",
    thumbnailImageUrl: "/candidate-spots/naver-1784-garden.png",
    latitude: 37.35973,
    longitude: 127.10531,
    likes: 4,
    threshold: 10,
    imageTone: "lake",
  },
];

export const shotFrames: ShotFrame[] = [
  {
    id: "couple-stage",
    title: "무대 배경 투샷",
    subtitle: "추천 · 커플",
    people: "couple",
    tone: "stage",
    guide: "무대 지붕선과 두 사람의 상체를 가이드에 맞춰보세요.",
  },
  {
    id: "solo-center",
    title: "중앙 전신샷",
    subtitle: "초보 · 1인",
    people: "solo",
    tone: "plaza",
    guide: "인물을 하단 1/3에 두고 배경 여백을 남겨보세요.",
  },
  {
    id: "couple-walk",
    title: "산책길 커플샷",
    subtitle: "커플 · 자연스러운 포즈",
    people: "couple",
    tone: "grove",
    guide: "두 사람의 얼굴이 원형 가이드 안에 들어오게 맞춰보세요.",
  },
];
