import { useMemo, useState } from 'react';
import { ArrowLeft, Check, Coins } from 'lucide-react';
import { CATEGORIES, DEFAULT_EQUIPPED, SOCIAL_CATALOG } from '../../shared/socialCatalog.mjs';
import SocialAvatar from './SocialAvatar';
import { SOCIAL_TEXT as T, socialErrorMessage } from './socialText.mjs';
import { useSocialDialogFocus } from './hooks/useSocialDialogFocus';
import { translations } from './translations';
import { getAchievementText } from './socialAchievements.mjs';

export default function AvatarWardrobe({ profile, inventory = [], points = 0, lang, onClose, onEquip, onBuy }) {
  const [tab, setTab] = useState('closet');
  const [category, setCategory] = useState('hair');
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const t = T[lang] || T.es;
  const dialogRef = useSocialDialogFocus(onClose);
  const ownedIds = useMemo(() => new Set(inventory.map(item => typeof item === 'string' ? item : item.itemId || item.id)), [inventory]);
  const equipped = profile?.equipped || {};
  const items = SOCIAL_CATALOG.filter(item => item.category === category && (tab === 'closet' ? ownedIds.has(item.id) : !ownedIds.has(item.id)));
  const isEquipped = item => (equipped[item.category] || DEFAULT_EQUIPPED[item.category]) === item.id;

  const perform = async (item, mode) => {
    setBusy(item.id); setMessage('');
    try {
      await (mode === 'equip' ? onEquip(item.id) : onBuy(item.id));
      if (mode === 'buy') setMessage(lang === 'en' ? 'Added to your wardrobe.' : 'Añadido a tu armario.');
    } catch (error) { setMessage(socialErrorMessage(error, lang)); }
    finally { setBusy(''); }
  };
  return <div className="social-wardrobe-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={dialogRef} className="social-wardrobe" role="dialog" aria-modal="true" aria-labelledby="social-wardrobe-title" tabIndex={-1}>
      <header className="social-wardrobe-header"><button type="button" className="social-icon-button" onClick={onClose} aria-label={t.closeButton}><ArrowLeft size={18} /></button><div><span className="social-eyebrow">{t.wardrobe}</span><h2 id="social-wardrobe-title">{t.wardrobe}</h2></div><SocialAvatar equipped={equipped} size={58} /></header>
      <div className="social-wardrobe-tabs" role="tablist"><button type="button" role="tab" aria-selected={tab === 'closet'} onClick={() => setTab('closet')}>{t.closet}</button><button type="button" role="tab" aria-selected={tab === 'shop'} onClick={() => setTab('shop')}>{t.shop}</button></div>
      <div className="social-wardrobe-balance"><Coins size={15} />{points} {lang === 'en' ? 'points' : 'puntos'}<small>{t.pointsNote}</small></div>
      <nav className="social-wardrobe-categories" aria-label={lang === 'en' ? 'Categories' : 'Categorías'}>{CATEGORIES.map(key => <button type="button" key={key} className={category === key ? 'is-active' : ''} onClick={() => setCategory(key)}>{t[key]}</button>)}</nav>
      {message && <p className="social-inline-message" role="status">{message}</p>}
      <div className="social-item-grid">
        {items.length === 0 && <p className="social-empty">{tab === 'closet' ? t.noItems : (lang === 'en' ? 'You have every item in this category.' : 'Ya tienes todos los artículos de esta categoría.')}</p>}
        {items.map(item => <article className="social-item-card" key={item.id}>
          <div className="social-item-preview"><SocialAvatar equipped={{ ...equipped, [item.category]: item.id }} size={58} /></div>
          <strong>{item.label[lang] || item.label.es}</strong>
          <small title={item.achievement ? getAchievementText(item.achievement, translations[lang] || translations.es).description : undefined}>{item.source === 'achievement' ? `${t.reward}: ${getAchievementText(item.achievement, translations[lang] || translations.es).title} · ${getAchievementText(item.achievement, translations[lang] || translations.es).description}` : item.price ? `${item.price} ${lang === 'en' ? 'points' : 'puntos'}` : t.owned}</small>
          {tab === 'closet' ? <button type="button" disabled={isEquipped(item) || busy === item.id} onClick={() => perform(item, 'equip')}>{isEquipped(item) ? <><Check size={14} />{t.equipped}</> : t.equip}</button> : <button type="button" disabled={!item.price || points < item.price || busy === item.id || item.source === 'achievement'} onClick={() => perform(item, 'buy')}>{busy === item.id ? '…' : item.price ? `${t.buy} ${item.price}` : t.reward}</button>}
        </article>)}
      </div>
    </section>
  </div>;
}
