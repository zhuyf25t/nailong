"""Draw press-room relay sprites at Godot's native pixel pitch (Python + Pillow).

Use the Night Shift relief-print tools and inks. All five strips have three
left-to-right frames. Coordinates in this file are authored at 1:1; the
enlargement on the inspection sheet uses nearest-neighbour sampling only.
"""
from pathlib import Path
import sys

from PIL import Image

HERE = Path(__file__).resolve().parent
sys.dont_write_bytecode = True
sys.path.insert(0, str(HERE.parent / "night_horror"))
from pressroom import (
    BLACK, BLOOD, BRUISE, CLOT, COAL, IRON, LIGHT, OCHRE, PAPER, RAW, SCARLET,
    SKIN, SUN, Block, NEAREST, sheet,
)

OUT = HERE.parents[1] / "game/assets/night/relay"
TEAL = "#419d94"
MINT = "#89e7c8"
GLINT = "#e1fff0"
COPPER = "#ad7960"
BRASS = "#d8bc78"
VIOLET = "#978db4"
IRIS = "#d5c5e7"
PEARL = "#fff5dc"


def first_shift_label(p, x, y, large=False):
    """A torn triangular corner, red border and black I identify the same slip."""
    if large:
        p.poly(BLACK,[(x,y+2),(x+12,y),(x+14,y+8),(x+12,y+10),
                      (x+6,y+10),(x+5,y+12),(x+1,y+11)])
        p.poly("#bfa67d",[(x+1,y+2),(x+11,y+1),(x+13,y+7),(x+10,y+9),
                           (x+7,y+8),(x+5,y+10),(x+2,y+10)])
        p.poly(LIGHT,[(x+2,y+3),(x+10,y+2),(x+11,y+6),(x+8,y+7),
                      (x+6,y+8),(x+3,y+8)])
        p.line(BLOOD,[(x+2,y+3),(x+9,y+2)])
        p.line(BLOOD,[(x+3,y+8),(x+7,y+7)])
        p.line(BLACK,[(x+5,y+4),(x+8,y+4)])
        p.line(BLACK,[(x+6,y+4),(x+7,y+6)])
        p.line(BLACK,[(x+5,y+6),(x+8,y+6)])
    else:
        p.poly("#d9be8c",[(x,y),(x+7,y-1),(x+7,y+3),(x+3,y+4),(x+2,y+3),(x,y+4)])
        p.line(BLOOD,[(x,y),(x+5,y-1)])
        p.line(BLACK,[(x+3,y+1),(x+4,y+1),(x+4,y+3)])


