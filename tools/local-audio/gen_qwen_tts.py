"""Qwen3-TTS (VoiceDesign) candidates: creature/soldier voices for the aos-* sfx ids and the aos-narr-* narrator lines.

Run with the qwen-tts venv's python:
  python gen_qwen_tts.py voices            # TTS candidates for the 7 voice-like sfx ids
  python gen_qwen_tts.py narrator          # all aos-narr-* lines (one designed reference voice, cloned per line)
  python gen_qwen_tts.py narrator --ids aos-narr-victory
Takes land in <OUT>/<id>/qwen-<n>.wav (voices) and qwen-clone-<n>.wav (narrator).
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
    # One designed voice for every line: VoiceDesign makes several reference clips of the same sentence, the
    # deepest clearly-voiced one becomes the reference, and the Base model clones it for each line, so the
    # timbre is identical across all aos-narr-* items (VoiceDesign alone invents a new voice per call).
    import librosa
    items = {k: v for k, v in NARRATOR.items() if not want or k in want}
    ref_dir = OUT / "_narrator"
    ref_dir.mkdir(parents=True, exist_ok=True)
    ref_text = "The banners are raised and the drums are beating. Let no enemy leave this field alive."
    ref_wav = ref_dir / "ref.wav"
    if not ref_wav.exists() or args.force:
        design = load("Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign")
        best = None
        for k in range(1, 9):
            seed_for(f"narrator-ref-{k}")
            wavs, sr = design.generate_voice_design(text=ref_text, instruct=NARRATOR_INSTRUCT, language="English")
            w = np.asarray(wavs[0], dtype=np.float32)
            sf.write(str(ref_dir / f"ref-{k}.wav"), w, sr)
            y = librosa.resample(w, orig_sr=sr, target_sr=16000)
            f0, voiced, _ = librosa.pyin(y, fmin=60, fmax=400, sr=16000)
            med = float(np.nanmedian(f0[voiced])) if voiced.any() else 999.0
            ok = voiced.mean() > 0.5 and 3.0 < len(w) / sr < 9.0
            print("ref", k, f"f0 {med:.0f} Hz voiced {voiced.mean():.2f} dur {len(w) / sr:.1f}s", flush=True)
            if ok and (best is None or med < best[0]):
                best = (med, k)
        print("reference take", best, flush=True)
        import shutil
        shutil.copy(ref_dir / f"ref-{best[1]}.wav", ref_wav)
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
