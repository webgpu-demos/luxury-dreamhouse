import numpy as np, json
from PIL import Image, ImageDraw
src=np.asarray(Image.open('/mnt/user-data/uploads/Luxury-Dreamhouse/House images (JPEG)/IMG_7109.jpg').convert('RGB'),dtype=np.float32)
ax,ay,C0,R0=1832,1178,46,31
pxb,pxt,pyb,pyt,rot=31.7,29.8,30.0,27.8,0.012
def stud(c,r):
    t=(R0-r)/R0; py=pyb+(pyt-pyb)*t/2; px=pxb+(pxt-pxb)*t
    y=ay-(R0-r)*py+(c-C0)*px*0.0225
    x=ax+(c-C0)*px-(R0-r)*py*rot
    return x,y
S=24; W=(C0+1)*S; H=(R0+1)*S
u=(np.arange(W)+0.5)/S-0.5; v=(np.arange(H)+0.5)/S-0.5
U,V=np.meshgrid(u,v)
X,Y=stud(U,V)
x0=np.clip(np.floor(X).astype(int),0,src.shape[1]-2); y0=np.clip(np.floor(Y).astype(int),0,src.shape[0]-2)
fx=(X-x0)[...,None]; fy=(Y-y0)[...,None]
out=(src[y0,x0]*(1-fx)*(1-fy)+src[y0,x0+1]*fx*(1-fy)+src[y0+1,x0]*(1-fx)*fy+src[y0+1,x0+1]*fx*fy)
img=Image.fromarray(out.clip(0,255).astype(np.uint8))
img.save('ortho/ortho_clean.png')
d=ImageDraw.Draw(img)
for c in range(C0+2):
    d.line([(c*S,0),(c*S,H)],fill=(255,255,255) if c%4 else (255,0,0),width=1)
for r in range(R0+2):
    d.line([(0,r*S),(W,r*S)],fill=(255,255,255) if r%4 else (255,0,0),width=1)
for c in range(0,C0+1,4):
    for r in range(0,R0+1,4): d.text((c*S+2,r*S+1),f'{c},{r}',fill=(255,0,0))
img.save('ortho/ortho_grid.png'); print(W,H)
