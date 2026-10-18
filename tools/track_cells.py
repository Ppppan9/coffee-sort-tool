# Track board cell colors over time in reference video (top rows), print state changes.
import subprocess, numpy as np, sys
W,H=720,1280
p=subprocess.Popen(['ffmpeg','-v','error','-i','ref/ref.mp4','-vf','fps=10','-f','rawvideo','-pix_fmt','rgb24','-'],stdout=subprocess.PIPE)
# row centers / left edge / width (perspective) measured from f0 grid
rows=[(658,45,80),(722,38,81.5),(790,30,83),(860,22,85),(935,12,87.5)]
def cls(c):
    r,g,b=c
    if g>180 and r<200 and b<120: return 'G'
    if b>r+15 and b>150: return '.'
    if r>190 and g>170 and b>130: return 'W'
    if r<150 and g<110: return 'B'
    return '?'
prev=None;i=0
while True:
    buf=p.stdout.read(W*H*3)
    if len(buf)<W*H*3: break
    f=np.frombuffer(buf,np.uint8).reshape(H,W,3).astype(int)
    st=[]
    for (y,x0,w) in rows:
        s=''
        for c in range(8):
            cx=int(x0+w*(c+0.5)); 
            # sample between bumps: center of cell has the gap between 4 bumps
            patch=f[y-4:y+4,cx-4:cx+4].reshape(-1,3).mean(0)
            s+=cls(patch)
        st.append(s)
    # exit cell (channel) at x 360, y ~ 600
    ex=cls(f[596:604,356:364].reshape(-1,3).mean(0))
    key=' '.join(st)+' X'+ex
    if key!=prev: print(f'{i/10:5.1f}',key); prev=key
    i+=1
