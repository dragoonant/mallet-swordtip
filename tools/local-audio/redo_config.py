"""Second-pass ("redo") generation config for the weakest aos-* sounds.

Each id has `clap` (the single reference prompt every candidate AND the current public file is scored against, so the
comparison is fair), `groups` (name -> AudioGen/MusicGen prompt, duration, takes), optional `synth` (procedural layers
written by gen_redo.py) and `layers` (pairs of groups mixed into extra candidates by redo_pick.py).
Voice ids also list Qwen3-TTS lines in `tts` (run gen_redo_voice.py with the qwen venv).
Takes land in <OUT>/<id>/redo-<group>-<n>.wav; layered mixes in <OUT>/<id>/layer-<a>-<b>-<n>.wav.
"""
AG, MG = "audiogen", "musicgen"

REDO = {
    "aos-lumineth-wind-spirit": dict(
        clap="strong wind howling and whistling in a gust",
        groups=dict(
            gust=dict(p="strong wind gusting and howling across an open field", dur=3.0, takes=6),
            canyon=dict(p="a whistling wind blowing through a narrow canyon", dur=3.0, takes=6),
            swirl=dict(p="a swirling whoosh of wind with leaves rustling", dur=3.0, takes=6),
        ),
        synth=["wind"],
    ),
    "aos-kharadron-propeller": dict(
        clap="a propeller spinning fast with a whirring buzzing motor",
        groups=dict(
            prop=dict(p="a propeller spinning fast, a buzzing whirring motor", dur=2.5, takes=6),
            plane=dict(p="a small aeroplane flying past, engine drone", dur=2.5, takes=6),
            rotor=dict(p="helicopter rotor blades chopping the air, whump whump whump", dur=2.5, takes=6),
            fan=dict(p="a mechanical fan whirring fast", dur=2.5, takes=6),
        ),
    ),
    "aos-gloomspite-grot-bow": dict(
        clap="a bowstring twang and an arrow whizzing through the air",
        groups=dict(
            twang=dict(p="a bowstring twang", dur=1.5, takes=8),
            arrow=dict(p="an arrow whistling through the air, whoosh", dur=1.5, takes=8),
            shot=dict(p="an archer releasing an arrow from a wooden bow, twang and whoosh", dur=1.5, takes=8),
        ),
        synth=["twang"],
        layers=[("twang", "arrow"), ("synth-twang", "arrow")],
    ),
    "aos-armoured-march": dict(
        clap="soldiers in metal armour marching in step, boots stomping and plates rattling",
        groups=dict(
            march=dict(p="soldiers marching in step, heavy boots stomping on gravel", dur=4.0, takes=6),
            clank=dict(p="rhythmic marching footsteps with the clanking and rattling of metal armour", dur=4.0, takes=6),
            army=dict(p="an army marching, boots tramping and armour clinking", dur=4.0, takes=6),
        ),
        layers=[("march", "clank")],
    ),
    "aos-orruk-stomp": dict(
        clap="a single giant heavy footstep, a low thud with a metallic clank",
        groups=dict(
            step=dict(p="a single heavy footstep, a deep thud on the ground", dur=1.5, takes=8),
            boom=dict(p="a huge heavy boot stomping once, a low boom", dur=1.5, takes=8),
            clank=dict(p="a heavy iron armour clank and thud, one footstep", dur=1.5, takes=8),
        ),
        synth=["thump"],
        layers=[("step", "synth-thump"), ("boom", "synth-thump"), ("step", "clank")],
    ),
    "aos-battle-tactic-scored": dict(
        clap="a short bright triumphant trumpet fanfare ending with a cymbal crash",
        groups=dict(
            trum=dict(p="Short bright triumphant trumpet fanfare, three rising notes, clean brass, punchy", dur=2.5, takes=6, eng=MG),
            sting=dict(p="Heroic brass sting, trumpets playing a quick rising flourish and a final held note, uplifting", dur=2.5, takes=6, eng=MG),
            cym=dict(p="a cymbal crash ringing out", dur=2.5, takes=6),
            horns=dict(p="a short bright brass fanfare with trumpets", dur=2.5, takes=6),
        ),
        layers=[("trum", "cym", 1.0, 1.6), ("sting", "cym", 1.0, 1.6), ("horns", "cym", 1.0, 1.6)],
    ),
    "aos-fist-smash": dict(
        clap="a heavy iron fist smashing down hard, a deep crushing thud and a metallic crunch",
        groups=dict(
            punch=dict(p="a heavy punch landing hard, a deep thud", dur=1.5, takes=8),
            anvil=dict(p="a heavy iron hammer striking an anvil, a loud metallic clang", dur=1.5, takes=8),
            smash=dict(p="a huge fist smashing a wooden door, a crash and splintering", dur=1.5, takes=8),
            crunch=dict(p="metal armour crunching and denting under a heavy blow", dur=1.5, takes=8),
        ),
        layers=[("punch", "anvil"), ("punch", "crunch"), ("smash", "anvil"), ("punch", "smash")],
    ),
    # voice ids: AudioGen shouts plus Qwen3-TTS barks (wordless or non-English)
    "aos-kharadron-war-cry": dict(
        clap="a short gruff deep male shout, one loud bark",
        groups=dict(
            shout=dict(p="a single deep gruff male shout", dur=1.6, takes=8),
            bark=dict(p="a gruff man barking a short loud yell", dur=1.6, takes=8),
            grunt=dict(p="a burly dwarf bellowing a short gruff roar", dur=1.6, takes=8),
        ),
        voice=True,
        tts=dict(
            who="A short, stocky, bad-tempered dwarf sky-sailor with an extremely deep, rough, gravelly voice, "
                "barking one short loud shout with a snarl, not a cheer.",
            lines=["Hraaagh!", "Hah!", "Hoy! Hah!", "Gurraah!", "Hut! Hah!"],
        ),
    ),
    "aos-marshal-command": dict(
        clap="a man barking a short sharp loud command, a single shout",
        groups=dict(
            shout=dict(p="a man yelling a short sharp command", dur=1.6, takes=8),
            bark=dict(p="a single loud commanding male shout across a field", dur=1.6, takes=8),
        ),
        voice=True,
        tts=dict(
            who="A gruff, battle-hardened human knight-commander. Deep, loud, authoritative and hoarse, "
                "barking one short ringing parade-ground command.",
            lines=["Hah!", "Haaah!", "Hut!", "Hyaah!", "Hup! Hah!", "Vorwarts!"],
        ),
    ),
}

