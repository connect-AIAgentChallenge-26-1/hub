import { describe, expect, it } from "vitest";
import { __testing } from "../components/condition-review";

describe("ConditionReview", () => {
  it("OTHER에서 알려진 유형으로 바꾸면 숨은 세부 유형을 제거한다", () => {
    const current = {
      locationQuery: "서울",
      placeType: "OTHER" as const,
      placeTypeDetail: "북카페",
      partySize: null,
      budgetPerPersonMin: null,
      budgetPerPersonMax: null,
      preferences: [],
      exclusions: [],
    };

    expect(__testing.withPlaceType(current, "CAFE")).toMatchObject({
      placeType: "CAFE",
      placeTypeDetail: null,
    });
    expect(__testing.withPlaceType(current, "OTHER")).toMatchObject({
      placeType: "OTHER",
      placeTypeDetail: "북카페",
    });
  });
});
