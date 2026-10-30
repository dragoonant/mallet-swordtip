"""Score takes with CLAP, pick the best per id, master it and encode public/audio/<id>.mp3.

Run with the audiocraft venv's python:
  python master.py score [--ids a,b]          # CLAP + sanity metrics for every take -> <OUT>/scores.json
  python master.py apply [--ids a,b]          # master the winning take of each id -> public/audio/<id>.mp3
  python master.py apply --pick aos-victory=musicgen-2.wav   # force a specific take for an id (remembered in picks.json)
  python master.py apply --narr-variant clone # narrator lines: only consider qwen-clone-* (or qwen-design-*) takes
Per-id candidates are every *.wav in <OUT>/<id>/ (audiogen-*, musicgen-*, qwen-*, chatterbox-*).
"""
import argparse
import json
import subprocess

import numpy as np
import pyloudnorm as pyln
import soundfile as sf
import torch
from scipy.signal import resample_poly
from math import gcd

from common import MUSIC, NARRATOR, OUT, PUBLIC_AUDIO, SFX, aos_items, id_dir

SR = 44100
TARGET_RMS = 0.17          # whole-file RMS for sfx / voice (owner brief: ~0.15-0.18)
SCORES = OUT / "scores.json"
PICKS = OUT / "picks.json"

ap = argparse.ArgumentParser()
ap.add_argument("cmd", choices=["score", "apply"])
ap.add_argument("--ids", default="")
ap.add_argument("--pick", action="append", default=[], help="id=file.wav to force a take")
ap.add_argument("--narr-variant", default="", help="design|clone: restrict narrator takes")
args = ap.parse_args()
want = set(filter(None, args.ids.split(",")))

manifest = {i["id"]: i for i in aos_items()}
for nid, text in NARRATOR.items():
    manifest.setdefault(nid, dict(id=nid, kind="voice", text=text))
ids = [i for i in manifest if (not want or i in want)]


def read(path):
    x, sr = sf.read(str(path), dtype="float32", always_2d=True)
    return x, sr


