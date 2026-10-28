import { CATALOG_BY_ID, DEFAULT_EQUIPPED } from '../../shared/socialCatalog.mjs';
import './SocialAvatar.css';

export default function SocialAvatar({ equipped = DEFAULT_EQUIPPED, size = 42, className = '' }) {
  const hair = CATALOG_BY_ID[equipped?.hair] || CATALOG_BY_ID[DEFAULT_EQUIPPED.hair];
  const skin = CATALOG_BY_ID[equipped?.skin] || CATALOG_BY_ID[DEFAULT_EQUIPPED.skin];
  const face = CATALOG_BY_ID[equipped?.face] || CATALOG_BY_ID[DEFAULT_EQUIPPED.face];
  const top = CATALOG_BY_ID[equipped?.top] || CATALOG_BY_ID[DEFAULT_EQUIPPED.top];
  const bottom = CATALOG_BY_ID[equipped?.bottom] || CATALOG_BY_ID[DEFAULT_EQUIPPED.bottom];
  const shoes = CATALOG_BY_ID[equipped?.shoes] || CATALOG_BY_ID[DEFAULT_EQUIPPED.shoes];
  const accessory = CATALOG_BY_ID[equipped?.accessory];
  return (
    <span className={`social-avatar social-avatar-bottom-${bottom.style} ${className}`} style={{ '--avatar-size': `${size}px`, '--avatar-hair': hair.color, '--avatar-skin': skin.color, '--avatar-top': top.color, '--avatar-bottom': bottom.color, '--avatar-shoes': shoes.color }} aria-hidden="true">
      <span className={`social-avatar-hair social-avatar-hair-${hair.style}`} />
      <span className={`social-avatar-head social-avatar-face-${face.style}`}><i /><i /><b /></span>
      {accessory && <span className={`social-avatar-accessory social-avatar-accessory-${accessory.style}`} style={{ '--accessory-color': accessory.color }} />}
      <span className={`social-avatar-body social-avatar-top-${top.style}`} />
      {bottom.style === 'skirt' && <span className="social-avatar-skirt" />}
      <span className={`social-avatar-leg social-avatar-leg-left social-avatar-bottom-${bottom.style}`} />
      <span className={`social-avatar-leg social-avatar-leg-right social-avatar-bottom-${bottom.style}`} />
      <span className="social-avatar-shoe social-avatar-shoe-left" />
      <span className="social-avatar-shoe social-avatar-shoe-right" />
    </span>
  );
}
