"""Paint the 480 × 288 night-shift bottling room at its native pixel pitch.

Run with Python and Pillow. All fixtures share the coordinates in night-wire.md.
Dynamic glass, characters, wall reflections, levers and the belt live in Godot.
"""
from math import cos, pi, sin
from pathlib import Path
from random import Random

from PIL import Image, ImageDraw


SIZE = 480, 288
WINDOWS = (104, 240, 376)
DEST = Path(__file__).resolve().parents[2] / "game/assets/night/factory/floor.png"
INK = "#272638"
PLUM = "#413947"
DARK = "#293e44"
DEEP = "#355052"
IRON = "#54706b"
SAGE = "#809485"
GLASS = "#99af97"
IVORY = "#f6e3af"
CREAM = "#e4c892"
HONEY = "#f4c373"
BRASS = "#c39259"
COPPER = "#a56e4e"
RED = "#a3584b"
SHADOW_RED = "#734850"


def rgb(color):
    return tuple(bytes.fromhex(color.lstrip("#")))


def mix(a, b, t):
    return tuple(round(x + (y-x)*t) for x, y in zip(a, b))


def cut(x, y, w, h, c=2):
    return [(x+c,y), (x+w-1-c,y), (x+w-1,y+c), (x+w-1,y+h-1-c),
            (x+w-1-c,y+h-1), (x+c,y+h-1), (x,y+h-1-c), (x,y+c)]


def plate(d, x, y, w, h, edge, fill, c=2):
    d.polygon(cut(x, y, w, h, c), fill=fill, outline=edge)


def bolt(d,x,y):
    d.line((x,y+1,x+1,y+1), fill=DARK)
    d.line((x,y,x+1,y), fill="#c9b28c")


def floor_tiles(im):
    """Glazed octagonal tiles, inset dark cabochons and three pools of lamplight."""
    px = im.load()
    rnd = Random(411)
    tile = {}
    shade, middle, warm = rgb("#4c6060"), rgb("#858d79"), rgb("#d8b48a")
    for y in range(84,282):
        for x in range(480):
            tx, ox = divmod(x+11, 28)
            ty, oy = divmod(y+9, 20)
            key = tx, ty
            if key not in tile:
                tile[key] = rnd.choice((-.035,-.018,0,.016,.03))
            light = max(max(0,1-((x-cx-(y-95)*.12)/(77+(y-84)*.22))**2
                              -((y-89)/190)**2) for cx in WINDOWS)
            center = 1 - min(1, abs(x-240)/254)
            value = .24 + .42*light + .24*center - max(0,y-183)/385 + tile[key]
            value += ((x*.23+y)%112 < 37) * .024
            if 86 <= y < 106:  # projecting counter lip casts a short shadow
                value -= (106-y)*.014
            value = round(min(1,max(0,value))*16)/16
            tone = mix(shade,middle,value/.47) if value<=.47 else mix(middle,warm,(value-.47)/.53)
            k = min(ox,27-ox) + min(oy,19-oy)
            shade_delta = 0
            if k <= 2: shade_delta = -.085
            elif k == 3: shade_delta = .03
            elif oy == 0 or ox == 0: shade_delta = -.09
            elif oy == 1 and 2 < ox < 24: shade_delta = .048
            elif ox == 1 and 4 < oy < 14: shade_delta = .02
            if shade_delta:
                tone = mix(tone, rgb("#f3e6b9") if shade_delta > 0 else rgb("#303f46"),
                           abs(shade_delta)*2)
            px[x,y] = tone
    d = ImageDraw.Draw(im)
    for _ in range(175):
        x,y = rnd.randrange(15,465), rnd.randrange(98,269)
        base = im.getpixel((x,y))
        d.line((x,y,x+rnd.randrange(1,5),y),fill=mix(base,rgb("#efe6b7"),rnd.uniform(.05,.12)))
    for x,y in ((54,136),(139,186),(299,111),(397,239),(74,250),(338,174)):
        base=im.getpixel((x,y))
        d.line((x,y,x+3,y-2,x+5,y-1,x+8,y-4),fill=mix(base,rgb("#384b4b"),.25))
        d.point((x+6,y-1),fill=mix(base,rgb("#f2d6a6"),.4))


