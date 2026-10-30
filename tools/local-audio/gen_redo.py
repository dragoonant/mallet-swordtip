"""Generate second-pass takes for the ids in redo_config.REDO (audiocraft venv).
  python gen_redo.py [--ids a,b] [--force]
Writes <OUT>/<id>/redo-<group>-<n>.wav (AudioGen/MusicGen) and redo-synth-<name>-<n>.wav (procedural layers).
"""
import argparse
import zlib

import numpy as np
import soundfile as sf
import torch

from common import id_dir
from redo_config import AG, MG, REDO

ap = argparse.ArgumentParser()
ap.add_argument("--ids", default="")
ap.add_argument("--force", action="store_true")
args = ap.parse_args()
want = set(filter(None, args.ids.split(",")))
SR = 32000


def synth(name, n):
    """Procedural layers: deterministic per (name, n). Returns float32 mono at SR."""
    rng = np.random.default_rng(zlib.crc32(f"{name}-{n}".encode()))
    if name == "thump":  # sub thump for a footstep: pitch-dropping sine plus a short noise crack
        t = np.arange(int(SR * 1.2)) / SR
        f = 38 + 55 * np.exp(-t * 14 * (0.9 + 0.2 * rng.random()))
        body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * (5.5 + n))
        crack = rng.standard_normal(len(t)) * np.exp(-t * 55)
        crack = np.convolve(crack, np.ones(40) / 40, mode="same")
        x = body * 0.9 + crack * 1.6
        return (x / np.abs(x).max() * 0.9).astype(np.float32)
    if name == "twang":  # plucked-string twang: decaying harmonic stack with a downward pitch bend
        t = np.arange(int(SR * 0.9)) / SR
        f0 = (180 + 40 * n) * (1 + 0.06 * np.exp(-t * 25))
        ph = 2 * np.pi * np.cumsum(f0) / SR
        x = sum(np.sin(h * ph) / h * np.exp(-t * (7 + 3 * h)) for h in range(1, 7))
        x = x + rng.standard_normal(len(t)) * np.exp(-t * 120) * 0.5
        return (x / np.abs(x).max() * 0.9).astype(np.float32)
    if name == "wind":  # band-limited noise swept by slow gust envelopes, with a thin whistle
        T = int(SR * 3.0)
        t = np.arange(T) / SR
        env = np.zeros(T)
        for _ in range(3):
            c, w = rng.uniform(0.5, 2.5), rng.uniform(0.3, 0.7)
            env += np.exp(-((t - c) / w) ** 2)
        env = 0.25 + env / env.max()
        from scipy.signal import butter, sosfilt
        noise = rng.standard_normal(T)
        low = sosfilt(butter(2, [150, 1400], btype="band", fs=SR, output="sos"), noise)
        hi = sosfilt(butter(2, [1800, 3600], btype="band", fs=SR, output="sos"), noise)
        sweep = 1500 + 700 * np.sin(2 * np.pi * (0.45 + 0.1 * n) * t) * env
        whistle = np.sin(2 * np.pi * np.cumsum(sweep) / SR) * 0.06 * env
        x = (low * 0.8 + hi * 0.25 * env) * env + whistle
        return (x / np.abs(x).max() * 0.8).astype(np.float32)
    raise ValueError(name)


jobs = []
for iid, c in REDO.items():
    if want and iid not in want:
        continue
    d = id_dir(iid)
    for name in c.get("synth", []):
        for n in range(1, 4):
            o = d / f"redo-synth-{name}-{n}.wav"
            if args.force or not o.exists():
                sf.write(str(o), synth(name, n), SR)
    for g, gc in c["groups"].items():
        jobs.append((gc.get("eng", AG), iid, g, gc))

from audiocraft.models import AudioGen, MusicGen  # noqa: E402

for engine in (AG, MG):
    todo = [j for j in jobs if j[0] == engine]
    if not todo:
        continue
    model = (AudioGen.get_pretrained("facebook/audiogen-medium", device="cuda") if engine == AG
             else MusicGen.get_pretrained("facebook/musicgen-stereo-medium", device="cuda"))
    for _, iid, g, gc in todo:
        d = id_dir(iid)
        outs = [d / f"redo-{g}-{n + 1}.wav" for n in range(gc["takes"])]
        if not args.force and all(o.exists() for o in outs):
            print("skip", iid, g, flush=True)
            continue
        torch.manual_seed(zlib.crc32(f"redo-{iid}-{g}".encode()))
        model.set_generation_params(duration=gc["dur"], use_sampling=True, top_k=250,
                                    cfg_coef=3.5 if engine == AG else 3.0)
        print("gen", engine, iid, g, f"{gc['dur']:.1f}s x{gc['takes']}", flush=True)
        wav = model.generate([gc["p"]] * gc["takes"]).cpu()
        for o, w in zip(outs, wav):
            sf.write(str(o), w.T.numpy(), model.sample_rate)
        torch.cuda.empty_cache()
    del model
    torch.cuda.empty_cache()
print("done")
