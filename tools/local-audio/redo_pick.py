"""Layer, score and apply the redo takes (audiocraft venv).
  python redo_pick.py layer [--ids a,b]        # mix group pairs from redo_config.REDO[id]["layers"] -> layer-*.wav
  python redo_pick.py score [--ids a,b]        # CLAP + sanity + f0 for redo/layer takes AND the current public mp3
  python redo_pick.py apply id=take.wav ...    # master that take over public/audio/<id>.mp3 (via master.py)
Every candidate and the current file are scored against the same reference prompt (REDO[id]["clap"]).
Results: <OUT>/redo_scores.json. Nothing touches public/audio except `apply`.
"""
import json
import subprocess
import sys

cmd = sys.argv[1]
rest = sys.argv[2:]
sys.argv = ["master.py", "apply", "--ids", "__none__"]  # master.py parses argv at import; keep it inert
import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402

import master as M  # noqa: E402
from common import OUT, PUBLIC_AUDIO, id_dir  # noqa: E402
from redo_config import REDO  # noqa: E402

want = set()
picks = []
for a in rest:
    if a.startswith("--ids"):
        continue
    if "=" in a:
        picks.append(a.split("="))
    elif a and not a.startswith("-") and cmd != "apply":
        want |= set(filter(None, a.split(",")))
ids = [i for i in REDO if not want or i in want]
SR = 44100


def group_files(iid, g):
    d = id_dir(iid)
    pat = f"redo-{g}-*.wav" if not g.startswith("synth-") else f"redo-{g}-*.wav"
    return sorted(d.glob(pat))


def norm(x):
    return x / (np.abs(x).max() + 1e-9)


def onset(x, sr, db=-30):
    f, h = M.frame_db(np.abs(x).max(1) if x.ndim > 1 else np.abs(x), sr)
    idx = np.where(f > f.max() + db)[0]
    return int(idx[0] * h) if len(idx) else 0


def mono44(path):
    x, sr = M.read(path)
    return M.resample(x.mean(1, keepdims=True), sr, SR)[:, 0]


def do_layer():
    for iid in ids:
        c = REDO[iid]
        for spec in c.get("layers", []):
            a, b = spec[0], spec[1]
            offs = spec[2:] or [None]  # None = align onsets, number = seconds after a's onset
            fa, fb = group_files(iid, a), group_files(iid, b)
            for k, off in enumerate(offs):
                tag = "al" if off is None else f"o{off}"
                for n, pa in enumerate(fa[:6]):
                    pb = fb[n % len(fb)]
                    xa, xb = norm(mono44(pa)), norm(mono44(pb))
                    sa, sb = onset(xa[:, None], SR), onset(xb[:, None], SR)
                    shift = 0 if off is None else int(off * SR)
                    xb = xb[sb:] if off is not None else xb[sb:]
                    start = sa + shift
                    L = max(len(xa), start + len(xb))
                    mix = np.zeros(L, np.float32)
                    mix[: len(xa)] += xa * 0.8
                    mix[start: start + len(xb)] += xb * 0.8
                    out = id_dir(iid) / f"layer-{a}+{b}-{tag}-{n + 1}.wav"
                    sf.write(str(out), norm(mix) * 0.95, SR)
        print("layered", iid, flush=True)


def current_wav(iid):
    tmp = OUT / iid / "_current.wav"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(PUBLIC_AUDIO / f"{iid}.mp3"), str(tmp)], check=True)
    return tmp


def do_score():
    f = OUT / "redo_scores.json"
    allsc = json.loads(f.read_text()) if f.exists() else {}
    for iid in ids:
        c = REDO[iid]
        res = {}
        files = sorted(w for w in id_dir(iid).glob("*.wav") if w.name.startswith(("redo-", "layer-")))
        files.append(current_wav(iid))
        for w in files:
            x, sr = M.read(w)
            r = M.metrics(x, sr)
            r["clap"] = round(M.clap_score(w, c["clap"]), 4)
            if c.get("voice"):
                try:
                    r["f0"] = M.f0_median(x, sr)
                except Exception:
                    r["f0"] = 0
            name = "CURRENT" if w.name == "_current.wav" else w.name
            res[name] = r
        allsc[iid] = res
        rows = sorted(res.items(), key=lambda kv: -kv[1]["clap"])
        cur = res["CURRENT"]["clap"]
        print(f"== {iid}  current clap {cur:.3f}  rms {res['CURRENT']['rms']} content {res['CURRENT']['content_s']}s", flush=True)
        for k, v in rows[:7]:
            print(f"   {k:34s} clap {v['clap']:.3f} peak {v['peak']:.2f} clip {v['clip']:.4f} rms {v['rms']:.3f} "
                  f"content {v['content_s']:.2f}s" + (f" f0 {v['f0']}" if "f0" in v else ""), flush=True)
    f.write_text(json.dumps(allsc, indent=1))


def do_apply():
    for iid, take in picks:
        x, ch = M.master(iid, take)
        dst = M.encode(iid, x, ch)
        print(f"{iid:30s} <- {take:34s} {len(x) / SR:5.2f}s rms {np.sqrt((x ** 2).mean()):.3f} peak {np.abs(x).max():.2f} -> {dst.name}")


{"layer": do_layer, "score": do_score, "apply": do_apply}[cmd]()
