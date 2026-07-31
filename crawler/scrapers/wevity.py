import re
import requests
from bs4 import BeautifulSoup
from typing import List, Dict, Optional
from datetime import datetime
import time
from config import BASE_URL, USER_AGENT, CRAWL_DELAY
import json
import os

# shared/taxonomy.json 로드
TAXONOMY_PATH = os.path.join(os.path.dirname(__file__), "../../shared/taxonomy.json")
with open(TAXONOMY_PATH, "r", encoding="utf-8") as f:
    TAXONOMY_DATA = json.load(f)

MAJOR_MAPPING = TAXONOMY_DATA["major_mapping"]


def collect_ids(section_path: str, max_pages: int = 10) -> List[int]:
    """목록 페이지에서 공고 ID (ix) 수집"""
    ids = []
    seen_ids = set()
    consecutive_no_new = 0

    for page in range(1, max_pages + 1):
        url = f"{BASE_URL}/{section_path}&gp={page}"
        print(f"[목록] {url}")

        try:
            headers = {"User-Agent": USER_AGENT}
            response = requests.get(url, headers=headers, timeout=10)
            response.raise_for_status()

            soup = BeautifulSoup(response.content, "html.parser")
            page_ids = []

            # 링크 패턴: ?c=find&s=1&gbn=view&gp=1&ix=XXXX
            for link in soup.find_all("a", href=True):
                href = link.get("href", "")
                match = re.search(r"ix=(\d+)", href)
                if match:
                    posting_id = int(match.group(1))
                    if posting_id not in seen_ids:
                        ids.append(posting_id)
                        seen_ids.add(posting_id)
                        page_ids.append(posting_id)

            if page_ids:
                consecutive_no_new = 0
                print(f"  → 새 ID {len(page_ids)}개 발견 (누적: {len(ids)}개)")
            else:
                consecutive_no_new += 1
                print(f"  → 새 ID 없음 ({consecutive_no_new}회 연속)")
                if consecutive_no_new >= 2:
                    print("  → 2페이지 연속 새 ID 없음, 중단")
                    break

            time.sleep(CRAWL_DELAY)

        except Exception as e:
            print(f"  ❌ 오류: {e}")
            continue

    print(f"총 {len(ids)}개 ID 수집 완료\n")
    return ids


def fetch_posting(posting_id: int, section: str = "find") -> Optional[Dict]:
    """상세 페이지에서 공고 정보 추출"""
    # section: "find" (공모전) 또는 "active" (대외활동)
    url = f"{BASE_URL}/?c={section}&s=1&gbn=view&gp=1&ix={posting_id}"

    try:
        headers = {"User-Agent": USER_AGENT}
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()

        soup = BeautifulSoup(response.content, "html.parser")

        # 제목 (meta og:title 우선, 없으면 title 태그, 그 다음 h1/h2)
        title = ""
        og_title = soup.find("meta", property="og:title")
        if og_title:
            title = og_title.get("content", "").strip()

        if not title:
            title_tag = soup.find("title")
            if title_tag:
                # title 태그는 " | 공모전 대외활동 콘테스트 - 위비티" 같은 접미사가 있으므로 제거
                title = title_tag.text.split("|")[0].strip()

        if not title:
            title_elem = soup.find("h1") or soup.find("h2")
            title = title_elem.text.strip() if title_elem else ""

        if not title:
            print(f"  ⚠️  ID {posting_id}: 제목 미발견, 스킵")
            return None

        # 모든 텍스트 수집 (자격요건은 본문 어디든 섞여 있을 수 있음)
        raw_text = soup.get_text(separator="\n")

        # 마감일 추출 (YYYY-MM-DD 또는 YYYY년 MM월 DD일 형식)
        reception_end_date = extract_date(raw_text)

        # 주최사 추출 (단순 텍스트 키워드 검색)
        host_org = extract_host_org(raw_text)

        # 분야 태그 추출 (위비티가 제공하는 구조화 필드 대상)
        # 예: <span>웹/모바일/IT</span> 같은 태그
        wevity_fields = extract_wevity_fields(soup)

        posting = {
            "source_url": url,
            "raw_title": title,
            "raw_text": raw_text,
            "reception_end_date": reception_end_date,
            "host_org": host_org,
            "wevity_fields": wevity_fields,
        }

        print(f"  ✅ ID {posting_id}: {title[:50]}...")
        return posting

    except Exception as e:
        print(f"  ❌ ID {posting_id}: {e}")
        return None


