import { useState } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";

export default function WriteBoardPost() {
  const { listingId } = useParams();
  const navigate = useNavigate();
  const { addBoardPost, listings } = useOutletContext();
  const listing = listings.find((l) => l.id === listingId);

  const [title, setTitle] = useState("");
  const [meta, setMeta] = useState("");
  const [body, setBody] = useState("");

  const canSubmit = title.trim() && meta.trim() && body.trim();

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const created = await addBoardPost({
      listingId: listing.id,
      title: title.trim(),
      meta: meta.trim(),
      body: body.trim(),
    });
    navigate(`/board/post/${created.id}`);
  };

  return (
    <div className="detail">
      <p className="crumb">
        <Link to={`/board/listing/${listing.id}`}>홈</Link> /{" "}
        <Link to={`/board/listing/${listing.id}`}>팀원모집</Link>
      </p>
      <h1 style={{ fontSize: 30 }}>{listing.title}의 팀원모집 글쓰기</h1>
      <div className="info-box">
        <p className="info-title">제목</p>
        <input
          className="text-input"
          type="text"
          placeholder="예: 디자이너 1명 구해요"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div className="info-box">
        <p className="info-title">한 줄 소개</p>
        <input
          className="text-input"
          type="text"
          placeholder="예: 기획·개발 2명 확정 · UI/UX 담당자 모집"
          value={meta}
          onChange={(e) => setMeta(e.target.value)}
        />
      </div>
      <div className="info-box">
        <p className="info-title">상세 내용</p>
        <textarea
          placeholder="어떤 팀원을 찾는지, 진행 방식은 어떤지 알려주세요"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          style={{ marginTop: 0, minHeight: 100 }}
        />
      </div>
      <button className="btn-accent" onClick={handleSubmit} disabled={!canSubmit}>
        등록
      </button>
    </div>
  );
}