def medallion(im):
    """Glazed floor mosaic bearing the works' bottle emblem."""
    cx,cy=240,171
    layer=Image.new("RGBA",SIZE)
    a=ImageDraw.Draw(layer)
    patina=(53,76,69,91)
    bright=(228,218,164,86)
    a.ellipse((cx-35,cy-23,cx+35,cy+23),outline=patina,width=2)
    a.ellipse((cx-32,cy-21,cx+32,cy+21),outline=bright,width=1)
    for i in range(24):
        angle=2*pi*i/24
        x,y=round(cx+29*cos(angle)),round(cy+18*sin(angle))
        a.point((x,y),fill=patina)
    # Back-to-back laurel branches and a swing-top soda bottle.
    for s in (-1,1):
        a.line([(cx+s*11,cy+11),(cx+s*21,cy+6),(cx+s*25,cy-1)],fill=patina)
        for j in range(4):
            x,y=cx+s*(13+3*j),cy+10-2*j
            a.polygon([(x,y),(x+s*3,y-5),(x+s*4,y-5),(x+s*3,y-1)],fill=patina)
        a.line((cx+s*12,cy-7,cx+s*17,cy-7),fill=bright)
        a.point((cx+s*21,cy-10),fill=bright)
    a.polygon([(cx-3,cy-14),(cx+3,cy-14),(cx+3,cy-8),(cx+6,cy-4),
               (cx+6,cy+8),(cx+4,cy+10),(cx-4,cy+10),(cx-6,cy+8),
               (cx-6,cy-4),(cx-3,cy-8)],fill=patina)
    a.line((cx-4,cy-14,cx+4,cy-14),fill=bright,width=2)
    a.line((cx-5,cy+1,cx+4,cy-3),fill=bright,width=2)
    for y in range(cy-24,cy+26):
        for x in range(cx-36,cx+37):
            if (x+11)%28==0 or (y+9)%20==0 or (x*17+y*31)%59==0:
                layer.putpixel((x,y),(0,0,0,0))
    im.paste(layer,mask=layer.getchannel("A"))


def drain(d, x, y, w=20):
    plate(d,x,y,w,5,"#758076","#999e84",1)
    for i in range(x+3,x+w-2,3):
        d.line((i,y+2,i-1,y+3), fill="#63736b")
    d.point((x+1,y+1),fill=CREAM)


def north_wall(d):
    d.rectangle((0,0,479,93),fill=DEEP)
    # Glazed subway-tile wall behind the counter, with hand-painted olive band.
    rng=Random(17)
    for row in range(5):
        for x in range(-22 if row%2 else 0,480,37):
            y=8+row*15
            fill=rng.choice(("#a9a58a","#aba891","#bab097","#a4a68d"))
            d.rectangle((x,y,x+35,y+13),fill=fill)
            d.line((x+1,y+1,x+33,y+1),fill="#c5bc9e")
            d.line((x+35,y+2,x+35,y+12),fill="#979882")
    for y,fill in ((7,"#5d7269"),(69,"#9f9d7e"),(70,"#d4c196"),(71,"#768879")):
        d.line((0,y,479,y),fill=fill)
    d.rectangle((0,0,479,7),fill=INK)
    d.rectangle((0,2,479,4),fill="#705955")
    d.line((0,2,479,2),fill="#ab8261")
    for x in range(10,480,34):
        d.rectangle((x,1,x+3,6),fill=PLUM)
        d.line((x+1,2,x+1,5),fill=CREAM)
    for x in (17,158,318,452):
        d.line((x+2,7,x+2,19,x+7,24),fill="#8b8878",width=2)
        d.line((x,7,x,18,x+6,24),fill=COPPER,width=2)
        d.line((x-1,9,x-1,16),fill=HONEY)


