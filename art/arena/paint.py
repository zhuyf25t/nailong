"""Paint the candy bottling hall and its pickups at native pixel resolution.

Run with Python + Pillow. Every solid is clipped to the collision grid. Positions
in arena.json are tile coordinates, measured from the upper left of the room.
"""
import json
import math
from collections import deque
from pathlib import Path
from random import Random

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "game/assets/arena"
TILE = 16
INK = "#3c3546"
DEEP = "#364b55"
IRON = "#50656b"
STEEL = "#708584"
SHINE = "#a0b2a4"
LIGHT = "#fbe3a7"
MILK = "#fff4cb"
WOOD = "#bc926d"
MINT = ("#305b60", "#427d7d", "#5fa497", "#92c5aa", "#cbe2b5")
BERRY = ("#694852", "#955760", "#bb7474", "#dd9890", "#f3c0a3")
SODA = ("#665653", "#9d725b", "#c5986f", "#ddba82", "#efda9f")


def clipped_box(x, y, w, h, cut=2):
    """Polygon with stepped 45-degree corners inside a given box."""
    return [(x + cut, y), (x+w-1-cut, y), (x+w-1, y+cut), (x+w-1, y+h-1-cut),
            (x+w-1-cut, y+h-1), (x+cut, y+h-1), (x, y+h-1-cut), (x, y+cut)]


def rivet(d, x, y, dark=IRON, light=SHINE):
    d.line((x, y, x+1, y), fill=light)
    d.line((x, y+1, x+1, y+1), fill=dark)


def emblem(d, x, y, berry, dark, light):
    if berry:
        d.polygon([(x-3,y-1),(x-2,y-2),(x+2,y-2),(x+3,y-1),
                   (x+2,y+1),(x,y+3),(x-2,y+1)], fill=dark)
        d.line((x-1,y-3,x+1,y-2), fill=light)
        d.point([(x-1,y),(x+1,y)], fill=light)
    else:
        d.polygon([(x-3,y+2),(x-3,y),(x-1,y-2),(x+3,y-3),
                   (x+3,y),(x+1,y+2)], fill=dark)
        d.line((x-1,y+1,x+1,y-1), fill=light)


def bubble(d, x, y, r, edge, fill, shine):
    d.ellipse((x-r,y-r,x+r,y+r), fill=fill, outline=edge)
    d.point((x-1,y-1), fill=shine)


