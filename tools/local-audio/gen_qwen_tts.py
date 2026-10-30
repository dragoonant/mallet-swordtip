"""Qwen3-TTS (VoiceDesign) candidates: creature/soldier voices for the aos-* sfx ids and the aos-narr-* narrator lines.

Run with the qwen-tts venv's python:
  python gen_qwen_tts.py voices            # TTS candidates for the 7 voice-like sfx ids
  python gen_qwen_tts.py narrator          # all aos-narr-* lines (designed voice, plus a cloned-reference variant)
  python gen_qwen_tts.py narrator --ids aos-narr-victory
Takes land in <OUT>/<id>/qwen-<n>.wav (voices) and qwen-design-<n>.wav / qwen-clone-<n>.wav (narrator).
"""
import argparse
import os
import zlib

import numpy as np
import soundfile as sf
import torch

from common import NARRATOR, NARRATOR_INSTRUCT, TTS_LINES, TTS_VOICES, id_dir, OUT

os.environ.setdefault("HF_HUB_DISABLE_PROGRESS_BARS", "1")
from qwen_tts import Qwen3TTSModel  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("mode", choices=["voices", "narrator"])
ap.add_argument("--ids", default="")
ap.add_argument("--takes", type=int, default=3)
ap.add_argument("--force", action="store_true")
args = ap.parse_args()
want = set(filter(None, args.ids.split(",")))


def seed_for(s):
    torch.manual_seed(zlib.crc32(s.encode()))


def load(name):
    return Qwen3TTSModel.from_pretrained(name, device_map="cuda:0", dtype=torch.bfloat16, attn_implementation="sdpa")


if args.mode == "voices":
    design = load("Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign")
    for iid, (who, lines) in TTS_LINES.items():
        if want and iid not in want:
            continue
        d = id_dir(iid)
        n = 0
        for line in lines:
            for t in range(max(1, args.takes // len(lines) + (1 if args.takes % len(lines) else 0))):
                n += 1
                out = d / f"qwen-{n}.wav"
                if out.exists() and not args.force:
                    continue
                seed_for(f"{iid}-{n}")
                wavs, sr = design.generate_voice_design(text=line, instruct=TTS_VOICES[who]["instruct"], language="English")
                sf.write(str(out), np.asarray(wavs[0], dtype=np.float32), sr)
                print("wrote", out.name, iid, repr(line), f"{len(wavs[0]) / sr:.2f}s", flush=True)
else:
    items = {k: v for k, v in NARRATOR.items() if not want or k in want}
    design = load("Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign")
    ref_dir = OUT / "_narrator"
    ref_dir.mkdir(parents=True, exist_ok=True)
    # 1. one-line-at-a-time designed voice, same instruct + fixed seeds
    for iid, line in items.items():
        d = id_dir(iid)
        for n in range(1, args.takes + 1):
            out = d / f"qwen-design-{n}.wav"
            if out.exists() and not args.force:
                continue
            seed_for(f"{iid}-design-{n}")
            wavs, sr = design.generate_voice_design(text=line, instruct=NARRATOR_INSTRUCT, language="English")
            sf.write(str(out), np.asarray(wavs[0], dtype=np.float32), sr)
            print("wrote", out.name, repr(line), f"{len(wavs[0]) / sr:.2f}s", flush=True)
    # 2. cloned-reference variant for a tighter, consistent timbre across all lines
    ref_text = "The banners are raised and the drums are beating. Let no enemy leave this field alive."
    ref_wav = ref_dir / "ref.wav"
    if not ref_wav.exists() or args.force:
        seed_for("narrator-ref")
        wavs, sr = design.generate_voice_design(text=ref_text, instruct=NARRATOR_INSTRUCT, language="English")
        sf.write(str(ref_wav), np.asarray(wavs[0], dtype=np.float32), sr)
    del design
    torch.cuda.empty_cache()
    base = load("Qwen/Qwen3-TTS-12Hz-1.7B-Base")
    prompt = base.create_voice_clone_prompt(ref_audio=str(ref_wav), ref_text=ref_text)
    for iid, line in items.items():
        d = id_dir(iid)
        for n in range(1, args.takes + 1):
            out = d / f"qwen-clone-{n}.wav"
            if out.exists() and not args.force:
                continue
            seed_for(f"{iid}-clone-{n}")
            wavs, sr = base.generate_voice_clone(text=line, language="English", voice_clone_prompt=prompt)
            sf.write(str(out), np.asarray(wavs[0], dtype=np.float32), sr)
            print("wrote", out.name, repr(line), f"{len(wavs[0]) / sr:.2f}s", flush=True)
print("done")
