import { useEffect, useRef } from 'react';
import { ArrowLeft, CalendarDays, Heart, Music2, ShieldBan, Star, X } from 'lucide-react';
import SocialAvatar from './SocialAvatar';
import { INVITE_TEXT, SOCIAL_TEXT as T, SOCIAL_ZONE_TEXT } from './socialText.mjs';
import { translations } from './translations';
import { getAchievementText } from './socialAchievements.mjs';

export default function DjCard({ card, lang, onClose, onInvite, onBlock, onUnblock, onWardrobe, isOwn = false }) {
  const t = T[lang] || T.es;
  const closeRef = useRef(null);
  useEffect(() => { closeRef.current?.focus(); }, []);
  if (!card) return null;
  const invitations = [['drink', t.drink], ['pool', t.poolInvite], ['foosball', t.foosballInvite]];
  const achievements = Array.isArray(card.achievements) ? card.achievements : [];
  const favorite = card.favoriteSong;
  const dateLabel = card.accountSinceLabel === 'account' || card.accountCreatedAt ? t.joined : t.tracking;
  const dateValue = card.accountSince || card.accountCreatedAt || card.trackingStartedAt;
  const dateText = formatDate(dateValue, lang);
  return <div className="social-dj-card-wrap" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="social-dj-card" role="dialog" aria-modal="true" aria-labelledby="social-card-title">
      <header className="social-card-header"><span className="social-eyebrow">{t.cardTitle}</span><button ref={closeRef} type="button" className="social-icon-button" onClick={onClose} aria-label={t.closeButton}><X size={18} /></button></header>
      <div className="social-card-person"><SocialAvatar equipped={card.equipped} size={70} /><div><h2 id="social-card-title">{card.name || 'DJ'}</h2><span className="social-level">{t.level} {card.level ?? 1}</span>{card.zone && <small>{SOCIAL_ZONE_TEXT[card.zone]?.[lang] || card.zone}</small>}</div></div>
      <div className="social-card-favorite"><Music2 size={16} /><div><span>{t.favorite}</span><strong>{favorite?.title || t.noFavorite}</strong></div><Heart size={16} /></div>
      <div className="social-card-stats"><div><strong>{card.stats?.proposalsPlayed ?? '—'}</strong><small>{t.proposals}</small></div><div><strong>{card.stats?.uniqueVotes ?? '—'}</strong><small>{t.votes}</small></div></div>
      {dateText && <p className="social-card-date"><CalendarDays size={14} />{dateLabel} · {dateText}</p>}
      {achievements.length > 0 && <div className="social-achievements"><h3>{t.achievements}</h3><div>{achievements.map((achievement, index) => {
        const id = typeof achievement === 'string' ? achievement : achievement.id;
        const copy = getAchievementText(id, translations[lang] || translations.es);
        return <span key={id || index} title={copy.description || (typeof achievement === 'object' ? achievement.name : '')}><Star size={13} fill="currentColor" />{copy.title || achievement.name}</span>;
      })}</div></div>}
      {isOwn ? <button className="social-primary-button social-wide" type="button" onClick={onWardrobe}>{t.wardrobe}</button> : <>
        <div className="social-invite-actions">{invitations.map(([type, label]) => <button key={type} type="button" onClick={() => onInvite(type)}>{label}</button>)}</div>
        <button type="button" className="social-text-button social-block-button" onClick={() => card.blocked ? onUnblock(card.uid) : onBlock(card.uid)}><ShieldBan size={14} />{card.blocked ? t.unblock : t.block}</button>
      </>}
    </section>
  </div>;
}

function formatDate(value, lang) {
  if (!value) return '';
  const date = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'es-ES', { month: 'short', year: 'numeric' }).format(date);
}
