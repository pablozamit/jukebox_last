import { useState } from 'react';
import { updateDoc, doc } from 'firebase/firestore';
import { X, Gift, Trophy, Music, Calendar, TrendingUp, Star } from 'lucide-react';
import { db } from './firebase';

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

export default function Profile({ userData, userId, t, onClose, onLogout }) {
  const [historyFilter, setHistoryFilter] = useState('all');
  const [exchanging, setExchanging] = useState(false);
  const [exchangeMsg, setExchangeMsg] = useState('');

  if (!userData) return null;

  const totalEarned = userData.totalPointsEarned || 0;
  const currentPoints = userData.points || 0;
  const freeVotes = userData.freeVotes || 0;
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

  const handleExchange = async () => {
    if (currentPoints < EXCHANGE_COST) { setExchangeMsg(t.notEnoughPoints); return; }
    setExchanging(true);
    try {
      await updateDoc(doc(db, 'users', userId), { points: currentPoints - EXCHANGE_COST, freeVotes: freeVotes + 1 });
      setExchangeMsg(t.exchangeSuccess);
    } catch (error) { setExchangeMsg(t.authErrorGeneric); }
    setExchanging(false);
  };

  return (
    <div className="fixed inset-0 z-[110] bg-zinc-950 flex flex-col">
      <header className="p-4 border-b border-brand-gold/20 flex items-center justify-between shrink-0">
        <h2 className="text-xl font-bold text-brand-gold flex items-center gap-2"><Trophy size={24} />{t.profileTitle}</h2>
        <button onClick={onClose} className="p-2 text-zinc-400 hover:text-white transition-colors"><X size={24} /></button>
      </header>
      <main className="flex-1 overflow-y-auto p-6 space-y-8">