def bottle(empty, frame):
    p=Block((18,24))
    if empty:
        # Slim shoulders and an uncapped hollow mouth. Light can actually pass
        # through the central window, so the conveyor remains visible inside.
        edge=[(6,3),(11,3),(11,5),(10,6),(10,9),(12,11),(13,13),
              (13,19),(12,21),(5,21),(4,19),(4,13),(5,11),(7,9),(7,6),(6,6)]
        p.poly("#51475e",edge,BLACK)
        p.poly("#79758b",[(7,5),(10,5),(9,6),(9,10),(12,13),(12,19),
                          (11,20),(6,20),(5,18),(5,13),(8,10),(8,6)])
        p.poly((52,54,67,70),[(8,7),(9,7),(9,11),(11,13),(11,18),
                              (10,19),(7,19),(6,17),(6,13),(8,11)])
        p.line(IRIS,[(5,13),(7,11),(8,10)])
        p.line("#c0b4cc",[(5,15),(5,18),(6,19)])
        p.line("#9185a4",[(11,19),(12,18)])
        p.oval(IRIS,(5,2,12,5),BLACK)
        p.line("#483f56",[(7,3),(10,3)])
        first_shift_label(p,5,13)
        p.line(VIOLET,[(6,20),(11,20)])
    else:
        # A sealed squat soda bottle: brass serrated cap and a bright, straight
        # turquoise meniscus. A crown-shaped cream label carries one water drop.
        p.poly(BLACK,[(5,2),(11,2),(12,3),(12,5),(11,6),(11,8),(13,10),
                      (15,12),(15,19),(13,21),(5,21),(3,19),(3,12),(5,10),
                      (6,8),(6,6),(5,5)])
        p.poly("#447a72",[(6,5),(11,5),(10,7),(10,9),(13,11),(14,13),
                          (14,18),(12,20),(6,20),(4,18),(4,13),(6,10),(7,9)])
        p.poly("#a8d7c3",[(7,5),(9,5),(9,9),(12,11),(11,12),(6,12),
                          (5,13),(6,10),(8,9)])
        p.poly(TEAL,[(5,13),(13,12),(14,14),(14,18),(12,20),(6,20),(4,18)])
        p.line(MINT,[(5,12),(7,12),(8,13),(10,12),(13,12)])
        p.line("#72c7af",[(6,18),(8,19),(11,19)])
        p.poly(PAPER,[(4,14),(7,15),(10,14),(14,14),(14,17),
                      (11,18),(7,17),(4,17)])
        p.line(TEAL,[(10,15),(9,16),(10,16)])
        p.line(GLINT,[(5,13),(5,15)])
        p.rect(COPPER,(5,2,12,4));p.line(BRASS,[(6,2),(11,2)])
        p.line("#715849",[(5,4),(7,4),(8,5),(11,4)])
        for x in (6,9,11):
            p.d.point((x,3),fill=LIGHT)
    if frame:
        ink=PEARL if frame==1 else "#b8c6b9"
        # Only the neck gets a catch flash. Keep the belly and the central
        # aiming location free, and leave the carrier's collision ring independent.
        p.line(ink,[(4,2),(4,1),(7,0)])
        p.line(ink,[(11,0),(13,1),(14,3)])
        p.line(ink,[(14,5),(12,6)])
        p.line(ink,[(6,6),(4,5)])
        if frame==1:
            p.d.point((2,3),fill=PEARL);p.d.point((15,0),fill=PEARL)
    return p.im


def pipe_nail(frame):
    p=Block((27,16))
    # Low cast-iron shell, distorted steel plate under the raised fastener.
    p.poly(BLACK,[(1,10),(4,8),(21,7),(25,9),(25,12),(22,14),(3,15),(1,13)])
    p.poly("#4a5554",[(2,10),(5,9),(20,8),(24,10),(21,12),(4,13)])
    p.line("#79857b",[(2,10),(6,9),(20,8),(23,9)])
    p.line("#313b3d",[(5,12),(20,11),(23,10)])
    for x,y in ((4,11),(22,10)):
        p.d.point((x,y),fill=PAPER)
    bulge=(9,6,5)[frame]
    p.poly("#30373a",[(5,12),(7,10),(10,bulge),(14,bulge-1),(17,bulge),
                       (20,9),(21,11),(18,12),(8,13)])
    p.poly(IRON,[(7,11),(10,bulge+1),(13,bulge),(16,bulge),(20,10),(17,11),(12,11)])
    p.line("#a1a68f",[(8,10),(11,bulge),(15,bulge-1),(16,bulge)])
    if frame:
        p.line(COAL,[(8,12),(11,11),(12,9)])
        p.line(COPPER,[(13,10),(16,8),(18,8)])
    top=(8,4,1)[frame]
    p.rect(BLACK,(12,top+1,15,9))
    p.line(COPPER,[(13,top+2),(13,8)])
    p.rect(COAL,(10,top,16,top+2))
    p.line(PAPER,[(11,top),(15,top)])
    p.line(IRON,[(12,top+1),(15,top+1)])
    if frame==2:
        p.line("#9d9582",[(18,4),(19,2)])
    return p.im