def little_bottle(d,x,y,glass,label):
    # x centre, y baseline. Bottle silhouette remains readable at 5x12.
    d.rectangle((x-2,y-7,x+2,y-1),fill=DARK)
    d.rectangle((x-1,y-9,x+1,y-6),fill=glass)
    d.line((x-1,y-10,x+1,y-10),fill=CREAM)
    d.rectangle((x-1,y-7,x+1,y-1),fill=glass)
    d.line((x-1,y-4,x+1,y-4),fill=label)
    d.point((x-1,y-6),fill=IVORY)
    d.line((x-2,y,x+2,y),fill=DEEP)


def display_fridge(d):
    x,y=18,17
    plate(d,x+2,y+2,35,56,DEEP,IRON,3)
    plate(d,x,y,35,56,PLUM,RED,3)
    d.line((x+4,y+1,x+29,y+1),fill="#dfac78")
    plate(d,x+4,y+4,27,10,COPPER,IVORY,2)
    # A clinking pair of tiny soda bottles serves as its pictorial sign.
    d.line((x+10,y+7,x+13,y+10),fill=RED,width=2)
    d.line((x+22,y+7,x+19,y+10),fill=RED,width=2)
    d.point([(x+16,y+6),(x+17,y+8),(x+14,y+5)], fill=BRASS)
    plate(d,x+3,y+15,26,31,SHADOW_RED,DARK,1)
    d.rectangle((x+5,y+17,x+26,y+43),fill="#617d70")
    for row in (0,1):
        for col in range(3):
            little_bottle(d,x+8+col*7,y+29+13*row,("#6ca396",BRASS,RED)[(col+row)%3],CREAM)
        d.line((x+5,y+30+13*row,x+26,y+30+13*row),fill=GLASS)
    d.line((x+31,y+24,x+31,y+35),fill=CREAM,width=2)
    for yy in (48,50,52):
        d.line((x+7,y+yy,x+26,y+yy),fill=SHADOW_RED)


def pressure_column(d):
    x=171
    d.line((x+3,7,x+3,76),fill="#8d8975",width=7)
    d.line((x,7,x,76),fill=PLUM,width=6)
    d.line((x,7,x,76),fill=COPPER,width=4)
    d.line((x-1,8,x-1,73),fill=HONEY)
    for y in (15,44,62):
        plate(d,x-5,y,11,5,PLUM,BRASS,1)
        d.line((x-3,y+1,x+2,y+1),fill=IVORY)
    d.ellipse((x-12,19,x+12,42),fill=PLUM,outline=INK)
    d.ellipse((x-10,19,x+10,39),fill=BRASS,outline=IRON)
    d.ellipse((x-8,21,x+8,37),fill=IVORY,outline=PLUM)
    for a in (-145,-110,-75,-40,-5):
        t=a*pi/180
        d.point((x+round(6*cos(t)),29+round(6*sin(t))),fill=DEEP)
    d.line((x,30,x+4,25),fill=RED)
    d.point((x,30),fill=PLUM)
    d.rectangle((x+10,50,x+15,67),fill=DARK)
    d.rectangle((x+11,52,x+13,61),fill="#d7b979")
    d.line((x+11,56,x+13,56),fill=RED)


