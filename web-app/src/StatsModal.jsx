import { useState, useEffect } from 'react';
import { BarChart3, X, Disc3, Flame } from 'lucide-react';
import { collection, doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

export default function StatsModal({ onClose, t, catalog, isCatrina, mainTextClass, getServerTime }) {
  const [range, setRange] = useState('hoy');
  const [data, setData] = useState({ plays: {}, votes: {}, time: {}, playsTotal: {}, votesTotal: {} });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      try {
        const statsRef = collection(db, 'statistics');
        let baseDocs = [];
        if (range === 'cost') {
          baseDocs = ['plays_total', 'votes_total'];
        } else {
          baseDocs = [`plays_${range}`, `votes_${range}`];
          if (range === 'hoy' || range === 'semana') baseDocs.push(`time_${range}`);
        }
        const results = await Promise.all(baseDocs.map(id => getDoc(doc(statsRef, id))));
        const newData = { plays: {}, votes: {}, time: {}, playsTotal: {}, votesTotal: {} };

        // Frescura de los contadores 'hoy'/'semana': el bridge los reinicia al abrir
        // el bar. Si no ha habido actividad en la sesión actual, son de un día
        // anterior (p. ej. al consultar un lunes estando cerrados).
        let lastActive = 0;
        try {
          const npSnap = await getDoc(doc(db, 'state', 'nowPlaying'));
          lastActive = npSnap.data()?.lastActive || 0;
        } catch { /* sin conexión o sin doc */ }
        const boundary = new Date(getServerTime());
        boundary.setHours(2, 0, 0, 0);
        if (getServerTime() < boundary.getTime()) boundary.setDate(boundary.getDate() - 1);
        const monday = new Date(getServerTime());
        monday.setHours(2, 0, 0, 0);
        monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));

        results.forEach((docSnap, index) => {
          if (docSnap.exists()) {
            const id = baseDocs[index];
            const data = docSnap.data();
            const stale = (range === 'hoy' && lastActive < boundary.getTime())
                       || (range === 'semana' && lastActive < monday.getTime());
            if (stale) return;
            if (id === `plays_${range}`) newData.plays = data;
            else if (id === `votes_${range}`) newData.votes = data;
            else if (id === `time_${range}`) newData.time = data;
            else if (id === 'plays_total') newData.playsTotal = data;
            else if (id === 'votes_total') newData.votesTotal = data;
          }
        });
        if (range === 'total' || range === 'cost') {
          newData.playsTotal = newData.playsTotal || newData.plays;
          newData.votesTotal = newData.votesTotal || newData.votes;
        }
        setData(newData);
      } catch (error) {
        console.error("Error fetching stats:", error);
      }
      setLoading(false);
    };
    fetchStats();
  }, [range]);

  const renderTopList = (statsMap, title) => {
    const sorted = Object.entries(statsMap)
      .map(([id, count]) => {
        const song = catalog.find(s => s.id === id);
        return { id, count, title: song ? song.title : id };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    if (sorted.length === 0) return null;
    const maxCount = sorted[0].count;

    return (
      <div className="space-y-4">
        <h3 className="text-brand-gold font-bold uppercase tracking-wider text-sm flex items-center gap-2">
          {title === 'plays' ? <Disc3 size={16} /> : <Flame size={16} />}
          {title === 'plays' ? t.statsPlays : t.statsVotes}
        </h3>
        <div className="space-y-3">
          {sorted.map((item) => (
            <div key={item.id} className="space-y-1">
              <div className={`flex justify-between text-xs ${isCatrina ? 'text-brand-gold/70' : 'text-zinc-300'}`}>
                <span className="truncate pr-4">{item.title}</span>
                <span className="font-bold">{item.count}</span>
              </div>
              <div className={`h-2 w-full rounded-full overflow-hidden ${isCatrina ? 'bg-white/[0.04]' : 'bg-zinc-800'}`}>
                <div className="h-full bg-brand-neon-purple rounded-full" style={{ width: `${(item.count / maxCount) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderTimeChart = () => {
    if (range !== 'hoy' && range !== 'semana') return null;
    const timeData = data.time;
    const isHoy = range === 'hoy';
    const keys = isHoy
      ? ['18', '19', '20', '21', '22', '23', '0', '1']
      : Array.from({ length: 7 }, (_, i) => ((i + 1) % 7).toString());
    const maxCount = Math.max(...Object.values(timeData), 0) || 1;

    return (
      <div className="space-y-4">
        <h3 className="text-brand-gold font-bold uppercase tracking-wider text-sm">
          {isHoy ? t.statsTime : t.statsDays}
        </h3>
        <div className="flex items-end gap-1 h-32 pt-4">
          {keys.map(key => {
            const count = timeData[key] || 0;
            const height = (count / maxCount) * 100;
            return (
              <div key={key} className="flex-1 flex flex-col items-center gap-2 h-full">
                <div className="flex-1 w-full flex items-end">
                  <div
                    className={`w-full border-t rounded-t-sm transition-all duration-500 ${isCatrina ? 'bg-brand-gold/20 border-brand-gold' : 'bg-brand-neon-green/40 border-brand-neon-green'}`}
                    style={{ height: `${height}%` }}
                    title={`${count} votos`}
                  />
                </div>
                <span className={`text-[10px] ${isCatrina ? 'text-brand-gold/40' : 'text-zinc-500'}`}>
                  {isHoy ? `${key}h` : t.daysShort[parseInt(key)]}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderAvgCostList = () => {
    if (!data.playsTotal || !data.votesTotal || Object.keys(data.playsTotal).length === 0) return null;
    const avgCosts = [];
    for (const [songId, plays] of Object.entries(data.playsTotal)) {
      if (plays >= 2) {
        const votes = data.votesTotal[songId] || 0;
        const avg = votes / plays;
        const song = catalog.find(s => s.id === songId);
        avgCosts.push({ id: songId, title: song ? song.title : songId, avg });
      }
    }
    if (avgCosts.length === 0) return null;
    avgCosts.sort((a, b) => b.avg - a.avg);
    const topAvgs = avgCosts.slice(0, 5);

    return (
      <div className="space-y-4">
        <h3 className="text-brand-gold font-bold uppercase tracking-wider text-sm flex items-center gap-2">
          <BarChart3 size={16} />
          {t.avgVoteCostTitle}
        </h3>
        <div className="space-y-3">
          {topAvgs.map((item) => (
            <div key={item.id} className={`flex justify-between items-center p-3 border rounded-xl ${isCatrina ? 'bg-brand-gold/5 border-brand-gold/10' : 'bg-zinc-900 border-zinc-800'}`}>
              <span className={`truncate pr-4 text-sm font-medium ${mainTextClass}`}>{item.title}</span>
              <span className={`font-bold text-sm shrink-0 ${item.avg >= 2 ? 'text-brand-gold' : (isCatrina ? 'text-brand-gold/30' : 'text-zinc-400')}`}>
                {item.avg.toFixed(1)}v
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className={`fixed inset-0 z-[110] flex flex-col ${isCatrina ? 'bg-[#0f0d0a]' : 'bg-zinc-950'}`}>
      <header className={`p-4 border-b flex items-center justify-between ${isCatrina ? 'border-brand-gold/10' : 'border-brand-gold/20'}`}>
        <h2 className="text-xl font-bold text-brand-gold flex items-center gap-2">
          <BarChart3 />
          {t.statsTitle}
        </h2>
        <button onClick={onClose} className={`p-2 transition-colors ${isCatrina ? 'text-brand-gold/40 hover:text-brand-gold' : 'text-zinc-400 hover:text-white'}`}>
          <X size={24} />
        </button>
      </header>

      <nav className={`flex p-2 gap-1 border-b overflow-x-auto custom-scrollbar ${isCatrina ? 'bg-[#141210] border-brand-gold/10' : 'bg-zinc-900 border-zinc-800'}`}>
        {[
          { id: 'hoy', label: t.statsToday },
          { id: 'semana', label: t.statsWeek },
          { id: 'mes', label: t.statsMonth },
          { id: 'total', label: t.statsTotal },
          { id: 'cost', label: t.statsCost }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setRange(tab.id)}
            className={`flex-1 py-2 text-sm font-bold transition-all rounded-lg ${isCatrina ? 'jukebox-stat-tab' : ''} ${
              range === tab.id
                ? (isCatrina ? 'jukebox-stat-tab-active' : 'bg-brand-gold text-zinc-950')
                : (isCatrina ? 'jukebox-stat-tab-inactive' : 'text-zinc-500 hover:text-zinc-300')
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="flex-1 overflow-y-auto p-6 space-y-10">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-brand-gold animate-pulse">
            {t.loading}
          </div>
        ) : (
          <>
            {range === 'cost' ? (
              renderAvgCostList() || (
                <div className={`text-center py-20 ${isCatrina ? 'text-brand-gold/15' : 'text-zinc-600'}`}>
                  <BarChart3 size={48} className="mx-auto mb-4 opacity-20" />
                  <p>{t.noStats}</p>
                </div>
              )
            ) : (
              <>
                {Object.keys(data.plays).length === 0 && Object.keys(data.votes).length === 0 ? (
                  <div className={`text-center py-20 ${isCatrina ? 'text-brand-gold/15' : 'text-zinc-600'}`}>
                    <BarChart3 size={48} className="mx-auto mb-4 opacity-20" />
                    <p>{t.noStats}</p>
                  </div>
                ) : (
                  <>
                    {renderTimeChart()}
                    {renderTopList(data.votes, 'votes')}
                    {renderTopList(data.plays, 'plays')}
                  </>
                )}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
