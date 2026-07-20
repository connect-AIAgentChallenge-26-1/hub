import html
import re

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.config import settings
from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.place import PlaceRead, PlaceSearchResponse

router = APIRouter(prefix="/places", tags=["places"])

NAVER_LOCAL_SEARCH_URL = "https://openapi.naver.com/v1/search/local.json"
HTML_TAG_PATTERN = re.compile(r"<[^>]*>")


def _plain_text(value: str) -> str:
    return html.unescape(HTML_TAG_PATTERN.sub("", value))


@router.get("/search", response_model=PlaceSearchResponse)
async def search_places(
    query: str = Query(min_length=2, max_length=100, description="예: 강남역 파스타"),
    _: User = Depends(get_current_user),
) -> PlaceSearchResponse:
    if not settings.naver_client_id or not settings.naver_client_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="네이버 검색 API가 설정되지 않았습니다. backend/.env를 확인해주세요.",
        )

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.get(
                NAVER_LOCAL_SEARCH_URL,
                params={"query": query, "display": 10, "sort": "comment"},
                headers={
                    "X-Naver-Client-Id": settings.naver_client_id,
                    "X-Naver-Client-Secret": settings.naver_client_secret,
                },
            )
            response.raise_for_status()
    except httpx.TimeoutException as exc:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="네이버 검색 응답이 지연되고 있습니다. 잠시 후 다시 시도해주세요.",
        ) from exc
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="네이버 검색 요청에 실패했습니다. API 설정을 확인해주세요.",
        ) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="네이버 검색 서비스에 연결하지 못했습니다.",
        ) from exc

    items = [
        PlaceRead(
            name=_plain_text(item.get("title", "")),
            category=item.get("category", ""),
            address=item.get("address", ""),
            road_address=item.get("roadAddress", ""),
            telephone=item.get("telephone", ""),
            link=item.get("link", ""),
        )
        for item in response.json().get("items", [])
    ]
    return PlaceSearchResponse(items=items)
