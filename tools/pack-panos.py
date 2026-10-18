#!/usr/bin/env python3
"""Mac/Linux version of pack-panos.ps1 - .png/.jpg/.webp, full quality, only changed renders."""
import base64, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
src = root / "assets" / "panos"; out = src / "packed"; out.mkdir(exist_ok=True)
stf = out / "stamps.txt"
old = dict(l.split("\t", 1) for l in stf.read_text().splitlines() if "\t" in l) if stf.exists() else {}
files = [f for f in src.iterdir() if f.is_file() and f.suffix.lower() in (".png", ".jpg", ".jpeg", ".webp")]
pick = {}
for f in files:
    if f.stem not in pick or f.stat().st_mtime > pick[f.stem].stat().st_mtime: pick[f.stem] = f
new, n = {}, 0
for b in sorted(pick):
    f = pick[b]; st = f.stat(); stamp = f"{f.name}|{st.st_size}|{int(st.st_mtime)}"; new[b] = stamp
    dst = out / (b + ".js")
    if dst.exists() and old.get(b) == stamp and (out / "thumbs" / (b + ".jpg")).exists(): continue
    d = f.read_bytes()
    mime = "image/png" if d[:2] == b"\x89P" else "image/webp" if d[8:12] == b"WEBP" else "image/jpeg"
    dst.write_text(f'window.PANO_PACK=window.PANO_PACK||{{}};window.PANO_PACK["{b}"]="data:{mime};base64,{base64.b64encode(d).decode()}";')
    try:
        from PIL import Image
        (out / "thumbs").mkdir(exist_ok=True)
        Image.open(f).convert("RGB").resize((480, 240), Image.LANCZOS).save(out / "thumbs" / (b + ".jpg"), quality=82)
    except Exception as e:
        print("           (thumbnail skipped:", e, ")")
    print(f"  updated  {f.name:<14} {st.st_size/2**20:7.1f} MB"); n += 1
for j in out.glob("pano*.js"):
    if j.stem not in pick: j.unlink()
for t in (out / "thumbs").glob("*.jpg") if (out / "thumbs").exists() else []:
    if t.stem not in pick: t.unlink()
thumbs = ",".join(f'"{b}":{int(pick[b].stat().st_mtime) % 1000000000}' for b in sorted(pick) if (out / "thumbs" / (b + ".jpg")).exists())
(out / "manifest.js").write_text("window.PANO_FILES={" + ",".join(f'"{b}":"{pick[b].name}"' for b in sorted(pick)) + "};window.PANO_THUMBS={" + thumbs + "};")
stf.write_text("\n".join(f"{b}\t{new[b]}" for b in sorted(new)))
print(f"\n  {n} panorama(s) updated." if n else "  all panoramas already up to date")