def enamel_poster(d):
    x,y=292,24
    d.polygon([(x+2,y),(x+30,y+1),(x+29,y+44),(x,y+42)],fill="#7d8274")
    plate(d,x,y,28,43,PLUM,RED,3)
    d.rectangle((x+2,y+2,x+25,y+40),outline=CREAM)
    d.polygon([(x+3,y+31),(x+25,y+22),(x+25,y+37),(x+3,y+37)],fill="#dcaf78")
    # Cream screenprint of a diagonal swing-top bottle and four fizz stars.
    d.polygon([(x+18,y+7),(x+21,y+9),(x+18,y+14),(x+18,y+18),
               (x+12,y+29),(x+7,y+27),(x+7,y+25),(x+13,y+15),(x+15,y+14)],fill=IVORY)
    d.line((x+11,y+20,x+16,y+22),fill=IRON,width=2)
    d.line((x+19,y+7,x+21,y+8),fill=IRON,width=2)
    for xx,yy in ((7,10),(11,6),(22,18),(6,22)):
        d.point((x+xx,y+yy),fill=IVORY)
    for j in (0,4,8,12):
        d.line((x+5+j,y+35,x+7+j,y+35),fill=RED)
    for sx,sy in ((x+3,y+3),(x+24,y+3),(x+3,y+39),(x+24,y+39)):
        d.point((sx,sy),fill=DARK)


def crate_shelves(d):
    x=435
    plate(d,x-7,20,35,52,DARK,"#596c61",2)
    for y in (42,65):
        d.rectangle((x-5,y-17,x+25,y),fill=DEEP)
        for j in range(5):
            little_bottle(d,x-2+j*5,y-3,(BRASS,"#669a83")[j%2],CREAM)
        d.rectangle((x-6,y-6,x+26,y),fill="#946e56",outline=PLUM)
        d.line((x-4,y-5,x+24,y-5),fill=BRASS)
        for k in (0,8,16,24):
            d.line((x-3+k,y-4,x-3+k,y-1),fill="#b68a62")
        d.rectangle((x+6,y-4,x+14,y-2),fill="#5d5750")
    d.line((x-5,21,x+25,21),fill=BRASS)


DIGITS = (
    ("010","110","010","010","111"),
    ("110","001","010","100","111"),
    ("110","001","010","001","110"),
)


def window(d,cx,n):
    x=cx-48
    # Bent metal window frame; portraits sit in the central 48x48 aperture.
    plate(d,x+2,21,97,59,DEEP,"#706d60",3)
    plate(d,x,19,96,59,INK,IRON,3)
    plate(d,x+3,22,90,53,IVORY,DEEP,2)
    d.rectangle((cx-40,25,cx+40,74),fill=PLUM,outline="#a59075")
    d.rectangle((cx-39,26,cx+39,74),fill="#37494c")
    d.rectangle((cx-39,29,cx+39,71),fill="#405651")
    d.polygon([(cx-39,35),(cx-14,29),(cx+23,29),(cx-39,52)],fill="#4c6459")
    d.polygon([(cx+5,61),(cx+39,48),(cx+39,53),(cx+12,63)],fill="#485e55")
    for sign in (-1,1):
        edge=cx+sign*37
        d.line((edge,32,edge,70),fill="#708172")
        for k in (0,1):
            bx=cx+sign*(35-k*6)
            little_bottle(d,bx,69,("#6b8773","#a28962")[k],"#a2a489")
        d.line((min(edge,cx+sign*27),70,max(edge,cx+sign*27),70),fill="#808977")
    d.line((cx-39,26,cx+38,26),fill="#222f36",width=2)
    for bx in (cx-44,cx+44):
        d.line((bx,30,bx,70),fill="#8b9a82")
        for by in (32,65): bolt(d,bx-1,by)
    # Striped oilcloth awning with a scalloped hem; trimmed to leave clear eyes.
    awning=(("#ac6550","#ca8961","#e7c78d"),
            ("#96734e","#c89058","#edce94"),
            ("#97574e","#c37860","#e6c192"))[n]
    d.polygon([(x-2,12),(x+95,12),(x+100,24),(x-5,24)],fill=PLUM)
    for j in range(11):
        a,b=x+1+j*8,x+1+(j+1)*8
        f=(awning[0],awning[2])[j%2]
        d.polygon([(a,13),(b,13),(b+2,22),(a-1,22)],fill=f)
        d.line((a+1,14,b-2,14),fill=(awning[1],IVORY)[j%2])
        d.rectangle((a-1,22,b,24),fill=f)
        d.line((a,25,b-2,25),fill=(SHADOW_RED,"#ad9577")[j%2])
    d.line((x,12,x+95,12),fill=INK)
    # Small number tag in the bill of the awning.
    plate(d,cx-7,12,15,13,PLUM,CREAM,2)
    for iy,row in enumerate(DIGITS[n]):
        for ix,v in enumerate(row):
            if v=="1": d.point((cx-1+ix,16+iy),fill=PLUM)
    d.rectangle((cx-44,74,cx+44,79),fill=INK)
    d.rectangle((cx-45,74,cx+45,75),fill=IVORY)
    d.rectangle((cx-44,76,cx+44,77),fill=BRASS)
    d.line((cx-33,73,cx-18,73),fill=GLASS)
    # Cast-iron front; between foot rail and counter is a shadowed open space.
    d.rectangle((cx-46,80,cx+46,89),fill=DARK)
    d.line((cx-44,81,cx+44,81),fill=IRON)
    for b in (cx-42,cx-16,cx+16,cx+42):
        d.rectangle((b,81,b+2,89),fill="#52665e")
        d.line((b,81,b,86),fill=SAGE)
    d.line((cx-41,88,cx+42,88),fill="#202e33")
    # Twin bulbs in a shallow pendant.
    d.line((cx-13,6,cx-13,8),fill=BRASS)
    d.line((cx+13,6,cx+13,8),fill=BRASS)
    plate(d,cx-17,6,35,6,INK,"#8f785d",2)
    d.line((cx-14,9,cx+14,9), fill=HONEY,width=2)
    d.line((cx-10,9,cx+10,9),fill=IVORY)