def extract_date(text: str) -> Optional[str]:
    """텍스트에서 마감일 추출 (YYYY-MM-DD 형식 반환)

    "마감", "접수 마감", "신청 마감" 키워드 근처 날짜를 우선 추출.
    범위 형식 (A ~ B)에서는 마지막 날짜 추출.
    """
    # 유효한 연도 범위 (2020-2030)
    def is_valid_year(year: int) -> bool:
        return 2020 <= year <= 2030

    # 패턴 1: 마감 관련 키워드가 포함된 라인에서만 날짜 추출
    lines = text.split('\n')
    deadline_keywords = ['마감', '접수', '신청', '응모', '지원', '기간', '마감일', '접수기간', '응모기간', '지원기간']
    for line in lines:
        if any(kw in line for kw in deadline_keywords):
            # YYYY-MM-DD 형식
            match = re.search(r'(\d{4})-(\d{2})-(\d{2})', line)
            if match:
                year = int(match.group(1))
                if is_valid_year(year):
                    return f"{match.group(1)}-{match.group(2)}-{match.group(3)}"

            # YYYY년 MM월 DD일 형식
            match = re.search(r'(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일', line)
            if match:
                year = int(match.group(1))
                if is_valid_year(year):
                    month, day = match.group(2), match.group(3)
                    return f"{year}-{month.zfill(2)}-{day.zfill(2)}"

    # 패턴 2: 범위 형식 (A ~ B에서 B 추출)
    range_matches = re.findall(r"(\d{4})-(\d{2})-(\d{2})\s*~\s*(\d{4})-(\d{2})-(\d{2})", text)
    if range_matches:
        # 유효한 범위 찾기 (마지막부터)
        for match in reversed(range_matches):
            year = int(match[3])
            if is_valid_year(year):
                return f"{match[3]}-{match[4]}-{match[5]}"

    # 패턴 3: 범위 형식 한글 (A년 B월 C일 ~ D년 E월 F일)
    range_matches = re.findall(r"(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일\s*~\s*(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일", text)
    if range_matches:
        # 유효한 범위 찾기 (마지막부터)
        for match in reversed(range_matches):
            year = int(match[3])
            if is_valid_year(year):
                return f"{year}-{match[4].zfill(2)}-{match[5].zfill(2)}"

    # 패턴 4: 일반 날짜 (2020-2030 범위의 첫 번째 유효한 날짜)
    for match in re.finditer(r"(\d{4})-(\d{2})-(\d{2})", text):
        year = int(match.group(1))
        if is_valid_year(year):
            return f"{match.group(1)}-{match.group(2)}-{match.group(3)}"

    # 패턴 5: 한글 날짜 형식 (유효한 연도만)
    for match in re.finditer(r"(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일", text):
        year = int(match.group(1))
        if is_valid_year(year):
            month, day = match.group(2), match.group(3)
            return f"{year}-{month.zfill(2)}-{day.zfill(2)}"

    return None


def extract_host_org(text: str) -> Optional[str]:
    """텍스트에서 주최사 추출"""
    # 패턴: "주최사: XXXX", "주최: XXXX" 등
    match = re.search(r"주최[사]?\s*[:：]\s*([^\n]+)", text)
    if match:
        org = match.group(1).strip()
        return org[:100] if org else None

    return None


def extract_wevity_fields(soup: BeautifulSoup) -> Dict[str, any]:
    """위비티가 제공하는 구조화 필드 추출 (분야, 응모대상)"""
    fields = {
        "category": None,  # 공모전 vs 대외활동
        "fields": [],      # 분야 태그 (예: ["웹/모바일/IT", "디자인"])
        "targets": [],     # 응모대상 (예: ["대학생", "일반인"])
    }

    # 분야와 응모대상을 감싸는 div/span 찾기
    for elem in soup.find_all(["span", "div", "a"]):
        text = elem.get_text(strip=True)

        # 분야: 웹/모바일/IT, 광고/마케팅, 디자인, 과학/공학 등
        if text in ["웹/모바일/IT", "기획/아이디어", "광고/마케팅", "논문/리포트",
                     "영상/UCC/사진", "디자인/캐릭터/웹툰", "게임/소프트웨어",
                     "과학/공학", "예체능/미술/음악"]:
            fields["fields"].append(text)

        # 응모대상: 대학생, 일반인, 청소년 등
        if text in ["대학생", "일반인", "청소년", "초등", "중등", "고등"]:
            fields["targets"].append(text)

    return fields


def normalize_wevity_fields_to_majors(field_str: str) -> List[str]:
    """위비티 분야 → canonical majors 변환"""
    if not field_str:
        return []

    # 매핑 테이블에서 찾기
    return MAJOR_MAPPING.get(field_str, [])
