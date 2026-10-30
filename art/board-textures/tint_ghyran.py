"""Tints the baked Realm of Fire mat (aqshy) into the Realm of Life mat (ghyran) for Fire and Jade's other side.

No new image generation: it reads public/assets/terrain/battlefield/aqshy/{diff,nor,rough,emis}.jpg (made by gen_aqshy.py),
remaps the ground colour from scorched brown to moss and grass greens, turns the lava seams into faintly glowing jade veins,
and reuses the relief and roughness untouched. Writes public/assets/terrain/battlefield/ghyran/{diff,nor,rough,emis}.jpg.

    python art/board-textures/tint_ghyran.py
"""
import os
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter

ROOT = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'assets', 'terrain', 'battlefield')
SRC, DST = os.path.join(ROOT, 'aqshy'), os.path.join(ROOT, 'ghyran')
os.makedirs(DST, exist_ok=True)

diff = np.asarray(Image.open(os.path.join(SRC, 'diff.jpg')).convert('RGB'), np.float32)
emis = np.asarray(Image.open(os.path.join(SRC, 'emis.jpg')).convert('RGB'), np.float32)

# ---- ground: luminance of the scorched mat picks a point on a moss -> grass -> sunlit-lichen ramp
lum = diff @ np.array([0.30, 0.59, 0.11], np.float32) / 255.0
lo, hi = np.percentile(lum, 1), np.percentile(lum, 99.5)
t = np.clip((lum - lo) / (hi - lo), 0, 1)
stops = [(0.0, (12, 30, 18)), (0.28, (34, 78, 38)), (0.58, (64, 118, 52)), (0.82, (112, 150, 70)), (1.0, (168, 184, 112))]
col = np.zeros_like(diff)
for (a, ca), (b, cb) in zip(stops, stops[1:]):
    m = (t >= a) & (t <= b)
    u = ((t - a) / (b - a))[m][:, None]
    col[m] = np.array(ca, np.float32) * (1 - u) + np.array(cb, np.float32) * u
# the old ash drifts were grey (low saturation): keep a little of that as pale lichen and bare stone
sat = diff.max(2) - diff.min(2)
grey = np.clip(1.0 - sat / 70.0, 0, 1) * np.clip((lum - 0.35) * 2.5, 0, 1)
col = col * (1 - grey[..., None] * 0.55) + np.array([138, 146, 126], np.float32) * (grey[..., None] * 0.55)
# the heat-scorched ground beside the old seams becomes damp, darker mud
glow = emis.max(2) / 255.0
mud = gaussian_filter(glow, 10)
col = col * (1 - np.clip(mud * 1.2, 0, 0.5)[..., None]) + np.array([30, 52, 30], np.float32) * np.clip(mud * 1.2, 0, 0.5)[..., None]
col = np.clip(col, 0, 255)

# ---- emissive: the lava seams become jade-green veins with a pale core, dimmer than the fire
core = np.clip((emis @ np.array([0.2, 0.6, 0.2], np.float32) / 255.0) * 1.6, 0, 1)
vein = glow
jade = np.array([30, 190, 120], np.float32)
pale = np.array([190, 255, 215], np.float32)
out = jade * vein[..., None] * 0.62 + pale * (core ** 2.2)[..., None] * 0.34
out += np.array([12, 70, 44], np.float32) * gaussian_filter(vein, 6)[..., None] * 0.5
out = np.clip(out, 0, 255)

Image.fromarray(col.astype(np.uint8)).save(os.path.join(DST, 'diff.jpg'), quality=88)
Image.fromarray(out.astype(np.uint8)).save(os.path.join(DST, 'emis.jpg'), quality=88)
for name in ('nor.jpg', 'rough.jpg'):  # relief and roughness are reused as they are
    Image.open(os.path.join(SRC, name)).save(os.path.join(DST, name), quality=90)
print('baked ghyran')
