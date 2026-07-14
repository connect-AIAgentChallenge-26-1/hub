"""맛집 추천.

네이버 지역검색 + 카카오 로컬 API 결과를 합쳐 평점·리뷰 기반 통합 점수로 정렬한다.
키가 설정되지 않으면 목업 데이터를 반환해 UI/흐름을 그대로 시연할 수 있다.
(구글 OAuth와 동일한 "키 없으면 안내/폴백" 패턴)
"""

import hashlib
from dataclasses import dataclass

from app.config import settings

CATEGORIES = ["한식", "일식", "중식", "양식", "분식", "카페"]


@dataclass
class Restaurant:
    name: str
    category: str
    rating: float
    review_count: int
    distance_min: int  # 도보 분
    sources: list[str]  # ["naver", "kakao"]
    address: str
    place_url: str
    is_mock: bool = False


def keys_configured() -> bool:
    return bool(
        (settings.naver_client_id and settings.naver_client_secret)
        or settings.kakao_rest_api_key
    )


def _score(r: Restaurant) -> float:
    """평점(0~5)과 리뷰 수(로그 스케일)를 합친 통합 점수. 두 소스 모두면 가산점."""
    import math

    base = r.rating * 20 + math.log1p(r.review_count) * 5
    if len(r.sources) > 1:
        base += 8
    return base


def _mock_restaurants(location: str, category: str) -> list[Restaurant]:
    """위치·카테고리로 결정적(deterministic) 목업 4곳을 만든다."""
    templates = {
        "한식": ["온담식당", "밥꽃마을", "청춘국밥", "순이네 백반"],
        "일식": ["스시노마", "멘야하나", "돈카츠공방", "우동상회"],
        "중식": ["홍복반점", "짬뽕지존", "청도양꼬치", "마라공방"],
        "양식": ["파스타공작소", "버거앤번", "트라토리아", "스테이크하우스"],
        "분식": ["엽기떡볶이", "김밥천국", "신전떡볶이", "종로김밥"],
        "카페": ["빈브라더스", "카페베네", "블루보틀", "테라로사"],
    }
    names = templates.get(category, templates["한식"])
    seed = f"{location}:{category}"
    out: list[Restaurant] = []
    for i, name in enumerate(names):
        # location+name 해시로 평점/리뷰/거리를 안정적으로 생성
        h = int(hashlib.md5(f"{seed}:{name}".encode()).hexdigest(), 16)
        rating = round(4.0 + (h % 10) / 10, 1)  # 4.0~4.9
        reviews = 50 + (h // 10 % 400)  # 50~449
        distance = 2 + (h // 100 % 10)  # 2~11분
        sources = ["naver", "kakao"] if h % 3 == 0 else (["naver"] if h % 2 == 0 else ["kakao"])
        out.append(
            Restaurant(
                name=name,
                category=category,
                rating=rating,
                review_count=reviews,
                distance_min=distance,
                sources=sources,
                address=f"{location} 인근",
                place_url=f"https://map.naver.com/v5/search/{name}",
                is_mock=True,
            )
        )
    out.sort(key=_score, reverse=True)
    return out


def search_restaurants(location: str, category: str) -> list[Restaurant]:
    """맛집 후보를 통합 점수 상위 4곳 반환. 키 없으면 목업."""
    if not keys_configured():
        return _mock_restaurants(location, category)
    # TODO: 네이버 지역검색(https://openapi.naver.com/v1/search/local.json) +
    #       카카오 로컬(https://dapi.kakao.com/v2/local/search/keyword.json) 병합.
    #       키가 준비되면 여기서 실제 호출로 대체 (목업과 동일한 Restaurant 리스트 반환).
    return _mock_restaurants(location, category)
