"""Shared paths and per-id generation config for the local Swordtip audio pipeline."""
import json
import os
from pathlib import Path

HOME = Path(os.path.expanduser("~"))
STUDIO = Path(os.environ.get("AUDIO_STUDIO", HOME / "AudioStudio"))
OUT = Path(os.environ.get("SWORDTIP_AUDIO_OUT", STUDIO / "out" / "swordtip"))
REPO = Path(__file__).resolve().parents[2]
MANIFEST = REPO / "tools" / "audio-manifest.json"
PUBLIC_AUDIO = REPO / "public" / "audio"

VENV_AUDIOCRAFT = Path(os.environ.get("AUDIOCRAFT_VENV", STUDIO / "audiocraft"))
VENV_QWEN = Path(os.environ.get("QWEN_TTS_VENV", STUDIO / "qwen-tts" / ".venv"))
VENV_CHATTERBOX = Path(os.environ.get("CHATTERBOX_VENV", STUDIO / "chatterbox" / ".venv"))


def load_manifest():
    return json.loads(MANIFEST.read_text(encoding="utf-8"))


def aos_items(prefix="aos-"):
    return [i for i in load_manifest()["items"] if i["id"].startswith(prefix)]


def id_dir(item_id):
    d = OUT / item_id
    d.mkdir(parents=True, exist_ok=True)
    return d


# ---- AudioGen / MusicGen prompts. AudioGen answers badly to "no X" clauses (it tends to add X),
# so these are short positive descriptions. `dur` is the generation length in seconds (the master
# step trims silence and caps the tail). `engines` lists which generators produce takes; `p` is the
# AudioGen prompt (also what CLAP scores against), `mp` the MusicGen prompt.
AG, MG = "audiogen", "musicgen"
SFX = {
    "aos-halberd-strike": dict(dur=2.0, p="a heavy steel axe blade chopping into plate armour, a whoosh then a metallic crunch and a thud"),
    "aos-sword-clash": dict(dur=2.0, p="two steel swords clashing with a loud ringing metallic clang"),
    "aos-lance-charge-impact": dict(dur=2.5, p="a wooden lance splintering against a metal shield with a heavy crash and a thud"),
    "aos-cannon-fire": dict(dur=3.0, p="a huge cannon firing, a deep loud boom with a rolling rumbling echo"),
    "aos-cannonball-impact": dict(dur=2.5, p="a heavy cannonball smashing into stone and wooden timber, a crash of debris and a deep thump"),
    "aos-choppa-hit": dict(dur=2.0, p="a heavy rusty iron cleaver chopping into metal armour, a dull clunking crunch"),
    "aos-fist-smash": dict(dur=2.0, p="a heavy iron gauntlet smashing down on metal armour, a deep crushing thud and bending metal"),
    "aos-shield-bash": dict(dur=1.5, p="a wooden shield slammed into armour, a thick thump and a metallic rattle"),
    "aos-armour-hit": dict(dur=1.5, p="a sword blow hitting steel plate armour with a sharp metallic clank"),
    "aos-miss-whoosh": dict(dur=1.5, p="a sword swung quickly through the air, a fast whoosh"),
    "aos-horse-gallop": dict(dur=4.5, p="a single horse galloping on a dirt road, steady hoofbeats with jingling metal harness"),
    "aos-horse-charge": dict(dur=4.0, p="a horse neighing then many horses galloping, thundering hooves and clanking armour"),
    "aos-armoured-march": dict(dur=4.5, p="soldiers in metal armour marching in step, heavy boots stomping and metal plates rattling"),
    "aos-orruk-stomp": dict(dur=2.0, p="a giant heavy footstep stomping on the ground with a clank of iron armour"),
    "aos-human-battle-cry": dict(dur=3.0, p="a crowd of men roaring a loud angry battle cry"),
    "aos-human-death-1": dict(dur=2.5, p="a man crying out in pain and grunting, then falling to the ground in armour"),
    "aos-human-death-2": dict(dur=2.5, p="a man screaming in pain, then a body falling heavily onto stone"),
    "aos-orruk-roar": dict(dur=3.0, p="a huge monster roaring with a very deep growling voice"),
    "aos-orruk-death-1": dict(dur=2.5, p="a huge monster bellowing in pain with a deep gravelly voice, then a heavy thud on the ground"),
    "aos-orruk-death-2": dict(dur=3.0, p="a big monster groaning and growling weakly, then collapsing with a crash of heavy metal"),
    "aos-marshal-command": dict(dur=2.5, p="a man shouting a loud commanding order across a battlefield"),
    # tonal / musical effects: AudioGen and MusicGen both try
    "aos-priority-drumroll": dict(dur=4.0, engines=[AG, MG], p="a snare drum roll building up and ending with one loud bass drum hit",
                                  mp="Tense medieval military snare drum roll that builds, ending with one hard hit on a big war drum. Drums only, no melody"),
    "aos-round-start-war-horn": dict(dur=4.0, engines=[AG, MG], p="a deep medieval war horn blowing a long low call",
                                     mp="A deep powerful medieval war horn blown twice, a long rising low brass call with a slight echo. Solo horn only"),
    "aos-objective-captured": dict(dur=3.5, engines=[AG, MG], p="two trumpets playing a short bright triumphant fanfare",
                                   mp="A short heraldic brass fanfare: two bright trumpets playing a rising triumphant three-note flourish. Brass only, clean"),
    "aos-battle-tactic-scored": dict(dur=3.0, engines=[AG, MG], p="a short trumpet fanfare with a snare roll and a cymbal crash",
                                     mp="A short heroic fanfare sting: trumpets with a snare roll ending on a bright cymbal crash, uplifting and punchy"),
    "aos-victory": dict(dur=8.0, engines=[AG, MG], p="a triumphant orchestral brass fanfare with timpani and a cymbal crash at the end",
                        mp="A grand triumphant orchestral brass fanfare with rolling timpani and a final bright held chord with a cymbal crash, heroic fantasy victory"),
    "aos-defeat": dict(dur=7.0, engines=[AG, MG], p="a slow sad orchestral brass descent with a single deep drum hit",
                       mp="A slow mournful descending orchestral sting with low brass and a single deep muffled war drum, a solemn defeat fading into silence, dark fantasy"),
}

