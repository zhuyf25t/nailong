"""Native-resolution cut-paper and relief-print plates for nights six to eight.

Run with Python 3 and Pillow. All paths, stains, hatching and compositions are
drawn here; the actors come from this project's existing Night Shift cast.
"""
from pathlib import Path
from math import cos, sin, pi
from random import Random
from PIL import Image, ImageDraw, ImageChops

HERE = Path(__file__).resolve().parent
ART = HERE.parents[1] / "game/assets/night"
OUT = ART / "horror"
NEAREST = Image.Resampling.NEAREST
BLACK = "#211c27"
COAL = "#332834"
OIL = "#50404a"
IRON = "#69706c"
JADE = "#899d88"
PAPER = "#d6c19b"
LIGHT = "#fbe7b5"
SKIN = "#e9bb4b"
SUN = "#ffe190"
OCHRE = "#b47b3d"
BRUISE = "#7d493e"
CLOT = "#592133"
BLOOD = "#a52e41"
SCARLET = "#e64a4e"
RAW = "#fa8782"


class Block:
    def __init__(self, size, bg=None):
        self.im = Image.new("RGBA", size, bg or (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.im)

    def poly(self, color, points, edge=None):
        self.d.polygon(points, fill=color, outline=edge)

    def line(self, color, points, width=1):
        self.d.line(points, fill=color, width=width)

    def rect(self, color, box):
        self.d.rectangle(box, fill=color)

    def oval(self, color, box, edge=None):
        self.d.ellipse(box, fill=color, outline=edge)

    def specks(self, color, box, count, seed, width=1):
        rng = Random(seed)
        x0,y0,x1,y1=box
        for _ in range(count):
            x,y=rng.randint(x0,x1),rng.randint(y0,y1)
            self.line(color, [(x,y),(x+rng.randrange(width), y)])


def wound(p, path, scale=1):
    """A gaping yellow rim, clotted channel, wet exposed edge and staple knots."""
    p.line(BRUISE, [(x,y+2*scale) for x,y in path], 6*scale)
    p.line(CLOT, path, 5*scale)
    p.line(BLOOD, [(x,y+scale) for x,y in path], 3*scale)
    p.line(SCARLET, [(x,y+2*scale) for x,y in path], scale)
    for x,y in path[1:-1:2]:
        p.line(BLACK,[(x-2*scale,y-3*scale),(x+scale,y+3*scale)],scale)
        p.line(PAPER,[(x-scale,y-2*scale),(x,y)],scale)


def bloodtrail(p,x,y,length,lean=0):
    p.poly(CLOT,[(x-2,y),(x+3,y-1),(x+2+lean,y+length-2),(x+lean,y+length+1)])
    p.line(SCARLET,[(x+1,y),(x+lean,y+length-2)])
    p.oval(BLOOD,(x-1+lean,y+length-2,x+2+lean,y+length+1))
    p.line(RAW,[(x+lean,y+length-1),(x+lean,y+length)])


def traced_hand(p, mode):
    # Wrist is fixed in the brick seam. Each frame splays the fingers further.
    shift = (5,2,0)[mode]
    hand = Block((32,64))
    hand.poly(OCHRE,[(13,52),(12,44),(9,38),(8,30),(6,27),(4,24),(3,21),(4,20),
              (6,20),(10,25),(10,18),(9,11),(10,8),(12,8),(14,17),(14,9),
              (15,3),(18,3),(18,11),(19,16),(20,8),(22,6),(24,7),(23,13),
              (23,21),(25,17),(28,15),(30,17),(28,20),(27,26),(23,32),
              (22,39),(23,49),(26,53),(24,59),(16,59)],BLACK)
    hand.poly(SKIN,[(10,29),(8,25),(6,24),(10,26),(12,27),(11,16),(11,11),(12,12),
              (14,22),(16,21),(16,8),(17,5),(17,17),(18,22),(20,21),(21,12),
              (23,9),(22,20),(22,25),(25,22),(28,18),(26,24),(23,28),(22,32),
              (19,37),(19,45),(16,45),(14,38)])
    hand.line(SUN,[(11,12),(12,18),(13,21)])
    hand.line(SUN,[(16,8),(16,16)])
    hand.line(SUN,[(20,23),(22,22),(23,22)])
    hand.line(BRUISE,[(12,28),(15,30),(18,27),(20,26)])
    wound(hand,[(13,38),(14,34),(17,32),(18,28),(21,26)])
    bloodtrail(hand,15,35,13,1)
    hand.line(RAW,[(19,31),(20,32),(19,35)])
    hand.poly(BLOOD,[(10,8),(12,8),(12,12),(11,13),(10,11)])
    hand.line(SCARLET,[(15,4),(17,4),(17,6)])
    hand.line(BLOOD,[(26,17),(28,16),(29,17)],2)
    p.im.alpha_composite(hand.im,(0,shift))
    # Individual broken brick faces in front of the wrist.
    p.poly(BLACK,[(0,54),(4,50),(11,48),(17,50),(20,48),(29,51),(31,55),(31,60),
                  (23,62),(5,61),(0,58)])
    p.poly(IRON,[(0,53),(7,50),(14,51),(12,55),(5,56),(0,55)])
    p.poly(JADE,[(0,53),(8,50),(14,51),(12,52),(5,53)])
    p.poly(OIL,[(0,55),(5,56),(12,54),(11,58),(3,60),(0,58)])
    p.poly(IRON,[(21,52),(26,49),(31,51),(31,56),(28,58),(21,56)])
    p.line(PAPER,[(22,52),(25,50),(29,50)])
    p.poly(BLOOD,[(9,55),(13,52),(16,52),(17,54),(15,57),(10,59),(5,59)])
    p.line(SCARLET,[(11,55),(14,54),(17,54)])
    p.line(OCHRE,[(18,56),(21,57)])


def print_mark():
    p=Block((34,30))
    outline=[(11,15),(12,12),(15,11),(19,12),(21,15),(22,19),(20,23),
             (18,24),(17,27),(14,26),(12,22),(9,21),(7,18),(8,16)]
    p.poly(BLOOD,outline)
    for a,b,w in [((10,17),(3,11),3),((12,12),(8,4),3),((15,10),(14,1),3),
                  ((19,11),(22,3),3),((22,14),(28,9),3)]:
        p.line(CLOT,[a,b],w+1);p.line(SCARLET,[a,b],w-1)
    p.line(SCARLET,[(10,17),(12,19),(14,16),(18,15)],2)
    p.line(CLOT,[(12,22),(17,20),(19,16)])
    p.line(RAW,[(16,13),(18,13),(19,14)])
    p.oval(BLOOD,(24,25,26,26));p.oval(SCARLET,(5,19,6,20))
    # Dry gaps in lifted finger pads let the tile show through the print.
    for xy in [(8,6),(15,5),(21,7),(25,12),(10,17),(12,18),(16,22),(14,24)]:
        p.d.point(xy,fill=(0,0,0,0))
    return p.im


def pane(frame):
    p=Block((64,56))
    # Jagged glass remains translucent and leaves the majority of the window open.
    rays=[[(33,27),(23,20),(18,20),(8,13),(4,12)],
          [(29,25),(25,12),(22,9),(23,2)],[(38,23),(47,14),(53,13),(59,5)],
          [(42,31),(51,33),(54,31),(62,35)],[(28,32),(22,38),(17,38),(9,47)],
          [(35,34),(39,43),(39,50),(42,54)]]
    for index,points in enumerate(rays):
        pts=points[:(2+frame if frame<2 else len(points))]
        p.line("#637d7b",[(x+1,y+1) for x,y in pts])
        p.line("#d1e6cc",pts)
    if frame==0:
        p.poly("#78685e",[(18,24),(26,26),(36,26),(46,22),(42,27),(32,30),(23,29)])
        p.line("#e1bd91",[(21,25),(31,27),(40,25)])
        return p.im
    edge=[(12,22),(20,21),(25,24),(35,25),(42,24),(50,20),
          (52,22),(49,28),(47,34),(42,39),(36,41),(28,41),(21,37),(18,31)]
    p.poly(BLACK,edge)
    p.poly(CLOT,[(14,23),(24,27),(34,28),(43,26),(50,22),(47,32),
                  (41,37),(37,39),(29,40),(23,36),(20,30)])
    p.line(SCARLET,[(15,23),(21,25),(26,27),(34,28),(43,26),(49,23)],2)
    p.line(BLOOD,[(21,33),(25,36),(32,38),(40,35),(46,30)],3)
    for x,y in ((23,28),(28,29),(34,29),(40,28),(44,26)):
        p.poly(PAPER,[(x,y),(x+3,y),(x+1,y+3)])
    p.line(RAW,[(24,35),(29,37),(34,37)])
    if frame==2:
        # Ribbons of torn gum push through to the near side of the pane.
        for x,y,h in [(21,31,11),(31,38,9),(44,31,13)]:
            bloodtrail(p,x,y,h,2)
        p.poly(BLOOD,[(32,38),(35,35),(38,35),(40,38),(38,44),(32,47),(29,47),(33,43)])
        p.line(RAW,[(36,36),(38,37),(36,42),(32,45)])
        for tri in [[(9,22),(15,22),(13,28)],[(44,19),(51,13),(50,21)],[(23,42),(22,48),(18,46)]]:
            p.poly(IRON,tri,LIGHT)
        p.oval(SCARLET,(26,46,28,48))
    return p.im


def screen():
    # Ink, rust and old ivory. Broad diagonals are hand-carved inside the panel.
    p=Block((84,40))
    p.poly(BLACK,[(0,9),(8,3),(79,3),(83,7),(83,32),(77,36),(76,39),
                  (72,39),(71,36),(12,36),(10,39),(6,39),(6,35),(0,32)])
    p.poly("#cbbf99",[(3,9),(9,5),(78,5),(80,7),(76,10),(10,10)])
    p.rect("#a1474b",(5,12,78,31));p.rect(BLACK,(7,14,76,29))
    for x in range(11,75,8):
        p.poly("#d9cba5",[(x,15),(x+4,15),(x-2,26),(x-6,28)])
    p.poly(BLACK,[(24,19),(37,16),(46,18),(54,16),(62,18),(52,23),(38,24)])
    p.line("#c14a4e",[(27,20),(37,18),(47,20),(56,17)],2)
    p.line("#c14a4e",[(34,22),(42,24),(48,22)])
    p.line("#d9cba5",[(11,33),(70,33)])
    for x in (4,78):
        p.rect("#d9cba5",(x,12,x+1,13));p.rect("#d9cba5",(x-1,29,x,30))
    return p.im


def sheet(images):
    w,h=images[0].size
    result=Image.new("RGBA",(w*len(images),h))
    for i,img in enumerate(images):
        result.alpha_composite(img,(w*i,0))
    return result


def bolt(p,x,y):
    p.oval(BLACK,(x-2,y-2,x+2,y+2))
    p.rect(JADE,(x-1,y-1,x+1,y+1))
    p.line(COAL,[(x-1,y+1),(x+1,y-1)])


def dial(p,x,y,r):
    p.oval(BLACK,(x-r-2,y-r-2,x+r+2,y+r+2))
    p.oval(JADE,(x-r,y-r,x+r,y+r))
    p.oval(PAPER,(x-r+2,y-r+2,x+r-2,y+r-2),IRON)
    for i in range(12):
        a=pi*i/6
        p.line(COAL,[(round(x+(r-4)*sin(a)),round(y-(r-4)*cos(a))),
                     (round(x+(r-6)*sin(a)),round(y-(r-6)*cos(a)))])
    p.line(BLACK,[(x-4,y-5),(x,y),(x+6,y-8)],2)
    p.oval(BLOOD,(x-2,y-2,x+1,y+1))


def ticket(p, corners, stain):
    p.poly(PAPER,corners,BLACK)
    x,y=corners[0]
    # Rule, registration grid and time-punched holes.
    p.line(IRON,[(x+4,y+5),(x+30,y+6)])
    for ty in range(y+10, min(p.im.height-4,y+40),4):
        p.line("#ae9a82",[(x+3,ty),(x+29,ty+1)])
        p.rect(INK_RED,(x+1,ty-2,x+2,ty-1))
    for tx in (x+7,x+16,x+24):
        p.line("#b49b7f",[(tx,y+9),(tx-3,y+33)])
    if stain:
        p.poly(BLOOD,[(x+21,y),(x+34,y+1),(x+32,y+6),(x+29,y+8),
                     (x+28,y+17*stain),(x+25,y+12*stain),(x+24,y+15*stain),
                     (x+23,y+9),(x+18,y+6)])
        p.line(SCARLET,[(x+20,y+3),(x+24,y+5),(x+26,y+10)])
        p.oval(CLOT,(x+14,y+8,x+17,y+11))


INK_RED = "#68474d"


def press(frame):
    p=Block((192,104), BLACK)
    p.rect(COAL,(1,2,190,101))
    p.rect("#584a4a",(4,5,187,96))
    # Cast-iron register fills the left of the frame. Hatched iron and the dial
    # identify the machine even after the platen comes down.
    p.poly(IRON,[(4,9),(9,5),(61,5),(66,11),(66,91),(60,98),(4,98)],BLACK)
    p.rect("#3e4848",(7,11,61,87))
    p.rect("#58635c",(12,15,55,53))
    dial(p,33,34,16)
    for x in (10,59):
        for y in (10,88): bolt(p,x,y)
    p.rect(BLACK,(10,56,57,67));p.rect(IRON,(14,57,53,59))
    ticket(p,[(19,62),(54,63),(63,100),(14,103)],frame)
    for y in (74,78,82):
        p.rect(INK_RED,(25,y,31,y))
    p.rect("#8c7968",(69,7,176,92));p.rect(BLACK,(75,11,172,90))
    # Isolated soft silhouette and green eyes are the playable yellow character.
    actor=Image.open(ART/"cast/dragon_portrait.png").convert("RGBA")
    actor=actor.resize((85+frame*2,85-frame),NEAREST)
    p.im.alpha_composite(actor,(81-frame,11+frame))
    # Counterweight compresses the right temple. A long split and black stitches
    # stay attached to the actor and can be traced to the printed timecard.
    xx,yy=143-frame,31+frame
    wound(p,[(xx+9,yy-9),(xx+5,yy-4),(xx+7,yy),(xx,yy+5),(xx-3,yy+8),
             (xx-2,yy+11),(xx-6,yy+15)])
    bloodtrail(p,xx-5,yy+14,13+frame*5,-3)
    p.line("#805634",[(110,37+frame),(115,35),(117,36)])
    p.oval(BLACK,(115,49+frame,127,55+2*frame))
    p.line(RAW,[(117,54+2*frame),(122,53+2*frame),(125,54+2*frame)])
    p.line(SUN,[(103,43),(102,46),(103,47)])
    # Tensioned threads cross the air between the cut and the machine.
    for i in range(2+frame):
        p.line(BLOOD,[(146,30+i*3),(151+i,38+i*3),(162,33+i*2)])
        p.line(RAW,[(148,32+i*3),(150,35+i*3)])
    p.poly(OIL,[(62,6),(185,6),(186,18),(175,19),(166,32+frame*3),
                (159,34+frame*3),(153,32+frame*3),(150,25+frame*3),
                (154,19),(65,19)],BLACK)
    p.line(JADE,[(64,7),(180,7),(184,9)],2)
    p.poly(IRON,[(152,23+frame*3),(165,20+frame*3),(169,21+frame*3),
                  (161,31+frame*3),(156,33+frame*3),(153,30+frame*3)])
    p.line(PAPER,[(153,24+frame*3),(164,21+frame*3)])
    p.oval(CLOT,(155,29+frame*3,161,35+frame*3))
    p.line(SCARLET,[(155,31+frame*3),(158,33+frame*3),(160,32+frame*3)])
    for x in range(80,144,8):
        p.line("#776557",[(x,12),(x+2,13),(x+1,14)])
    p.poly(COAL,[(66,87),(160,86),(173,80),(190,83),(190,98),(67,98)],BLACK)
    p.line(IRON,[(67,87),(156,87),(175,81),(188,84)],2)
    p.poly(CLOT,[(65,85),(90,83),(103,75),(108,76),(99,83),(79,89),(54,89),
                 (50,82),(53,78),(58,79),(60,85)])
    p.line(SCARLET,[(53,81),(61,86),(77,86),(93,82)])
    p.rect(COAL,(3,0,188,2));p.rect(COAL,(1,101,189,103))
    return p.im


def hatch(p, points, ink, step, slope=-0.75, seed=0):
    m=Image.new("L",p.im.size);ImageDraw.Draw(m).polygon(points,fill=255)
    strokes=Image.new("L",p.im.size)
    d=ImageDraw.Draw(strokes);r=Random(seed)
    w,h=p.im.size
    for x in range(-w,2*w,step):
        end=r.randrange(1,3)
        d.line([(x,0),(x+round(h*slope),h)],fill=255,width=end)
    p.im.paste(ink,(0,0,w,h),ImageChops.multiply(strokes,m))


def back_actor(kind, h):
    if kind=="dragon":
        actor=Image.open(ART/"cast/dragon.png").convert("RGBA").crop((0,80,32,120))
        actor=actor.crop(actor.getbbox())
        return actor.resize((round(h*actor.width/actor.height),h),NEAREST)
    # Back view of the two factory partners, feet turned toward the dawn.
    p=Block((29,34))
    if kind=="frog":
        shape=[(3,29),(3,23),(6,17),(8,10),(10,7),(10,4),(13,3),(16,5),
               (18,2),(21,3),(22,6),(24,12),(26,19),(27,27),(24,31),(8,32)]
    else:
        shape=[(3,27),(3,21),(6,14),(9,8),(13,4),(16,4),(20,7),
               (23,13),(26,22),(25,28),(21,31),(9,31)]
    p.poly(OCHRE,shape,BLACK)
    p.poly(SKIN,[(5,23),(8,13),(12,7),(16,6),(20,8),(22,14),(23,22),
                 (21,26),(15,28),(9,27)])
    p.line(SUN,[(7,17),(9,12),(13,8),(15,7)])
    p.oval(BRUISE,(4,24,7,29));p.oval(BRUISE,(23,22,26,27))
    p.rect(INK_RED,(9,30,13,32));p.rect(INK_RED,(18,30,22,32))
    return p.im.resize((round(h*29/34),h),NEAREST)


def dawn_ending():
    p=Block((320,180),"#312f34")
    # Seen from inside the old packing shop: the open doorway is the aperture.
    room=[(0,0),(319,0),(319,180),(0,180)]
    hatch(p,room,"#40383c",8)
    p.poly("#59615c",[(0,4),(75,25),(75,100),(0,146)])
    p.poly("#44464b",[(319,1),(258,24),(257,101),(319,146)])
    for y in (34,53,74,99):
        p.line(COAL,[(0,y),(74,round(26+y*.55))],2)
    for x,y in ((15,46),(47,58),(31,82),(61,41)):
        p.line("#7e7c69",[(x,y),(x,y+8)])
    # Exterior skyline, hazy vapor and a rising sun.
    p.rect("#d7c69b",(80,14,256,108))
    p.rect("#e4c693",(80,40,256,108));p.rect("#e6ad7d",(80,68,256,108))
    p.oval("#fff0b8",(157,26,222,92))
    for y,x1,x2 in ((37,85,150),(47,113,168),(65,191,255),(53,82,120),(74,142,199)):
        p.line("#f0d9a7",[(x1,y),(x2,y)],2)
    p.poly("#a18e78",[(80,79),(98,78),(98,68),(104,67),(108,72),(111,71),
                       (111,63),(116,63),(116,78),(130,78),(134,71),(143,71),(147,76),
                       (172,76),(172,65),(177,64),(181,75),(188,74),(196,67),
                       (204,67),(207,74),(226,75),(227,58),(231,54),(234,56),(234,73),
                       (248,64),(256,65),(256,108),(80,108)])
    p.rect("#cbb491",(80,86,256,108))
    # Open sliding doors with warning bands, lock compartment and chain.
    p.rect(COAL,(71,9,77,111));p.rect(IRON,(77,8,80,107));p.rect(PAPER,(80,12,82,102))
    p.rect(BLACK,(256,8,267,113));p.rect(IRON,(254,13,257,107))
    p.rect(COAL,(66,7,268,13));p.rect(JADE,(76,12,253,13))
    for y in range(19,98,10): p.line("#a18e76",[(72,y),(75,y+3)],2)
    p.rect("#87645a",(26,47,47,73));p.rect(COAL,(28,49,45,70))
    dial(p,36,57,7)
    p.poly("#858577",[(0,145),(78,101),(255,101),(319,143),(319,180),(0,180)])
    p.poly("#c3b595",[(82,101),(253,101),(319,154),(319,179),(0,179),(0,166)])
    p.poly("#dcc89d",[(94,102),(232,102),(263,119),(53,126)])
    for x in (-60,33,97,163,240,353,440):
        p.line("#827c70",[(169+(x-169)*.16,101),(x,179)])
    for y in (109,123,147,174):
        p.line("#938a77",[(0,y+3),(319,y-4)])
    # Three long shadows tie the characters to the light axis.
    for x,y,w in [(129,109,7),(172,102,6),(202,102,5)]:
        p.poly("#9f947d",[(x-w,y),(x+w,y),(x-25,134),(x-34,135)])
    for kind,x,y,h in [("egg",199,80,21),("frog",160,78,25),("dragon",114,74,35)]:
        p.im.alpha_composite(back_actor(kind,h),(x,y))
    # The abandoned timekeeper is the dark accent opposite the open dawn.
    p.poly(BLACK, [(264,40),(313,29),(313,100),(264,103)])
    p.poly(IRON, [(266,40),(311,31),(311,96),(266,101)])
    p.poly("#3b4142", [(269,45),(308,38),(308,91),(269,96)])
    p.poly("#454a48", [(270,60),(307,47),(307,56),(270,74)])
    p.line(PAPER,[(266,41),(309,33)])
    p.line(IRON,[(271,72),(307,64)])
    p.line(OCHRE, [(278,62),(279,60),(281,59)])
    p.line(OCHRE, [(290,58),(291,56),(294,56)])
    p.line(CLOT,[(275,66),(280,70),(287,70),(296,63),(300,58)],3)
    p.line("#d8a892",[(277,66),(282,67),(288,66),(297,60)])
    p.im.alpha_composite(print_mark().resize((25,23),NEAREST),(287,67))
    p.line(BLOOD,[(299,83),(298,92),(297,94)])
    p.line("#928a77",[(266,102),(313,96)],2)
    # The foreman's desk is unoccupied; a punched final ticket curls forward.
    p.poly(COAL,[(275,110),(306,105),(318,111),(318,115),(284,120),(273,116)])
    p.poly(PAPER,[(284,106),(296,104),(304,110),(292,113)])
    for i in range(3):
        p.line("#816f68",[(287+i*2,107+i),(295+i*2,106+i)])
    p.poly("#aba187",[(28,160),(34,157),(43,157),(37,160),(33,162)])
    p.poly("#b5a88b",[(44,153),(48,150),(54,151),(49,154)])
    return p.im


def ring_frog(frame):
    p=Block((56,56))
    # Three physical amber signal lamps sit in a metal cradle at her feet.
    p.oval(BLACK,(2,30,53,52))
    p.oval("#52615c",(3,29,52,49))
    p.oval("#7c9180",(4,28,51,47))
    p.oval("#384542",(6,29,49,45))
    p.line("#9ba18b",[(5,37),(7,34),(11,32)])
    for x,y in ((7,42),(46,42),(26,47)):
        p.oval(BLACK,(x-3,y-2,x+3,y+2))
        p.oval("#bc9253",(x-2,y-1,x+2,y+1))
        p.line(("#ffe4a0","#dcb67f","#c3ad8b")[frame],[(x-1,y-1),(x+1,y-1)])
    actor=Image.open(ART/"cast/frog.png").convert("RGBA").crop((0,0,48,48))
    skin=Block((48,48));skin.im.alpha_composite(actor)
    if frame<2:
        # Replace each protruding green iris with a folded ochre lid.
        for x,y,rx in ((16,15,4),(26,13,5)):
            skin.oval("#bf823b",(x-rx,y-5,x+rx,y+5))
            skin.oval("#efbd54",(x-rx+1,y-4,x+rx-1,y+3))
            skin.line(SUN,[(x-rx+1,y-2),(x-1,y-4),(x+1,y-4)])
            skin.line("#775037",[(x-rx+1,y),(x-1,y+2),(x+1,y+2),(x+rx-1,y)])
            if frame==1 and x==26:
                skin.line("#6d782d",[(x-2,y+1),(x+1,y+1),(x+3,y)])
        skin.line("#ad7337",[(14,23),(18,23),(21,22)])
        skin.oval("#725332",(18,23,20,24))
    else:
        skin.line("#805336",[(12,11),(14,9),(17,9)])
        skin.line("#805336",[(23,8),(25,6),(28,7)])
        skin.oval("#593c37",(20,23,24,27))
        skin.line("#eaa574",[(21,26),(23,26)])
    # Puffed blanket has a woven corner and broad moon-lit fold.
    h=(38,40,42)[frame]
    p.im.alpha_composite(skin.im.resize((42,h),NEAREST),(7,45-h))
    p.poly("#424f4a",[(8,37),(14,34),(23,34),(30,36),(38,35),(44,38),(46,42),
                      (40,46),(20,47),(10,44)],BLACK)
    p.poly("#819983",[(10,36),(16,35),(22,35),(29,37),(37,36),(42,38),
                      (38,42),(30,41),(23,43),(14,42)])
    p.line("#b5baa0",[(11,37),(18,36),(24,37),(28,38)])
    p.line("#566f61",[(16,42),(23,42),(29,39),(33,39)])
    for x,y in ((34,38),(36,39),(38,38),(34,41),(39,40)):
        p.d.point((x,y),fill=PAPER)
    if frame<2:
        x,y=((40,12),(43,7))[frame]
        p.line("#bfcdad",[(x,y),(x+3,y),(x,y+3),(x+3,y+3)])
        p.line("#849e92",[(x+4,y-4),(x+6,y-4),(x+4,y-2),(x+6,y-2)])
    else:
        p.line(LIGHT,[(42,12),(46,9)],2)
        p.line("#b3b99e",[(43,15),(47,15)])
    return p.im


def lunge(frame):
    p=Block((80,72))
    # One model is mirrored around all four walls. The sill and bolted corners
    # establish its depth even when the face projects past the jamb.
    p.poly(BLACK,[(10,12),(62,9),(68,14),(70,53),(65,57),(13,59),(8,54)])
    p.poly("#726f64",[(11,12),(61,10),(66,14),(67,51),(64,54),(12,55)])
    p.poly("#343637",[(14,16),(60,14),(63,17),(64,48),(14,51)])
    p.line("#aba38a",[(11,13),(60,11),(64,14)])
    p.line("#8b8d7e",[(14,52),(63,50)])
    for x,y in ((12,15),(63,14),(11,51),(65,50)):
        p.d.point((x,y),fill=PAPER)
    if frame==0:
        # A clean, falsely reassuring closed counter. Only its glass is scored.
        for x,y in ((29,27),(46,25)):
            p.line("#a69364",[(x-3,y+1),(x-1,y-1),(x+1,y-1),(x+3,y+1)])
        p.line("#c1aa7a",[(24,32),(29,35),(37,36),(45,34),(53,29)])
        p.line("#6c776c",[(16,26),(24,21),(27,22)])
        p.line("#616e66",[(53,44),(59,40),(61,40)])
    else:
        # Sharp silhouette moves from inside the pane to beyond its bottom lip.
        boundary=[(16,31),(21,23),(25,19),(30,19),(35,15),(43,15),(47,18),
                  (51,18),(56,22),(58,29),(57,36),(53,47),(45,51),(30,50),(21,46)]
        if frame==2:
            boundary=[(4,34),(11,22),(17,17),(21,16),(24,10),(32,6),(42,7),
                      (47,10),(54,10),(60,14),(63,22),(68,29),(69,38),(66,47),
                      (60,57),(50,63),(36,64),(22,59),(13,52),(8,44)]
        p.poly(OCHRE,boundary,BLACK)
        mask=Image.new("L",p.im.size);md=ImageDraw.Draw(mask);md.polygon(boundary,fill=255)
        ink=Block(p.im.size)
        if frame==1:
            ink.oval(SKIN,(18,16,56,46))
            for x,y in ((29,27),(44,24)):
                ink.oval(BLACK,(x-4,y-5,x+3,y+4))
                ink.oval("#839345",(x-2,y-4,x+2,y+2))
                ink.oval(BLACK,(x-1,y-3,x+1,y))
                ink.d.point((x-1,y-3),fill=LIGHT)
            wound(ink,[(24,36),(29,38),(35,38),(41,37),(46,34),(50,31)])
            for x,y in ((30,37),(36,37),(42,35)):
                ink.line(PAPER,[(x,y),(x+1,y+1)])
            bloodtrail(ink,35,39,8)
        else:
            ink.oval(SKIN,(8,7,61,53))
            ink.line(LIGHT,[(17,25),(20,19),(25,16)],2)
            for x,y,r in ((27,25,5),(47,21,6)):
                ink.oval(BLACK,(x-r,y-r-1,x+r,y+r+1))
                ink.oval("#a3ac53",(x-r+1,y-r,x+r-1,y+r))
                ink.oval("#dedf83",(x-3,y-3,x+3,y+3))
                ink.oval(BLACK,(x-1,y-4,x+2,y+3))
                ink.d.point((x-1,y-3),fill="white")
                ink.line(BLOOD,[(x-4,y+r),(x-1,y+r+1),(x+2,y+r)])
            mouth=[(11,34),(20,35),(31,38),(41,36),(51,32),(62,25),
                   (59,38),(55,50),(47,57),(39,59),(31,57),(23,53),(16,45)]
            ink.poly(CLOT,mouth,BLACK)
            ink.line(SCARLET,[(12,34),(23,37),(31,39),(43,37),(53,32),(61,26)],3)
            ink.poly(BLACK,[(19,39),(30,42),(43,39),(55,33),(50,46),(45,51),
                            (36,54),(28,49),(22,46)])
            for x,y,h in [(22,38,5),(28,40,5),(35,40,6),(42,38,5),(49,35,5),(54,32,4)]:
                ink.poly(PAPER,[(x,y),(x+3,y-1),(x+2,y+h)])
            ink.poly(BLOOD,[(29,53),(32,49),(38,48),(44,45),(46,48),
                            (43,53),(37,56),(31,55)])
            ink.line(RAW,[(32,52),(36,50),(39,50)])
            ink.line(SCARLET,[(18,46),(24,51),(31,55),(38,57),(44,55)],2)
            wound(ink,[(51,18),(55,20),(54,24),(58,26),(59,30)])
            for x,y,h in [(19,43,11),(30,55,6),(51,48,10),(55,40,9)]:
                bloodtrail(ink,x,y,h,1)
        p.im.alpha_composite(Image.composite(ink.im,Image.new("RGBA",p.im.size),mask))
        if frame==2:
            # The open wound's wet threads and torn-ticket strips bridge empty
            # space from the mouth to the sill (they are above the foreground).
            for x,y,ex,ey in ((16,43,7,54),(22,50,14,61),(50,53,58,62),(57,43,70,51)):
                p.line(BLOOD,[(x,y),(x+1,(y+ey)//2),(ex,ey)],2)
                p.line(RAW,[(x,y),(x+1,(y+ey)//2)])
            for points in [[(4,30),(9,29),(8,34)],[(65,20),(69,16),(68,23)],
                           [(68,43),(76,40),(71,47)],[(11,54),(8,61),(5,59)]]:
                p.poly("#83958b",points,LIGHT)
            bloodtrail(p,32,59,8,1)
    if frame<2:
        p.poly(COAL,[(7,52),(65,49),(72,52),(68,56),(14,60),(7,58)],BLACK)
        p.line("#8d9181",[(9,53),(65,50),(70,52)])
    return p.im


def build():
    OUT.mkdir(parents=True,exist_ok=True)
    hands=[]
    for frame in range(3):
        panel=Block((32,64));traced_hand(panel,frame);hands.append(panel.im)
    parts={
        "torn_hand":sheet(hands),
        "palm_mark":print_mark(),
        "glass_grin":sheet([pane(i) for i in range(3)]),
        "woodcut_screen":screen(),
        "clock_jaw":sheet([press(i) for i in range(3)]),
        "frog_ring":sheet([ring_frog(i) for i in range(3)]),
        "window_lunge":sheet([lunge(i) for i in range(3)]),
        "ending_dawn":dawn_ending(),
    }
    for key,value in parts.items():
        value.save(OUT/(key+".png"),optimize=True)
    review=Block((596,420),"#20252a")
    review.im.alpha_composite(parts["ending_dawn"],(6,7))
    review.im.alpha_composite(parts["frog_ring"],(345,23))
    review.im.alpha_composite(parts["window_lunge"],(340,100))
    review.im.alpha_composite(parts["clock_jaw"],(10,205))
    review.im.alpha_composite(parts["torn_hand"],(17,332))
    review.im.alpha_composite(parts["palm_mark"].resize((51,45),NEAREST),(125,342))
    review.im.alpha_composite(parts["glass_grin"],(191,332))
    review.im.alpha_composite(parts["woodcut_screen"].resize((168,80),NEAREST),(406,322))
    for y in (194,316):
        review.line("#61685e",[(6,y),(589,y)])
    review.im.save(HERE/"plates.png")


if __name__=="__main__":
    build()
