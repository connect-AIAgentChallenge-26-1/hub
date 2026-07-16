import { Link, useOutletContext } from "react-router-dom";
import BookmarkStar from "../components/BookmarkStar";

export default function Bookmarks() {
  const { bookmarks, toggleBookmark, categories, listings } = useOutletContext();

  const bookmarkedListings = listings
    .filter((l) => bookmarks.includes(l.id))
    .sort((a, b) => a.dDay - b.dDay);

  return (
    <div className="detail">
      <p className="crumb">
        <Link to="/">홈</Link>
      </p>
      <h1 style={{ fontWeight: 800, fontSize: 32, letterSpacing: "-.02em", margin: "0 0 8px" }}>북마크</h1>
      <p className="cat-sub">별표를 눌러 담아둔 공고예요. 이 브라우저에만 저장돼요.</p>
      <div className="divider-list">
        {bookmarkedListings.map((l) => {
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
              <span className={l.dDay <= 7 ? "pill-alert" : "pill-neutral"}>D-{l.dDay}</span>
              <BookmarkStar
                active
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  toggleBookmark(l.id);
                }}
              />
            </Link>
          );
        })}
        {bookmarkedListings.length === 0 && (
          <p className="cat-sub">아직 북마크한 공고가 없어요. 공고 옆 별표를 눌러 담아보세요.</p>
        )}
      </div>
    </div>
  );
}
