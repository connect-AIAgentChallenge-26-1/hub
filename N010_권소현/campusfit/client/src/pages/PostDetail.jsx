import { useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { listings } from "../data/mockListings";

export default function PostDetail() {
  const { postId } = useParams();
  const { boardPosts, addComment } = useOutletContext();
  const post = boardPosts.find((p) => p.id === postId);
  const listing = listings.find((l) => l.id === post.listingId);

  const [commentText, setCommentText] = useState("");

  const handleRegister = () => {
    if (!commentText.trim()) return;
    addComment(post.id, { who: "나", text: commentText.trim() });
    setCommentText("");
  };

  return (
    <div className="detail">
      <p className="crumb">
        <Link to={`/board/listing/${listing.id}`}>홈</Link> /{" "}
        <Link to={`/board/listing/${listing.id}`}>팀원모집</Link>
      </p>
      <div className="detail-meta">
        <span className="cat">
          {listing.title} · D-{post.dDay}
        </span>
      </div>
      <h1 style={{ fontSize: 30 }}>{post.title}</h1>
      <p className="body-txt">{post.body}</p>
      <p className="comment-head">댓글 {post.comments.length}</p>
      {post.comments.map((c, i) => (
        <div className="comment" key={i}>
          <div className="who">{c.who}</div>
          <div className="txt">{c.text}</div>
        </div>
      ))}
      <textarea
        placeholder="댓글로 지원 의사를 남겨보세요"
        value={commentText}
        onChange={(e) => setCommentText(e.target.value)}
      />
      <button className="btn-accent" style={{ marginTop: 10 }} onClick={handleRegister}>
        등록
      </button>
    </div>
  );
}