def tagged_hand(frame):
    p=Block((32,44))
    # Warp a hand-painted silhouette about the wrist from partly inside the
    # floor to fully open; the five touch pads stay separate at native scale.
    xscale=(0.72,0.9,1.0)[frame]
    yscale=(0.43,0.75,1.0)[frame]
    palm=Block((32,42))
    outline=[(12,40),(12,32),(9,29),(7,25),(4,23),(2,20),(2,17),(4,16),
             (6,17),(10,20),(10,15),(8,10),(8,6),(9,4),(11,4),(13,9),
             (14,12),(14,5),(15,2),(17,1),(19,2),(19,10),(21,5),(24,4),
             (25,6),(24,11),(23,14),(26,11),(28,10),(30,11),(30,13),
             (27,17),(26,22),(24,26),(23,31),(24,39),(20,41)]
    palm.poly(BRUISE,outline,BLACK)
    palm.poly(OCHRE,[(13,38),(13,31),(10,28),(8,23),(4,20),(4,18),(6,18),
                      (11,22),(12,17),(11,12),(10,6),(11,7),(14,15),(16,15),
                      (16,5),(17,3),(18,3),(17,13),(19,15),(22,7),(23,6),
                      (24,7),(21,16),(21,19),(24,16),(28,12),(29,12),(26,16),
                      (23,22),(22,28),(21,38)])
    palm.poly(SKIN,[(10,22),(13,22),(13,16),(15,17),(17,16),(18,13),
                     (19,16),(21,16),(21,19),(25,16),(23,21),(21,24),
                     (20,31),(17,34),(14,32),(14,27)])
    palm.line(SUN,[(10,6),(11,7),(12,11)])
    palm.line(SUN,[(16,6),(17,3),(18,3)])
    palm.line(SUN,[(22,9),(23,7)])
    palm.line(BRUISE,[(10,23),(13,25),(17,23),(20,20)])
    palm.line(CLOT,[(14,31),(16,28),(17,28),(19,25)],2)
    palm.line(BLOOD,[(14,32),(16,31),(17,28)])
    first_shift_label(palm,10,17,large=True)
    palm.line("#ac7048",[(11,22),(12,21)])
    w,h=round(32*xscale),round(42*yscale)
    p.im.alpha_composite(palm.im.resize((w,h),NEAREST),((32-w)//2,40-h))
    p.poly(BLACK,[(0,38),(5,35),(10,35),(14,37),(21,36),(26,34),(31,36),
                  (30,40),(23,42),(5,42),(0,40)])
    p.poly(IRON,[(0,38),(4,36),(9,36),(12,37),(9,39),(2,40)])
    p.poly("#5c665c",[(20,38),(26,35),(31,36),(28,38),(23,40)])
    p.line("#a2a68e",[(21,37),(26,35),(29,36)])
    return p.im


def close_glass(frame):
    p=Block((80,64))
    # The print is composed into the left edge of the near glass; the right
    # margin stays broken and transparent instead of forming a rectangular HUD.
    p.poly("#414c4b",[(0,4),(11,5),(14,6),(14,45),(0,60)],BLACK)
    p.line("#a4a58c",[(2,6),(11,7),(11,43),(2,52)])
    pane=[(8,8),(53,4),(65,7),(60,19),(62,29),(49,40),(38,43),
          (29,54),(6,60),(3,54),(8,43)]
    p.poly((47,66,67,105),pane)
    p.line("#697c78",[(10,8),(45,4),(53,4)])
    p.line("#87958a",[(8,50),(16,44),(17,40),(26,33)])
    if frame==0:
        p.line("#7a8c84",[(10,20),(18,17),(21,17)])
        p.line("#697b77",[(13,31),(26,22),(28,23)])
        p.line("#978b75",[(23,32),(27,33),(32,31)])
        return p.im
    # Silhouette, asymmetric pressed eyes and a flattened snout. At maximum
    # pressure the face bursts past the glass plane and smears the near edge.
    face=Block((63,57))
    profile=[(0,20),(5,14),(11,9),(20,8),(24,4),(31,4),(35,7),(41,7),
             (47,10),(52,16),(56,19),(58,25),(58,29),(55,33),(54,40),
             (50,46),(45,49),(37,52),(21,51),(12,48),(8,45),(3,38),(0,36)]
    face.poly(BRUISE,profile,BLACK)
    face.poly(OCHRE,[(1,22),(7,15),(13,11),(20,10),(26,6),(31,6),(36,10),
                      (42,9),(47,13),(52,20),(55,22),(56,26),(53,32),(51,39),
                      (46,45),(38,49),(24,48),(14,45),(6,40),(2,33)])
    face.poly("#d7ab4e",[(3,22),(10,15),(18,12),(24,9),(29,8),(36,11),
                         (43,11),(48,16),(51,22),(52,27),(47,31),(39,36),
                         (26,39),(13,38),(6,34)])
    face.line(SUN,[(8,20),(12,15),(18,13)],2)
    # One eye is pressed flat against glass, with a clearly visible green iris.
    face.oval(BLACK,(14,17,26,28))
    face.oval("#939e50",(15,18,25,27))
    face.oval("#d5d282",(17,18,24,25))
    face.oval(BLACK,(19,18,23,25))
    face.line(PEARL,[(19,19),(20,19)])
    face.oval(BLACK,(36,13,49,26))
    face.oval("#a4a65b",(37,14,48,25))
    face.oval("#e3da96",(39,15,47,23))
    face.oval(BLACK,(42,15,46,23))
    face.line(PEARL,[(42,16),(43,16)])
    face.line(BRUISE,[(32,30),(35,28),(38,29)])
    face.line(SUN,[(35,27),(37,27)])
    if frame==1:
        face.line("#815743",[(13,34),(20,36),(29,37),(40,34),(50,29)],2)
        face.line("#e3ad79",[(18,37),(26,39),(32,38)])
        face.im=face.im.resize((43,39),NEAREST)
        p.im.alpha_composite(face.im,(4,10))
    else:
        face.poly(CLOT,[(7,32),(13,33),(21,35),(29,35),(38,32),(48,27),
                        (54,25),(54,31),(50,39),(44,44),(36,48),(28,48),
                        (21,45),(15,41)],BLACK)
        face.line(SCARLET,[(9,32),(17,35),(23,36),(29,36),(40,32),(52,26)],2)
        face.poly(BLACK,[(17,37),(29,39),(39,36),(49,30),(47,36),(41,41),
                         (33,43),(26,44),(20,40)])
        for x,y,h in [(18,36,4),(24,37,4),(30,37,5),(37,34,5),(44,31,4),(49,28,4)]:
            face.poly(PAPER,[(x,y),(x+3,y-1),(x+1,y+h)])
        face.line(RAW,[(23,43),(26,42),(31,44),(35,43)],2)
        face.line(BLOOD,[(39,42),(43,40),(46,38)])
        face.line(BRUISE,[(15,28),(19,30),(24,29)])
        face.line(BLOOD,[(41,27),(45,26),(48,24)])
        p.im.alpha_composite(face.im,(1,3))
    splits=[
        [(24,33),(15,25),(14,20),(6,14)],
        [(33,26),(31,18),(34,13),(32,5)],
        [(47,27),(55,21),(61,20),(68,12)],
        [(46,35),(54,39),(61,38),(70,44)],
        [(32,42),(34,47),(29,53),(29,62)],
        [(17,37),(12,41),(7,42),(1,49)],
    ]
    for i,line in enumerate(splits):
        points=line[:3] if frame==1 else line
        p.line("#637775",[(x,y+1) for x,y in points])
        p.line("#b4c5b7" if i%2 else "#d9dcbf",points)
    if frame==2:
        # Angular glass flakes cross the silhouette at three different depths.
        for outline in [[(53,10),(63,4),(58,15)],[(57,29),(70,22),(65,30)],
                        [(47,47),(55,52),(48,54)],[(15,47),(12,56),(9,54)]]:
            p.poly("#85958d",outline,LIGHT)
        p.line(CLOT,[(38,47),(41,52),(41,55)],2)
        p.line(SCARLET,[(38,47),(40,49)])
        p.oval(BLOOD,(40,54,42,57))
    return p.im


PARTS={
    "cargo": lambda i:bottle(False,i),
    "echo":lambda i:bottle(True,i),
    "pipe_rivet":pipe_nail,
    "label_hand":tagged_hand,
    "near_glass":close_glass,
}


def main():
    OUT.mkdir(parents=True,exist_ok=True)
    strips={name:sheet([draw(i) for i in range(3)]) for name,draw in PARTS.items()}
    for name,strip in strips.items():
        strip.save(OUT/(name+".png"),optimize=True)
    review=Block((520,308),"#252e32")
    for y in (87,171):
        review.line("#5f6a63",[(9,y),(510,y)])
    for name,x,y,scale in [("cargo",8,9,3),("echo",205,9,3),("pipe_rivet",10,111,3),
                           ("label_hand",312,85,2),("near_glass",14,175,2)]:
        strip=strips[name]
        review.im.alpha_composite(strip.resize((strip.width*scale,strip.height*scale),NEAREST),(x,y))
    review.im.save(HERE/"plates.png")


if __name__=="__main__":
    main()
