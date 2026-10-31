// Original faction crests (drawn here, not taken from anyone's artwork): Cities of Sigmar are a stylised
// tower with a crossed halberd, Ironjawz a tusked iron jaw under a bolted helm, Slaves to Darkness a horned helm over a
// snapped chain, Fyreslayers a flame-crested duardin helm over crossed axes, Kruleboyz a crude crimson-and-mustard shield with a
// three-claw scratch, Gloomspite Gitz a sun disc with a jagged bite out of it, Lumineth a three-curl wind swirl, Kharadron a cog
// inside a cloud, Stormcast a winged hammer-head over a lightning bolt, Skaven a three-scratch rune inside a cracked green stone,
// Seraphon a stepped-pyramid sun under a star, Soulblight a bat-winged drop of blood, Blades of Khorne a hound skull over crossed blades,
// Maggotkin of Nurgle three flies circling a cracked bell, Nighthaunt a hooded wisp holding a lantern, Sylvaneth a spiral of thorned leaves,
// Daughters of Khaine a curved dagger inside a heart outline, Idoneth Deepkin an eel coiled round a pale moon, Disciples of Tzeentch an eye set in a
// spiralling flame, Ossiarch Bonereapers a bone crown over two crossed femurs, Hedonites of Slaanesh two curling ribbons that form a mirror round a
// teardrop gem, Helsmiths of Hashut a horned bull head over a flaming anvil, Flesh-eater Courts a cracked, dripping crown over a bone goblet,
// Ogor Mawtribes a round iron gut-plate with a fanged maw, Sons of Behemat a giant's fist clutching a boulder. One 64x64 viewBox each, drawn with
// currentColor plus a handful of fixed accents so a crest reads on dark panels and on a bright active tile.
import type { CSSProperties, ReactElement } from 'react'

/** Faction ids the game ships a crest for; anything else gets a plain shield with the initial. */
export type CrestFaction = 'cities' | 'ironjawz' | 'slaves' | 'fyreslayers' | 'kruleboyz' | 'gloomspite' | 'lumineth' | 'kharadron' | 'stormcast' | 'skaven' | 'seraphon' | 'soulblight' | 'khorne' | 'nurgle' | 'nighthaunt' | 'sylvaneth' | 'daughters' | 'idoneth' | 'tzeentch' | 'ossiarch' | 'slaanesh' | 'helsmiths' | 'fec' | 'ogors' | 'behemat'

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
      {/* lower jaw: heavy U, tusks sweeping up and out on both sides, a row of short lower teeth */}
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

function KhorneCrest() {
  // Blades of Khorne (Fangs of the Blood God): a hound's skull, long muzzle and two pricked ears, over two crossed blades, a drop of blood
  // on one fang. Original line work; deliberately not any rune or skull sigil.
  return (
    <g>
      {/* crossed blades: tapered, hilts low, tips high either side of the skull */}
      <g fill="currentColor" opacity="0.8">
        <path d="M2 27 L47 52 L43 58 Z" />
        <path d="M62 27 L17 52 L21 58 Z" />
      </g>
      <g stroke="currentColor" strokeWidth="3.6" strokeLinecap="round">
        <line x1="41" y1="49" x2="48" y2="60" />
        <line x1="23" y1="49" x2="16" y2="60" />
        <line x1="45" y1="55" x2="54" y2="62" />
        <line x1="19" y1="55" x2="10" y2="62" />
      </g>
      <g transform="translate(32 4) scale(0.86) translate(-32 -4)">
      {/* ears */}
      <path d="M15 7 L27 16 L16 27 Z M49 7 L37 16 L48 27 Z" fill="currentColor" stroke="#0f1119" strokeWidth="1.6" strokeLinejoin="round" />
      {/* skull: round cranium narrowing into a muzzle */}
      <path d="M17 27 Q17 13 32 13 Q47 13 47 27 Q47 33 42 37 L40 44 L24 44 L22 37 Q17 33 17 27 Z" fill="currentColor" stroke="#0f1119" strokeWidth="2" strokeLinejoin="round" />
      {/* furious eye sockets and the nose */}
      <path d="M21 24 L30 28 L28 33 L21 30 Z M43 24 L34 28 L36 33 L43 30 Z" fill="#0f1119" />
      <path d="M29 37 H35 L32 41 Z" fill="#0f1119" />
      <path d="M26 44 H38" stroke="#0f1119" strokeWidth="2" />
      {/* fangs hanging from the upper jaw, one dripping */}
      <path d="M26 44 L28.5 54 L31 44 Z M33 44 L35.5 54 L38 44 Z" fill="currentColor" stroke="#0f1119" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M35.5 55 Q33.6 58.5 35.5 61 Q37.4 58.5 35.5 55 Z" fill="#c4282c" />
      </g>
    </g>
  )
}