def resample(x, sr, to=SR):
    if sr == to:
        return x
    g = gcd(sr, to)
    return resample_poly(x, to // g, sr // g, axis=0).astype(np.float32)


def prompt_for(iid):
    it = manifest[iid]
    if it["kind"] == "voice":
        return f'a deep, fierce, powerful male narrator voice announcing "{it["text"]}"'
    if iid in SFX:
        return SFX[iid]["p"]
    return it["prompt"]


def frame_db(mono, sr, hop_ms=10):
    h = int(sr * hop_ms / 1000)
    n = len(mono) // h
    f = mono[: n * h].reshape(n, h)
    return 20 * np.log10(np.sqrt((f ** 2).mean(1)) + 1e-9), h


def trim(x, sr, lead_db=-42, tail_db=-46, pre_ms=15):
    mono = np.abs(x).max(1)
    db, h = frame_db(mono, sr)
    if len(db) == 0:
        return x
    pk = db.max()
    idx = np.where(db > pk + min(lead_db, tail_db))[0]
    s = np.where(db > pk + lead_db)[0]
    e = np.where(db > pk + tail_db)[0]
    start = max(0, (s[0] if len(s) else 0) * h - int(sr * pre_ms / 1000))
    end = min(len(x), ((e[-1] if len(e) else len(db) - 1) + 1) * h)
    return x[start:end]


def fade_out(x, sr, secs):
    n = min(len(x), int(sr * secs))
    if n:
        x = x.copy()
        x[-n:] *= (np.cos(np.linspace(0, np.pi / 2, n)) ** 2)[:, None]
    return x


def fade_in(x, sr, secs):
    n = min(len(x), int(sr * secs))
    if n:
        x = x.copy()
        x[:n] *= (np.sin(np.linspace(0, np.pi / 2, n)) ** 2)[:, None]
    return x


def loop_xfade(x, n_x):
    """Blend the last n_x samples into the head so the file loops without a seam. Returns len(x) - n_x samples."""
    t = np.linspace(0, np.pi / 2, n_x)[:, None]
    head = x[:n_x] * np.sin(t) + x[-n_x:] * np.cos(t)
    return np.concatenate([head, x[n_x:-n_x]]).astype(np.float32)


def soft_limit(x, ceil=0.97, knee=0.8):
    a = np.abs(x)
    over = a > knee
    y = x.copy()
    y[over] = np.sign(x[over]) * (knee + (ceil - knee) * np.tanh((a[over] - knee) / (ceil - knee)))
    return y


def metrics(x, sr):
    mono = x.mean(1)
    pk = float(np.abs(x).max())
    clip = float((np.abs(x) > 0.99).mean())
    db, _ = frame_db(mono, sr)
    active = float((db > db.max() - 35).mean()) if len(db) else 0.0
    t = trim(x, sr, lead_db=-36, tail_db=-45)
    return dict(peak=round(pk, 3), clip=round(clip, 5), active=round(active, 3), content_s=round(len(t) / sr, 2),
                dur_s=round(len(x) / sr, 2), rms=round(float(np.sqrt((mono ** 2).mean())), 4))


def f0_median(x, sr):
    import librosa
    mono = resample(x.mean(1, keepdims=True), sr, 16000)[:, 0]
    f = librosa.yin(mono, fmin=60, fmax=400, sr=16000)
    return round(float(np.median(f)), 1)


# ---------------------------------------------------------------- CLAP
_clap = {}


def clap():
    if not _clap:
        from transformers import ClapModel, ClapProcessor
        _clap["m"] = ClapModel.from_pretrained("laion/larger_clap_general").to("cuda").eval()
        _clap["p"] = ClapProcessor.from_pretrained("laion/larger_clap_general")
    return _clap["m"], _clap["p"]


def _feat(out):
    return out if torch.is_tensor(out) else getattr(out, "pooler_output", out[0])


@torch.no_grad()
def clap_score(path, text):
    m, p = clap()
    x, sr = read(path)
    a = resample(x.mean(1, keepdims=True), sr, 48000)[:, 0][: 48000 * 10]
    ai = p(audio=[a], sampling_rate=48000, return_tensors="pt")
    ti = p(text=[text], return_tensors="pt", padding=True)
    af = _feat(m.get_audio_features(**{k: v.to("cuda") for k, v in ai.items()}))
    tf = _feat(m.get_text_features(**{k: v.to("cuda") for k, v in ti.items()}))
    af, tf = torch.nn.functional.normalize(af, dim=-1), torch.nn.functional.normalize(tf, dim=-1)
    return float((af * tf).sum())


def candidates(iid):
    d = id_dir(iid)
    return sorted(w for w in d.glob("*.wav") if not w.name.startswith("_"))


def do_score():
    allscores = json.loads(SCORES.read_text()) if SCORES.exists() else {}
    for iid in ids:
        text = prompt_for(iid)
        res = {}
        for w in candidates(iid):
            x, sr = read(w)
            r = metrics(x, sr)
            r["clap"] = round(clap_score(w, text), 4)
            if manifest[iid]["kind"] == "voice" or iid in ("aos-orruk-roar", "aos-marshal-command"):
                r["f0"] = f0_median(x, sr)
            res[w.name] = r
        allscores[iid] = res
        if res:
            best = max(res.items(), key=lambda kv: kv[1]["clap"])
            print(f"{iid:34s} best {best[0]:20s} clap {best[1]['clap']:.3f}  ({len(res)} takes)", flush=True)
    SCORES.write_text(json.dumps(allscores, indent=1))


def ok(r, kind, loop, iid=""):
    lo_peak, lo_rms = (0.25, 0.02) if kind == "sfx" else (0.08, 0.01)
    if r["peak"] < lo_peak or r["rms"] < lo_rms or r["clip"] > 0.003:
        return False
    if kind == "sfx" and r["content_s"] < (0.3 if not loop else 1.5):
        return False
    if iid in SFX and "engines" in SFX[iid]:  # horn / fanfares / drumroll / victory / defeat must actually last
        if r["content_s"] < 0.7 * manifest[iid].get("durationSeconds", 2):
            return False
    if kind == "music" and r["content_s"] < r["dur_s"] * 0.6:
        return False
    return True


def choose(iid):
    forced = json.loads(PICKS.read_text()) if PICKS.exists() else {}
    for spec in args.pick:
        k, v = spec.split("=")
        forced[k] = v
    PICKS.write_text(json.dumps(forced, indent=1))
    if iid in forced:
        return forced[iid], None
    sc = json.loads(SCORES.read_text())[iid]
    kind = manifest[iid]["kind"]
    loop = bool(manifest[iid].get("loop")) or MUSIC.get(iid, {}).get("loop", False)
    pool = {k: v for k, v in sc.items() if ok(v, kind, loop, iid)}
    if kind == "sfx" and not loop and iid not in MUSIC:  # TTS speaks long sentences; sfx must stay short
        base = manifest[iid].get("durationSeconds", 2)
        cap = (SFX[iid]["dur"] if "engines" in SFX.get(iid, {}) else max(base * 2.2, 1.6)) * 1.3
        pool = {k: v for k, v in pool.items() if v["content_s"] <= cap}
    if kind == "voice" and args.narr_variant:
        pool = {k: v for k, v in pool.items() if f"-{args.narr_variant}-" in k}
    flag = None
    if not pool:
        pool, flag = sc, "all-takes-failed-sanity"
    best = max(pool.items(), key=lambda kv: kv[1]["clap"])
    return best[0], flag


# ---------------------------------------------------------------- mastering
def master(iid, take):
    kind = manifest[iid]["kind"]
    x, sr = read(OUT / iid / take)
    x = resample(x, sr)
    sr = SR
    if kind == "music":
        c = MUSIC[iid]
        if x.shape[1] == 1:
            x = np.repeat(x, 2, axis=1)
        target_len = int(manifest[iid]["lengthMs"] / 1000 * sr)
        if c["loop"]:
            n_x = len(x) - target_len
            x = loop_xfade(x, n_x) if n_x > int(0.5 * sr) else x[:target_len]
        else:
            x = trim(x, sr, lead_db=-50, tail_db=-60)[:target_len]
            x = fade_in(x, sr, 0.02)
            x = fade_out(x, sr, c["fade"])
        meter = pyln.Meter(sr)
        for _ in range(3):
            lufs = meter.integrated_loudness(x)
            x = soft_limit(x * 10 ** ((c["lufs"] - lufs) / 20), ceil=0.97, knee=0.85)
        return x, 2
    # sfx / voice -> mono
    x = x.mean(1, keepdims=True)
    loop = bool(manifest[iid].get("loop"))
    tonal = iid in SFX and "engines" in SFX[iid]
    x = trim(x, sr, lead_db=-36, tail_db=(-45 if tonal else -34) if kind == "sfx" else -36)
    if loop:
        x = loop_xfade(x, int(0.15 * sr))
    else:
        cap = None
        if kind == "sfx":
            base = manifest[iid].get("durationSeconds", 2)
            cap = max(base * 2.2, 1.6) if iid not in ("aos-victory", "aos-defeat") else 8.0
            if iid in SFX and "engines" in SFX[iid]:
                cap = SFX[iid]["dur"]
        if cap:
            x = x[: int(cap * sr)]
        x = fade_in(x, sr, 0.004)
        x = fade_out(x, sr, 0.12 if kind == "sfx" else 0.08)
    rms = float(np.sqrt((x ** 2).mean())) + 1e-9
    for _ in range(3):  # limit then re-gain so RMS lands near target even with a soft limiter in the path
        x = soft_limit(x * (TARGET_RMS / rms), ceil=0.97, knee=0.75)
        rms = float(np.sqrt((x ** 2).mean())) + 1e-9
    return x, 1


def encode(iid, x, ch):
    tmp = OUT / iid / "_master.wav"
    sf.write(str(tmp), x, SR)
    dst = PUBLIC_AUDIO / f"{iid}.mp3"
    br = "160k" if ch == 2 else "128k"
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(tmp), "-ac", str(ch), "-ar", str(SR),
                    "-codec:a", "libmp3lame", "-b:a", br, "-map_metadata", "-1", str(dst)], check=True)
    return dst


def do_apply():
    PUBLIC_AUDIO.mkdir(parents=True, exist_ok=True)
    for iid in ids:
        take, flag = choose(iid)
        x, ch = master(iid, take)
        dst = encode(iid, x, ch)
        print(f"{iid:34s} <- {take:20s} {len(x) / SR:5.2f}s rms {np.sqrt((x ** 2).mean()):.3f} peak {np.abs(x).max():.2f}"
              + (f"  [{flag}]" if flag else ""), flush=True)


if __name__ == "__main__":
    if args.cmd == "score":
        do_score()
    else:
        do_apply()
