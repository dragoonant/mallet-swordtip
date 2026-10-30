// Original faction crests (drawn here, not taken from anyone's artwork): Cities of Sigmar are a stylised
// tower with a crossed halberd, Ironjawz a fanged iron jaw over a fist. One 64x64 viewBox each, drawn with
// currentColor plus a handful of fixed accents so a crest reads on dark panels and on a bright active tile.
import type { CSSProperties } from 'react'

/** Faction ids the game ships a crest for; anything else gets a plain shield with the initial. */
export type CrestFaction = 'cities' | 'ironjawz'

function CitiesCrest() {
  return (
    <g>
      {/* crossed halberd: shaft, axe blade, spike */}
      <line x1="10" y1="56" x2="54" y2="8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <path d="M44 6 L58 8 L54 22 L50 16 Z" fill="currentColor" opacity="0.85" />
      <path d="M10 56 L6 62 L14 59 Z" fill="currentColor" />
      <line x1="54" y1="56" x2="10" y2="8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.55" />
      {/* tower */}
      <path d="M22 54 V26 H18 V16 H24 V20 H28 V16 H36 V20 H40 V16 H46 V26 H42 V54 Z" fill="#0f1119" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M28 54 V44 a4 4 0 0 1 8 0 V54 Z" fill="currentColor" opacity="0.9" />
      <rect x="30.5" y="29" width="3" height="7" rx="1.2" fill="currentColor" opacity="0.9" />
    </g>
  )
}

function IronjawzCrest() {
  return (
    <g>
      {/* fist below */}
      <path d="M18 62 V48 a4 4 0 0 1 4 -4 h20 a4 4 0 0 1 4 4 V62 Z" fill="currentColor" opacity="0.9" />
      <g stroke="#0f1119" strokeWidth="1.6" strokeLinecap="round">
        <line x1="26" y1="44" x2="26" y2="50" />
        <line x1="32" y1="44" x2="32" y2="50" />
        <line x1="38" y1="44" x2="38" y2="50" />
      </g>
      {/* upper jaw plate with fangs */}
      <path d="M8 24 Q8 8 32 8 Q56 8 56 24 L52 28 H12 Z" fill="#0f1119" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M14 28 L18 38 L22 28 Z M26 28 L30 36 L34 28 Z M38 28 L42 38 L46 28 Z" fill="currentColor" />
      {/* lower jaw */}
      <path d="M12 34 Q32 44 52 34" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" opacity="0.7" />
      {/* rivets and a glaring eye slit */}
      <circle cx="14" cy="16" r="1.8" fill="currentColor" />
      <circle cx="50" cy="16" r="1.8" fill="currentColor" />
      <path d="M20 19 L30 21 L30 23 L20 22 Z M44 19 L34 21 L34 23 L44 22 Z" fill="currentColor" />
    </g>
  )
}

function FallbackCrest({ initial }: { initial: string }) {
  return (
    <g>
      <path d="M12 8 H52 V34 Q52 52 32 60 Q12 52 12 34 Z" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round" />
      <text x="32" y="42" textAnchor="middle" fontSize="26" fontWeight="700" fill="currentColor" fontFamily="system-ui, sans-serif">{initial}</text>
    </g>
  )
}

export function FactionCrest({ faction, name, size = 48, style }: { faction: string; name?: string; size?: number; style?: CSSProperties }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={name ? `${name} crest` : 'Faction crest'}
      data-testid={`faction-crest-${faction}`}
      style={{ display: 'block', flex: 'none', ...style }}
    >
      {faction === 'cities' ? <CitiesCrest /> : faction === 'ironjawz' ? <IronjawzCrest /> : <FallbackCrest initial={(name ?? faction).charAt(0).toUpperCase()} />}
    </svg>
  )
}