function NurgleCrest() {
  // Maggotkin of Nurgle (Bleak Host): a cracked iron bell hung from a ring, a sickly dashed orbit round it and three fat flies on the orbit.
  const fly = (x: number, y: number, rot: number, key: string) => (
    <g key={key} transform={`translate(${x} ${y}) rotate(${rot}) scale(1.2)`}>
      <ellipse cx="-3.6" cy="-1.2" rx="2.4" ry="4.4" transform="rotate(-28 -3.6 -1.2)" fill="currentColor" opacity="0.55" stroke="currentColor" strokeWidth="0.8" />
      <ellipse cx="3.6" cy="-1.2" rx="2.4" ry="4.4" transform="rotate(28 3.6 -1.2)" fill="currentColor" opacity="0.55" stroke="currentColor" strokeWidth="0.8" />
      <ellipse cx="0" cy="0.8" rx="3.3" ry="4.2" fill="#a8c43a" stroke="#0f1119" strokeWidth="1" />
      <circle cx="0" cy="-3.6" r="2.3" fill="#a8c43a" stroke="#0f1119" strokeWidth="1" />
    </g>
  )
  return (
    <g>
      <circle cx="32" cy="33" r="22" fill="none" stroke="currentColor" strokeWidth="1.4" strokeDasharray="2.5 3.5" opacity="0.4" />
      {/* the bell: ring, domed body flaring to a lip, clapper */}
      <circle cx="32" cy="16" r="3.2" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <path d="M22 45 Q22 27 32 22 Q42 27 42 45 L46.5 49 H17.5 Z" fill="currentColor" stroke="#0f1119" strokeWidth="1.6" strokeLinejoin="round" />
      {/* the crack: a dark zigzag from the shoulder down through the lip */}
      <path d="M32 22 L28.5 31 L34.5 36 L29.5 43 L33 49" fill="none" stroke="#0f1119" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
      {[fly(11.5, 21, -35, 'a'), fly(52.5, 21, 35, 'b'), fly(32, 58, 180, 'c')]}
    </g>
  )
}

function NighthauntCrest() {
  // Nighthaunt (Slasher Host): a hooded wisp, face a black hollow with two soulfire eyes, its torn hem trailing off, a lantern hung from one hand.
  return (
    <g>
      <path d="M31 5 Q16 8 16 28 Q16 37 21 43 Q14 51 17 61 Q23 54 26 59 Q29 52 33 59 Q36 53 40 59 Q44 52 45 43 Q48 36 47 27 Q46 8 31 5 Z" fill="currentColor" />
      <path d="M31 11 Q22 14 22 27 Q22 36 31 40 Q40 36 40 27 Q40 14 31 11 Z" fill="#0f1119" />
      <ellipse cx="27" cy="26" rx="2.4" ry="3.2" fill="#8cf0b4" />
      <ellipse cx="35" cy="26" rx="2.4" ry="3.2" fill="#8cf0b4" />
      {/* the reaching arm and the lantern on its hook */}
      <path d="M43 40 Q49 40 52 35" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" />
      <line x1="53" y1="35" x2="53" y2="31" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M48.5 31 L53 26.5 L57.5 31 Z" fill="currentColor" />
      <rect x="49" y="31" width="8" height="12" rx="1.2" fill="#0f1119" stroke="currentColor" strokeWidth="1.8" />
      <path d="M53 33 Q55.4 37 53 41 Q50.6 37 53 33 Z" fill="#8cf0b4" />
    </g>
  )
}

