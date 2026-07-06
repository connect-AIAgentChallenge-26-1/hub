"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/home", icon: "🏠", label: "홈" },
  { href: "/calendar", icon: "📅", label: "캘린더" },
  { href: "/budget", icon: "💰", label: "예산" },
  { href: "/my", icon: "👤", label: "마이" },
];

export default function BottomTab() {
  const pathname = usePathname();
  return (
    <nav className="tabbar">
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link key={t.href} href={t.href} className={`tab${active ? " active" : ""}`}>
            <span className="ic">{t.icon}</span>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
