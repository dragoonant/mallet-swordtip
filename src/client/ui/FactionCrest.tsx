// Original faction crests (drawn here, not taken from anyone's artwork): Cities of Sigmar are a stylised
// tower with a crossed halberd, Ironjawz a tusked iron jaw under a bolted helm, Slaves to Darkness a horned helm over a
// snapped chain, Fyreslayers a flame-crested duardin helm over crossed axes. One 64x64 viewBox each, drawn with
// currentColor plus a handful of fixed accents so a crest reads on dark panels and on a bright active tile.
import type { CSSProperties } from 'react'

/** Faction ids the game ships a crest for; anything else gets a plain shield with the initial. */
export type CrestFaction = 'cities' | 'ironjawz' | 'slaves' | 'fyreslayers'

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
  // A bolted iron brow-plate over a gaping jaw: fangs hang from the plate, the lower jaw is a heavy U with two tall tusks,
  // and the dark gap between them is the mouth, so it reads as a jaw at any size (the old fist-and-skull blurred into a
  // mushroom below ~32px).
  return (
    <g>
      {/* lower jaw: heavy U, tusks sweeping up and out on both sides, a row of stubby lower teeth */}
      <path d="M9 40 Q12 60 32 61 Q52 60 55 40 L49 41 Q32 56 15 41 Z" fill="currentColor" />
      <path d="M8 44 Q1 26 11 8 Q12 28 21 40 Z" fill="currentColor" />
      <path d="M56 44 Q63 26 53 8 Q52 28 43 40 Z" fill="currentColor" />
      <path d="M20 47 L24 40 L28 49 Z M29 50 L32 41 L35 50 Z M36 49 L40 40 L44 47 Z" fill="currentColor" />
      {/* iron brow-plate with a notched edge, a rivet at each end and furious eye slits */}
      <path d="M17 7 H47 L51 16 L47 24 H17 L13 16 Z" fill="#0f1119" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
      <path d="M19 12 L30 16 L29 19 L19 17 Z M45 12 L34 16 L35 19 L45 17 Z" fill="currentColor" />
      {/* fangs hanging from the plate */}
      <path d="M20 25 L23 33 L26 25 Z M29 25 L32 35 L35 25 Z M38 25 L41 33 L44 25 Z" fill="currentColor" />
    </g>
  )
}

function SlavesCrest() {
  // Slaves to Darkness (Darkoath): an open horned war-helm over a snapped chain, three claw scratches behind. Original line work.
  return (
    <g>
      {/* scratch-runes: three jagged claw marks raking behind the helm */}
      <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.5">
        <path d="M22 4 L26 12 L21 18" />
        <path d="M32 2 L35 9 L30 14" />
        <path d="M42 4 L46 12 L41 18" />
      </g>
      {/* horns */}
      <path d="M17 29 Q5 28 4 11 Q12 17 20 20 Z" fill="currentColor" />
      <path d="M47 29 Q59 28 60 11 Q52 17 44 20 Z" fill="currentColor" />
      {/* helm: dome, nasal bar, cheek guards */}
      <path d="M16 36 V25 Q16 12 32 12 Q48 12 48 25 V36 L44 42 H38 L36 36 H28 L26 42 H20 Z" fill="#0f1119" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M30 14 H34 V32 L32 36 L30 32 Z" fill="currentColor" />
      <path d="M20 25 L28 27 L27 31 L20 29 Z M44 25 L36 27 L37 31 L44 29 Z" fill="currentColor" />
      <path d="M16 20 Q32 10 48 20" fill="none" stroke="currentColor" strokeWidth="1.6" opacity="0.6" />
      {/* the snapped chain: two links each side and a jagged break between */}
      <g fill="none" stroke="currentColor" strokeWidth="2.6">
        <rect x="3" y="49" width="13" height="8" rx="4" />
        <rect x="13" y="49" width="13" height="8" rx="4" transform="rotate(0)" />
        <rect x="38" y="49" width="13" height="8" rx="4" />
        <rect x="48" y="49" width="13" height="8" rx="4" />
      </g>
      <path d="M27 47 L31 53 L28 55 L33 62 L34 55 L31 53 L35 47 Z" fill="currentColor" />
    </g>
  )
}

function FyreslayersCrest() {
  // Fyreslayers: a flame-crested duardin helm with a short beard, over two crossed axes. Original line work.
  return (
    <g>
      {/* crossed axes: handles cross under the beard, crescent heads stand out either side of the helm */}
      <g stroke="currentColor" strokeWidth="3.4" strokeLinecap="round">
        <line x1="12" y1="28" x2="54" y2="62" />
        <line x1="52" y1="28" x2="10" y2="62" />
      </g>
      <path d="M13 29 L3 19 Q-1 31 7 40 Z" fill="currentColor" />
      <path d="M51 29 L61 19 Q65 31 57 40 Z" fill="currentColor" />
      {/* flame crest: three tongues */}
      <path d="M32 1 Q39 8 35 14 Q43 10 42 4 Q49 12 45 20 H19 Q15 12 22 4 Q21 10 29 14 Q25 8 32 1 Z" fill="currentColor" opacity="0.9" />
      {/* short braided beard in front of the crossing */}
      <path d="M22 36 Q20 50 32 57 Q44 50 42 36 Z" fill="#0f1119" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M28 42 L30 51 M32 41 V53 M36 42 L34 51" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity="0.75" />
      {/* helm with a brow band, eye slits and a nose guard */}
      <path d="M19 38 V27 Q19 18 32 18 Q45 18 45 27 V38 L40 42 H24 Z" fill="#0f1119" stroke="currentColor" strokeWidth="2.8" strokeLinejoin="round" />
      <path d="M19 26 H45" stroke="currentColor" strokeWidth="2.4" />
      <path d="M23 30 L30 32 L29 35 L23 34 Z M41 30 L34 32 L35 35 L41 34 Z M30.5 28 H33.5 V38 L32 40 L30.5 38 Z" fill="currentColor" />
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
      {faction === 'cities' ? <CitiesCrest /> : faction === 'ironjawz' ? <IronjawzCrest /> : faction === 'slaves' ? <SlavesCrest /> : faction === 'fyreslayers' ? <FyreslayersCrest /> : <FallbackCrest initial={(name ?? faction).charAt(0).toUpperCase()} />}
    </svg>
  )
}
