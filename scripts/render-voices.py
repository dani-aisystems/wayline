"""
Render voice/lines.json to MP3 clips with Kokoro-82M (Apache-2.0) via kokoro-onnx.
Resumable: clips already in voice-cache/ are skipped. Then run scripts/pack-voices.mjs.

  pip install kokoro-onnx soundfile
  python3 scripts/render-voices.py --model DIR   # DIR holds kokoro-v1.0.onnx and voices-v1.0.bin
"""
import argparse, json, os, subprocess, sys, time
import numpy as np
from kokoro_onnx import Kokoro

# Single letters and letter names that the model would otherwise read differently.
SAY_AS = {"a": "ay.", "e": "ee.", "i": "eye.", "o": "oh.", "u": "you.", "ar": "are.", "wye": "why.", "cue": "queue.",
          "ess": "ess.", "ef": "eff.", "el": "ell.", "em": "em.", "en": "en.", "ex": "ex.", "zee": "zee.", "aitch": "aitch.",
          "double-u": "double you."}

ap = argparse.ArgumentParser()
ap.add_argument("--model", required=True)
ap.add_argument("--lines", default="voice/lines.json")
ap.add_argument("--out", default="voice-cache")
ap.add_argument("--only", default="")
args = ap.parse_args()

jobs = json.load(open(args.lines))
if args.only: jobs = [j for j in jobs if j["voice"] in args.only.split(",")]
todo = [j for j in jobs if not os.path.exists(f"{args.out}/{j['voice']}/{j['key']}.mp3")]
print(f"{len(jobs)} clips, {len(todo)} to render", flush=True)
k = Kokoro(os.path.join(args.model, "kokoro-v1.0.onnx"), os.path.join(args.model, "voices-v1.0.bin"))

def trim(a, sr, pad=0.08, thr=0.006):
    idx = np.where(np.abs(a) > thr)[0]
    if len(idx) == 0: return a
    s, e = max(0, idx[0] - int(0.02 * sr)), min(len(a), idx[-1] + int(0.05 * sr))
    z = np.zeros(int(pad * sr), dtype=np.float32)
    return np.concatenate([z, a[s:e].astype(np.float32), z])

t0 = time.time()
for n, j in enumerate(todo, 1):
    v, text = j["voice"], j["text"]
    say = SAY_AS.get(text.lower(), text)
    lang = "en-gb" if v.startswith("b") else "en-us"
    try:
        audio, sr = k.create(say, voice=v, speed=1.0, lang=lang)
    except Exception as e:
        print("FAILED", v, repr(text[:60]), e, file=sys.stderr, flush=True)
        continue
    audio = trim(np.asarray(audio), sr)
    os.makedirs(f"{args.out}/{v}", exist_ok=True)
    pcm = (np.clip(audio, -1, 1) * 32767).astype("<i2").tobytes()
    tmp = f"{args.out}/{v}/{j['key']}.tmp.mp3"
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-f", "s16le", "-ar", str(sr), "-ac", "1", "-i", "-",
                    "-codec:a", "libmp3lame", "-b:a", "32k", "-write_xing", "0", "-id3v2_version", "0", tmp], input=pcm, check=True)
    os.replace(tmp, f"{args.out}/{v}/{j['key']}.mp3")
    if n % 100 == 0:
        el = time.time() - t0
        print(f"{n}/{len(todo)} rendered, {el/60:.1f} min, ~{el/n*(len(todo)-n)/60:.0f} min left", flush=True)
print("done", flush=True)
