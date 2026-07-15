import CardNewsIcon, { resolveCardNewsIcon } from "./CardNewsIcon";

export default function CardNewsThumb({ categoryId, categoryLabel, interest, title, dDay }) {
  const iconKey = resolveCardNewsIcon(categoryId, interest);

  return (
    <div className="card-news">
      <div className="cn-deco a" />
      <CardNewsIcon iconKey={iconKey} className="cn-icon-bg" />
      <p className="cn-eyebrow">
        <CardNewsIcon iconKey={iconKey} className="cn-icon-badge" />
        {categoryLabel}
      </p>
      <h2 className="cn-title">{title}</h2>
      <div className="cn-footer">
        <span className="cn-ddaypill">D-{dDay}</span>
        <span className="cn-brand">캠퍼스핏</span>
      </div>
    </div>
  );
}
