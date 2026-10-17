import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, onSnapshot, query, where, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { socialRequest } from '../socialApi';
import { HEARTBEAT_MS, visibleCount } from '../../../shared/socialCatalog.mjs';
import { socialErrorMessage } from '../socialText.mjs';
import { isActivityCurrent, isInvitationCurrent, isPresenceCurrent, nextSocialExpiry, shouldHeartbeat, socialExpiryDelay } from '../socialLifecycle.mjs';

export function useSocialPresence({ userId, isRegistered, expanded, getServerTime = Date.now, lang = 'es' }) {
  const [profileState, setProfileState] = useState(null);
  const [presence, setPresence] = useState([]);
  const [summary, setSummary] = useState({});
  const [invitationState, setInvitationState] = useState({ userId: null, items: [] });
  const [blockState, setBlockState] = useState({ userId: null, ids: [] });
  const [error, setError] = useState('');
  const [stale, setStale] = useState(false);
  const [socialNow, setSocialNow] = useState(() => getServerTime());
  const versionRef = useRef(null);
  const profileSnapshotRevisionRef = useRef(0);
  const busyRef = useRef(false);
  const profile = profileState?.userId === userId ? profileState.value : null;
  const invitations = useMemo(() => invitationState.userId === userId ? invitationState.items : [], [invitationState, userId]);
  const blockedIds = useMemo(() => new Set(blockState.userId === userId ? blockState.ids : []), [blockState, userId]);
  const setProfile = useCallback(updater => setProfileState(current => {
    const previous = current?.userId === userId ? current.value : null;
    return { userId, value: typeof updater === 'function' ? updater(previous) : updater };
  }), [userId]);

  const refresh = useCallback(async () => {
    if (!userId || !isRegistered) return;
    const requestRevision = profileSnapshotRevisionRef.current;
    try {
      const data = await socialRequest('initialize');
      if (requestRevision === profileSnapshotRevisionRef.current) {
        setProfile(data.profile || null);
        versionRef.current = data.profile?.version || null;
        setError('');
        setStale(false);
      }
    } catch (err) {
      setError(socialErrorMessage(err, lang));
    }
  }, [userId, isRegistered, setProfile, lang]);

  useEffect(() => {
    if (!userId || !isRegistered) return undefined;
    let active = true;
    const unsubscribe = onSnapshot(doc(db, 'socialUsers', userId), snapshot => {
      if (snapshot.exists()) {
        const value = snapshot.data();
        profileSnapshotRevisionRef.current += 1;
        versionRef.current = value.version || null;
        setProfile(value);
        setStale(false);
      }
    }, () => setStale(true));
    Promise.resolve().then(() => { if (active) refresh(); });
    return () => { active = false; unsubscribe(); };
  }, [userId, isRegistered, refresh, setProfile]);

  useEffect(() => {
    if (!userId) return undefined;
    const unsubscribers = [];
    unsubscribers.push(onSnapshot(doc(db, 'rooms', 'catrina'), snapshot => {
      setSocialNow(getServerTime());
      setSummary(snapshot.data()?.buckets || {});
    }, () => setStale(true)));
    if (expanded) {
      unsubscribers.push(onSnapshot(collection(db, 'rooms', 'catrina', 'presence'), snapshot => {
        setSocialNow(getServerTime());
        setPresence(snapshot.docs.map(item => ({ uid: item.id, ...item.data() })));
        setStale(false);
      }, () => setStale(true)));
    }
    if (isRegistered) unsubscribers.push(onSnapshot(collection(db, 'socialUsers', userId, 'blocks'), snapshot => setBlockState({ userId, ids: snapshot.docs.map(item => item.id) }), () => setStale(true)));
    const outgoing = query(collection(db, 'socialInvitations'), where('senderId', '==', userId), orderBy('createdAt', 'desc'), limit(25));
    const incoming = query(collection(db, 'socialInvitations'), where('recipientId', '==', userId), orderBy('createdAt', 'desc'), limit(25));
    const inviteRows = { outgoing: [], incoming: [] };
    const publish = () => {
      setSocialNow(getServerTime());
      setInvitationState({ userId, items: [...inviteRows.outgoing, ...inviteRows.incoming].sort((a, b) => invitationTime(b.createdAt) - invitationTime(a.createdAt)) });
    };
    unsubscribers.push(onSnapshot(outgoing, snapshot => { inviteRows.outgoing = snapshot.docs.map(item => ({ id: item.id, ...item.data() })); publish(); }, () => setStale(true)));
    unsubscribers.push(onSnapshot(incoming, snapshot => { inviteRows.incoming = snapshot.docs.map(item => ({ id: item.id, ...item.data() })); publish(); }, () => setStale(true)));
    return () => unsubscribers.forEach(unsubscribe => unsubscribe());
  }, [userId, expanded, isRegistered, getServerTime]);

  const nextExpiry = useMemo(() => nextSocialExpiry({ summary, presence, invitations, expanded, now: socialNow }), [summary, presence, invitations, expanded, socialNow]);
  useEffect(() => {
    if (!nextExpiry) return undefined;
    const timer = setTimeout(() => setSocialNow(getServerTime()), socialExpiryDelay(nextExpiry, getServerTime()));
    return () => clearTimeout(timer);
  }, [nextExpiry, socialNow, getServerTime]);

  useEffect(() => {
    const refreshClock = () => setSocialNow(getServerTime());
    document.addEventListener('visibilitychange', refreshClock);
    window.addEventListener('focus', refreshClock);
    return () => {
      document.removeEventListener('visibilitychange', refreshClock);
      window.removeEventListener('focus', refreshClock);
    };
  }, [getServerTime]);

  const currentPresence = useMemo(() => presence.filter(person => isPresenceCurrent(person, socialNow)).map(person => isActivityCurrent(person.activity, socialNow) ? person : { ...person, activity: null }), [presence, socialNow]);
  const ownPresence = currentPresence.find(person => person.uid === userId && person.version === profile?.version);
  const isVisible = Boolean(profile?.visible && ownPresence);

  useEffect(() => {
    if (!userId || !shouldHeartbeat({ isRegistered, visible: isVisible, profileVersion: profile?.version, activeVersion: versionRef.current, documentHidden: document.hidden })) return undefined;
    if (versionRef.current !== profile.version) return undefined;
    let active = true;
    const beat = async () => {
      if (!active || !shouldHeartbeat({ isRegistered, visible: isVisible, profileVersion: profile.version, activeVersion: versionRef.current, documentHidden: document.hidden }) || busyRef.current) return;
      busyRef.current = true;
      try { await socialRequest('heartbeat', { version: profile.version }); setStale(false); }
      catch (error) {
        setStale(true);
        if (error?.code === 'functions/failed-precondition' || /presence expired/i.test(error?.message || '')) {
          versionRef.current = null;
          setProfile(previous => previous ? { ...previous, visible: false, zone: null } : previous);
        }
      }
      finally { busyRef.current = false; }
    };
    const onVisibility = () => { if (!document.hidden) beat(); };
    beat();
    const timer = setInterval(beat, HEARTBEAT_MS);
    document.addEventListener('visibilitychange', onVisibility);
    return () => { active = false; clearInterval(timer); document.removeEventListener('visibilitychange', onVisibility); };
  }, [userId, isRegistered, isVisible, profile?.version, setProfile]);

  const show = useCallback(async zone => {
    const data = await socialRequest('show', { zone });
    setProfile(previous => ({ ...(previous || {}), visible: true, zone, ...(data.presence || {}) })); setError('');
    versionRef.current = data.presence?.version || null;
    setStale(false);
    return data;
  }, [setProfile]);
  const hide = useCallback(async () => {
    await socialRequest('hide');
    versionRef.current = null;
    setProfile(previous => ({ ...(previous || {}), visible: false, zone: null }));
    setStale(false);
  }, [setProfile]);
  const act = useCallback(async (action, payload) => {
    const data = await socialRequest(action, payload);
    if (data.profile) setProfile(data.profile);
    return data;
  }, [setProfile]);

  const people = useMemo(() => currentPresence.filter(person => person.uid !== userId), [currentPresence, userId]);
  const count = useMemo(() => visibleCount(summary, socialNow), [summary, socialNow]);
  const currentInvitations = useMemo(() => invitations.filter(invitation => isInvitationCurrent(invitation, socialNow)), [invitations, socialNow]);
  return { profile, people, presence: currentPresence, isVisible, count, invitations: currentInvitations, blockedIds, stale, error, refresh, show, hide, act };
}

function invitationTime(value) {
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (value instanceof Date) return value.getTime();
  return Number(value) || 0;
}