def floor(rows):
    w, h = len(rows[0])*TILE, len(rows)*TILE
    image = Image.new("RGB", (w,h), "#ad887c")
    d = ImageDraw.Draw(image)
    rng = Random(42)
    floor_colors = ["#b39180","#af8b7b","#b3907e","#ae8c7d"]
    for y in range(0,h,16):
        for x in range(-16 if (y//16)%2 else 0,w,32):
            d.rectangle((x,y,x+31,y+15), fill=rng.choice(floor_colors))
            d.line((x,y+15,x+31,y+15), fill="#a48174")
            d.line((x+31,y+2,x+31,y+13), fill="#a78476")
            d.line((x+2,y+1,x+13,y+1), fill="#bb9983")
            if rng.random() < 0.25:
                dx,dy=x+rng.randrange(4,23),y+rng.randrange(3,11)
                d.line((dx,dy,dx+1,dy),fill="#aa8576")
    # Tinted receiving bays belong to each team. A stepped edge follows the
    # factory floor plan so the left and right approaches read at a glance.
    for right in (False,True):
        team_floor = ("#9aa290","#a6ad95","#8c9789","#b6baa0") if not right else ("#bc998a","#c6a193","#ab897f","#d2ae96")
        for yy in range(1,h//16-1):
            reach=4 if yy in range(5,13) else 2
            for col in range(1,reach+1):
                xx=w//16-1-col if right else col
                x,y=16*xx,16*yy
                d.rectangle((x,y,x+15,y+15), fill=team_floor[(xx//2+yy//2)%2])
                d.line((x,y+15,x+15,y+15),fill=team_floor[2])
                if (xx+yy)%2: d.line((x+15,y+2,x+15,y+14),fill=team_floor[2])
                d.line((x+2,y+1,x+7,y+1),fill=team_floor[3])
            xx=w-16*(reach+1) if right else 16*(reach+1)-1
            d.line((xx,y,xx,y+15),fill=team_floor[2])
        for yy in (72,h-73):
            xx=w-29 if right else 28
            for off in (-3,3):
                delta=-1 if right else 1
                d.line((xx+off,yy-3,xx+off+3*delta,yy,xx+off,yy+3),fill=team_floor[2],width=2)
    # Flat cast-iron drains and wear around the two loading aisles.
    for x,y in ((55,21),(w-88,21),(72,h-24),(w-100,h-24),(133,142),(326,142)):
        d.polygon(clipped_box(x,y,23,6,1),fill="#857c73",outline="#9d8979")
        for vx in range(x+3,x+20,3):
            d.line((vx,y+2,vx+1,y+4),fill="#666e67")
            d.point((vx+1,y+1),fill="#b4a08a")
    # The perimeter is ribbed service flooring; the central apron carries the
    # cross-lane markings and a faded bottle-cap maker's mark.
    for s in (-1,1):
        x = 40 if s < 0 else w-41
        tone = "#859c8b" if s < 0 else "#b98783"
        for y in range(25,h-24,8):
            d.line((x,y,x,y+3),fill=tone,width=2)
    cx,cy=w//2,h//2
    d.polygon(clipped_box(cx-28,cy-22,56,44,8), outline="#a28074")
    d.polygon(clipped_box(cx-25,cy-19,50,38,7), outline="#bb9985")
    for x in range(30,w-30,12):
        for y in (cy-11,cy+11):
            d.line((x,y,x+3,y),fill="#c2a289")
    # Embossed crown cap medallion with eight shallow teeth, kept low contrast.
    for i in range(8):
        a=math.pi*i/4
        qx,qy=cx+round(11*math.cos(a)),cy+round(8*math.sin(a))
        d.rectangle((qx-1,qy-1,qx+1,qy+1), fill="#a38073")
    d.ellipse((cx-12,cy-9,cx+12,cy+9), fill="#a98577", outline="#9e7d71")
    d.ellipse((cx-9,cy-7,cx+9,cy+6), outline="#c3a28a")
    d.polygon([(cx-2,cy-4),(cx+1,cy-4),(cx+1,cy-2),(cx+3,cy),
               (cx+3,cy+3),(cx-3,cy+3),(cx-3,cy),(cx-2,cy-2)],fill="#c3a28a")
    return image


def service_ring(d, w, h):
    # Two parallel feed pipes, melon-shaped copper junctions, gauges and a
    # central pressure cabinet turn the exterior wall into a single machine.
    d.rectangle((0,0,w-1,15), fill=DEEP)
    d.rectangle((0,h-16,w-1,h-1), fill=DEEP)
    d.rectangle((0,0,15,h-1), fill=DEEP)
    d.rectangle((w-16,0,w-1,h-1), fill=DEEP)
    d.rectangle((1,1,w-2,h-2), outline=STEEL)
    d.rectangle((14,14,w-15,h-15), outline=INK)
    for x in range(17,w-15,32):
        for y in (0,h-15):
            d.line((x,y+2,x,y+13), fill="#2e424c")
            rivet(d,x+3,y+2)
            rivet(d,x+26,y+10)
    for y in (6,h-10):
        d.rectangle((8,y+1,w-9,y+4),fill="#2e4249")
        d.rectangle((8,y,w-9,y+2),fill="#a0846d")
        d.line((10,y,w-11,y),fill="#c5ab84")
        for x in range(26,w-16,31):
            d.rectangle((x,y-2,x+3,y+4),fill=IRON)
            d.line((x,y-1,x+2,y-1),fill=SHINE)
    for x in (5,w-9):
        d.rectangle((x,8,x+3,h-9), fill="#7b8c87")
        d.line((x,9,x,h-10), fill="#aabba9")
        for y in range(20,h-8,29):
            d.rectangle((x-1,y,x+4,y+3), fill=IRON)
            d.line((x-1,y,x+3,y), fill=SHINE)
    for x,y in [(10,8),(w-10,8),(10,h-9),(w-10,h-9)]:
        d.ellipse((x-5,y-5,x+5,y+5),fill=INK)
        d.ellipse((x-4,y-4,x+4,y+3),fill="#bb936a",outline="#93735d")
        d.line((x-2,y,x+1,y-2),fill=LIGHT)
    for x, palette in ((66,MINT),(w-67,BERRY)):
        d.polygon(clipped_box(x-20,1,41,13),fill=INK)
        d.polygon(clipped_box(x-18,2,37,10),fill=palette[1])
        for dx in (-10,-5,0,5,10):
            d.line((x+dx-2,9,x+dx+1,4), fill=palette[3],width=2)
    cx=w//2
    d.polygon(clipped_box(cx-26,1,53,13),fill=INK)
    d.polygon(clipped_box(cx-25,2,51,10),fill=IRON)
    for x in (cx-14,cx,cx+14):
        d.ellipse((x-5,2,x+5,11),fill=DEEP,outline="#82958c")
        d.arc((x-3,4,x+3,10),190,350,fill="#dfcb9a")
        d.line((x,8,x+2,5),fill="#ebad81")


def components(rows):
    w,h=len(rows[0]),len(rows)
    left={(x,y) for y in range(1,h-1) for x in range(1,w-1) if rows[y][x]=="#"}
    while left:
        start=min(left,key=lambda p:(p[1],p[0]))
        left.remove(start)
        todo=deque([start])
        found={start}
        while todo:
            x,y=todo.popleft()
            for p in ((x+1,y),(x-1,y),(x,y+1),(x,y-1)):
                if p in left:
                    left.remove(p)
                    found.add(p)
                    todo.append(p)
        yield found


def packs(cells):
    left=set(cells)
    while left:
        x,y=min(left,key=lambda p:(p[1],p[0]))
        options=[]
        for height in range(1,5):
            for width in range(1,6):
                if all((xx,yy) in left for yy in range(y,y+height) for xx in range(x,x+width)):
                    options.append((width*height,min(width,height),width,height))
        _,_,width,height=max(options)
        left.difference_update((xx,yy) for yy in range(y,y+height) for xx in range(x,x+width))
        yield x*16,y*16,width*16,height*16


def panel(d,x,y,w,h,p):
    d.polygon(clipped_box(x,y,w,h,2),fill=INK)
    d.polygon(clipped_box(x+1,y+1,w-2,h-3,2),fill=p[0])
    d.polygon(clipped_box(x+1,y+1,w-2,h-6),fill=p[2])
    d.line((x+3,y+1,x+w-4,y+1),fill=p[4])
    d.line((x+1,y+3,x+1,y+h-7),fill=p[3])
    d.line((x+3,y+h-5,x+w-4,y+h-5),fill=p[1])
    d.line((x+3,y+h-2,x+w-4,y+h-2),fill=p[1])


def tank(d,x,y,w,h,p,berry):
    panel(d,x,y,w,h,(DEEP,IRON,STEEL,SHINE,"#bbc2a6"))
    # Draw a rolled, enamel-coated, banded syrup tank on its steel skid.
    tx,ty=x+3,y+2
    tw,th=w-6,h-7
    d.polygon(clipped_box(tx,ty,tw,th,4),fill=p[0])
    d.polygon(clipped_box(tx+1,ty+1,tw-2,th-3,3),fill=p[2])
    d.rectangle((tx+3,ty+4,tx+5,ty+th-6),fill=p[3])
    d.rectangle((tx+tw-7,ty+4,tx+tw-3,ty+th-4),fill=p[1])
    d.ellipse((tx+1,ty+th-8,tx+tw-2,ty+th-2),fill=p[1])
    d.ellipse((tx+1,ty+th-10,tx+tw-2,ty+th-4),fill=p[2])
    d.ellipse((tx,ty,tx+tw-1,ty+9),fill=p[0])
    d.ellipse((tx+1,ty,tx+tw-2,ty+7),fill=p[3])
    d.arc((tx+2,ty+1,tx+tw-4,ty+6),185,329,fill=p[4])
    cx=tx+tw//2
    d.ellipse((cx-5,ty+1,cx+5,ty+5),fill=p[1])
    d.line((cx-2,ty+2,cx+2,ty+2),fill=p[4])
    sy=ty+th//2+3
    d.polygon(clipped_box(cx-6,sy-5,13,10),fill=p[4])
    emblem(d,cx,sy-1,berry,p[1],p[3])
    for xx in (x+2,x+w-4): rivet(d,xx,y+h-4)


def carton(d,x,y,w,h,p,berry):
    panel(d,x,y,w,h,p)
    if w>=28:
        d.line((x+3,y+5,x+w-4,y+5),fill=p[1])
        d.line((x+3,y+6,x+w-5,y+6),fill=p[3])
        for xx in (x+5,x+w-8):
            d.rectangle((xx,y+1,xx+2,y+h-3),fill=p[0])
            d.line((xx,y+2,xx,y+h-6),fill=p[4])
    if h>=26:
        d.line((x+2,y+h//2,x+w-3,y+h//2), fill=p[0])
        d.line((x+3,y+h//2+1,x+w-3,y+h//2+1),fill=p[3])
    cx,cy=x+w//2,y+(h-4)//2
    emblem(d,cx,cy,berry,p[0],p[4])


def cooling_rack(d,x,y,w,h,p,vertical=False):
    panel(d,x,y,w,h,p)
    if vertical:
        d.rectangle((x+3,y+4,x+w-4,y+h-8), fill=p[0])
        for yy in range(y+5,y+h-9,4):
            d.line((x+4,yy,x+w-5,yy),fill=p[2])
            d.point((x+4,yy),fill=p[3])
    else:
        d.rectangle((x+3,y+3,x+w-4,y+h-8),fill=p[0])
        for xx in range(x+5,x+w-6,4):
            d.line((xx,y+4,xx,y+h-9),fill=p[2])
            d.point((xx,y+4),fill=p[4])
        rivet(d,x+w-5,y+h-5,p[0],p[4])


def bottle_case(d,x,y,w,h,p,berry):
    """Glass-front filling cabinet. Each bottle has a cap and milk meniscus."""
    panel(d,x,y,w,h,p)
    d.polygon(clipped_box(x+3,y+4,w-13,h-11),fill=INK)
    d.rectangle((x+5,y+6,x+w-12,y+h-10),fill="#526467")
    for by in [y+8]:
        for i in range((w-15)//7):
            bx=x+7+i*7
            d.rectangle((bx+1,by,bx+3,by+1),fill=p[4])
            d.rectangle((bx+1,by+2,bx+3,by+4),fill="#a9c5b5")
            d.polygon([(bx+1,by+4),(bx+3,by+4),(bx+4,by+5),
                       (bx+4,by+12),(bx,by+12),(bx,by+5)],fill=p[2])
            d.rectangle((bx,by+7,bx+4,by+10),fill="#dec48e")
            d.point((bx+1,by+8),fill=p[0])
            d.line((bx,by+4,bx,by+6),fill=LIGHT)
    d.line((x+5,y+h-9,x+w-12,y+h-9),fill=SHINE)
    d.line((x+6,y+11,x+10,y+7),fill="#9daf9e")
    d.line((x+7,y+13,x+10,y+10),fill="#8d9e94")
    d.rectangle((x+w-8,y+5,x+w-4,y+10),fill=p[0])
    d.rectangle((x+w-7,y+6,x+w-5,y+8),fill=LIGHT)
    for dy in [14,17]:
        d.line((x+w-8,y+dy,x+w-5,y+dy),fill=p[4])
    d.rectangle((x+7,y+h-6,x+w-9,y+h-5),fill=DEEP)


def bottle_crate(d,x,y,w,h,p,berry):
    """Open wooden soda crate with six fluted caps in two racks."""
    panel(d,x,y,w,h,SODA)
    d.rectangle((x+3,y+3,x+w-4,y+h-9), fill="#6e5752")
    for yy in (y+8,y+17):
        for xx in range(x+7,x+w-6,8):
            d.polygon(clipped_box(xx-3,yy-3,7,8),fill=p[0])
            d.ellipse((xx-3,yy-3,xx+3,yy+3),fill=p[2],outline=p[0])
            d.ellipse((xx-2,yy-3,xx+2,yy+1),fill=p[3])
            d.line((xx-1,yy-2,xx+1,yy-2),fill=p[4])
    d.line((x+1,y+h-8,x+w-2,y+h-8),fill=SODA[4])
    d.rectangle((x+2,y+h-7,x+w-3,y+h-4),fill=SODA[2])
    d.line((x+w//2-3,y+h-6,x+w//2+2,y+h-6),fill=SODA[0])
    for xx in (x+2,x+w-4):
        rivet(d,xx,y+h-6,SODA[0],SODA[4])


def pressure_pump(d,x,y,w,h):
    """The orange central pump and its large dial landmark the crossroads."""
    panel(d,x,y,w,h,(DEEP,IRON,STEEL,SHINE,"#bbcac0"))
    for xx in (x+3,x+w-7):
        d.rectangle((xx,y+4,xx+3,y+h-7),fill="#ad8564",outline="#745f54")
        d.line((xx+1,y+5,xx+1,y+h-9),fill="#d0b181")
        for yy in (y+7,y+h-10):
            d.rectangle((xx-1,yy,xx+4,yy+2),fill=DEEP)
    cx,cy=x+w//2,y+12
    d.ellipse((cx-9,cy-10,cx+9,cy+9),fill=INK)
    d.ellipse((cx-8,cy-9,cx+8,cy+7),fill="#c18560",outline="#e8bc83")
    d.ellipse((cx-6,cy-7,cx+6,cy+5),fill="#e9d8a9",outline="#7c776a")
    for dx,dy in [(-4,0),(-3,-3),(0,-5),(3,-3),(4,0)]:
        d.point((cx+dx,cy+dy),fill=DEEP)
    d.line((cx,cy+1,cx+3,cy-3),fill="#b46d58",width=2)
    d.point((cx,cy+1),fill=INK)
    d.rectangle((cx-5,y+h-7,cx+5,y+h-5),fill=DEEP)
    for dx in (-3,0,3): d.point((cx+dx,y+h-6),fill="#a3c39f")


def mixer(d,x,y,w,h,p,berry):
    """Top-entry glass tank with stirring paddle and bubbles."""
    panel(d,x,y,w,h,p)
    cx,cy=x+w//2,y+(h-6)//2
    d.ellipse((cx-12,cy-10,cx+12,cy+10),fill=p[0],outline=INK)
    d.ellipse((cx-11,cy-9,cx+11,cy+7),fill="#b6c6aa",outline=SHINE)
    d.ellipse((cx-9,cy-7,cx+9,cy+6),fill=p[2],outline=p[0])
    d.arc((cx-7,cy-5,cx+7,cy+4),20,220,fill=p[3])
    d.line((cx-3,cy-1,cx+2,cy+2),fill=p[0],width=2)
    bubble(d,cx+3,cy-2,2,p[2],p[3],p[4])
    d.line((cx-6,cy-3,cx-3,cy-5),fill=p[4],width=2)
    rivet(d,x+2,y+h-6,p[0],p[4])
    rivet(d,x+w-5,y+h-6,p[0],p[4])


def syrup_pallet(d,x,y,w,h,p,berry):
    """A strapped checker-wafer shipment beside a team-coloured enamel can."""
    panel(d,x,y,w,h,SODA)
    for bx,by in ((x+3,y+3),(x+16,y+3),(x+3,y+14),(x+16,y+14)):
        d.rectangle((bx,by,bx+11,by+9),fill="#ad7e5c",outline="#81664f")
        for vx in (bx+3,bx+7):
            for vy in (by+2,by+5):
                d.rectangle((vx,vy,vx+1,vy+1),fill="#ddb27a")
        d.line((bx+1,by+1,bx+9,by+1),fill=SODA[4])
    d.rectangle((x+11,y+1,x+14,y+h-5),fill=p[1])
    d.line((x+12,y+2,x+12,y+h-7),fill=p[3])
    d.rectangle((x+10,y+14,x+15,y+17),outline=LIGHT)
    tank(d,x+29,y+1,w-30,h-3,p,berry)


def draw_machines(image, rows):
    mask=Image.new("1",image.size,0)
    md=ImageDraw.Draw(mask)
    for yy,row in enumerate(rows):
        for xx,c in enumerate(row):
            if c=="#":
                md.rectangle((xx*16,yy*16,xx*16+15,yy*16+15),fill=1)
    # Gentle floor shadows communicate height without implying extra collision.
    d=ImageDraw.Draw(image)
    for islands in components(rows):
        for gx,gy in sorted(islands):
            if (gx,gy+1) not in islands:
                d.rectangle((gx*16+3,gy*16+16,gx*16+16,gy*16+18),fill="#96796c")
    solids=Image.new("RGB",image.size,INK)
    d=ImageDraw.Draw(solids)
    service_ring(d,*image.size)
    for index,island in enumerate(components(rows)):
        for n,(x,y,w,h) in enumerate(packs(island)):
            berry=x+w/2>image.width/2
            p=BERRY if berry else MINT
            if w>=32 and h>=32:
                if y==32 and w>=48:
                    bottle_case(d,x,y,w,h,p,berry)
                elif y==224 and w>=48:
                    syrup_pallet(d,x,y,w,h,p,berry)
                elif y==96:
                    bottle_crate(d,x,y,w,h,p,berry)
                elif y==160 or y==64:
                    mixer(d,x,y,w,h,p,berry)
                elif 200<x<256 and 110<y<150:
                    pressure_pump(d,x,y,w,h)
                elif y>=190:
                    carton(d,x,y,w,h,SODA,berry)
                else:
                    tank(d,x,y,w,h,p,berry)
            elif w==16 and h>=32:
                if h>=48:
                    cooling_rack(d,x,y,w,32,p,True)
                    carton(d,x,y+32,w,h-32,SODA,berry)
                else:
                    cooling_rack(d,x,y,w,h,p,True)
            elif w>=32:
                # Pressure gauges and candy wrappers differentiate the conveyor runs.
                if (index+n)%3==0:
                    cooling_rack(d,x,y,w,h,p)
                else:
                    for dx in range(0,w,32):
                        carton(d,x+dx,y,min(32,w-dx),h,SODA,berry)
            else:
                carton(d,x,y,w,h,p,berry)
    image.paste(solids,mask=mask)


def tile_center(point):
    if isinstance(point,dict):
        return int(point["x"])*16+8,int(point["y"])*16+8
    return point[0]*16+8,point[1]*16+8


def base_pad(d,x,y,berry):
    edge,shadow,mid,accent,glint = BERRY if berry else MINT
    d.polygon(clipped_box(x-13,y-10,26,20,5),fill=shadow,outline=edge)
    d.polygon(clipped_box(x-12,y-9,24,17,4),fill=mid,outline=accent)
    d.polygon(clipped_box(x-8,y-6,16,11,3),fill=shadow)
    for dx,dy in [(-8,-6),(7,-6),(-8,5),(7,5)]:
        d.point((x+dx,y+dy),fill=glint)


def supply_pad(d,x,y):
    d.polygon(clipped_box(x-7,y-5,15,10),fill="#917d70",outline="#8a7166")
    d.polygon(clipped_box(x-5,y-4,11,7),outline="#c8ae8b")
    d.line((x-2,y-1,x+2,y-1),fill="#bca685")
    d.line((x,y-3,x,y+1),fill="#bca685")


def milk():
    im=Image.new("RGBA",(16,16))
    d=ImageDraw.Draw(im)
    d.polygon([(5,1),(10,1),(11,2),(11,5),(13,7),(13,13),(11,15),
               (4,15),(2,13),(2,7),(4,5),(4,2)],fill=INK)
    d.rectangle((5,2,10,3),fill="#e99987")
    d.line((5,2,9,2),fill="#ffdec3")
    d.line((5,4,10,4),fill="#ab6f71")
    d.polygon([(5,5),(10,5),(12,8),(12,12),(10,14),(5,14),(3,12),(3,8)],fill="#b6d4bd")
    d.polygon([(5,6),(9,6),(11,8),(11,12),(9,13),(5,13),(4,11),(4,8)],fill="#fff3d0")
    d.rectangle((4,8,11,11),fill="#db8e83")
    d.line((6,9,9,9),fill="#fff3d0")
    d.line((7,8,7,10),fill="#fff3d0")
    d.line((4,7,5,6),fill="#ffffff")
    return im


def flag(berry):
    im=Image.new("RGBA",(16,20))
    d=ImageDraw.Draw(im)
    p=BERRY if berry else MINT
    d.polygon([(4,2),(6,2),(6,3),(12,3),(15,5),(13,7),(15,10),
               (12,11),(8,9),(6,9),(6,17),(8,18),(8,19),(2,19),(2,18),(4,17)],fill=INK)
    d.line((5,3,5,17),fill="#d8b97e")
    d.polygon([(6,4),(11,4),(13,5),(11,7),(13,9),(12,10),(8,8),(6,8)],fill=p[2])
    d.line((7,5,10,5),fill=p[4])
    d.point((8,6),fill=p[4])
    d.point((12,8),fill=p[1])
    d.rectangle((4,0,6,2),fill=INK)
    d.point((5,1),fill=LIGHT)
    return im


def main():
    arena=json.loads((ROOT/"game/data/arena.json").read_text(encoding="utf-8-sig"))
    rows=arena["rows"]
    if len(rows)!=18 or any(len(row)!=30 for row in rows):
        raise ValueError("A 30 by 18 grid is required")
    image=floor(rows)
    d=ImageDraw.Draw(image)
    for i,point in enumerate(arena["bases"]):
        base_pad(d,*tile_center(point),i==1)
    for point in arena["pickups"]:
        supply_pad(d,*tile_center(point))
    draw_machines(image, rows)
    OUTPUT.mkdir(parents=True,exist_ok=True)
    image.save(OUTPUT/"bottling_floor.png",optimize=True)
    milk().save(OUTPUT/"pickup_milk.png",optimize=True)
    flag(False).save(OUTPUT/"flag_mint.png",optimize=True)
    flag(True).save(OUTPUT/"flag_berry.png",optimize=True)


if __name__=="__main__":
    main()
