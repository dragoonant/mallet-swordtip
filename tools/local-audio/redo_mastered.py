"""Fair comparison: master the top-N raw redo candidates of each id the way `apply` would and CLAP-score the
mastered result against the same reference prompt as the pre-redo public mp3 (kept in <OUT>/_backup_pre_redo/).
  python redo_mastered.py [--ids a,b] [--top 8]
"""
import json
import subprocess
import sys

args = sys.argv[1:]
sys.argv = ["master.py", "apply", "--ids", "__none__"]
import soundfile as sf  # noqa: E402

import master as M  # noqa: E402
from common import OUT  # noqa: E402
from redo_config import REDO  # noqa: E402

want = set(filter(None, (args[args.index("--ids") + 1] if "--ids" in args else "").split(",")))
top = int(args[args.index("--top") + 1]) if "--top" in args else 8
raw = json.loads((OUT / "redo_scores.json").read_text())
for iid, c in REDO.items():
    if want and iid not in want:
        continue
    old = OUT / "_backup_pre_redo" / f"{iid}.mp3"
    tmp = OUT / iid / "_old.wav"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(old), str(tmp)], check=True)
    print(f"== {iid}  OLD mp3 clap {M.clap_score(tmp, c['clap']):.3f}", flush=True)
    names = [k for k, _ in sorted(raw[iid].items(), key=lambda kv: -kv[1]["clap"]) if k != "CURRENT"][:top]
    rows = []
    for n in names:
        x, ch = M.master(iid, n)
        t = OUT / iid / "_m.wav"
        sf.write(str(t), x, M.SR)
        mp3 = OUT / iid / "_m.mp3"  # score what ships: the 128k mp3 round trip
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(t), "-ac", "1", "-codec:a", "libmp3lame",
                        "-b:a", "128k", str(mp3)], check=True)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(mp3), str(t)], check=True)
        rows.append((M.clap_score(t, c["clap"]), n, len(x) / M.SR))
    for s, n, d in sorted(rows, reverse=True)[:6]:
        print(f"   {n:36s} mp3 clap {s:.3f} dur {d:.2f}s", flush=True)