# Ids that are voices/creature sounds and also get TTS candidates (Qwen3-TTS VoiceDesign, Chatterbox).
# text = what the voice says; style = how (Qwen instruct / CLAP prompt).
TTS_VOICES = {
    "human": dict(
        instruct="A gruff, battle-hardened middle-aged human knight-commander. Deep, loud, authoritative and hoarse, "
                 "shouting across a battlefield with a ringing parade-ground voice.",
    ),
    "orruk": dict(
        instruct="A huge brutish monster warrior with an extremely deep, low, gravelly, growling voice. Slow, heavy, "
                 "furious and menacing, bellowing and snarling, like a giant thug.",
    ),
}
TTS_LINES = {
    "aos-marshal-command": ("human", ["Halberds, forward! Advance!", "Hold the line! Forward, together!"]),
    "aos-human-battle-cry": ("human", ["For the city! Charge!", "Aaaargh! For the crown! Kill them all!"]),
    "aos-human-death-1": ("human", ["Argh! Ngh... uhh.", "Aagh! No... uh."]),
    "aos-human-death-2": ("human", ["Aaaaargh! Gah... hhh.", "Aaagh! Guh... urrgh."]),
    "aos-orruk-roar": ("orruk", ["Raaaargh! Smash them all!", "Waaagh! Crush them! Roaaar!"]),
    "aos-orruk-death-1": ("orruk", ["Aaargh... urrgh... no...", "Grraaargh! Uuuh... ugh."]),
    "aos-orruk-death-2": ("orruk", ["Hrraah... gnnh... uuurgh.", "Urrrgh... gah... huh..."]),
}
TTS_CLAP = {  # what CLAP scores TTS takes against (same as the sfx prompt unless overridden)
}

