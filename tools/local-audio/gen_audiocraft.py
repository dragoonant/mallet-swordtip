"""Generate AudioGen / MusicGen takes for the aos-* sfx and music items.

Run with the audiocraft venv's python (see README):
  python gen_audiocraft.py [--ids aos-sword-clash,aos-victory] [--takes 4] [--force] [--only sfx|music]
Takes land in <OUT>/<id>/{audiogen,musicgen}-<n>.wav (native sample rate, float32).
"""
import argparse
import zlib

import soundfile as sf
import torch

from common import AG, MG, MUSIC, SFX, aos_items, id_dir

ap = argparse.ArgumentParser()
ap.add_argument("--ids", default="")
ap.add_argument("--takes", type=int, default=0, help="override takes per engine")
ap.add_argument("--force", action="store_true")
ap.add_argument("--only", choices=["sfx", "music"], default=None)
args = ap.parse_args()
want = set(filter(None, args.ids.split(",")))
manifest = {i["id"]: i for i in aos_items()}

jobs = []  # (engine, id, prompt, duration, takes)
for iid, c in SFX.items():
    if args.only == "music" or (want and iid not in want):
        continue
    for eng in c.get("engines", [AG]):
        jobs.append((eng, iid, c["mp"] if eng == MG else c["p"], c["dur"], args.takes or 4))
for iid, c in MUSIC.items():
    if args.only == "sfx" or (want and iid not in want):
        continue
    dur = c.get("dur") or manifest[iid]["lengthMs"] / 1000 + 1.0
    jobs.append((MG, iid, manifest[iid]["prompt"], dur, args.takes or c["takes"]))

from audiocraft.models import AudioGen, MusicGen  # noqa: E402

for engine in (AG, MG):
    todo = [j for j in jobs if j[0] == engine]
    if not todo:
        continue
    model = (AudioGen.get_pretrained("facebook/audiogen-medium", device="cuda") if engine == AG
             else MusicGen.get_pretrained("facebook/musicgen-stereo-medium", device="cuda"))
    for _, iid, prompt, dur, takes in todo:
        d = id_dir(iid)
        outs = [d / f"{engine}-{n + 1}.wav" for n in range(takes)]
        if not args.force and all(o.exists() for o in outs):
            print("skip", iid, engine, flush=True)
            continue
        torch.manual_seed(zlib.crc32(f"{iid}-{engine}".encode()))
        model.set_generation_params(duration=dur, use_sampling=True, top_k=250,
                                    cfg_coef=3.5 if engine == AG else 3.0)
        print("gen", engine, iid, f"{dur:.1f}s x{takes}", flush=True)
        wav = model.generate([prompt] * takes).cpu()  # [B, C, T]
        for o, w in zip(outs, wav):
            sf.write(str(o), w.T.numpy(), model.sample_rate)
        torch.cuda.empty_cache()
    del model
    torch.cuda.empty_cache()
print("done")
