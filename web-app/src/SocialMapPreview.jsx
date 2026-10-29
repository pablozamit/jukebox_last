const ROOM_NAMES = {
  es: { terrace: 'TERRAZA', entrance: 'ENTRADA', tables: 'MESAS', foosball: 'FUTBOLÍN', pool: 'BILLAR', bar: 'BARRA' },
  en: { terrace: 'TERRACE', entrance: 'ENTRANCE', tables: 'TABLES', foosball: 'FOOSBALL', pool: 'POOL', bar: 'BAR' },
};

export default function SocialMapPreview({ lang = 'es' }) {
  const rooms = ROOM_NAMES[lang === 'en' ? 'en' : 'es'];
  return <svg className="social-map-preview" viewBox="0 0 640 184" role="img" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="social-map-floor" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#524334" /><stop offset="1" stopColor="#29221c" /></linearGradient>
      <linearGradient id="social-map-terrace" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#514a37" /><stop offset="1" stopColor="#34352a" /></linearGradient>
      <linearGradient id="social-map-water" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#315c60" /><stop offset="1" stopColor="#1c393c" /></linearGradient>
      <filter id="social-map-shadow" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="4" stdDeviation="3" floodColor="#000" floodOpacity=".42" /></filter>
    </defs>
    <g className="social-map-plan" filter="url(#social-map-shadow)">
      {/* The outdoor terrace connects directly to the main room. */}
      <path className="social-map-wall" d="M20 54 142 44 174 63 174 153 20 153Z" />
      <path className="social-map-terrace-floor" d="M25 60 140 51 166 66 166 147 25 147Z" fill="url(#social-map-terrace)" />
      <path className="social-map-terrace-trim" d="M25 60 140 51 166 66 166 147 25 147Z" />
      <path className="social-map-plant" d="M39 73q-13-14 0-22 10 9 0 22m0 0q-12-1-17-12m17 12q11-8 16-16m-16 16v6" />
      <path className="social-map-plant" d="M149 127q-12-12 0-21 10 8 0 21m0 0q-11-1-15-10m15 10q10-7 14-14m-14 14v6" />
      {/* Two adjacent rectangular terrace tables with four stools each. */}
      <g className="social-map-furniture">
        <rect className="social-map-table" x="57" y="88" width="34" height="15" rx="2" />
        <rect className="social-map-table" x="94" y="88" width="34" height="15" rx="2" />
        <circle className="social-map-stool" cx="63" cy="82" r="2.8" /><circle className="social-map-stool" cx="85" cy="82" r="2.8" />
        <circle className="social-map-stool" cx="63" cy="109" r="2.8" /><circle className="social-map-stool" cx="85" cy="109" r="2.8" />
        <circle className="social-map-stool" cx="100" cy="82" r="2.8" /><circle className="social-map-stool" cx="122" cy="82" r="2.8" />
        <circle className="social-map-stool" cx="100" cy="109" r="2.8" /><circle className="social-map-stool" cx="122" cy="109" r="2.8" />
      </g>
      <text className="social-map-room-title" x="42" y="140">{rooms.terrace}</text>

      {/* Main room, with the entrance opening toward the terrace. */}
      <path className="social-map-wall" d="M174 35 601 35 619 48 619 153 174 153 174 119 187 119 187 84 174 84Z" />
      <path className="social-map-main-floor" d="M181 42 595 42 611 52 611 146 181 146 181 112 194 112 194 91 181 91Z" fill="url(#social-map-floor)" />
      <path className="social-map-room-divider" d="M181 91H226M244 42V146M326 42V146M408 42V146M490 42V146" />
      <path className="social-map-entrance" d="M174 84V119M181 91V112" />
      <text className="social-map-room-title" x="197" y="106">{rooms.entrance}</text>

      {/* Dining tables and chairs. */}
      <g className="social-map-furniture">
        <rect x="518" y="57" width="28" height="17" rx="2" /><path d="M532 57v17M512 61v9m40-9v9" />
        <rect x="558" y="57" width="28" height="17" rx="2" /><path d="M572 57v17M552 61v9m40-9v9" />
      </g>
      <text className="social-map-room-title" x="532" y="86">{rooms.tables}</text>

      {/* Foosball table. */}
      <g className="social-map-game">
        <rect x="252" y="117" width="65" height="18" rx="2" />
        <path d="M272 117v18m25-18v18M257 121h55M257 131h55" />
        <circle cx="284" cy="126" r="2" />
      </g>
      <text className="social-map-room-title" x="256" y="143">{rooms.foosball}</text>

      {/* Pool table and cue rails. */}
      <g className="social-map-pool-table">
        <rect x="337" y="99" width="59" height="38" rx="4" />
        <rect x="343" y="105" width="47" height="26" rx="2" fill="url(#social-map-water)" />
        <circle cx="347" cy="109" r="2" /><circle cx="386" cy="109" r="2" /><circle cx="347" cy="127" r="2" /><circle cx="386" cy="127" r="2" />
        <circle className="social-map-ball" cx="362" cy="118" r="2.5" />
      </g>
      <text className="social-map-room-title" x="356" y="146">{rooms.pool}</text>

      {/* Bar counter and warm back-bar shelves. */}
      <g className="social-map-bar">
        <path d="M416 51h75v13h-62v21h-13Z" />
        <path d="M430 68h61v22h-61z" />
        <path d="M438 72v8m11-8v8m11-8v8m11-8v8m11-8v8" />
        <circle cx="453" cy="99" r="3" /><circle cx="475" cy="99" r="3" />
      </g>
      <text className="social-map-room-title" x="447" y="125">{rooms.bar}</text>
    </g>
  </svg>;
}