function SylvanethCrest() {
  // Sylvaneth (Spitewing Flight): a thorned vine winding out in a spiral, a pointed leaf at each turn, an amber seed at the heart.
  const pts = Array.from({ length: 60 }, (_, i) => {
    const t = (i / 59) * Math.PI * 4.1
    const r = 3 + t * 1.95
    return { x: 32 + r * Math.cos(t - 1), y: 32 + r * Math.sin(t - 1), t }
  })
  const stem = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
  const leaves = [10, 20, 30, 40, 50, 59].map((i) => {
    const p = pts[i]
    const deg = ((p.t - 1) * 180) / Math.PI // radial direction at this point
    return <path key={`l${i}`} transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${(deg + 90 - 40).toFixed(0)})`} d="M0 0 Q7 -5 0.8 -17 Q-6 -7 0 0 Z" fill="currentColor" />
  })
  const thorns = [5, 15, 25, 35, 45, 55].map((i) => {
    const p = pts[i]
    const deg = ((p.t - 1) * 180) / Math.PI
    return <path key={`t${i}`} transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${(deg + 90).toFixed(0)})`} d="M-2 0 L0 -6.5 L2 0 Z" fill="currentColor" />
  })
  return (
    <g>
      <path d={stem} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {thorns}
      {leaves}
      <circle cx={pts[0].x} cy={pts[0].y} r="3.4" fill="#e0b040" stroke="#0f1119" strokeWidth="1" />
    </g>
  )
}

function DaughtersCrest() {
  // Daughters of Khaine (Heartflayer Troupe): a heart outline, blood-tinted, with a curved sacrificial dagger plunged point-down through its middle.
  return (
    <g>
      <path d="M32 59 C8 41 4 24 13 14 C21 7 30 11 32 18 C34 11 43 7 51 14 C60 24 56 41 32 59 Z" fill="#b3263c" fillOpacity="0.38" stroke="currentColor" strokeWidth="3.4" strokeLinejoin="round" />
      {/* the dagger: pommel, grip, cross-guard and a broad blade that bows to one side before its point */}
      <circle cx="32" cy="20.5" r="3" fill="currentColor" />
      <rect x="29.8" y="23" width="4.4" height="9" rx="1.4" fill="currentColor" />
      <rect x="21" y="31" width="22" height="4" rx="2" fill="currentColor" />
      <path d="M26.6 35 Q24.6 47 35.6 57 Q32.6 45 37.6 35 Z" fill="currentColor" stroke="#0f1119" strokeWidth="1.1" strokeLinejoin="round" />
      <path d="M31.2 36 Q30 44 33.4 51" fill="none" stroke="#0f1119" strokeWidth="1.2" strokeLinecap="round" opacity="0.55" />
      {/* a drop of blood off the point */}
      <path d="M45 43 Q42 47.6 45 50.6 Q48 47.6 45 43 Z" fill="#e0323f" stroke="#0f1119" strokeWidth="0.8" />
    </g>
  )
}

function IdonethCrest() {
  // Idoneth Deepkin (Soulraid Hunt): a pale-blue moon ringed by a thick eel that loops once round it, tail tucked under its own neck, a glowing eye.
  return (
    <g>
      <circle cx="32" cy="32" r="15" fill="#a9dcea" />
      <circle cx="27.5" cy="27" r="3.2" fill="#7fc2d4" /><circle cx="37" cy="37" r="2.4" fill="#7fc2d4" /><circle cx="36" cy="25.5" r="1.6" fill="#7fc2d4" />
      {/* the tail tapers off the upper right and runs under the body */}
      <path d="M52 20 Q57 14 61 9 Q58 18 57.5 25 Z" fill="currentColor" stroke="#0f1119" strokeWidth="1.2" strokeLinejoin="round" />
      {/* the body: nearly a full ring, dark outline under a pale stroke so it reads over the moon */}
      <path d="M54 22 A23 23 0 1 0 45 49" fill="none" stroke="#0f1119" strokeWidth="9.4" strokeLinecap="round" />
      <path d="M54 22 A23 23 0 1 0 45 49" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
      {/* scale ticks along the spine and the head turned back over the neck */}
      <path d="M32 5.5 V9.5 M19 11 L21.5 14 M10 24 L14 25.5 M12 43 L15.5 41.5" stroke="#0f1119" strokeWidth="1.6" strokeLinecap="round" opacity="0.55" />
      <path d="M41 44 Q50 42 58 49 Q55 58 44 57 Q37 54 41 44 Z" fill="currentColor" stroke="#0f1119" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="50" cy="50" r="2" fill="#12c8d8" stroke="#0f1119" strokeWidth="0.8" />
    </g>
  )
}