# Narrator lines (new manifest items, kind "voice"), one consistent fierce voice via Qwen3-TTS VoiceDesign.
NARRATOR_INSTRUCT = ("A fierce, powerful male war-narrator with a very deep, low, resonant bass voice and a gravelly edge, "
                     "speaking slowly and forcefully with grim dramatic intensity, like an epic fantasy game announcer.")
NARRATOR = {
    "aos-narr-battle-round-one": "Battle round one.",
    "aos-narr-battle-round-two": "Battle round two.",
    "aos-narr-battle-round-three": "Battle round three.",
    "aos-narr-battle-round-four": "Battle round four.",
    "aos-narr-roll-for-priority": "Roll for priority.",
    "aos-narr-hero-phase": "Hero phase.",
    "aos-narr-movement-phase": "Movement phase.",
    "aos-narr-shooting-phase": "Shooting phase.",
    "aos-narr-charge-phase": "Charge phase.",
    "aos-narr-combat-phase": "Combat phase.",
    "aos-narr-end-of-turn": "End of turn.",
    "aos-narr-battle-tactic-complete": "Battle tactic complete.",
    "aos-narr-twist-revealed": "Twist revealed.",
    "aos-narr-victory": "Victory!",
    "aos-narr-defeat": "Defeat.",
    "aos-narr-objective-taken": "Objective taken.",
    "aos-narr-unit-destroyed": "Unit destroyed.",
    "aos-narr-your-turn": "Your turn.",
}

MUSIC = {  # music: id -> params (dur from the manifest lengthMs when absent)
    "aos-ambient-bed": dict(dur=42.0, takes=3, lufs=-24.5, fade=0.0, loop=True),
}
for _i in ["iron-vanguard", "the-long-march", "gate-of-ash", "banner-and-blade", "last-stand", "cold-hearth"]:
    MUSIC[f"aos-stinger-{_i}"] = dict(takes=3, lufs=-16.0, fade=1.5, loop=False)

# Second-pass prompts for ids whose first-pass takes scored poorly with CLAP. `python gen_audiocraft.py --alt`
# generates extra takes named audiogen-alt-<n> / musicgen-alt-<n> that join the pick pool.
ALT = {
    "aos-orruk-stomp": dict(ag="a loud heavy thud of one giant footstep, a low rumble and a metallic clank"),
    "aos-fist-smash": dict(ag="a loud heavy punch smashing into metal armour, a deep crunch and a thud"),
    "aos-cannonball-impact": dict(ag="a heavy stone and wood crash, timber splintering and rubble falling"),
    "aos-horse-charge": dict(ag="a herd of horses galloping, loud thundering hooves approaching and a horse neighing"),
    "aos-armoured-march": dict(ag="many soldiers marching with rhythmic stomping footsteps and clanking metal armour"),
    "aos-battle-tactic-scored": dict(ag="a short bright brass fanfare with trumpets, ending in a cymbal crash",
                                     mg="Short triumphant brass fanfare, trumpets and a cymbal crash, heroic and punchy"),
    "aos-objective-captured": dict(ag="a short bright trumpet fanfare, three rising notes",
                                   mg="Two trumpets play a short bright rising fanfare, regal and clean"),
}