def bumper(d,x,hand):
    for start,end,color in ((0,12,INK),(1,10,DEEP),(3,8,IRON),(6,10,"#718576")):
        a,b=sorted((x+start*hand,x+end*hand))
        d.rectangle((a,86,b,276),fill=color)
    for y in range(89,273,28):
        a,b=sorted((x+3*hand,x+11*hand))
        d.rectangle((a,y,b,y+4),fill=DARK)
        d.line((a,y,b,y),fill=GLASS)
        bolt(d,x+5*hand,y+2)
    inner=x+12*hand
    d.line((inner,95,inner,268),fill="#b4ae83")
    for y in (125,151,182,207,240):
        d.line((inner,y,inner,y+8),fill="#d2be87")
    # A small cast iron sounder attached to the wall; its footprint stays outside.
    for y in (118,252):
        a,b=sorted((x+hand,x+7*hand))
        d.rectangle((a,y,b,y+10),fill=PLUM)
        for yy in (y+2,y+5,y+8): d.line((a+1,yy,b-1,yy),fill=BRASS)


def lever_socket(d,x):
    y=220
    plate(d,x-12,y-9,25,19,"#52635e","#778573",3)
    plate(d,x-10,y-7,21,14,"#4e635f","#9a9a79",2)
    d.line((x-8,y-6,x+7,y-6),fill="#bfba8f")
    plate(d,x-4,y-6,9,12,IRON,DEEP,2)
    for dx,dy in ((-8,-5),(7,-5),(-8,4),(7,4)):
        d.point((x+dx,y+dy),fill=CREAM)
    # Floor stencil tabs leave space above socket for moving lever.
    for side in (-1,1):
        for j in (-1,0,1):
            d.line((x+side*15,y+j*4,x+side*17,y+j*4-1),fill="#ab9e73")


