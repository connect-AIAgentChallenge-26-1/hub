import { Link } from "react-router-dom";
import { useOutletContext } from "react-router-dom";
import { categories, listings } from "../data/mockListings";
import BookmarkStar from "../components/BookmarkStar";

export default function Main() {
  const { region, grade, openFilter, bookmarks, toggleBookmark } = useOutletContext();

  const deadlineSoon = listings
    .filter((l) => l.dDay <= 7)
    .filter((l) => region === "all" || !l.eligibleRegions || l.eligibleRegions.includes(region))
    .filter((l) => grade === "all" || !l.eligibleGrades || l.eligibleGrades.includes(grade))
    .sort((a, b) => a.dDay - b.dDay);

  const categoryCounts = categories.map((c) => ({
    ...c,
    count: listings.filter((l) => l.categoryId === c.id).length,
  }));

  const teamBoardTotal = listings.reduce((sum, l) => sum + (l.teamBoardCount || 0), 0);

  return (
    <>
      <div className="hero shell">
        <div>
          <p className="eyebrow">CAMPUS INFO PLATFORM</p>
          <h1>
            흩어진 정보 중,
            <br />
            내게 필요한 것만.
          </h1>
          <p>
            장학금·공모전·지자체 혜택·대외활동·인턴십. 학과 네트워크가 없어도 괜찮아요 —
            국립/사립과 지역만 알려주시면, 지원 자격이 되는 것만 걸러서 보여드려요.
          </p>
          <button className="btn-primary" onClick={openFilter}>
            필터 설정하고 보기
          </button>
        </div>
        <div className="stat-col">
          <div>
            <div className="stat-num">{categories.length}개</div>
            <div className="stat-label">카테고리</div>
          </div>
          <div>
            <div className="stat-num">{listings.length}건</div>
            <div className="stat-label">등록된 정보</div>
          </div>
          <div>
            <div className="stat-num">{teamBoardTotal}건</div>
            <div className="stat-label">팀원모집 중</div>
          </div>
        </div>
      </div>

      <div className="section shell">
        <div className="section-head">
          <h2>마감 임박</h2>
          <span className="note">7일 이내</span>
        </div>
        <div className="divider-list">
          {deadlineSoon.map((l) => {
            const category = categories.find((c) => c.id === l.categoryId);
            return (
              <Link className="row" to={`/listing/${l.id}`} key={l.id}>
                <div className="main">
                  <div className="top-line">
                    <span className="tag">{category.label}</span>
                    <span className="title">{l.title}</span>
                  </div>
                  <div className="desc">{l.desc}</div>
                </div>
                <span className="pill-alert">D-{l.dDay}</span>
                <BookmarkStar
                  active={bookmarks.includes(l.id)}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleBookmark(l.id);
                  }}
                />
              </Link>
            );
          })}
          {deadlineSoon.length === 0 && (
            <p className="cat-sub">선택한 조건에 맞는 마감 임박 공고가 없어요.</p>
          )}
        </div>
      </div>

      <div className="section shell">
        <div className="section-head">
          <h2>카테고리별로 보기</h2>
        </div>
        <div className="divider-list">
          {categoryCounts.map((c) => (
            <Link className="cat-row" to={`/category/${c.id}`} key={c.id}>
              <div>
                <div className="name">{c.label}</div>
                <div className="desc">{c.desc}</div>
              </div>
              <div className="meta">
                <span>{c.count}건</span>
                <span className="arrow">→</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
