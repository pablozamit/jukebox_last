import { CATALOG_BY_ID, DEFAULT_EQUIPPED } from '../../shared/socialCatalog.mjs';

export default function SocialAvatar({ equipped = DEFAULT_EQUIPPED, size = 42, className = '' }) {
  const hair = CATALOG_BY_ID[equipped?.hair] || CATALOG_BY_ID[DEFAULT_EQUIPPED.hair];
  const top = CATALOG_BY_ID[equipped?.top] || CATALOG_BY_ID[DEFAULT_EQUIPPED.top];
  const bottom = CATALOG_BY_ID[equipped?.bottom] || CATALOG_BY_ID[DEFAULT_EQUIPPED.bottom];
  const shoes = CATALOG_BY_ID[equipped?.shoes] || CATALOG_BY_ID[DEFAULT_EQUIPPED.shoes];
  const accessory = CATALOG_BY_ID[equipped?.accessory];
  return (
    <span className={`social-avatar ${className}`} style={{ '--avatar-size': `${size}px`, '--avatar-hair': hair.color, '--avatar-top': top.color, '--avatar-bottom': bottom.color, '--avatar-shoes': shoes.color }} aria-hidden="true">
      <span className={`social-avatar-hair social-avatar-hair-${hair.style}`} />
      <span className="social-avatar-head"><i /><i /></span>
      {accessory && <span className={`social-avatar-accessory social-avatar-accessory-${accessory.style}`} style={{ '--accessory-color': accessory.color }} />}
      <span className="social-avatar-body" />
      <span className="social-avatar-leg social-avatar-leg-left" />
      <span className="social-avatar-leg social-avatar-leg-right" />
      <span className="social-avatar-shoe social-avatar-shoe-left" />
      <span className="social-avatar-shoe social-avatar-shoe-right" />
    </span>
  );
}