def entry(d):
    d.rectangle((0,274,479,287),fill=DARK)
    d.line((1,274,478,274),fill=INK,width=2)
    d.line((13,273,467,273),fill="#a99e7f")
    for x in range(14,478,26):
        d.rectangle((x,276,x+22,283),fill=IRON)
        d.line((x,277,x+21,277),fill=SAGE)
        d.line((x+1,282,x+20,282),fill=DEEP)
        d.point((x+3,279),fill=CREAM)
    # Door is flush with the walkable floor. At y260 the player can clock out.
    d.polygon([(208,259),(271,259),(277,272),(203,272)],fill="#637671")
    for y in range(261,271,3):
        d.line((209-(y-260)//4,y,269+(y-260)//4,y),fill="#95a18d")
        for x in range(213,269,7):
            d.line((x,y+1,x+1,y+1),fill="#576f6a")
    d.line((205,273,274,273),fill=CREAM)
    d.rectangle((205,275,274,287),fill="#344e50")
    d.line((208,279,271,279),fill="#718b77")
    for side in (-1,1):
        x=240+side*37
        plate(d,x-4,265,9,20,INK,IRON,2)
        d.line((x-2,268,x+2,268),fill=HONEY)
        bolt(d,x-1,280)
    for y in (252,248):
        d.line((236,y-2,240,y,244,y-2),fill="#a2a487")


def floor_wear(im):
    """Flush inset service routes, worn paint, wet tracks and a shift receipt."""
    d=ImageDraw.Draw(im)
    for x,side in ((23,1),(456,-1)):
        for y in range(105,259,12):
            tone=mix(im.getpixel((x,y)),rgb("#d5bd85"),.38)
            d.line((x,y,x,y+5),fill=tone)
        # Recessed pressure line from each lever follows the inside wall.
        x0=x+2*side
        for y in range(233,268,4):
            d.line((x0,y,x0,y+2),fill=mix(im.getpixel((x0,y)),rgb("#4b6767"),.35))
        for xx in range(6):
            d.point((x0+side*xx,232-xx),fill="#8c927d")
    # Marks left by the kitchen cart. Both trails cross grout so they read as
    # surface scuffs, with no implication of an obstacle in the walkable room.
    for x,y in ((90,124),(392,114),(97,243)):
        for shift in (0,7):
            for j in range(4):
                sx,sy=x+shift+2*j,y+3*j
                c=mix(im.getpixel((sx,sy)),rgb("#526b69"),.21)
                d.line((sx,sy,sx+1,sy+2),fill=c)
    slip=[(150,96),(159,98),(157,107),(148,105)]
    d.polygon([(x+1,y+1) for x,y in slip],fill="#68786b")
    d.polygon(slip,fill="#c7b894")
    d.line((150,97,157,99),fill="#ded0a8")
    d.line((151,100,155,101),fill="#938b73")
    d.point((151,103),fill="#9f806d")
    # Cobalt fizz taps painted on two of the counter-front service panels.
    for x in (39,442):
        d.line((x-4,82,x+4,82,x+4,85),fill="#77958a")
        d.line((x,84,x,86),fill="#9aaa8c")
        d.point((x,89),fill="#88a098")


def paint():
    im=Image.new("RGB",SIZE,DARK)
    floor_tiles(im)
    medallion(im)
    d=ImageDraw.Draw(im)
    for x,y in ((21,157),(71,253),(388,126),(383,250)):
        drain(d,x,y)
    for cx in WINDOWS:
        # Matte floor markers show the centre of each delivery hatch.
        for s in (-1,1):
            x=cx+s*27
            d.line((x,99,x,103,x-s*5,103),fill="#a99e7c")
        d.line((cx-3,104,cx,102,cx+3,104),fill="#b2a982")
    north_wall(d)
    d.rectangle((0,77,479,91),fill=DEEP)
    d.line((0,77,479,77),fill=CREAM)
    d.line((0,80,479,80),fill=IRON)
    d.line((0,90,479,90),fill=INK,width=3)
    display_fridge(d)
    pressure_column(d)
    enamel_poster(d)
    crate_shelves(d)
    for i,cx in enumerate(WINDOWS): window(d,cx,i)
    bumper(d,0,1)
    bumper(d,479,-1)
    floor_wear(im)
    for x in (46,434): lever_socket(d,x)
    entry(d)
    return im


if __name__ == "__main__":
    DEST.parent.mkdir(parents=True,exist_ok=True)
    paint().save(DEST,optimize=True)
