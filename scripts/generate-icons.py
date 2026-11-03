"""Create original geometric HH icons, with no input artwork. MIT licensed."""
from pathlib import Path
import struct,zlib
out=Path(__file__).resolve().parent.parent/'Habit_Hero_h5/public/icons'
out.mkdir(parents=True,exist_ok=True)
svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#7c3aed"/><path d="M20 20H80V58L50 85 20 58Z" fill="#fde047"/><path d="M34 32V62H43V51H57V62H66V32H57V42H43V32Z" fill="#312e81"/></svg>\n'
(out/'hero.svg').write_text(svg)
def pixel(x,y):
 c=(124,58,237)
 if 20<=x<=80 and 20<=y<=58 or 58<y<=85 and 20+(y-58)*30/27<=x<=80-(y-58)*30/27:c=(253,224,71)
 if 32<=y<=62 and (34<=x<=43 or 57<=x<=66) or 42<=y<=51 and 34<=x<=66:c=(49,46,129)
 return bytes(c)
def chunk(t,data):return struct.pack('>I',len(data))+t+data+struct.pack('>I',zlib.crc32(t+data)&0xffffffff)
for n in (32,180,192,512):
 raw=b''.join(b'\x00'+b''.join(pixel((x+.5)*100/n,(y+.5)*100/n) for x in range(n)) for y in range(n))
 (out/f'hero-{n}.png').write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',n,n,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(raw))+chunk(b'IEND',b''))
