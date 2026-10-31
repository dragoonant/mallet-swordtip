// Original faction crests (drawn here, not taken from anyone's artwork): Cities of Sigmar are a stylised
// tower with a crossed halberd, Ironjawz a tusked iron jaw under a bolted helm, Slaves to Darkness a horned helm over a
// snapped chain, Fyreslayers a flame-crested duardin helm over crossed axes, Kruleboyz a crude crimson-and-mustard shield with a
// three-claw scratch, Gloomspite Gitz a sun disc with a jagged bite out of it, Lumineth a three-curl wind swirl, Kharadron a cog
// inside a cloud, Stormcast a winged hammer-head over a lightning bolt, Skaven a three-scratch rune inside a cracked green stone,
// Seraphon a stepped-pyramid sun under a star, Soulblight a bat-winged drop of blood. One 64x64 viewBox each, drawn with
// currentColor plus a handful of fixed accents so a crest reads on dark panels and on a bright active tile.
import type { CSSProperties } from 'react'

/** Faction ids the game ships a crest for; anything else gets a plain shield with the initial. */
export type CrestFaction = 'cities' | 'ironjawz' | 'slaves' | 'fyreslayers' | 'kruleboyz' | 'gloomspite' | 'lumineth' | 'kharadron' | 'stormcast' | 'skaven' | 'seraphon' | 'soulblight'

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

function KruleboyzCrest() {
  // Kruleboyz: a lopsided, hastily hammered shield painted crimson with a mustard rim and band, and three claw gashes scraped
  // across it in mustard. Heavy shapes only, so it still reads as a scratched shield at 24px.
  return (
    <g>
      <path d="M9 9 L33 6 L55 10 L57 33 Q54 51 31 60 Q9 51 7 32 Z" fill="#a7282a" stroke="#d4a62a" strokeWidth="4" strokeLinejoin="round" />
      <path d="M11 13 L33 10 L53 14 L54 21 L33 18 L10 21 Z" fill="#d4a62a" />
      <g fill="#f0cf63">
        <path d="M14 26 L21 24 L30 54 L27 55 L24 44 L22 45 Z" />
        <path d="M26 24 L33 23 L40 55 L37 56 L34 45 L32 46 Z" />
        <path d="M38 24 L45 25 L49 52 L46 52 L44 43 L41 44 Z" />
      </g>
    </g>
  )
}

function GloomspiteCrest() {
  // Gloomspite Gitz: a stolen sun, rays all round and a jagged bite torn out of its upper right, a spark of pale light left in the gap.
  return (
    <g>
      <mask id="crest-gz-bite" maskUnits="userSpaceOnUse" x="0" y="0" width="64" height="64">
        <rect width="64" height="64" fill="#fff" />
        <path d="M64 2 L47 8 L50 14 L41 18 L47 24 L38 30 L46 33 L43 40 L64 40 Z" fill="#000" />
      </mask>
      <g mask="url(#crest-gz-bite)">
        <circle cx="32" cy="32" r="17" fill="currentColor" />
        <g fill="currentColor">
          <path d="M32 2 L37 12 H27 Z" />
          <path d="M32 62 L37 52 H27 Z" />
          <path d="M2 32 L12 27 V37 Z" />
          <path d="M62 32 L52 27 V37 Z" />
          <path d="M11 11 L21 15 L15 21 Z" />
          <path d="M53 53 L43 49 L49 43 Z" />
          <path d="M11 53 L15 43 L21 49 Z" />
          <path d="M53 11 L49 21 L43 15 Z" />
        </g>
        <circle cx="26" cy="28" r="2.6" fill="#0f1119" opacity="0.55" />
        <circle cx="33" cy="40" r="3.4" fill="#0f1119" opacity="0.45" />
      </g>
      <path d="M52 22 L56 28 L52 34 L48 28 Z" fill="#f0e08a" />
    </g>
  )
}

function LuminethCrest() {
  // Lumineth Realm-lords: three curls of wind chasing round a still centre, one arm turned 120 degrees from the next.
  return (
    <g fill="none" stroke="currentColor" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round">
      {[0, 120, 240].map((a) => (
        <path key={a} transform={`rotate(${a} 32 32)`} d="M32 32 C32 22 36 12 45 12 C53 12 55 22 49 26 C45 29 41 26 43 22" />
      ))}
      <circle cx="32" cy="32" r="3.2" fill="currentColor" stroke="none" />
    </g>
  )
}

function KharadronCrest() {
  // Kharadron Overlords: a toothed brass cog riding inside a puffy cloud (an airship-port badge).
  const teeth = [0, 45, 90, 135, 180, 225, 270, 315]
  return (
    <g>
      <path d="M15 52 Q4 52 4 41 Q4 31 14 30 Q15 17 28 17 Q35 8 44 15 Q50 18 51 24 Q61 25 61 38 Q61 52 49 52 Z" fill="#0f1119" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
      <g transform="translate(32 35)" fill="currentColor">
        {teeth.map((a) => (
          <rect key={a} x="-3.2" y="-13.5" width="6.4" height="7" rx="1" transform={`rotate(${a})`} />
        ))}
        <circle r="9.6" />
        <circle r="3.8" fill="#0f1119" />
      </g>
    </g>
  )
}

