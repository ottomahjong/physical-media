import { typeAbbr, typeKey } from "../data.js";

export function MediaThumb({ item, size = "table" }) {
  const cls = `thumb thumb--${size} t-${typeKey(item.type)}`;
  if (item.image_url) {
    return <img className={cls} src={item.image_url} alt="" loading="lazy" />;
  }
  return <span className={`${cls} placeholder`}>{typeAbbr(item.type)}</span>;
}

export function CategoryPill({ type }) {
  return <span className={`typepill t-${typeKey(type)}`}>{typeAbbr(type)}</span>;
}
