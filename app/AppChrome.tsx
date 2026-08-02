import Link from "next/link";

export function AppHeader() {
  return (
    <header className="mb-12 flex items-center justify-between">
      <Link href="/" className="text-[26px] font-extrabold tracking-[-0.055em] text-ink">
        later<span className="text-[#e51c2b]">.</span>
      </Link>
      <div aria-hidden="true" className="h-9 w-9 rounded-full border border-creamDeep bg-white" />
    </header>
  );
}

type BottomNavProps = { active: "home" | "categories" | "archive" };

export function BottomNav({ active }: BottomNavProps) {
  const linkClass = (name: BottomNavProps["active"]) =>
    `relative flex min-w-16 flex-col items-center gap-1.5 ${
      active === name ? "font-semibold text-ink" : "text-muted"
    }`;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-20 border-t border-creamDeep bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-md justify-around pb-[calc(0.8rem+env(safe-area-inset-bottom))] pt-3 text-xs">
        <Link href="/" className={linkClass("home")}>
          {active === "home" && <span className="absolute -top-1.5 h-1.5 w-1.5 rounded-full bg-ink" />}
          홈
        </Link>
        <Link href="/categories" className={linkClass("categories")}>
          {active === "categories" && <span className="absolute -top-1.5 h-1.5 w-1.5 rounded-full bg-ink" />}
          카테고리
        </Link>
        <Link href="/archive" className={linkClass("archive")}>
          {active === "archive" && <span className="absolute -top-1.5 h-1.5 w-1.5 rounded-full bg-ink" />}
          아카이브
        </Link>
        <span className="min-w-16 text-center text-muted">설정</span>
      </div>
    </nav>
  );
}
