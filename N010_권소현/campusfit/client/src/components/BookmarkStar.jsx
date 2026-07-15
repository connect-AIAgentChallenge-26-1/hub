export default function BookmarkStar({ active, onClick, size = 20 }) {
  return (
    <button
      type="button"
      className="bookmark-star"
      onClick={onClick}
      aria-label={active ? "북마크 해제" : "북마크에 담기"}
      aria-pressed={active}
    >
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={active ? "currentColor" : "none"}
      >
        <path d="m12 3 2.6 5.9 6.4.6-4.8 4.3 1.4 6.3L12 17l-5.6 3.1 1.4-6.3-4.8-4.3 6.4-.6L12 3Z" />
      </svg>
    </button>
  );
}