# F12 armies: the weakest first-pass ids, rebuilt from two concrete layers.
REDO.update({
    "aos-stormcast-death": dict(
        clap="a man groaning in pain, then a loud crack of thunder",
        groups=dict(
            groan=dict(p="a man groaning in pain", dur=1.5, takes=6),
            thunder=dict(p="a loud sharp thunder clap and lightning crack", dur=2.0, takes=6),
        ),
        layers=[("groan", "thunder", 0.45)],
    ),
    "aos-seraphon-dartpipe": dict(
        clap="a blowpipe dart shot, a short puff of air and a whizz",
        groups=dict(
            puff=dict(p="a short sharp puff of air", dur=1.0, takes=8),
            whizz=dict(p="a small dart whizzing past fast", dur=1.2, takes=8),
        ),
        layers=[("puff", "whizz", 0.05)],
    ),
    "aos-seraphon-spear": dict(
        clap="a spear thrust, a fast swish and a hard stab",
        groups=dict(
            swish=dict(p="a fast swish of a spear through the air", dur=1.2, takes=8),
            stab=dict(p="a sharp stab into a wooden shield, a hard thunk", dur=1.2, takes=8),
        ),
        layers=[("swish", "stab", 0.15)],
    ),
    "aos-soulblight-bone-march": dict(
        clap="skeletons walking, dry bones rattling and clattering",
        groups=dict(
            rattle=dict(p="a bag of bones rattling and clattering", dur=3.0, takes=6),
            sticks=dict(p="wooden sticks clacking and rattling together", dur=3.0, takes=6),
            steps=dict(p="slow footsteps walking on stone", dur=3.0, takes=6),
        ),
        layers=[("rattle", "steps"), ("sticks", "steps")],
    ),
    "aos-soulblight-vargheist": dict(
        clap="a giant bat screeching with leathery wings flapping",
        groups=dict(
            screech=dict(p="a large bat screeching a loud shrill shriek", dur=2.0, takes=6),
            wings=dict(p="large leathery wings flapping", dur=2.0, takes=6),
        ),
        layers=[("screech", "wings")],
    ),
})

