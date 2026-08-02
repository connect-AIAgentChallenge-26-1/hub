import type { Item } from "../lib/items";

type SourceLabelProps = {
  item: Pick<Item, "source_platform" | "original_url">;
};

function SourceIcon({ platform }: { platform: string }) {
  const common = "h-3.5 w-3.5 shrink-0";

  if (platform === "youtube") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={common} fill="none">
        <rect x="2.5" y="5.5" width="19" height="13" rx="4" stroke="currentColor" strokeWidth="2" />
        <path d="m10 9 5 3-5 3V9Z" fill="currentColor" />
      </svg>
    );
  }
  if (platform === "instagram") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (platform === "twitter") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={common} fill="currentColor">
        <path d="M5.2 4h3.5l3.9 5.2L17 4h1.8l-5.4 6.6L19.5 20H16l-4.6-6.1L6.3 20H4.5l6-7.5L5.2 4Zm2.7 1.5 8.8 13h1L8.9 5.5h-1Z" />
      </svg>
    );
  }
  if (platform === "manual") {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h5" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className={common} fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.5 3.8 5.5 3.8 9S14.5 18.5 12 21M12 3c-2.5 2.5-3.8 5.5-3.8 9s1.3 6.5 3.8 9" />
    </svg>
  );
}

function getSourceName(item: SourceLabelProps["item"]) {
  const platform = item.source_platform?.toLowerCase() || "manual";
  if (platform === "youtube") return "YouTube";
  if (platform === "instagram") return "Instagram";
  if (platform === "twitter") return "X";
  if (platform === "naver") return "Naver";
  if (platform === "manual") return "직접 저장";
  if (item.original_url) {
    try {
      return new URL(item.original_url).hostname.replace(/^www\./, "");
    } catch {
      // 잘못된 과거 URL은 일반 웹사이트로 표시한다.
    }
  }
  return "웹사이트";
}

export default function SourceLabel({ item }: SourceLabelProps) {
  const platform = item.source_platform?.toLowerCase() || "manual";
  return (
    <span className="inline-flex min-w-0 items-center gap-1 text-muted">
      <SourceIcon platform={platform} />
      <span className="truncate">{getSourceName(item)}</span>
    </span>
  );
}
