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

export function SearchField({ onSubmit, value, onChange }) {
  return (
    <form className="ui-search" onSubmit={onSubmit}>
      <label>
        <span className="sr-only">식당 또는 카페 검색</span>
        <input
          aria-label="식당 또는 카페 검색"
          autoComplete="off"
          value={value}
          onChange={onChange}
          placeholder="식당, 카페 이름을 검색하세요"
        />
      </label>
      <Button type="submit">검색</Button>
    </form>
  );
}