function TzeentchCrest() {
  // Disciples of Tzeentch (Tzaangor Warflock): a flame that twists up into a curl at its tip, a spiral drawn inside it, and an open eye at its heart.
  return (
    <g>
      <path d="M33 3 C 34 12 46 17 49 29 C 52 42 45 57 32 58 C 19 59 11 48 14 36 C 16 28 22 25 24 18 C 27 21 29 24 29 28 C 33 21 28 11 33 3 Z" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
      {/* the spiral winding round the eye, inside the flame */}
      <path d="M32 12 C 40 14 45 21 43 29 C 41 36 33 38 29 34 C 26 31 28 27 31 27" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity="0.7" />
      {/* the eye: an almond, an iris and a slit pupil */}
      <path d="M17 42 Q32 29 47 42 Q32 55 17 42 Z" fill="#0f1119" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />
      <circle cx="32" cy="42" r="6" fill="#e0399a" stroke="currentColor" strokeWidth="1.4" />
      <ellipse cx="32" cy="42" rx="1.9" ry="4.4" fill="#0f1119" />
      <circle cx="34" cy="40" r="1.2" fill="#fff" />
    </g>
  )
}

function OssiarchCrest() {
  // Ossiarch Bonereapers (Mortisan Elite): a spiked bone crown with a teal soul-gem over two femurs crossed in an X, a knob at each end.
  const femur = (x1: number, y1: number, x2: number, y2: number, key: string) => {
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len, nx = -uy, ny = ux
    const knob = (x: number, y: number, k: string) => (
      <g key={k}>
        <circle cx={x + nx * 2.6 - ux * 1.2} cy={y + ny * 2.6 - uy * 1.2} r="3.1" fill="currentColor" />
        <circle cx={x - nx * 2.6 - ux * 1.2} cy={y - ny * 2.6 - uy * 1.2} r="3.1" fill="currentColor" />
      </g>
    )
    return (
      <g key={key}>
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#0f1119" strokeWidth="7.4" strokeLinecap="round" />
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth="4.6" strokeLinecap="round" />
        {knob(x1, y1, 'a')}
        {knob(x2, y2, 'b')}
      </g>
    )
  }
  return (
    <g>
      {femur(14, 32, 50, 58, 'f1')}
      {femur(50, 32, 14, 58, 'f2')}
      {/* the crown: a band with five tall tines, the middle one set with a soul-gem */}
      <path d="M13 29 L11 11 L21 20 L27 5 L32 17 L37 5 L43 20 L53 11 L51 29 Z" fill="currentColor" stroke="#0f1119" strokeWidth="2" strokeLinejoin="round" />
      <rect x="13" y="25" width="38" height="5.4" rx="1" fill="#0f1119" fillOpacity="0.55" />
      <path d="M32 18 L35.2 23.4 L32 28.4 L28.8 23.4 Z" fill="#2fd8be" stroke="#0f1119" strokeWidth="1.2" strokeLinejoin="round" />
    </g>
  )
}

function SlaaneshCrest() {
  // Hedonites of Slaanesh (Epicurean Revellers): two mirrored ribbons that sweep out and round into an oval hand-mirror, each end curling
  // over like a ringlet, the tails crossing below as the handle, a pink teardrop gem hung in the glass. No rune, no GW icon.
  const ribbon = (key: string, flip: boolean) => (
    <g key={key} transform={flip ? 'translate(64 0) scale(-1 1)' : undefined} fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d="M29 7 C13 7 7 24 12 37 C16 46 25 49 30 45" stroke="#0f1119" strokeWidth="7.6" />
      <path d="M29 7 C13 7 7 24 12 37 C16 46 25 49 30 45" stroke="currentColor" strokeWidth="4.6" />
      <path d="M29 7 C34 5 38 9 35 12 C33 14 30 12 31 10" stroke="currentColor" strokeWidth="2.6" />
      <path d="M30 45 C27 52 22 55 19 61" stroke="#0f1119" strokeWidth="6.4" />
      <path d="M30 45 C27 52 22 55 19 61" stroke="currentColor" strokeWidth="3.6" />
    </g>
  )
  return (
    <g>
      {ribbon('r', true)}
      {ribbon('l', false)}
      <path d="M32 18 C40 28 41 36 32 43 C23 36 24 28 32 18 Z" fill="#e45bc9" stroke="#0f1119" strokeWidth="2" strokeLinejoin="round" />
      <path d="M29.5 28 C29 32 30 36 32 38" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" opacity="0.8" />
    </g>
  )
}

