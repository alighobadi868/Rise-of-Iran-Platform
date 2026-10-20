import os, re, uuid, subprocess, tempfile, shutil, threading
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "output"
OUT.mkdir(exist_ok=True)
WEB = ROOT / "web"
W, H = 1280, 720
FONTS = ["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/freefont/FreeSans.ttf"]
JOBS = {}
LOCK = threading.Lock()
POOL = ThreadPoolExecutor(max_workers=1)
_BG = None

def font(size):
    for p in FONTS:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()

def background():
    # Generate a tiny gradient once, then upscale; avoids millions of Python pixel operations per frame.
    global _BG
    if _BG is None:
        small = Image.new("RGB", (80, 45))
        pix = small.load()
        for y in range(45):
            for x in range(80):
                g = int(13 * (1 - abs(x / 80 - .5) * 1.6))
                pix[x, y] = (max(0, 5 + g), max(0, 18 + int(y / 45 * 15) + g), max(0, 35 + int(x / 80 * 22) + g))
        _BG = small.resize((W, H), Image.Resampling.BILINEAR)
    return _BG.copy()

class Request(BaseModel):
    text: str = Field(min_length=10, max_length=200000)
    title: str = Field(default="مستند فارسی", max_length=120)
    seconds_per_scene: int = Field(default=4, ge=2, le=10)

app = FastAPI(title="Independent Persian Video Engine", version="0.4.0")

def scenes_of(text):
    parts = [s.strip() for s in re.split(r'(?<=[.!؟?؛])\s+|\n+', text) if s.strip()]
    if len(parts) < 2:
        words = text.split()
        parts = [" ".join(words[i:i+18]) for i in range(0, len(words), 18)]
    # Hard limit prevents unbounded CPU and disk use on a free host.
    return parts[:1800]

def frame(title, caption, index, total, path):
    im = background()
    draw = ImageDraw.Draw(im)
    for k in range(7):
        x = (index * 97 + k * 225) % (W + 200) - 100
        draw.line((x, 0, x - 220, H), fill=(23, 67, 89), width=2)
    draw.rounded_rectangle((55, 50, W-55, H-50), radius=24, outline=(66,157,177), width=2)
    draw.text((W-95, 95), title, font=font(44), fill=(241,248,252), anchor="ra", direction="rtl", language="fa")
    draw.line((90,165,W-90,165), fill=(70,190,204), width=3)
    words = caption.split()
    lines, current = [], ""
    for word in words:
        if len(current + " " + word) > 40:
            lines.append(current)
            current = word
        else:
            current = (current + " " + word).strip()
    if current:
        lines.append(current)
    for j, line in enumerate(lines[:4]):
        draw.text((W-100, 250+j*60), line, font=font(32), fill=(230,240,247), anchor="ra", direction="rtl", language="fa")
    draw.text((W-95,H-95), f"صحنه {index+1:04d} / {total:04d}", font=font(21), fill=(118,207,215), anchor="ra", direction="rtl", language="fa")
    draw.text((95,H-95), "INDEPENDENT VIDEO ENGINE", font=font(20), fill=(118,207,215))
    im.save(path, "JPEG", quality=88, optimize=False)

def render(job_id, req, scenes):
    work = Path(tempfile.mkdtemp(prefix="film_"))
    try:
        with LOCK:
            JOBS[job_id].update(status="rendering", progress=1, message="در حال ساخت قاب‌های تصویری")
        total = len(scenes)
        listing = work / "list.txt"
        # Save frames sequentially and write the concat list immediately; don't keep a second huge path list.
        with listing.open("w", encoding="utf-8") as manifest:
            last_path = None
            for i, caption in enumerate(scenes):
                p = work / f"s{i:04d}.jpg"
                frame(req.title, caption, i, total, p)
                manifest.write(f"file '{p.as_posix()}'\nduration {req.seconds_per_scene}\n")
                last_path = p
                if i % 5 == 0:
                    with LOCK:
                        JOBS[job_id].update(progress=min(82, int((i+1)/total*82)), message=f"ساخت قاب‌ها: {i+1} از {total}")
            if last_path:
                manifest.write(f"file '{last_path.as_posix()}'\n")
        out = OUT / f"{job_id}.mp4"
        with LOCK:
            JOBS[job_id].update(progress=85, message="در حال تبدیل قاب‌ها به MP4")
        cmd = ["ffmpeg","-hide_banner","-loglevel","error","-y","-f","concat","-safe","0","-i",str(listing),"-vf","format=yuv420p,scale=1280:720","-r","25","-c:v","libx264","-preset","ultrafast","-crf","28","-threads","2","-movflags","+faststart",str(out)]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=3600)
        if result.returncode != 0:
            raise RuntimeError("FFmpeg: " + (result.stderr or "خطای نامشخص")[-600:])
        if not out.exists() or out.stat().st_size < 1024:
            raise RuntimeError("فایل خروجی ساخته نشد یا ناقص است")
        with LOCK:
            JOBS[job_id].update(status="completed", progress=100, message="ویدئو آماده است", download_url=f"/api/videos/{job_id}/download", filename=out.name)
    except Exception as exc:
        with LOCK:
            if job_id in JOBS:
                JOBS[job_id].update(status="failed", progress=0, message=str(exc)[:700])
        try:
            (OUT / f"{job_id}.mp4").unlink(missing_ok=True)
        except Exception:
            pass
    finally:
        shutil.rmtree(work, ignore_errors=True)

@app.get("/health")
def health():
    return {"status":"ok","engine":"independent-persian-video-engine","version":"0.4.0","ai_api_required":False,"max_scenes":1800,"background_rendering":True,"optimized_frame_generation":True}

@app.post("/api/videos")
def create_video(req: Request):
    if not shutil.which("ffmpeg"):
        raise HTTPException(500, "FFmpeg روی سرور نصب نیست")
    scenes = scenes_of(req.text)
    if not scenes:
        raise HTTPException(400, "متن قابل تبدیل به صحنه نیست")
    job_id = uuid.uuid4().hex[:12]
    duration = len(scenes) * req.seconds_per_scene
    with LOCK:
        JOBS[job_id] = {"status":"queued","progress":0,"message":"کار ثبت شد و در صف قرار گرفت","scenes":len(scenes),"duration_seconds":duration}
    POOL.submit(render, job_id, req, scenes)
    return {"status":"queued","id":job_id,"scenes":len(scenes),"duration_seconds":duration,"status_url":f"/api/videos/{job_id}/status"}

@app.get("/api/videos/{job_id}/status")
def video_status(job_id: str):
    with LOCK:
        item = JOBS.get(job_id)
        if item:
            return {"id":job_id, **item}
    raise HTTPException(404, "کار پیدا نشد؛ ممکن است سرور راه‌اندازی مجدد شده باشد")

@app.get("/api/videos/{job_id}/download")
def download_video(job_id: str):
    if not re.fullmatch(r"[a-f0-9]{12}", job_id):
        raise HTTPException(400, "شناسه نامعتبر است")
    path = OUT / f"{job_id}.mp4"
    if not path.exists():
        raise HTTPException(404, "ویدئو هنوز آماده نیست یا فایل موقت حذف شده است")
    return FileResponse(path, media_type="video/mp4", filename=path.name)

app.mount("/", StaticFiles(directory=str(WEB), html=True), name="web")