function StormcastCrest() {
  // Stormcast Eternals: a winged war-hammer head hovering over a forked lightning bolt. Wings are three stacked feathers a side;
  // the bolt is a cyan accent so it still reads when the rest is a single colour.
  const wing = <path d="M19 15 Q9 6 1 11 Q7 12 8 15 Q3 17 2 22 Q8 21 11 22 Q7 26 7 30 Q14 27 18 24 Z" fill="currentColor" />
  return (
    <g>
      {wing}
      <g transform="translate(64 0) scale(-1 1)">{wing}</g>
      {/* hammer head: blocky, flared faces either end of a dark waist band */}
      <path d="M20 6 H44 L46 9 V20 L44 23 H20 L18 20 V9 Z" fill="#0f1119" stroke="currentColor" strokeWidth="2.8" strokeLinejoin="round" />
      <path d="M27 6 H37 V23 H27 Z" fill="currentColor" />
      <path d="M22 11 H25 M39 11 H42" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
      {/* lightning bolt */}
      <path d="M38 25 L23 43 H31 L25 62 L44 38 H35 L41 25 Z" fill="#7fe3f5" stroke="#0f1119" strokeWidth="1.6" strokeLinejoin="round" />
    </g>
  )
}

function SkavenCrest() {
  // Skaven: a chipped, glowing warpstone with a crack running down its left side and three claw scratches raked across its face.
  return (
    <g>
      <path d="M32 3 L52 11 L60 32 L49 56 L27 61 L8 48 L5 23 L17 8 Z" fill="#46ad2a" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
      <path d="M32 3 L52 11 L37 23 L17 8 Z" fill="#9cf06a" opacity="0.65" />
      <path d="M52 11 L60 32 L49 38 L37 23 Z" fill="#2d7a1b" opacity="0.7" />
      {/* the crack: a dark zigzag through the left face */}
      <path d="M17 8 L22 17 L15 24 L21 33 L13 41" fill="none" stroke="#0f1119" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
      {/* the rune: three scratches, ragged and not quite parallel */}
      <g fill="none" stroke="#0f1119" strokeWidth="4.6" strokeLinecap="round">
        <path d="M27 20 Q33 31 28 50" />
        <path d="M37 18 Q43 31 38 52" />
        <path d="M47 24 Q52 34 48 47" />
      </g>
    </g>
  )
}

function SeraphonCrest() {
  // Seraphon: a four-pointed star above a sun rising behind a stepped temple-pyramid.
  const rays = [-60, -30, 0, 30, 60]
  return (
    <g>
      <path d="M32 1 L34.6 7.4 L41 10 L34.6 12.6 L32 19 L29.4 12.6 L23 10 L29.4 7.4 Z" fill="#8fd0ff" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <g transform="translate(32 40)" fill="currentColor">
        {rays.map((a) => (
          <path key={a} d="M-2.6 -17 L0 -24 L2.6 -17 Z" transform={`rotate(${a})`} />
        ))}
        <circle r="14" />
      </g>
      {/* stepped pyramid with a doorway */}
      <path d="M5 60 V51 H12 V43 H20 V35 H44 V43 H52 V51 H59 V60 Z" fill="#0f1119" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M12 51 H52 M20 43 H44" stroke="currentColor" strokeWidth="1.8" opacity="0.6" />
      <path d="M28 60 V52 a4 4 0 0 1 8 0 V60 Z" fill="currentColor" />
    </g>
  )
}

function SoulblightCrest() {
  // Soulblight Gravelords: a drop of blood with a bat's scalloped wing out either side and a pair of small fangs in the drop.
  const wing = <path d="M19 33 Q10 19 1 21 Q5 25 4 29 Q8 28 9 33 Q12 32 14 37 Q17 36 19 41 Z" fill="currentColor" />
  return (
    <g>
      {wing}
      <g transform="translate(64 0) scale(-1 1)">{wing}</g>
      <path d="M32 6 C30 16 16 28 16 42 A16 16 0 0 0 48 42 C48 28 34 16 32 6 Z" fill="#b3162f" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
      <path d="M23 40 Q23 33 28 28" fill="none" stroke="#ffb3bd" strokeWidth="2.6" strokeLinecap="round" opacity="0.8" />
      <path d="M26 46 L29 55 L32 46 Z M32 46 L35 55 L38 46 Z" fill="#f4eee0" />
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
      {faction === 'cities' ? <CitiesCrest /> : faction === 'ironjawz' ? <IronjawzCrest /> : faction === 'slaves' ? <SlavesCrest /> : faction === 'fyreslayers' ? <FyreslayersCrest /> : faction === 'kruleboyz' ? <KruleboyzCrest /> : faction === 'gloomspite' ? <GloomspiteCrest /> : faction === 'lumineth' ? <LuminethCrest /> : faction === 'kharadron' ? <KharadronCrest /> : faction === 'stormcast' ? <StormcastCrest /> : faction === 'skaven' ? <SkavenCrest /> : faction === 'seraphon' ? <SeraphonCrest /> : faction === 'soulblight' ? <SoulblightCrest /> : <FallbackCrest initial={(name ?? faction).charAt(0).toUpperCase()} />}
    </svg>
  )
}
