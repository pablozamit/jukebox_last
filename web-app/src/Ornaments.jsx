import { useTheme } from './ThemeContext';

export function CornerFlourish({ position, size = 32 }) {
  const { theme } = useTheme();
  if (theme !== 'catrina') return null;

  const rotations = { tl: 0, tr: 90, br: 180, bl: 270 };
  const positions = {
    tl: { top: -2, left: -2 },
    tr: { top: -2, right: -2 },
    br: { bottom: -2, right: -2 },
    bl: { bottom: -2, left: -2 },
  };
  const pos = positions[position];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{
        position: 'absolute',
        ...pos,
        transform: `rotate(${rotations[position]}deg)`,
        opacity: 0.5,
        pointerEvents: 'none',
      }}
    >
      <path d="M2 30V16C2 12 4 8 8 6" stroke="#b58a3a" strokeWidth="1.2" fill="none" />
      <path d="M6 30V18C6 14 8 12 12 10" stroke="#b58a3a" strokeWidth="0.8" fill="none" opacity="0.6" />
      <circle cx="2" cy="30" r="2" fill="#b58a3a" opacity="0.4" />
    </svg>
  );
}

export function OrnamentalFrame({ children, className = '' }) {
  const { theme } = useTheme();
  if (theme !== 'catrina') return <>{children}</>;

  return (
    <div className={`relative ${className}`}>
      <CornerFlourish position="tl" />
      <CornerFlourish position="tr" />
      <CornerFlourish position="bl" />
      <CornerFlourish position="br" />
      {children}
    </div>
  );
}

export function OrnamentalDivider() {
  const { theme } = useTheme();
  if (theme !== 'catrina') return <div className="h-px bg-zinc-800 my-4" />;

  return (
    <div className="flex items-center gap-3 my-4">
      <svg width="40" height="8" viewBox="0 0 40 8" fill="none" className="shrink-0 opacity-40">
        <path d="M0 4 L15 4" stroke="#b58a3a" strokeWidth="0.8" />
        <circle cx="20" cy="4" r="1.5" fill="#b58a3a" opacity="0.6" />
        <path d="M25 4 L40 4" stroke="#b58a3a" strokeWidth="0.8" />
      </svg>
      <div className="h-px flex-1 bg-brand-gold/15" />
      <svg width="40" height="8" viewBox="0 0 40 8" fill="none" className="shrink-0 opacity-40" style={{ transform: 'scaleX(-1)' }}>
        <path d="M0 4 L15 4" stroke="#b58a3a" strokeWidth="0.8" />
        <circle cx="20" cy="4" r="1.5" fill="#b58a3a" opacity="0.6" />
        <path d="M25 4 L40 4" stroke="#b58a3a" strokeWidth="0.8" />
      </svg>
    </div>
  );
}

export function SectionHeader({ label }) {
  const { theme } = useTheme();

  return (
    <div className="flex items-center gap-2 px-1 mb-4">
      <div className={`h-px flex-1 ${theme === 'catrina' ? 'bg-brand-gold/20' : 'bg-zinc-800'}`} />
      <span className="text-[10px] font-bold text-brand-gold/60 uppercase tracking-[0.2em]">{label}</span>
      <div className={`h-px flex-1 ${theme === 'catrina' ? 'bg-brand-gold/20' : 'bg-zinc-800'}`} />
    </div>
  );
}

export function TextureOverlay() {
  const { theme } = useTheme();
  if (theme !== 'catrina') return null;

  return (
    <div
      className="fixed inset-0 pointer-events-none z-[1] opacity-[0.03]"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        backgroundSize: '256px 256px',
      }}
    />
  );
}
