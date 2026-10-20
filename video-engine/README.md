# Independent Persian Video Engine

Self-hostable Persian text-to-MP4 MVP. Uses Python, Pillow, FastAPI and FFmpeg; no paid AI API is required.

## Deploy on Render
Create a new Docker web service from this repository, branch `independent-video-engine`, Docker context `video-engine`, Dockerfile path `video-engine/Dockerfile`. Keep the existing website services unchanged.

## Local run
Install FFmpeg and Python 3.11+, then run:
```bash
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

The web UI accepts Persian text and returns an MP4 download. This first version makes cinematic text-card scenes, not AI-generated footage or narration. Free hosts can sleep, time out, or have temporary storage; unlimited free rendering cannot be guaranteed.