# ---- F8 armies: Kruleboyz, Gloomspite Gitz, Lumineth Realm-lords, Kharadron Overlords (aos-<army>-<thing>).
# Vocal cues are AudioGen growls / cackles / shouts (wordless); Qwen voices came out too high for orruks.
SFX.update({
    "aos-kruleboyz-war-cry": dict(dur=3.0, p="a pack of huge monsters growling and snarling a deep guttural roar"),
    "aos-kruleboyz-crossbow": dict(dur=2.0, p="a heavy crossbow firing, a sharp wooden twang and a bolt whooshing away"),
    "aos-kruleboyz-killbow": dict(dur=2.5, p="a giant wooden ballista firing, a loud rope snap, a heavy wooden thunk and a big bolt whooshing"),
    "aos-kruleboyz-hacka": dict(dur=2.0, p="a crude jagged iron blade hacking into armour, a heavy chop and a rough metal scrape"),
    "aos-kruleboyz-swamp-march": dict(dur=4.0, p="heavy footsteps squelching and splashing through deep swamp mud"),
    "aos-kruleboyz-gnashtoof": dict(dur=3.0, p="a huge vicious beast snarling and growling with snapping jaws"),
    "aos-kruleboyz-death": dict(dur=2.5, p="a big brute groaning in pain and falling with a heavy splash into mud"),
    "aos-gloomspite-cackle": dict(dur=3.0, p="a group of small goblins cackling with high pitched wicked laughter"),
    "aos-gloomspite-wolf-howl": dict(dur=4.0, p="a pack of wolves howling"),
    "aos-gloomspite-wolf-snarl": dict(dur=2.0, p="a wolf snarling viciously and snapping its jaws"),
    "aos-gloomspite-grot-bow": dict(dur=1.5, p="a small wooden bow firing, a light string twang and an arrow whizzing past"),
    "aos-gloomspite-wolf-run": dict(dur=4.0, p="a pack of wolves running fast, paws pounding on dirt and panting"),
    "aos-gloomspite-chariot": dict(dur=4.0, p="a rickety wooden cart racing over rough ground, rattling wheels, creaking and clattering wood"),
    "aos-gloomspite-death": dict(dur=2.0, p="a small goblin shrieking a high pitched squeal of pain"),
    "aos-lumineth-war-cry": dict(dur=2.5, p="a group of men shouting a short sharp battle cry together"),
    "aos-lumineth-arrow": dict(dur=1.5, p="an arrow shot from a bow, a taut string twang and a fast whistling whoosh"),
    "aos-lumineth-wind-blast": dict(dur=2.5, p="a sudden powerful gust of wind blasting past with a deep whoosh"),
    "aos-lumineth-pike": dict(dur=1.5, p="a steel spear thrust, a fast swish and a sharp metallic ring"),
    "aos-lumineth-wind-spirit": dict(dur=4.0, p="a howling roaring whirlwind, strong swirling gusts of wind"),
    "aos-lumineth-wind-rush": dict(dur=3.0, p="a fast rushing wind sweeping past"),
    "aos-lumineth-death": dict(dur=2.0, p="a young man gasping in pain with a short cry, then collapsing"),
    "aos-kharadron-war-cry": dict(dur=2.5, p="a group of gruff deep voiced men shouting a loud hearty cheer"),
    "aos-kharadron-aether-pistol": dict(dur=1.5, p="a steam powered pistol shot, a sharp bang with a hiss of steam"),
    "aos-kharadron-volley-gun": dict(dur=2.5, p="a rapid firing multi barrel gun, a fast rattling burst of shots with a mechanical whir"),
    "aos-kharadron-harpoon": dict(dur=2.0, p="a pneumatic harpoon gun firing, a heavy thunk, a hiss of air and a rattling chain"),
    "aos-kharadron-broadside": dict(dur=3.0, p="a ship firing a broadside of cannons, several heavy booms in a row"),
    "aos-kharadron-propeller": dict(dur=3.0, p="a small propeller engine buzzing and whirring as it flies past"),
    "aos-kharadron-airship-engine": dict(dur=5.0, p="a large airship engine droning with spinning propellers and hissing steam"),
    "aos-kharadron-death": dict(dur=2.0, p="a gruff man grunting in pain and falling down with a clank of metal armour"),
})
ALT.update({
    "aos-lumineth-wind-spirit": dict(ag="strong wind howling and whooshing in a storm"),
    "aos-kharadron-propeller": dict(ag="a small propeller spinning fast with a buzzing motor"),
    "aos-kharadron-aether-pistol": dict(ag="a loud gunshot followed by a short hiss of steam"),
    "aos-kharadron-war-cry": dict(ag="a crowd of men cheering and shouting loudly"),
    "aos-gloomspite-wolf-snarl": dict(ag="a dog growling and barking aggressively"),
    "aos-gloomspite-grot-bow": dict(ag="a bow string twang and an arrow flying"),
    "aos-kharadron-airship-engine": dict(ag="a propeller airplane engine droning steadily"),
})
