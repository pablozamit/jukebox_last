import { Component, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, ChevronDown, Compass, MapPin, Shirt, Users, X } from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { SOCIAL_ZONES } from '../../shared/socialCatalog.mjs';
import { db } from './firebase';
import { useSocialPresence } from './hooks/useSocialPresence';
import { socialRequest } from './socialApi';
import { SOCIAL_TEXT as T, SOCIAL_ZONE_TEXT, INVITE_TEXT, socialErrorMessage } from './socialText.mjs';
import SocialAvatar from './SocialAvatar';
import SocialPeopleList from './SocialPeopleList';
import SocialInvitationInbox from './SocialInvitationInbox';
import DjCard from './DjCard';
import AvatarWardrobe from './AvatarWardrobe';
import SocialMapPreview from './SocialMapPreview';
import { useSocialDialogFocus } from './hooks/useSocialDialogFocus';
import './SocialMapPanel.css';

const SocialMapScene = lazy(() => import('./SocialMapScene'));

export default function SocialMapPanel({ userId, isRegistered, userData, catalog = [], lang = 'es', onRegister = () => {}, getServerTime = Date.now }) {
  return <SocialPanelErrorBoundary lang={lang}><SocialMapPanelSession key={userId || 'guest'} userId={userId} isRegistered={isRegistered} userData={userData} catalog={catalog} lang={lang} onRegister={onRegister} getServerTime={getServerTime} /></SocialPanelErrorBoundary>;
}

class SocialPanelErrorBoundary extends Component {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    const language = this.props.lang === 'en' ? 'en' : 'es';
    const t = T[language];
    if (this.state.hasError) return <section className="social-panel social-panel-error" aria-label={t.title}><strong>{t.title}</strong><p role="alert">{t.offline}</p><button type="button" className="social-primary-button" onClick={() => this.setState({ hasError: false })}>{t.retry}</button></section>;
    return this.props.children;
  }
}

