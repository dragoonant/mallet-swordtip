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
