import os,re,uuid,subprocess,tempfile,shutil,textwrap
from pathlib import Path
from fastapi import FastAPI,HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel,Field
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/"output"; OUT.mkdir(exist_ok=True)
WEB=ROOT/"web"
W,H=1280,720
FONTS=["/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf","/usr/share/fonts/truetype/freefont/FreeSans.ttf"]
def font(n):
 for p in FONTS:
  if os.path.exists(p): return ImageFont.truetype(p,n)
 return ImageFont.load_default()
class Request(BaseModel):
 text:str=Field(min_length=10,max_length=20000)
 title:str=Field(default="مستند فارسی",max_length=120)
 seconds_per_scene:int=Field(default=4,ge=2,le=10)
app=FastAPI(title="Independent Persian Video Engine",version="0.2.0")
def scenes_of(t):
 a=[s.strip() for s in re.split(r'(?<=[.!؟?؛])\s+|\n+',t) if s.strip()]
 if len(a)<2:
  w=t.split(); a=[" ".join(w[i:i+18]) for i in range(0,len(w),18)]
 return a[:40]
def frame(title,caption,i,total,path):
 im=Image.new("RGB",(W,H)); px=im.load()
 for y in range(H):
  for x in range(W):
   g=int(13*(1-abs(x/W-.5)*1.6))
   px[x,y]=(max(0,5+g),max(0,18+int(y/H*15)+g),max(0,35+int(x/W*22)+g))
 d=ImageDraw.Draw(im)
 for k in range(7):
  x=(i*97+k*225)%(W+200)-100; d.line((x,0,x-220,H),fill=(23,67,89),width=2)
 d.rounded_rectangle((55,50,W-55,H-50),radius=24,outline=(66,157,177),width=2)
 d.text((W-95,95),title,font=font(44),fill=(241,248,252),anchor="ra",direction="rtl",language="fa")
 d.line((90,165,W-90,165),fill=(70,190,204),width=3)
 words=caption.split(); lines=[]; cur=""
 for word in words:
  if len(cur+" "+word)>40: lines.append(cur); cur=word
  else: cur=(cur+" "+word).strip()
 if cur: lines.append(cur)
 for j,line in enumerate(lines[:4]): d.text((W-100,250+j*60),line,font=font(32),fill=(230,240,247),anchor="ra",direction="rtl",language="fa")
 d.text((W-95,H-95),f"صحنه {i+1:02d} / {total:02d}",font=font(21),fill=(118,207,215),anchor="ra",direction="rtl",language="fa")
 d.text((95,H-95),"INDEPENDENT VIDEO ENGINE",font=font(20),fill=(118,207,215))
 im.save(path,quality=93)
@app.get("/health")
def health(): return {"status":"ok","engine":"independent-persian-video-engine","version":"0.2.0","ai_api_required":False}
@app.post("/api/videos")
def create_video(req:Request):
 if not shutil.which("ffmpeg"): raise HTTPException(500,"FFmpeg not installed")
 scenes=scenes_of(req.text)
 job=uuid.uuid4().hex[:12]; work=Path(tempfile.mkdtemp(prefix="film_"))
 try:
  paths=[]
  for i,s in enumerate(scenes):
   p=work/f"s{i:03d}.jpg"; frame(req.title,s,i,len(scenes),p); paths.append(p)
  listing=work/"list.txt"
  with listing.open("w",encoding="utf-8") as f:
   for p in paths: f.write(f"file '{p.as_posix()}'\nduration {req.seconds_per_scene}\n")
   f.write(f"file '{paths[-1].as_posix()}'\n")
  out=OUT/f"{job}.mp4"
  r=subprocess.run(["ffmpeg","-y","-f","concat","-safe","0","-i",str(listing),"-vf","format=yuv420p,scale=1280:720","-r","25","-c:v","libx264","-preset","veryfast","-crf","24","-movflags","+faststart",str(out)],capture_output=True,text=True,timeout=300)
  if r.returncode: raise HTTPException(500,"MP4 encoding failed: "+r.stderr[-700:])
  return {"status":"completed","id":job,"scenes":len(scenes),"duration_seconds":len(scenes)*req.seconds_per_scene,"download_url":f"/api/videos/{job}/download","filename":out.name}
 except subprocess.TimeoutExpired: raise HTTPException(504,"Rendering timed out")
 finally: shutil.rmtree(work,ignore_errors=True)
@app.get("/api/videos/{job_id}/download")
def download_video(job_id:str):
 if not re.fullmatch(r"[a-f0-9]{12}",job_id): raise HTTPException(400,"Invalid id")
 p=OUT/f"{job_id}.mp4"
 if not p.exists(): raise HTTPException(404,"Video expired or not found")
 return FileResponse(p,media_type="video/mp4",filename=p.name)
app.mount("/",StaticFiles(directory=str(WEB),html=True),name="web")
