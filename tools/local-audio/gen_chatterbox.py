"""Chatterbox TTS candidates for the voice-like aos-* sfx ids (default voice, no reference clip, high exaggeration).

Run with the chatterbox venv's python:
  python gen_chatterbox.py [--ids aos-orruk-roar] [--force]
Takes land in <OUT>/<id>/chatterbox-<n>.wav.
"""
import argparse
import zlib

import numpy as np
import soundfile as sf
import torch

from common import TTS_LINES, id_dir

ap = argparse.ArgumentParser()
ap.add_argument("--ids", default="")
ap.add_argument("--force", action="store_true")
args = ap.parse_args()
want = set(filter(None, args.ids.split(",")))

from chatterbox.tts import ChatterboxTTS  # noqa: E402

model = ChatterboxTTS.from_pretrained("cuda")
for iid, (who, lines) in TTS_LINES.items():
    if want and iid not in want:
        continue
    d = id_dir(iid)
    n = 0
    for line in lines:
        for exaggeration in (0.8, 1.2):
            n += 1
            out = d / f"chatterbox-{n}.wav"
            if out.exists() and not args.force:
                continue
            torch.manual_seed(zlib.crc32(f"{iid}-cb-{n}".encode()))
            wav = model.generate(line, exaggeration=exaggeration, cfg_weight=0.3, temperature=0.9)
            sf.write(str(out), np.asarray(wav.squeeze().cpu().numpy(), dtype=np.float32), model.sr)
            print("wrote", out.name, iid, repr(line), f"{wav.shape[-1] / model.sr:.2f}s", flush=True)
print("done")
