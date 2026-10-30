"""Bakes the Realm of Fire battle mats for Mallet Swordtip: scorched earth, ash and glowing lava cracks.

Writes public/assets/terrain/battlefield/<id>/{diff,nor,rough,emis}.jpg, 2048x1502 (30x22 inch board, ~68 px/inch),
each stretched once over the whole board (see src/client/board/terrainAssets.ts). Fully procedural, no source art.

    python art/board-textures/gen_aqshy.py
"""
import os
import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter, sobel
from scipy.spatial import cKDTree

W, H = 2048, 1502
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'assets', 'terrain', 'battlefield')


def fbm(rng, octaves=6, base=6.0, gain=0.55):
    """Fractal noise in [0,1], built from upsampled white noise (no tiling needed: the mat is used once)."""
    out = np.zeros((H, W), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        f = base * (2 ** o)
        gh, gw = max(2, int(f * H / W) + 2), int(f) + 2
        g = rng.random((gh, gw)).astype(np.float32)
        img = Image.fromarray((g * 255).astype(np.uint8)).resize((W, H), Image.BICUBIC)
        out += amp * (np.asarray(img, np.float32) / 255.0)
        tot += amp
        amp *= gain
    out /= tot
    lo, hi = np.percentile(out, 1), np.percentile(out, 99)
    return np.clip((out - lo) / (hi - lo), 0, 1)


def smooth(a, lo, hi):
    t = np.clip((a - lo) / (hi - lo), 0, 1)
    return t * t * (3 - 2 * t)


def voronoi_edges(rng, cells, warp):
    """Distance to the nearest cell border, in pixels (small = on a crack), with a noise-warped lookup for jagged lines."""
    pts = np.stack([rng.random(cells) * W, rng.random(cells) * H], 1)
    # pad by mirroring so border cells do not produce fake edges at the mat boundary
    tree = cKDTree(pts)
    ys, xs = np.mgrid[0:H:2, 0:W:2].astype(np.float32)
    xs = xs + warp[0][::2, ::2] * 40
    ys = ys + warp[1][::2, ::2] * 40
    d, _ = tree.query(np.stack([xs.ravel(), ys.ravel()], 1), k=2)
    edge = ((d[:, 1] - d[:, 0]) * 0.5).reshape(xs.shape)
    edge = np.asarray(Image.fromarray(edge).resize((W, H), Image.BILINEAR), np.float32)
    return edge


def lerp(a, b, t):
    return a + (b - a) * t[..., None]


def bake(name, seed, pal, lava_cover, lava_width, cells):
    rng = np.random.default_rng(seed)
    n1, n2, n3, n4 = fbm(rng, 6, 5), fbm(rng, 5, 9), fbm(rng, 4, 14), fbm(rng, 3, 3)
    warp = (fbm(rng, 4, 8) - 0.5, fbm(rng, 4, 8) - 0.5)

    # --- ground colour: char -> scorched earth, ash drifts, fine grit
    col = lerp(np.array(pal['dark'], np.float32), np.array(pal['mid'], np.float32), smooth(n1, 0.2, 0.8))
    col = lerp(col, np.array(pal['light'], np.float32), smooth(n2, 0.55, 0.95) * 0.55)
    ash = smooth(n4 * 0.6 + n3 * 0.4, pal['ash_lo'], pal['ash_hi'])
    col = lerp(col, np.array(pal['ash'], np.float32), ash * pal['ash_amt'])
    grit = (rng.random((H, W)).astype(np.float32) - 0.5)
    grit = gaussian_filter(grit, 0.8) * 90
    col += grit[..., None] * 0.35

    # --- cracks: big lava seams (some of the edges glow) and fine dark fissures everywhere
    big = voronoi_edges(rng, cells, warp)
    fine = voronoi_edges(rng, cells * 5, warp)
    glow_gate = smooth(fbm(rng, 4, 4), 1.0 - lava_cover - 0.08, 1.0 - lava_cover + 0.08)
    crack_big = 1 - smooth(big, 0.0, lava_width)
    lava = crack_big * glow_gate
    core = 1 - smooth(big, 0.0, lava_width * 0.38)
    fissure = (1 - smooth(fine, 0.0, 2.2)) * 0.8 + crack_big * 0.6
    heat = gaussian_filter(lava, 14)                       # heat bloom scorches the ground around a seam
    col *= (1 - np.clip(fissure, 0, 1) * 0.55)[..., None]
    col *= (1 - heat * 0.45)[..., None]
    col = lerp(col, col * np.array([1.25, 0.8, 0.55], np.float32), np.clip(heat * 2.2, 0, 1))
    col = np.clip(col, 0, 255)

    # --- emissive: orange seams with a yellow-white core, plus a few ember specks
    emis = np.zeros((H, W, 3), np.float32)
    seam = lerp(np.array([200, 55, 10], np.float32), np.array([255, 150, 30], np.float32), lava)
    emis += seam * lava[..., None]
    emis += np.array([255, 215, 120], np.float32) * (core * lava)[..., None] * 0.7
    emis += np.array([160, 50, 8], np.float32) * (gaussian_filter(lava, 6) * 0.55)[..., None]
    sp = rng.random((H, W)) > 0.99988
    sp = gaussian_filter(sp.astype(np.float32), 1.6) * 40
    emis += np.array([255, 120, 30], np.float32) * np.clip(sp, 0, 1)[..., None] * 0.7
    emis = np.clip(emis, 0, 255)

    # --- height -> normal: cracks are low, ground has soft relief
    hgt = n1 * 0.5 + n2 * 0.35 + n3 * 0.25 - np.clip(fissure, 0, 1) * 0.9 - lava * 0.4
    hgt = gaussian_filter(hgt, 1.0)
    gx, gy = sobel(hgt, axis=1) * 3.2, sobel(hgt, axis=0) * 3.2
    nz = np.ones_like(gx)
    ln = np.sqrt(gx * gx + gy * gy + nz * nz)
    nor = np.stack([-gx / ln, gy / ln, nz / ln], -1) * 0.5 + 0.5

    # --- roughness: ash is matte, vitrified seams are slicker
    rough = np.clip(0.93 - lava * 0.35 - heat * 0.12 + ash * 0.04, 0.35, 1.0)

    d = os.path.join(OUT, name)
    os.makedirs(d, exist_ok=True)
    Image.fromarray(col.astype(np.uint8)).save(os.path.join(d, 'diff.jpg'), quality=88)
    Image.fromarray((nor * 255).astype(np.uint8)).save(os.path.join(d, 'nor.jpg'), quality=88)
    Image.fromarray((rough * 255).astype(np.uint8)).save(os.path.join(d, 'rough.jpg'), quality=88)
    Image.fromarray(emis.astype(np.uint8)).save(os.path.join(d, 'emis.jpg'), quality=88)
    print('baked', name)


# Scorched earth: brown-red ground, ash drifts, moderate lava seams.
bake('aqshy', 4201,
     dict(dark=(46, 30, 23), mid=(98, 62, 40), light=(140, 92, 58), ash=(128, 118, 108), ash_lo=0.55, ash_hi=0.85, ash_amt=0.5),
     lava_cover=0.34, lava_width=7.0, cells=46)
# Basalt flats: near-black rock, lots of bright seams.
bake('basalt', 77,
     dict(dark=(24, 20, 20), mid=(58, 46, 42), light=(96, 76, 66), ash=(110, 100, 96), ash_lo=0.6, ash_hi=0.9, ash_amt=0.35),
     lava_cover=0.5, lava_width=8.5, cells=38)
# Ashlands: pale grey-ochre dust with only a few embers.
bake('ashlands', 913,
     dict(dark=(74, 58, 46), mid=(138, 112, 88), light=(182, 154, 120), ash=(160, 150, 142), ash_lo=0.4, ash_hi=0.75, ash_amt=0.6),
     lava_cover=0.16, lava_width=5.5, cells=52)