function HelsmithsCrest() {
  // Helsmiths of Hashut (Helforge Host): a horned bull's head, a flaring muzzle and two sweeping horns, over a bar of daemonfire (green) licking up
  // from a heavy anvil. The head is a general bull shape, not the Hashut sigil.
  return (
    <g>
      {/* anvil: a flat top, the pointed horn on the left, a waisted body and a broad foot */}
      <path d="M5 44 H54 L51 50 H42 C42 53 43 55 46 56 V61 H18 V56 C21 55 22 53 22 50 H15 C11 50 8 47 5 44 Z" fill="currentColor" stroke="#0f1119" strokeWidth="2" strokeLinejoin="round" />
      {/* daemonfire on the anvil face */}
      <path d="M17 44 C13 37 19 34 17 28 C23 32 26 38 22 44 Z" fill="#46d85a" stroke="#0f1119" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M26 44 C22 35 31 32 29 24 C36 30 38 38 34 44 Z" fill="#7bf08a" stroke="#0f1119" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M38 44 C35 38 41 36 40 30 C45 34 47 39 44 44 Z" fill="#46d85a" stroke="#0f1119" strokeWidth="1.4" strokeLinejoin="round" />
      {/* the bull: horns sweeping out and up, small ears, a broad brow narrowing to a flared muzzle */}
      <path d="M22 13 C12 14 6 10 5 2 C9 8 15 8 23 7 Z" fill="currentColor" stroke="#0f1119" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M42 13 C52 14 58 10 59 2 C55 8 49 8 41 7 Z" fill="currentColor" stroke="#0f1119" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M22 14 L14 15 L20 19 Z M42 14 L50 15 L44 19 Z" fill="currentColor" stroke="#0f1119" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M21 8 H43 L41 21 C40 26 41 28 39 31 C37 33 27 33 25 31 C23 28 24 26 23 21 Z" fill="currentColor" stroke="#0f1119" strokeWidth="2" strokeLinejoin="round" />
      <path d="M25 16 L30 18 M39 16 L34 18" stroke="#0f1119" strokeWidth="2" strokeLinecap="round" />
      <circle cx="29" cy="28" r="1.5" fill="#0f1119" />
      <circle cx="35" cy="28" r="1.5" fill="#0f1119" />
    </g>
  )
}

function FecCrest() {
  // Flesh-eater Courts (Carrion Retainers): a three-pointed paper crown with a crack running through it, blood dripping from its band into a bone goblet.
  return (
    <g>
      {/* goblet: bowl, stem, foot */}
      <path d="M17 36 H47 C47 47 41 52 34 52 V56 H42 V60 H22 V56 H30 V52 C23 52 17 47 17 36 Z" fill="currentColor" stroke="#0f1119" strokeWidth="2" strokeLinejoin="round" />
      <path d="M19 38 H45 C44 41 43 42 42 43 H22 C21 42 20 41 19 38 Z" fill="#c0262b" />
      {/* drips falling from the crown band */}
      <path d="M22 25 V31 M32 25 V33 M42 25 V29" stroke="#c0262b" strokeWidth="3" strokeLinecap="round" />
      <circle cx="22" cy="32.4" r="2.1" fill="#c0262b" />
      <circle cx="32" cy="34.4" r="2.1" fill="#c0262b" />
      <circle cx="42" cy="30.4" r="2.1" fill="#c0262b" />
      {/* crown: a band under three points, the middle tallest */}
      <path d="M10 25 L8 6 L21 15 L32 2 L43 15 L56 6 L54 25 Z" fill="currentColor" stroke="#0f1119" strokeWidth="2" strokeLinejoin="round" />
      <rect x="10" y="20" width="44" height="5.4" fill="#0f1119" fillOpacity="0.5" />
      {/* the crack: a jagged line from the middle point down through the band */}
      <path d="M33 4 L29 11 L35 15 L30 20 L34 25" fill="none" stroke="#0f1119" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round" />
    </g>
  )
}

