"""
pollinations -- image provider plugin for ref2game gen.py (written from provider_template.py).

Free anonymous text-to-image GET endpoint, no API key, no account, no cost.
  GET https://image.pollinations.ai/prompt/<url-encoded prompt>?width=W&height=H&seed=N&nologo=true
Findings (study/GENERATOR.md, probed 2026-10-17):
  - anonymous tier serves one model ("sana", from /models); model= is ignored.
  - output is JPEG, capped around 1015x580 for a 1344x768 request (~0.59 MP).
  - no reference images (text only), no native alpha, and it ignores key colours -> the plugin asks for a plain
    light grey background and cuts the subject out locally with rembg (isnet-general-use), returning real alpha.
  - a small "pollinations.ai" logo is stamped bottom-right on anonymous output (nologo needs an account),
    so this plugin crops the bottom strip off before gen.py keys and fits the image.
"""
import io, urllib.parse
from gen import GenError, http_request, save_bytes, say
from PIL import Image

API_BASE = "https://image.pollinations.ai"
ENV = []
CAPS = {"native_alpha": True, "max_refs": 0, "sizes": "any", "edit": False, "env": ENV,
        "default_model": "sana", "labels": False, "style_bible": True, "max_prompt": 1400}
MAX_PX = 1015 * 580
_SESSION = None


def generate(prompt, refs, size, transparent, model, out_raw, opts, dry_run):
    # This endpoint weights the start of the prompt: gen.py's order (style bible, then ASSET) gave the same
    # tree for every asset in batch 1. Put the ASSET text (and its background line) first, the bible after it.
    if "ASSET:" in prompt:
        style, rest = prompt.split("ASSET:", 1)
        rest = rest.strip()
        if transparent:   # this model ignores key colours (probe: magenta bled into the subject), so ask for plain grey
            rest = rest.split("Background:")[0].strip() + " Isolated on a plain light grey background."
        prompt = rest + "\n\nStyle: " + style.strip()
    w, h = size
    k = min(1.0, (MAX_PX / (w * h)) ** 0.5)
    w, h = int(w * k) // 8 * 8, int(h * k) // 8 * 8
    q = {"width": w, "height": h, "nologo": "true"}
    if opts.get("seed") is not None:
        q["seed"] = opts["seed"]
    url = f"{API_BASE}/prompt/{urllib.parse.quote(" ".join(prompt.split()), safe="")}?{urllib.parse.urlencode(q)}"
    r = http_request("GET", url, timeout=float(opts.get("timeout", 180)), dry_run=dry_run,
                     show=f"<prompt {len(prompt)} chars> {q}")
    if dry_run:
        return {"dry_run": True}
    if not (r.header("content-type") or "").startswith("image/"):
        raise GenError(f"not an image: {r.header('content-type')} {r.body[:200]!r}")
    im = Image.open(io.BytesIO(r.body)).convert("RGB")
    cut = max(26, int(im.height * 0.055))                   # drop the logo strip
    im = im.crop((0, 0, im.width, im.height - cut))
    if transparent:   # real alpha from a local background-removal model (generators.md (f) 3), rembg + isnet-general-use
        global _SESSION
        from rembg import remove, new_session
        _SESSION = _SESSION or new_session("isnet-general-use")
        im = remove(im, session=_SESSION)
    buf = io.BytesIO(); im.save(buf, "PNG")
    return {"path": save_bytes(buf.getvalue(), out_raw), "native_alpha": transparent, "request_id": None, "model": "sana"}


def check():
    return True, "anonymous endpoint, no key"