# F14 armies: the weakest first-pass ids (low CLAP, or Whisper heard real words in a vocal cue), rebuilt from concrete parts.
REDO.update({
    "aos-nurgle-hum": dict(
        clap="a low droning hum of many deep voices humming one note",
        groups=dict(
            choir=dict(p="Low male choir humming one sustained droning note with closed mouths, murky and dark, no lyrics, no instruments", dur=3.5, takes=6, eng=MG),
            monks=dict(p="monks humming one long low droning note", dur=3.5, takes=6),
            drone=dict(p="a deep buzzing drone hum", dur=3.5, takes=6),
        ),
        layers=[("choir", "drone"), ("monks", "drone"), ("qwen-1", "drone"), ("qwen-2", "drone")],
        voice=True,
        tts=dict(
            who="A bloated, slow, very deep-voiced plague daemon humming a low droning monotone note with closed lips, murky and bored.",
            lines=["Hmmmmmmmmmmmmmmm.", "Mmmmmmmmmmmmmmmmm.", "Hmmmmm... mmmmmmmm."],
        ),
    ),
    "aos-sylvaneth-call": dict(
        clap="an eerie haunting wordless call echoing through a forest",
        groups=dict(
            voice=dict(p="A single haunting wordless female vocal note, ethereal and airy with a forest echo, no lyrics", dur=3.0, takes=6, eng=MG),
            flute=dict(p="A wooden flute playing a short eerie rising call with a forest echo, solo flute", dur=3.0, takes=6, eng=MG),
            owl=dict(p="a strange eerie bird call echoing in a forest", dur=3.0, takes=6),
        ),
        voice=True,
        tts=dict(
            who="An ethereal female forest spirit with an airy, haunting, echoing voice, singing one long high wordless note.",
            lines=["Aaaaaaaaaah...", "Ooooooooooh...", "Ah-oooooooo..."],
        ),
    ),
    "aos-nighthaunt-scythe": dict(
        clap="a scythe swung fast through the air, a long sharp swish",
        groups=dict(
            swoosh=dict(p="a long fast whoosh of a blade through the air", dur=1.2, takes=8),
            shing=dict(p="a sharp metallic blade shing", dur=1.0, takes=8),
        ),
        layers=[("swoosh", "shing", 0.15)],
    ),
    "aos-nighthaunt-death": dict(
        clap="a ghost moaning and fading away into a soft whoosh of wind",
        groups=dict(
            moan=dict(p="a long eerie ghostly moan with reverb", dur=2.0, takes=8),
            wind=dict(p="a soft gust of wind whooshing away", dur=2.0, takes=8),
        ),
        layers=[("moan", "wind", 0.4)],
    ),
    "aos-sylvaneth-arrow": dict(
        clap="a bowstring twang and an arrow whizzing through the air",
        groups=dict(
            twang=dict(p="a bowstring twang", dur=1.2, takes=8),
            arrow=dict(p="an arrow whistling through the air, whoosh", dur=1.2, takes=8),
        ),
        synth=["twang"],
        layers=[("twang", "arrow", 0.05), ("synth-twang", "arrow", 0.05)],
    ),
    "aos-sylvaneth-horn": dict(
        clap="a hunting horn blowing a long low call",
        groups=dict(
            horn=dict(p="A deep wooden hunting horn blows one long low note, solo horn, slight echo", dur=3.0, takes=6, eng=MG),
            ram=dict(p="a ram's horn blowing a long low note", dur=3.0, takes=6),
        ),
    ),
    "aos-sylvaneth-leaves": dict(
        clap="leaves rustling in a swirling gust of wind and wooden branches creaking",
        groups=dict(
            leaves=dict(p="dry leaves rustling and swirling in a gust of wind", dur=3.0, takes=6),
            creak=dict(p="a wooden tree trunk creaking slowly", dur=3.0, takes=6),
        ),
        layers=[("leaves", "creak")],
    ),
    "aos-khorne-roar": dict(
        clap="a crowd of savage men roaring a furious wild battle roar",
        groups=dict(
            crowd=dict(p="an angry crowd of men roaring aaargh", dur=2.5, takes=8),
            beast=dict(p="a huge beast roaring furiously", dur=2.5, takes=6),
        ),
        layers=[("crowd", "beast")],
    ),
    "aos-nurgle-sneeze": dict(
        clap="one big loud wet sneeze",
        groups=dict(
            achoo=dict(p="a loud cartoon sneeze, achoo", dur=1.5, takes=8),
            wet=dict(p="a big wet sneeze and a sniffle", dur=1.5, takes=8),
        ),
    ),
    "aos-nurgle-bell": dict(
        clap="a cracked old bell tolling slowly with a dull clanking ring",
        groups=dict(
            toll=dict(p="A single cracked old bronze bell tolling slowly twice, dull and out of tune, no other instruments", dur=4.0, takes=6, eng=MG),
            clank=dict(p="an old iron bell clanking dully", dur=3.0, takes=6),
        ),
    ),
})