function SocialMapPanelSession({ userId, isRegistered, userData, catalog = [], lang = 'es', onRegister = () => {}, getServerTime = Date.now }) {
  const language = lang === 'en' ? 'en' : 'es';
  const t = T[language];
  const [expanded, setExpanded] = useState(false);
  const [selectedUid, setSelectedUid] = useState(null);
  const [selectedCard, setSelectedCard] = useState(null);
  const [cardLoading, setCardLoading] = useState(false);
  const [wardrobeOpen, setWardrobeOpen] = useState(false);
  const [favoriteOpen, setFavoriteOpen] = useState(false);
  const [favoriteSearch, setFavoriteSearch] = useState('');
  const [peopleTab, setPeopleTab] = useState('map');
  const [blockedOpen, setBlockedOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [inventoryState, setInventoryState] = useState({ userId: null, items: [] });
  const [pointsOverride, setPointsOverride] = useState(null);
  const panelRef = useRef(null);
  const returnFocusRef = useRef(null);
  const cardRequestRef = useRef(0);
  const expansionInitializedRef = useRef(false);
  const collapsedButtonRef = useRef(null);
  const expandedCloseRef = useRef(null);
  const favoriteDialogRef = useSocialDialogFocus(() => setFavoriteOpen(false), favoriteOpen);
  const { profile, people, presence, isVisible, count, invitations, blockedIds, stale, error: initError, refresh, show, hide, act } = useSocialPresence({ userId, isRegistered, expanded, getServerTime, lang: language });
  const visiblePeopleLabel = count === 1 ? (language === 'en' ? 'person visible on the map' : 'persona visible en el mapa') : t.visibleCount;

  const songs = useMemo(() => {
    if (Array.isArray(catalog)) return catalog.filter(song => song?.id && song?.title);
    return Object.entries(catalog || {}).map(([id, song]) => ({ id, ...song })).filter(song => song?.id && song?.title);
  }, [catalog]);
  const matchingSongs = useMemo(() => {
    const needle = favoriteSearch.trim().toLocaleLowerCase(language);
    return songs.filter(song => !needle || `${song.title} ${song.artist || ''}`.toLocaleLowerCase(language).includes(needle)).slice(0, 30);
  }, [songs, favoriteSearch, language]);
  const publicPeople = useMemo(() => people.filter(person => !blockedIds.has(person.uid)), [people, blockedIds]);
  const mapPeople = useMemo(() => presence.filter(person => !blockedIds.has(person.uid)), [presence, blockedIds]);
  const inventory = isRegistered && wardrobeOpen && inventoryState.userId === userId ? inventoryState.items : [];
  const points = pointsOverride && pointsOverride.base === userData?.points ? pointsOverride.value : userData?.points || 0;

  useEffect(() => {
    if (!userId || !isRegistered || !wardrobeOpen) return undefined;
    return onSnapshot(collection(db, 'socialUsers', userId, 'inventory'), snapshot => setInventoryState({ userId, items: snapshot.docs.map(item => ({ itemId: item.id, ...item.data() })) }), () => {});
  }, [userId, isRegistered, wardrobeOpen]);
  useEffect(() => {
    if (!expansionInitializedRef.current) { expansionInitializedRef.current = true; return undefined; }
    const frame = requestAnimationFrame(() => (expanded ? expandedCloseRef.current : collapsedButtonRef.current)?.focus());
    return () => cancelAnimationFrame(frame);
  }, [expanded]);
  useEffect(() => {
    if (!expanded) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [expanded]);
  const closeCard = useCallback(() => {
    cardRequestRef.current += 1;
    setSelectedUid(null); setSelectedCard(null); setCardLoading(false);
    requestAnimationFrame(() => returnFocusRef.current?.focus?.());
  }, []);

  useEffect(() => {
    if (selectedUid && !(selectedUid === userId ? isVisible : publicPeople.some(person => person.uid === selectedUid))) cardRequestRef.current += 1;
  }, [selectedUid, userId, isVisible, publicPeople]);

  useEffect(() => {
    if (!selectedCard) return undefined;
    const onKeyDown = event => { if (event.key === 'Escape') closeCard(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedCard, closeCard]);

  const openCard = useCallback(async uid => {
    const person = publicPeople.find(item => item.uid === uid);
    if (uid !== userId && !person) return;
    if (uid === userId && !isVisible) {
      setMessage(t.errorNoPresence);
      return;
    }
    const requestToken = cardRequestRef.current + 1;
    cardRequestRef.current = requestToken;
    returnFocusRef.current = document.activeElement;
    setSelectedUid(uid); setCardLoading(true); setSelectedCard(null);
    try {
      const data = await socialRequest('card', { uid });
      const targetStillVisible = uid === userId ? isVisible : publicPeople.some(item => item.uid === uid);
      if (requestToken === cardRequestRef.current && targetStillVisible) setSelectedCard(data.card || null);
    } catch (error) {
      if (requestToken === cardRequestRef.current) { setMessage(socialErrorMessage(error, language)); setSelectedUid(null); }
    } finally { if (requestToken === cardRequestRef.current) setCardLoading(false); }
  }, [publicPeople, userId, isVisible, t.errorNoPresence, language]);

  const withBusy = useCallback(async (fn, rethrow = false) => {
    setBusy(true); setMessage('');
    try { return await fn(); }
    catch (error) { setMessage(error?.message === t.errorNoPresence ? t.errorNoPresence : socialErrorMessage(error, language)); if (rethrow) throw error; return null; }
    finally { setBusy(false); }
  }, [t.errorNoPresence, language]);

  const setPresenceZone = zone => withBusy(async () => {
    await show(zone);
    setMessage('');
  });
  const hidePresence = () => withBusy(async () => { await hide(); closeCard(); setMessage(''); });
  const sendInvite = type => withBusy(async () => {
    if (!isVisible) throw new Error(t.errorNoPresence);
    const recipient = selectedUid;
    await act('invite', { recipientId: recipient, type, requestId: makeRequestId() });
    setMessage(`${t.inviteSent}: ${INVITE_TEXT[type]?.[language] || type}`);
  });
  const inviteAction = (id, response) => withBusy(() => act('respond', { id, response }));
  const cancelInvite = id => withBusy(() => act('cancel', { id }));
  const muteInvites = value => withBusy(() => act('preferences', { muteInvites: value }));
  const blockPerson = uid => withBusy(async () => { await act('block', { uid }); closeCard(); });
  const unblockPerson = uid => withBusy(() => act('unblock', { uid }));
  const equipItem = itemId => withBusy(() => act('equip', { itemId }), true);
  const buyItem = itemId => withBusy(async () => {
    const result = await act('buy', { itemId, requestId: makeRequestId() });
    if (Number.isFinite(result?.points)) setPointsOverride({ base: userData?.points, value: result.points });
  }, true);

  const saveFavorite = song => withBusy(async () => {
    const favoriteSong = song ? { id: song.id, title: song.title } : null;
    await act('favorite', { songId: favoriteSong?.id || null });
    setFavoriteOpen(false); setFavoriteSearch('');
  });

  const invitationRows = invitations.map(invitation => ({ ...invitation, direction: invitation.recipientId === userId ? 'incoming' : 'outgoing', currentUserId: userId }));
  const ownPresence = presence.find(person => person.uid === userId);
  const currentEquipped = profile?.equipped || ownPresence?.equipped;
  const favoriteSong = profile?.favoriteSong;
  const selectedCardIsCurrent = selectedUid === userId ? isVisible : publicPeople.some(person => person.uid === selectedUid);
  const closeExpanded = () => { setExpanded(false); setPeopleTab('map'); };
  const registerFromPanel = () => {
    closeExpanded();
    requestAnimationFrame(() => requestAnimationFrame(() => onRegister()));
  };
  const handlePanelKeyDown = event => {
    if (!expanded) return;
    if (event.key === 'Escape' && !favoriteOpen && !wardrobeOpen && !selectedCard) {
      event.preventDefault();
      closeExpanded();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = panelRef.current?.querySelectorAll('a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])');
    if (!focusable?.length) { event.preventDefault(); panelRef.current?.focus(); return; }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  };

  const pendingInvitations = invitations.filter(item => item.status === 'pending').length;
  const panel = <section ref={panelRef} className={`social-panel ${expanded ? 'is-expanded' : 'is-collapsed'}`} aria-label={expanded ? undefined : t.title} aria-labelledby={expanded ? 'social-panel-heading' : undefined} aria-modal={expanded || undefined} role={expanded ? 'dialog' : undefined} tabIndex={expanded ? -1 : undefined} onKeyDown={handlePanelKeyDown}>
    {!expanded ? <div className="social-collapsed-row">
      <button ref={collapsedButtonRef} type="button" className="social-collapsed-main" onClick={() => setExpanded(true)} aria-label={`${t.open}. ${count} ${visiblePeopleLabel}${pendingInvitations ? `. ${pendingInvitations} ${t.invitations}` : ''}`} aria-expanded="false" aria-controls="social-map-panel-content">
        <span className="social-collapsed-heading"><span className="social-title-copy"><strong>{t.title}</strong><small><span className="social-live-glyph" aria-hidden="true"><span /></span>{count} {visiblePeopleLabel}</small></span><span className="social-preview-cta">{pendingInvitations > 0 && <span className="social-preview-invites"><Bell size={13} aria-hidden="true" />{pendingInvitations}</span>}<span className="social-collapsed-cta"><MapPin size={15} aria-hidden="true" /><span>{language === 'en' ? 'Explore map' : 'Explorar mapa'}</span><ChevronDown size={14} aria-hidden="true" /></span></span></span>
        <SocialMapPreview lang={language} ownZone={isVisible ? profile?.zone : null} />
      </button>
    </div> : <>
      <header className="social-panel-header">
        <div className="social-panel-heading"><span className="social-live-glyph" aria-hidden="true"><span /></span><div><span className="social-eyebrow" id="social-panel-heading">{t.title}</span><p><Users size={14} aria-hidden="true" />{count} {visiblePeopleLabel}{stale && <em>{t.stale}</em>}</p></div></div>
        <div className="social-panel-tools">
          <button ref={expandedCloseRef} type="button" className="social-icon-button social-minimize-button" onClick={closeExpanded} aria-label={t.close} title={t.close}><ChevronDown size={19} aria-hidden="true" /><span>{t.close}</span></button>
        </div>
      </header>
      <p className="social-presence-help">{t.presenceHelp}</p>
      {(message || initError) && <div className="social-status-message" role="status">{message || initError}{initError && !message && <button type="button" className="social-text-button" onClick={refresh}>{t.retry}</button>}</div>}
      {stale && <div className="social-status-message is-warning" role="status">{t.stale}</div>}
      <SocialInvitationInbox invitations={invitationRows} lang={language} onRespond={inviteAction} onCancel={cancelInvite} onMute={muteInvites} muteInvites={!!profile?.muteInvites} isRegistered={isRegistered} />

      <div className="social-presence-controls">
        <div className={`social-presence-main ${isVisible ? 'is-visible' : 'is-hidden'}`}>
        {isVisible ? <label className="social-zone-select"><Compass size={16} /><span>{t.chooseZone}</span><select aria-label={t.chooseZone} value={profile.zone || 'entrance'} disabled={busy} onChange={event => setPresenceZone(event.target.value)}>{SOCIAL_ZONES.map(zone => <option key={zone.id} value={zone.id}>{SOCIAL_ZONE_TEXT[zone.id]?.[language] || zone.label[language]}</option>)}</select></label> : <div className="social-appear-controls">
          <label className="social-zone-select"><Compass size={16} /><span>{t.chooseZone}</span><select aria-label={t.chooseZone} defaultValue="terrace" id={`social-zone-${userId || 'guest'}`}>{SOCIAL_ZONES.map(zone => <option key={zone.id} value={zone.id}>{SOCIAL_ZONE_TEXT[zone.id]?.[language] || zone.label[language]}</option>)}</select></label>
          {isRegistered ? <button type="button" className="social-primary-button" disabled={busy} onClick={() => setPresenceZone(document.getElementById(`social-zone-${userId || 'guest'}`)?.value || 'terrace')}>{t.show}</button> : <button type="button" className="social-primary-button" onClick={registerFromPanel}>{t.registerButton}</button>}
        </div>}
        {isVisible && <button type="button" className="social-control-button" onClick={hidePresence} disabled={busy}><MapPin size={15} />{t.hide}</button>}
        </div>
        {isRegistered && <div className="social-own-actions"><div className="social-own-group"><button type="button" className="social-avatar-entry" onClick={() => setWardrobeOpen(true)}><SocialAvatar equipped={currentEquipped} size={34} /><span>{t.wardrobe}</span><Shirt size={15} /></button>{isVisible && <button type="button" className="social-text-button" onClick={() => openCard(userId)}>{t.ownCard}</button>}</div><button type="button" className="social-text-button social-favorite-entry" onClick={() => setFavoriteOpen(true)}><span aria-hidden="true">♫</span>{favoriteSong?.title || t.favoritePicker}</button></div>}
        {isRegistered && blockedIds.size > 0 && <><button type="button" className="social-text-button social-blocked-toggle" aria-expanded={blockedOpen} onClick={() => setBlockedOpen(value => !value)}>{t.blockedPeople} · {blockedIds.size}</button>{blockedOpen && <div className="social-blocked-list">{Array.from(blockedIds).map(uid => <div key={uid}><span>{people.find(person => person.uid === uid)?.name || 'DJ'}</span><button type="button" onClick={() => unblockPerson(uid)} disabled={busy}>{t.unblock}</button></div>)}</div>}</>}
      </div>

      <div className="social-view-tabs" aria-label={language === 'en' ? 'Social map view' : 'Vista del mapa social'}><button type="button" aria-pressed={peopleTab === 'map'} aria-controls="social-map-panel-content" onClick={() => setPeopleTab('map')}>{t.scene}</button><button type="button" aria-pressed={peopleTab === 'people'} aria-controls="social-map-panel-content" onClick={() => setPeopleTab('people')}>{t.list} <b>{publicPeople.length}</b></button></div>
      {peopleTab === 'map' && <p className="social-map-help">{language === 'en' ? 'Touch: drag to rotate; use two fingers to pan and pinch to zoom. Mouse: drag to rotate, scroll to zoom, right-drag to pan.' : 'Táctil: arrastra para girar; usa dos dedos para desplazar y pellizca para acercar o alejar. Ratón: arrastra para girar, usa la rueda para acercar y arrastra con el botón derecho para desplazar.'}</p>}
      <div className="social-map-content" id="social-map-panel-content" role="region" aria-label={peopleTab === 'map' ? t.scene : t.list} tabIndex={peopleTab === 'people' ? 0 : undefined}>
        {peopleTab === 'map' ? <Suspense fallback={<div className="social-map-loading" role="status">{t.loading}</div>}><SocialMapScene people={mapPeople} onSelect={openCard} focusZone={null} lang={language} labels={{ scene: t.scene, mapFallback: t.mapFallback, empty: t.empty, terrace: SOCIAL_ZONE_TEXT.terrace[language], bar: SOCIAL_ZONE_TEXT.bar[language], pool: SOCIAL_ZONE_TEXT.pool[language], foosball: SOCIAL_ZONE_TEXT.foosball[language] }} /></Suspense> : <SocialPeopleList people={publicPeople} lang={language} onSelect={openCard} emptyText={t.empty} />}
      </div>
      {cardLoading && selectedCardIsCurrent && <div className="social-card-loading" role="status">{language === 'en' ? 'Opening DJ card…' : 'Abriendo la ficha…'}</div>}
      {selectedCard && selectedCardIsCurrent && <DjCard card={selectedCard} lang={language} isOwn={selectedUid === userId} onClose={closeCard} onInvite={sendInvite} onBlock={blockPerson} onUnblock={unblockPerson} onWardrobe={() => { closeCard(); setWardrobeOpen(true); }} />}
      {wardrobeOpen && <AvatarWardrobe profile={profile} inventory={inventory} points={points} lang={language} onClose={() => setWardrobeOpen(false)} onEquip={equipItem} onBuy={buyItem} />}
      {favoriteOpen && <div className="social-wardrobe-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setFavoriteOpen(false); }}><section ref={favoriteDialogRef} className="social-favorite-picker" role="dialog" aria-modal="true" aria-labelledby="social-favorite-title" tabIndex={-1}><header><div><span className="social-eyebrow">{t.favorite}</span><h2 id="social-favorite-title">{t.favoritePicker}</h2></div><button type="button" className="social-icon-button" onClick={() => setFavoriteOpen(false)} aria-label={t.closeButton}><X size={18} /></button></header><input type="search" value={favoriteSearch} onChange={event => setFavoriteSearch(event.target.value)} placeholder={t.searchSongs} /><div className="social-song-list">{matchingSongs.map(song => <button type="button" key={song.id} onClick={() => saveFavorite(song)} disabled={busy}><span><strong>{song.title}</strong><small>{song.artist}</small></span><span>♫</span></button>)}{matchingSongs.length === 0 && <p className="social-empty">{t.noSongs}</p>}</div>{favoriteSong && <button type="button" className="social-text-button" onClick={() => saveFavorite(null)} disabled={busy}>{t.clearFavorite}</button>}</section></div>}
    </>}
  </section>;
  return expanded ? createPortal(panel, document.body) : panel;
}

function makeRequestId() {
  return globalThis.crypto?.randomUUID?.() || `social-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