function OgorsCrest() {
  // Ogor Mawtribes (Warglutt Marauders): a round, riveted iron belly-plate with a huge fanged maw across it: upper and lower fangs, two big tusks.
  return (
    <g>
      <circle cx="32" cy="32" r="28" fill="currentColor" stroke="#0f1119" strokeWidth="2.4" />
      <circle cx="32" cy="32" r="24" fill="none" stroke="#0f1119" strokeWidth="1.4" opacity="0.5" />
      {[[32, 9], [11, 32], [53, 32], [32, 55], [16, 16], [48, 16], [16, 48], [48, 48]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="1.9" fill="#0f1119" opacity="0.7" />)}
      {/* the maw */}
      <path d="M9 34 C15 20 49 20 55 34 C49 54 15 54 9 34 Z" fill="#0f1119" />
      <path d="M17 29 L21 38 L25 28 L29 38 L33 28 L37 38 L41 28 L45 38 L47 29 C41 24 23 24 17 29 Z" fill="#f4ecd6" />
      <path d="M20 44 L24 36 L28 45 L32 36 L36 45 L40 36 L44 44 C38 49 26 49 20 44 Z" fill="#f4ecd6" />
      <path d="M11 35 L17 19 L19 35 Z M53 35 L47 19 L45 35 Z" fill="#f4ecd6" stroke="#0f1119" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M28 42 C30 46 34 46 36 42 C34 40 30 40 28 42 Z" fill="#c0262b" />
    </g>
  )
}

function BehematCrest() {
  // Sons of Behemat (Stone Lobbas): a huge fist, forearm coming up from below, four fat knuckled fingers and a thumb clamped round a mossy boulder.
  return (
    <g>
      {/* the boulder */}
      <path d="M13 28 L19 11 L35 5 L50 12 L55 28 L49 42 L18 42 Z" fill="currentColor" fillOpacity="0.55" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M19 11 L26 20 L24 30 M35 5 L38 17 L48 22" fill="none" stroke="#0f1119" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" opacity="0.7" />
      <path d="M21 13 C26 9 30 10 32 14 C28 16 25 15 21 13 Z" fill="#6bc04a" />
      {/* forearm and wrist */}
      <path d="M20 62 L21 50 H44 L45 62 Z" fill="currentColor" stroke="#0f1119" strokeWidth="2" strokeLinejoin="round" />
      {/* four fingers, knuckles up, clamped over the boulder's lower half */}
      {[0, 1, 2, 3].map((i) => <rect key={i} x={13 + i * 10} y={33} width="10.4" height="19" rx="5" fill="currentColor" stroke="#0f1119" strokeWidth="2" />)}
      {[0, 1, 2, 3].map((i) => <path key={i} d={`M${15.5 + i * 10} 41 H${21 + i * 10}`} stroke="#0f1119" strokeWidth="1.4" strokeLinecap="round" opacity="0.55" />)}
      {/* thumb across the front */}
      <path d="M6 48 C5 41 14 37 24 44 C26 47 22 51 18 50 C14 49 10 52 6 48 Z" fill="currentColor" stroke="#0f1119" strokeWidth="2" strokeLinejoin="round" />
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

const CRESTS: Record<string, () => ReactElement> = {
  cities: () => <CitiesCrest />, ironjawz: () => <IronjawzCrest />, slaves: () => <SlavesCrest />, fyreslayers: () => <FyreslayersCrest />,
  kruleboyz: () => <KruleboyzCrest />, gloomspite: () => <GloomspiteCrest />, lumineth: () => <LuminethCrest />, kharadron: () => <KharadronCrest />,
  stormcast: () => <StormcastCrest />, skaven: () => <SkavenCrest />, seraphon: () => <SeraphonCrest />, soulblight: () => <SoulblightCrest />,
  khorne: () => <KhorneCrest />, nurgle: () => <NurgleCrest />, nighthaunt: () => <NighthauntCrest />, sylvaneth: () => <SylvanethCrest />,
  daughters: () => <DaughtersCrest />, idoneth: () => <IdonethCrest />, tzeentch: () => <TzeentchCrest />, ossiarch: () => <OssiarchCrest />,
  slaanesh: () => <SlaaneshCrest />, helsmiths: () => <HelsmithsCrest />, fec: () => <FecCrest />, ogors: () => <OgorsCrest />, behemat: () => <BehematCrest />,
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
      {(CRESTS[faction] ?? (() => <FallbackCrest initial={(name ?? faction).charAt(0).toUpperCase()} />))()}
    </svg>
  )
}
