import { useRef } from "react";

export function Button({ children, className = "", variant = "primary", ...props }) {
  return (
    <button className={`ui-button ui-button--${variant} ${className}`.trim()} {...props}>
      {children}
    </button>
  );
}

export function Badge({ children, className = "", tone = "verified" }) {
  return <span className={`ui-badge ui-badge--${tone} ${className}`.trim()}>{children}</span>;
}

export function SearchField({ onSubmit, value, onChange, onClear }) {
  const inputRef = useRef(null);

  function clearSearch() {
    onClear();
    inputRef.current?.focus();
  }

  return (
    <form className="ui-search" onSubmit={onSubmit}>
      <label>
        <span className="sr-only">식당 또는 카페 검색</span>
        <input
          ref={inputRef}
          aria-label="식당 또는 카페 검색"
          autoComplete="off"
          value={value}
          onChange={onChange}
          placeholder="식당, 카페 이름을 검색하세요"
        />
        {value && (
          <button
            aria-label="검색어 지우기"
            className="ui-search__clear"
            onClick={clearSearch}
            type="button"
          >
            ×
          </button>
        )}
      </label>
    </form>
  );
}
