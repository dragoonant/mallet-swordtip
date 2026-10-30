# Local audio generation (Swordtip `aos-*` sounds)

Replaces the ElevenLabs path in `tools/gen-audio.ts` for the Age of Sigmar sound set. Everything runs on one
NVIDIA GPU (developed on an RTX 5080 / Blackwell, CUDA 12.8 builds of torch). Nothing here hardcodes a home
folder: paths come from `~` or these env vars (all optional):

| var | default |
| --- | --- |
| `AUDIO_STUDIO` | `~/AudioStudio` |
| `SWORDTIP_AUDIO_OUT` | `$AUDIO_STUDIO/out/swordtip` (all takes, one folder per id) |
| `AUDIOCRAFT_VENV` | `$AUDIO_STUDIO/audiocraft` |
| `QWEN_TTS_VENV` | `$AUDIO_STUDIO/qwen-tts/.venv` |
| `CHATTERBOX_VENV` | `$AUDIO_STUDIO/chatterbox/.venv` |

`ffmpeg` must be on `PATH`.

## Setup

Three venvs (python 3.12, `uv`):

1. **audiocraft** (AudioGen, MusicGen, CLAP, mastering). audiocraft pins torch 2.1, which cannot run on Blackwell, so
   install it without dependencies on top of a current torch:
   ```
   uv venv $AUDIO_STUDIO/audiocraft --python 3.12
   uv pip install --python <venv>/Scripts/python.exe torch==2.11.0 torchaudio==2.11.0 --index-url https://download.pytorch.org/whl/cu128
   uv pip install --python <venv>/Scripts/python.exe --no-deps audiocraft
   uv pip install --python <venv>/Scripts/python.exe einops julius flashy encodec av hydra-core omegaconf sentencepiece \
       transformers huggingface_hub num2words librosa soundfile numpy scipy tqdm torchmetrics hydra_colorlog protobuf \
       colorlog treetable submitit demucs pyloudnorm accelerate
   ```
   Then apply the minimal xformers/spacy patch below (xformers is not installed; the torch SDPA backend is used).
2. **qwen-tts**: `pip install qwen-tts` (Qwen3-TTS), models `Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign` and `...-Base` from the HF hub.
3. **chatterbox**: `pip install chatterbox-tts`, model `ResembleAI/chatterbox`.

### The audiocraft patch (site-packages/audiocraft, three small edits)

- `modules/transformer.py`: `from xformers import ops` becomes a try/except that falls back to
  `ops = SimpleNamespace(unbind=torch.unbind)`.
- `modules/transformer.py`: `_verify_xformers_memory_efficient_compat()` returns immediately when the backend is `torch`
  (the default); `_get_mask` falls back to a truthy sentinel instead of `xformers.ops.LowerTriangularMask` (the torch
  SDPA call only checks `attn_mask is not None` and uses `is_causal`).
- `modules/conditioners.py`: `import spacy` wrapped in try/except (spacy is only used by the lyrics/chord tokenizers).

## Pipeline

All commands run from this folder, each with the right venv's python.

```
# 1. takes (audiocraft venv): AudioGen for sfx, MusicGen for music + tonal fanfares/drums/horn
python gen_audiocraft.py                   # everything (4 takes sfx, 3 takes music); --ids a,b  --only sfx|music  --force
python gen_audiocraft.py --alt             # second-pass prompts (common.ALT) for ids that scored poorly
# 2. voice candidates
python gen_qwen_tts.py voices              # (qwen venv)  7 soldier/orruk voice ids
python gen_qwen_tts.py narrator            # (qwen venv)  aos-narr-* : one designed reference voice, cloned per line
python gen_chatterbox.py                   # (chatterbox venv)
# 3. pick + master + encode (audiocraft venv)
python master.py score                     # CLAP similarity + sanity metrics for every take -> $OUT/scores.json
python master.py apply                     # best sane take per id -> public/audio/<id>.mp3
```

**Regenerate one id**: `python gen_audiocraft.py --ids aos-sword-clash --force`, then
`python master.py score --ids aos-sword-clash` and `python master.py apply --ids aos-sword-clash`.
To force a particular take (remembered in `$OUT/picks.json`): `python master.py apply --pick aos-victory=musicgen-2.wav`.

Prompts, durations, TTS lines and the narrator list live in `common.py`. AudioGen answers badly to "no X" negatives,
so its prompts are short positive descriptions (the manifest prompts were written for ElevenLabs).

## Mastering rules (master.py)

- sfx/voice: mono, silence trimmed, short fade-out, whole-file RMS about 0.17 with a soft limiter (the client can only
  turn down), 128 kbps mp3. Takes that are near-silent, clipped, too short, or (for TTS) too long are rejected.
- ambient bed: 42 s generated, the last 2 s crossfaded into the head so it loops seamlessly, -24.5 LUFS.
- stingers: trimmed to the manifest `lengthMs`, 1.5 s fade-out, -16 LUFS; music is stereo, 160 kbps.

## Models and licences

- Meta **AudioGen** (`facebook/audiogen-medium`) and **MusicGen** (`facebook/musicgen-stereo-medium`): weights CC-BY-NC 4.0.
  Fine for a free, non-commercial fan game; credit Meta. audiocraft code is MIT.
- **Qwen3-TTS** (`Qwen/Qwen3-TTS-12Hz-1.7B-*`): Apache 2.0.
- **Chatterbox** (`ResembleAI/chatterbox`): MIT. Output carries Resemble's Perth watermark.
- **CLAP** (`laion/larger_clap_general`): used only for scoring takes.

Credits line shown on `public/sounds-aos.html`.

## Redo pass (weakest sounds)

`redo_config.py` lists, per weak id, a reference CLAP prompt, several concrete AudioGen/MusicGen prompts (`groups`),
procedural layers (`synth`: a sub thump, a string twang, a wind bed) and which groups to mix (`layers`). Voice ids also get
Qwen3-TTS barks. Flow (each with the right venv):

```
python gen_redo.py                      # audiocraft venv: redo-<group>-<n>.wav + redo-synth-*.wav
python gen_redo_voice.py --takes 3      # qwen venv: redo-qwen-<line>-<take>.wav
python redo_pick.py layer               # layer-<a>+<b>-<align|oSECONDS>-<n>.wav mixes
python redo_pick.py score               # raw CLAP + sanity for every redo/layer take, plus the current public mp3
python redo_mastered.py --top 12        # master + 128k mp3 round trip, CLAP vs the pre-redo mp3 (fair comparison)
python redo_pick.py apply id=take.wav   # master one take over public/audio/<id>.mp3
```

CLAP scores differ between raw takes and shipped mp3s (fades, trim, limiter, codec), so only compare like with like.
Speech-looking takes were checked with Whisper-small to make sure shouts stay wordless.
