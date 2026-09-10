import { useState } from 'react';
import { updateDoc, doc, increment } from 'firebase/firestore';
import { X, Gift, Trophy, Music, Calendar, TrendingUp, Star } from 'lucide-react';
import { db } from './firebase';
import { useTheme } from './ThemeContext';
import { CornerFlourish } from './Ornaments';

const LEVELS = [
  { min: 0, max: 99, icon: '🎵' },
  { min: 100, max: 499, icon: '🎶' },
  { min: 500, max: 1999, icon: '🎧' },
  { min: 2000, max: 4999, icon: '🌀' },
  { min: 5000, max: Infinity, icon: '👑' },
];

const ACHIEVEMENT_ICONS = {
  first_vote: '🎵', protagonist: '🌟', hitmaker: '🔥', influencer: '📣',
  streak: '⚡', loyal: '🍻', early_bird: '🌅', night_owl: '🌙',
};

const EXCHANGE_COST = 50;

function getLevelName(min, t) {
  if (min >= 5000) return t.levelLeyenda;
  if (min >= 2000) return t.levelMaestro;
  if (min >= 500) return t.levelPro;
  if (min >= 100) return t.levelAficionado;
  return t.levelNovato;
}

export default function Profile({ userData, userId, t, onClose, onLogout, activeQueue }) {
  const { theme } = useTheme();
  const isCatrina = theme === 'catrina';
  const [historyFilter, setHistoryFilter] = useState('all');
  const [exchanging, setExchanging] = useState(false);
  const [exchangeMsg, setExchangeMsg] = useState('');
  const [djNameDraft, setDjNameDraft] = useState(userData?.djName || '');
  const [editingDjName, setEditingDjName] = useState(false);
  const [djMsg, setDjMsg] = useState('');

  if (!userData) return null;

  const totalEarned = userData.totalPointsEarned || 0;
  const currentPoints = userData.points || 0;
  const freeVotes = userData.freeVotes || 0;
  const freeProposals = userData.freeProposals || 0;
  const achievements = userData.achievements || [];
  const history = userData.history || [];
  const visitDates = userData.visitDates || [];
  const isRegistered = userData.isRegistered || false;

  const currentLevel = LEVELS.find(l => totalEarned >= l.min && totalEarned <= l.max) || LEVELS[0];
  const nextLevel = LEVELS.find(l => l.min > totalEarned);
  const levelName = getLevelName(currentLevel.min, t);
  const nextLevelName = nextLevel ? getLevelName(nextLevel.min, t) : null;
  const progressPct = nextLevel
    ? Math.round(((totalEarned - currentLevel.min) / (nextLevel.min - currentLevel.min)) * 100) : 100;

  const totalVotesCast = (userData.votes || []).length;
  const totalProposalsMade = (userData.proposals || []).length;
  const playedSongs = history.filter(h => h.status === 'played').length;
  const successRate = totalProposalsMade > 0 ? Math.round((playedSongs / totalProposalsMade) * 100) : 0;
  const nightsVisited = visitDates.length;

  const allAchievements = [
    { id: 'first_vote', title: t.achievementFirstVote, desc: t.achievementFirstVoteDesc },
    { id: 'protagonist', title: t.achievementProtagonist, desc: t.achievementProtagonistDesc },
    { id: 'hitmaker', title: t.achievementHitmaker, desc: t.achievementHitmakerDesc },
    { id: 'influencer', title: t.achievementInfluencer, desc: t.achievementInfluencerDesc },
    { id: 'streak', title: t.achievementStreak, desc: t.achievementStreakDesc },
    { id: 'loyal', title: t.achievementLoyal, desc: t.achievementLoyalDesc },
    { id: 'early_bird', title: t.achievementEarlyBird, desc: t.achievementEarlyBirdDesc },
    { id: 'night_owl', title: t.achievementNightOwl, desc: t.achievementNightOwlDesc },
  ];

  const filteredHistory = historyFilter === 'all' ? history : history.filter(h => h.status === historyFilter);

  // Progreso hacia cada logro (solo los computables con los datos disponibles)
  const myQueueVotes = (userData.proposals || []).map(id => activeQueue?.[id]?.votes || 0);
  const maxProposalVotes = myQueueVotes.length ? Math.max(...myQueueVotes) : 0;
  const sortedVisits = [...visitDates].sort();
  let nightStreak = 0;
  let prevVisit = null;
  sortedVisits.forEach((d) => {
    if (prevVisit === null) {
      nightStreak = 1;
    } else {
      const diff = (new Date(d) - new Date(prevVisit)) / 86400000;
      nightStreak = diff === 1 ? nightStreak + 1 : (diff > 1 ? 1 : nightStreak);
    }
    prevVisit = d;
  });
  const achievementProgress = {
    first_vote: { cur: Math.min((userData.votes || []).length, 1), target: 1 },
    influencer: { cur: Math.min(maxProposalVotes, 10), target: 10 },
    loyal: { cur: Math.min(visitDates.length, 4), target: 4 },
    streak: { cur: Math.min(nightStreak, 2), target: 2 },
  };

  const handleExchange = async () => {
    if (currentPoints < EXCHANGE_COST) { setExchangeMsg(t.notEnoughPoints); return; }
    setExchanging(true);
    try {
      await updateDoc(doc(db, 'users', userId), { 
        points: increment(-EXCHANGE_COST), 
        freeVotes: increment(1) 
      });
      setExchangeMsg(t.exchangeSuccess);
    } catch { setExchangeMsg(t.authErrorGeneric); }
    setExchanging(false);
  };

  const handleSaveDjName = async () => {
    const clean = djNameDraft.trim();
    if (!clean) {
      setDjMsg(t.djNameEmpty);
      return;
    }
    try {
      await updateDoc(doc(db, 'users', userId), { djName: clean.slice(0, 20) });
      setEditingDjName(false);
      setDjMsg(t.djNameSaved);
      setTimeout(() => setDjMsg(''), 2500);
    } catch {
      setDjMsg(t.authErrorGeneric);
    }
  };

  const statusLabels = {
    played: { label: t.historyPlayed },
    in_queue: { label: t.historyInQueue },
    not_played: { label: t.historyNotPlayed },
  };

  return (
    <div className="profile-shell fixed inset-0 z-[110] flex flex-col">
      <header className="profile-header p-4 border-b flex items-center justify-between shrink-0">
        <h2 className="profile-section-title text-xl font-bold flex items-center gap-2">
          <Trophy size={24} />{t.profileTitle}
        </h2>
        <button onClick={onClose} className="profile-close p-2 transition-colors">
          <X size={24} />
        </button>
      </header>
      <main className="profile-main flex-1 overflow-y-auto p-6 space-y-8">
        <div className="profile-hero relative overflow-hidden border rounded-2xl p-6 text-center space-y-4">
          {isCatrina && <>
            <CornerFlourish position="tl" size={34} />
            <CornerFlourish position="tr" size={34} />
            <CornerFlourish position="bl" size={34} />
            <CornerFlourish position="br" size={34} />
          </>}
          <div className={isCatrina ? 'relative z-[1]' : ''}>
          {isRegistered && (
            <div className="flex items-center justify-center gap-2 pb-3 mb-3 border-b border-brand-gold/20">
              {editingDjName ? (
                <form
                  onSubmit={(e) => { e.preventDefault(); handleSaveDjName(); }}
                  className="flex items-center gap-2 w-full max-w-[260px]"
                >
                  <input
                    type="text"
                    value={djNameDraft}
                    onChange={(e) => setDjNameDraft(e.target.value)}
                    maxLength={20}
                    placeholder={t.registerDjName}
                    className="flex-1 min-w-0 bg-transparent border border-brand-gold/40 rounded-lg px-3 py-1.5 text-sm text-center focus:outline-none"
                  />
                  <button type="submit" className="shrink-0 text-xs font-bold text-brand-gold">{t.saveDjName}</button>
                </form>
              ) : (
                <button
                  onClick={() => { setDjNameDraft(userData.djName || ''); setEditingDjName(true); }}
                  className="flex items-center gap-2 transition-opacity hover:opacity-70"
                >
                  <span className="text-lg">🎤</span>
                  <span className="text-lg font-bold">{userData.djName || t.anonymous}</span>
                  <span className="text-[10px] uppercase tracking-wider opacity-60 underline">{t.editDjName}</span>
                </button>
              )}
            </div>
          )}
          {djMsg && (
            <p className="text-xs text-brand-gold pb-2 -mt-1">{djMsg}</p>
          )}
          <div className="flex items-center justify-center gap-2">
            <span className="text-4xl">{currentLevel.icon}</span>
            <div className="text-left">
              <p className="profile-muted text-xs uppercase tracking-wider">{t.level}</p>
              <p className="profile-level text-xl font-bold">{levelName}</p>
            </div>
          </div>

          {nextLevel && (
            <div className="space-y-1">
              <div className="profile-muted flex justify-between text-xs">
                <span>{totalEarned} {t.points}</span>
                <span>{nextLevelName} ({nextLevel.min})</span>
              </div>
              <div className="profile-progress-track h-2 w-full rounded-full overflow-hidden">
                <div
                  className="profile-progress-fill h-full rounded-full transition-all"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}

          <div className="profile-muted flex justify-center gap-4 text-xs">
            <span>
              <span className="profile-points font-bold">{currentPoints}</span> {t.points}
            </span>
            <span>
              <span className="profile-free-votes font-bold">{freeVotes}</span> {t.freeVotesLabel}
            </span>
            {freeProposals > 0 && (
              <span>
                <span className="profile-free-proposals font-bold">{freeProposals}</span> {t.freeProposalsLabel}
              </span>
            )}
          </div>

          <button
            onClick={handleExchange}
            disabled={exchanging || currentPoints < EXCHANGE_COST}
            className={`profile-exchange-button w-full py-3 rounded-xl font-bold text-sm transition-all ${
              currentPoints >= EXCHANGE_COST ? 'profile-exchange-ready active:scale-95' : 'profile-exchange-disabled cursor-not-allowed'
            }`}
          >
            <Gift size={16} className="inline mr-1" />
            {exchangeMsg || t.exchangeButton}
          </button>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="profile-section-title font-bold uppercase tracking-wider text-sm flex items-center gap-2">
            <TrendingUp size={16} />{t.myStats}
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="profile-stat-card rounded-xl p-4 text-center">
              <Music size={20} className="profile-icon profile-icon-gold mx-auto mb-1" />
              <p className="profile-stat-value text-2xl font-bold">{totalVotesCast}</p>
              <p className="profile-stat-label text-xs">{t.totalVotesCast}</p>
            </div>
            <div className="profile-stat-card rounded-xl p-4 text-center">
              <Star size={20} className="profile-icon profile-icon-purple mx-auto mb-1" />
              <p className="profile-stat-value text-2xl font-bold">{totalProposalsMade}</p>
              <p className="profile-stat-label text-xs">{t.totalProposalsMade}</p>
            </div>
            <div className="profile-stat-card rounded-xl p-4 text-center">
              <TrendingUp size={20} className="profile-icon profile-icon-green mx-auto mb-1" />
              <p className="profile-stat-value text-2xl font-bold">{successRate}%</p>
              <p className="profile-stat-label text-xs">{t.successRate}</p>
            </div>
            <div className="profile-stat-card rounded-xl p-4 text-center">
              <Calendar size={20} className="profile-icon profile-icon-gold mx-auto mb-1" />
              <p className="profile-stat-value text-2xl font-bold">{nightsVisited}</p>
              <p className="profile-stat-label text-xs">{t.nightsVisited}</p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="profile-section-title font-bold uppercase tracking-wider text-sm flex items-center gap-2">
            <Trophy size={16} />{t.achievementsTitle}
          </h3>
          <div className="grid grid-cols-2 gap-2">
            {allAchievements.map((ach) => {
              const unlocked = achievements.includes(ach.id);
              return (
                <div
                  key={ach.id}
                  className={`profile-achievement rounded-xl p-3 text-center border transition-all ${
                    unlocked
                      ? 'profile-achievement-unlocked'
                      : 'profile-achievement-locked'
                  }`}
                >
                  <div className="text-2xl mb-1">{ACHIEVEMENT_ICONS[ach.id] || '🏆'}</div>
                  <p className={`profile-achievement-title text-xs font-bold ${unlocked ? 'profile-unlocked-text' : ''}`}>{ach.title}</p>
                  <p className="profile-achievement-desc text-[10px] mt-0.5">{ach.desc}</p>
                  {!unlocked && achievementProgress[ach.id] && (
                    <div className="mt-2">
                      <div className={`h-1 w-full rounded-full overflow-hidden ${isCatrina ? 'bg-white/10' : 'bg-zinc-800'}`}>
                        <div
                          className="h-full bg-brand-gold rounded-full transition-all"
                          style={{ width: `${Math.min(100, (achievementProgress[ach.id].cur / achievementProgress[ach.id].target) * 100)}%` }}
                        />
                      </div>
                      <p className="text-[9px] mt-1 opacity-60">{achievementProgress[ach.id].cur}/{achievementProgress[ach.id].target}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="profile-section-title font-bold uppercase tracking-wider text-sm flex items-center gap-2">
            <Music size={16} />{t.songHistory}
          </h3>
          <div className="flex gap-2">
            {[
              { id: 'all', label: t.historyAll },
              { id: 'played', label: t.historyPlayed },
              { id: 'in_queue', label: t.historyInQueue },
              { id: 'not_played', label: t.historyNotPlayed },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setHistoryFilter(f.id)}
                className={`profile-filter px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                  historyFilter === f.id
                    ? 'profile-filter-active'
                    : 'profile-filter-inactive'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          {filteredHistory.length === 0 ? (
            <p className="profile-empty text-sm text-center py-8">{t.noHistory}</p>
          ) : (
            <div className="space-y-1">
              {filteredHistory.map((h, i) => {
                const status = statusLabels[h.status] || { label: h.status };
                return (
                  <div key={i} className="profile-history-item flex items-center justify-between p-3 border rounded-xl">
                    <span className="profile-history-title text-sm truncate flex-1">{h.title}</span>
                    <span className={`profile-status profile-status-${h.status} text-xs font-medium shrink-0 ml-2`}>{status.label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {isRegistered && (
          <button
            onClick={onLogout}
            className="profile-logout w-full py-3 border rounded-xl font-medium text-sm transition-colors"
          >
            {t.logoutAccount}
          </button>
        )}
      </main>
    </div>
  );
}
