import assert from "node:assert/strict";
import test from "node:test";
import { normalizeSavedPlaceInput } from "./savedPlaceService.mjs";

test("카카오 장소를 places 테이블에 저장할 형식으로 정규화한다", () => {
  assert.deepEqual(normalizeSavedPlaceInput({
    id: "123",
    title: "테스트 카페",
    category: "카페",
    fullCategory: "음식점 > 카페",
    address: "서울 종로구",
    roadAddress: "서울 종로구 도로 1",
    x: "126.98",
    y: "37.57",
    telephone: "02-123-4567",
    link: "https://place.map.kakao.com/123",
  }), {
    kakao_place_id: "123",
    name: "테스트 카페",
    category: "음식점 > 카페",
    address: "서울 종로구",
    road_address: "서울 종로구 도로 1",
    latitude: 37.57,
    longitude: 126.98,
    phone: "02-123-4567",
    kakao_place_url: "https://place.map.kakao.com/123",
  });
});

test("필수 장소 정보가 없거나 좌표가 잘못되면 거부한다", () => {
  assert.throws(() => normalizeSavedPlaceInput({ title: "이름만 있음" }), /장소 정보/);
  assert.throws(() => normalizeSavedPlaceInput({ id: "1", title: "좌표 오류", x: "x", y: "y" }), /좌표/);
});

