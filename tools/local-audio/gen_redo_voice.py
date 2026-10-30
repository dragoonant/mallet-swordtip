"""Qwen3-TTS (VoiceDesign) barks for the redo voice ids (qwen venv): short wordless or non-English shouts.
  python gen_redo_voice.py [--ids a,b] [--takes 2] [--force]
Takes land in <OUT>/<id>/redo-qwen-<line#>-<take#>.wav.
"""
import argparse
import os
import zlib

import numpy as np
import soundfile as sf
import torch

from common import id_dir
from redo_config import REDO

os.environ.setdefault("HF_HUB_DISABLE_PROGRESS_BARS", "1")
from qwen_tts import Qwen3TTSModel  # noqa: E402

ap = argparse.ArgumentParser()
ap.add_argument("--ids", default="")
ap.add_argument("--takes", type=int, default=2)
ap.add_argument("--force", action="store_true")
args = ap.parse_args()
want = set(filter(None, args.ids.split(",")))

design = Qwen3TTSModel.from_pretrained("Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign", device_map="cuda:0",
                                       dtype=torch.bfloat16, attn_implementation="sdpa")
for iid, c in REDO.items():
    if "tts" not in c or (want and iid not in want):
        continue
    d = id_dir(iid)
    for li, line in enumerate(c["tts"]["lines"], 1):
        for t in range(1, args.takes + 1):
            out = d / f"redo-qwen-{li}-{t}.wav"
            if out.exists() and not args.force:
                continue
            torch.manual_seed(zlib.crc32(f"redo-{iid}-{li}-{t}".encode()))
            lang = "German" if line.startswith("Vorw") else "English"
            wavs, sr = design.generate_voice_design(text=line, instruct=c["tts"]["who"], language=lang)
            sf.write(str(out), np.asarray(wavs[0], dtype=np.float32), sr)
            print("wrote", iid, out.name, repr(line), f"{len(wavs[0]) / sr:.2f}s", flush=True)
print("done")
