"""Paint the Night Shift character sheets on their native pixel grids (Pillow).

Run this file to regenerate seven transparent PNGs and cast.png. Dragon's rows
are south/east/north/west and its columns are idle/step A/step B. Its feet
anchor at (16, 37) in a 32x40 cell. At a service window, align (24, 44) in
each 48x48 frog/egg cell to the sill. Columns are still/left/right/laugh.

Visual references for the original hand-drawn paths:
https://www.nailoong.com/ipStar/NaiLong/
https://naiwahub.com/zh/series/nai-wa
https://naiwahub.com/zh/series/nai-dan
"""

from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageOps


SOURCE = Path(__file__).resolve().parent
OUT = SOURCE.parents[1] / "game" / "assets" / "night" / "cast"

# Amber local colour, red-brown occlusion and a cool ink line hold together under both
# the canteen lamps and the warehouse's teal emergency lights.
INK = "#392936"
DEEP = "#764039"
OCHRE = "#b86d37"
HONEY = "#e7a33d"
YELLOW = "#f5c549"
LIGHT = "#ffdb69"
GLINT = "#ffeb94"
CREAM = "#ffe6ac"
CREAM_DARK = "#e9b879"
EYE_EDGE = "#625438"
EYE_PALE = "#dae39a"
EYE_GREEN = "#83b75d"
EYE_SHADE = "#488448"
EYE_DEEP = "#2c6040"
PUPIL = "#252e2c"
SHINE = "#fff3d0"
PALM = "#705344"
PALM_DARK = "#493a3a"
PALM_LIGHT = "#9b7652"
TONGUE = "#d87e67"


class Ink:
    """Integer paths, silhouette-dependent edge lighting, and a 1-pixel outer stroke."""

    def __init__(self, actual_size, design_size):
        self.size = actual_size
        self.scale = actual_size[0] / design_size[0]
        self.image = Image.new("RGBA", actual_size)

    def pt(self, x, y):
        return round(x * self.scale), round(y * self.scale)

    def mask(self, *shapes):
        mask = Image.new("L", self.size)
        d = ImageDraw.Draw(mask)
        for kind, coords in shapes:
            points = [self.pt(x, y) for x, y in coords]
            if kind == "ellipse":
                d.ellipse(points, fill=255)
            elif kind == "rect":
                d.rectangle(points, fill=255)
            else:
                d.polygon(points, fill=255)
        return mask

    def displaced(self, mask, dx, dy):
        shifted = Image.new("L", self.size)
        shifted.paste(mask, self.pt(dx, dy))
        return shifted

    def color(self, mask, paint):
        self.image.paste(paint, (0, 0, *self.size), mask)

    def form(self, mask, fill=YELLOW, shadow=HONEY, bounce=OCHRE,
             light=LIGHT, outline=INK, shade_depth=(3, 5)):
        # The outer ring is inside the path, so all frame anchors stay stable.
        interior = mask
        for dx, dy in ((-1, 0), (0, -1), (1, 0), (0, 1)):
            interior = ImageChops.darker(interior, self.displaced(mask, dx, dy))
        self.color(mask, outline)
        self.color(interior, fill)
        sx, sy = shade_depth
        shadow_mask = ImageChops.subtract(interior, self.displaced(interior, -sx, -sy))
        self.color(shadow_mask, shadow)
        self.color(ImageChops.subtract(interior, self.displaced(interior, -1, -2)), bounce)
        facing = ImageChops.subtract(interior, self.displaced(interior, 1, 2))
        self.color(ImageChops.subtract(facing, shadow_mask), light)

    def wash(self, mask, paint, shape):
        self.color(ImageChops.darker(mask, self.mask(shape)), paint)

    def flat(self, paint, *shapes):
        self.color(self.mask(*shapes), paint)

    def line(self, color, *points, width=1):
        ImageDraw.Draw(self.image).line([self.pt(x, y) for x, y in points],
                                        fill=color, width=max(1, round(width * self.scale)))


def oval(x0, y0, x1, y1):
    return "ellipse", ((x0, y0), (x1, y1))


def poly(*coords):
    return "poly", coords


def rect(x0, y0, x1, y1):
    return "rect", ((x0, y0), (x1, y1))


def green_eye(p, cx, cy, rx, ry, glance, *, protrudes=False):
    # Leave at least one unbroken ring of green, even in a 7-pixel window eye.
    mask = p.mask(oval(cx-rx,cy-ry,cx+rx,cy+ry))
    iris = p.mask(oval(cx-rx+0.8,cy-ry+0.7,cx+rx-0.6,cy+ry-0.8))
    p.color(mask,EYE_EDGE if protrudes else OCHRE)
    p.color(iris,EYE_GREEN)
    p.color(ImageChops.subtract(iris,p.displaced(iris,-1,-1)),EYE_SHADE)
    p.color(ImageChops.subtract(iris,p.displaced(iris,1,1)),EYE_PALE)
    ix,iy=cx+glance*0.8,cy+0.4
    px,py=rx*0.48,ry*0.48
    p.flat(PUPIL,oval(ix-px,iy-py,ix+px,iy+py))
    p.flat(SHINE,rect(ix-px+0.5,iy-py,ix-px+0.5,iy-py))


def tiny_eye(p, cx, cy, glance=0):
    p.flat(EYE_PALE, oval(cx - 2, cy - 3, cx + 2, cy + 2))
    p.flat(EYE_SHADE, oval(cx - 2, cy - 2, cx + 2, cy + 2))
    p.flat(PUPIL, oval(cx - 1 + glance, cy - 2, cx + 1 + glance, cy + 1))
    p.line(SHINE, (cx - 1 + glance, cy - 2), (cx - 1 + glance, cy - 2))


FACES = ("still", "left", "right", "laugh")
DIRECTIONS = ("south", "east", "north", "west")


def frog_paw(p, x, y, pointing):
    # Three short dark fingertips are a character mark visible through the glass.
    if pointing:
        shape = poly((x+9,y+2),(x+7,y),(x+3,y),(x+2,y-2),(x,y-3),
                     (x-1,y-3),(x-1,y-1),(x+1,y+1),(x-3,y),
                     (x-6,y),(x-6,y+2),(x-4,y+3),(x-6,y+3),
                     (x-5,y+5),(x-2,y+6),(x+4,y+7),(x+7,y+5))
        p.form(p.mask(shape), PALM, PALM_DARK, INK, PALM_LIGHT, INK,(1,1))
        p.line(PALM_DARK,(x-3,y+3),(x+1,y+4))
    else:
        shape = poly((x,y),(x+3,y-1),(x+5,y+1),(x+5,y+5),
                     (x+3,y+7),(x+1,y+6),(x-1,y+7),(x-3,y+5),(x-3,y+2))
        p.form(p.mask(shape), PALM, PALM_DARK, INK, PALM_LIGHT, INK,(1,2))
        p.line(PALM_DARK,(x,y+4),(x,y+6))


def frog(face, size=48):
    p = Ink((size, size), (48, 48))
    turn = face in ("left", "right")
    laugh = face == "laugh"
    # The long sloping neck continues into the far shoulder without a head seam.
    xshift = -2 if turn else 0
    yshift = 1 if laugh else 0
    contour = [(9,44),(6,42),(5,37),(6,32),(9,26),(11,20),(12,14),
               (14,10),(17,7),(20,5),(25,5),(29,7),(32,10),(35,16),
               (38,22),(41,31),(42,38),(41,42),(37,45),(16,46)]
    hull = p.mask(poly(*[(x + (xshift if y<26 else 0),y+yshift) for x,y in contour]))
    p.form(hull, shade_depth=(5,6))
    belly = p.mask(poly((12,36),(14,32),(18,29),(24,28),(30,29),(33,32),
                        (35,36),(34,41),(31,44),(15,45),(11,42)))
    p.color(ImageChops.darker(hull, belly), CREAM_DARK)
    p.wash(belly, CREAM, oval(12,28,33,45))
    p.wash(belly, "#ffedb6", oval(15,29,28,38))
    p.line(GLINT,(17+xshift,10+yshift),(19+xshift,8+yshift),(22+xshift,7+yshift))
    p.line(LIGHT,(31+xshift,17+yshift),(32+xshift,19+yshift))
    if laugh:
        p.line(DEEP,(12,17),(14,14),(17,14),(18,16),width=2)
        p.line(DEEP,(24,15),(26,13),(28,13),(30,15),width=2)
        mouth = p.mask(poly((13,19),(17,20),(23,20),(30,17),(29,21),
                           (25,26),(20,27),(16,25)))
        p.color(mouth, INK)
        p.wash(mouth, SHINE, poly((15,19),(27,18),(26,21),(17,22)))
        p.wash(mouth,TONGUE,oval(17,23,25,28))
        p.line(OCHRE,(16,29),(20,30),(24,29))
    else:
        glance = -1 if turn else 0
        green_eye(p, 16+xshift, 15, 3.3, 4, glance, protrudes=True)
        green_eye(p, 26+xshift, 13, 4, 4.4, glance, protrudes=True)
        p.line(DEEP,(13+xshift,22),(16+xshift,22),(20+xshift,21),(25+xshift,20),(28+xshift,19))
        p.line(LIGHT,(16+xshift,23),(20+xshift,22),(23+xshift,22))
        p.line(HONEY,(27+xshift,20),(28+xshift,19),(29+xshift,19))
    if turn:
        arm = p.mask(poly((15,29),(13,28),(10,28),(8,27),(6,26),(4,28),
                          (4,31),(10,34),(14,34),(17,31)))
        p.form(arm, outline=OCHRE,shade_depth=(2,2))
        frog_paw(p,7,25,True)
        p.line(OCHRE,(35,29),(34,34),(32,38))
        frog_paw(p,32,36,False)
    elif laugh:
        p.line(OCHRE,(9,32),(11,35),(16,38),width=3)
        p.line(OCHRE,(38,32),(35,36),(30,38),width=3)
        frog_paw(p,16,35,False); frog_paw(p,27,35,False)
    else:
        p.line(OCHRE,(10,30),(10,34),(13,38),width=2)
        p.line(OCHRE,(36,29),(36,33),(34,37),width=2)
        frog_paw(p,13,36,False); frog_paw(p,32,35,False)
    return ImageOps.mirror(p.image) if face=="right" else p.image


def egg(face, size=48):
    p = Ink((size, size), (48,48))
    turn = face in ("left", "right")
    laugh = face == "laugh"
    lift = -2 if turn else (1 if laugh else 0)
    contour = [(8,42),(6,39),(6,34),(7,28),(9,22),(12,16),(16,10),
               (20,7),(23,6),(26,6),(30,8),(34,12),(37,18),(40,26),
               (41,33),(41,37),(39,41),(36,44),(32,45),(16,45),(11,44)]
    body = p.mask(poly(*[(x + (-1 if turn and y<27 else 0),
                           y + (lift if y<30 else 0)) for x,y in contour]))
    p.form(body, fill="#f6c754", shadow=HONEY, bounce=OCHRE, light=LIGHT, shade_depth=(4,6))
    p.line(GLINT,(14,17+lift),(16,14+lift),(19,11+lift),(22,10+lift))
    p.line(LIGHT,(12,20+lift),(13,18+lift))
    if laugh:
        p.line(DEEP,(15,21),(17,18),(19,18),(20,20))
        p.line(DEEP,(26,20),(28,17),(31,18),(32,19))
        mouth = p.mask(poly((17,24),(21,25),(27,24),(30,22),(29,26),
                           (26,30),(23,31),(19,29)))
        p.color(mouth, INK); p.wash(mouth, TONGUE, oval(20,27,27,31))
        p.line(OCHRE,(15,36),(20,38)); p.line(OCHRE,(32,34),(28,37))
    else:
        front = -2 if turn else 0
        green_eye(p,17+front,19+lift,3,3.4,-1 if turn else 0)
        green_eye(p,29+front,19+lift,3.3,3.7,-1 if turn else 0)
        p.line(DEEP,(18+front,24+lift),(21+front,25+lift),(25+front,25+lift),(28+front,24+lift))
        p.line(LIGHT,(21+front,26+lift),(25+front,26+lift))
    if turn:
        hand = p.mask(poly((12,30),(10,28),(8,27),(5,25),(3,25),(3,27),
                           (4,28),(2,28),(3,30),(6,32),(10,34),(12,33)))
        p.form(hand, outline=DEEP, shade_depth=(2,1))
        p.line(OCHRE,(6,29),(8,30))
    return ImageOps.mirror(p.image) if face=="right" else p.image


def dragon(direction, frame):
    p = Ink((32,40), (32,40))
    side = direction in ("east","west")
    back = direction=="north"
    shift = 0 if frame==0 else -1
    gait = (0,2,-2)[frame]
    # The little feet and three umber toe tips move independently of the head bob.
    for foot, step in ((8,gait),(19,-gait)):
        x = foot + (step if side else 0)
        y = 32 + (0 if side else step)
        p.form(p.mask(oval(x,y-1,x+6,y+4)),
               fill=HONEY,shadow=OCHRE,bounce=DEEP,shade_depth=(2,2))
        if not back:
            p.line(PALM_DARK,(x+1,y+3),(x+1,y+3))
            p.line(PALM_DARK,(x+3,y+4),(x+3,y+4))
            p.line(PALM_DARK,(x+5,y+3),(x+5,y+3))
    torso = Ink((32,40),(32,40))
    if side:
        torso.form(torso.mask(poly((2,27),(5,26),(9,22),(11,23),(12,28),
                                   (8,31),(4,31),(2,29))), shade_depth=(2,2))
    body = torso.mask(oval(7,17,25,34),oval(8,20,26 if side else 25,32))
    torso.form(body,shade_depth=(3,4))
    if not back:
        belly = torso.mask(oval(14 if side else 11,21,25 if side else 22,32))
        torso.color(ImageChops.darker(belly,body),CREAM_DARK)
        torso.wash(belly,CREAM,oval(10 if not side else 13,20,22 if not side else 24,31))
    head = torso.mask(poly((7,17),(6,13),(7,9),(9,6),(12,4),(16,3),(19,3),
                           (23,5),(25,7),(27,11),(27,16),(25,19),(22,21),
                           (18,22),(13,22),(9,20)))
    torso.form(head,shade_depth=(3,3))
    torso.line(GLINT,(11,8),(13,6),(16,5))
    if not back:
        if side:
            tiny_eye(torso,23,12)
            torso.line(DEEP,(25,17),(27,16))
        else:
            tiny_eye(torso,13,13); tiny_eye(torso,22,12)
            torso.line(DEEP,(16,17),(17,18),(19,18),(20,17))
    if back:
        torso.line(HONEY,(13,20),(16,21),(19,21))
        torso.form(torso.mask(poly((18,28),(19,27),(21,27),(22,29),(21,32),(18,33),(16,32))),
                   fill=HONEY,shadow=OCHRE,bounce=OCHRE,light=YELLOW,outline=OCHRE,shade_depth=(1,1))
    arms = [(10,23+(gait//2))] if side else [(7,24+gait//2),(23,23-gait//2)]
    for x,y in arms:
        arm=torso.mask(poly((x,y),(x+2,y-1),(x+4,y+1),(x+4,y+3),(x+2,y+5),(x,y+5),(x-1,y+3)))
        torso.form(arm,outline=DEEP,shade_depth=(1,2))
        torso.line(PALM_DARK,(x+1,y+4),(x+2,y+4))
    p.image.alpha_composite(torso.image,(0,shift))
    return ImageOps.mirror(p.image) if direction=="west" else p.image


def dragon_portrait():
    p = Ink((64,64),(64,64))
    p.form(p.mask(oval(15,32,54,62)), shade_depth=(5,7))
    belly=p.mask(oval(24,40,48,59)); p.color(belly,CREAM_DARK); p.wash(belly,CREAM,oval(22,38,45,57))
    face=p.mask(poly((10,33),(9,26),(10,19),(13,13),(18,8),(24,5),
                     (32,4),(40,5),(47,8),(51,12),(54,17),(55,23),
                     (55,29),(53,35),(49,39),(42,42),(32,43),(24,42),(17,40),(13,37)))
    p.form(face,shade_depth=(6,5))
    p.line(GLINT,(16,18),(17,15),(21,11),(26,9),(29,9))
    green_eye(p,26,24,5,5.6,0); green_eye(p,44,21,5,5.6,0)
    mouth=p.mask(oval(34,31,39,35)); p.color(mouth,DEEP)
    p.wash(mouth,INK,oval(34,30,39,33)); p.wash(mouth,TONGUE,oval(36,34,39,35))
    for shape in (poly((16,47),(12,43),(10,39),(9,36),(7,35),(5,36),
                       (4,39),(6,46),(10,51),(15,54),(18,52)),
                  poly((48,46),(52,42),(55,38),(55,34),(58,32),(60,33),
                       (61,35),(60,43),(56,48),(51,52),(48,51))):
        p.form(p.mask(shape),outline=DEEP,shade_depth=(2,3))
    for x,y in ((6,37),(8,36),(56,34),(59,34)):
        p.flat(PALM_DARK,rect(x,y,x+1,y+1))
    return p.image


def intruder_hand():
    p=Ink((32,40),(32,40))
    sleeve=p.mask(poly((29,38),(19,37),(17,32),(15,27),(15,23),(20,19),
                       (24,21),(24,25),(25,30),(29,34),(31,35)))
    p.form(sleeve,fill=HONEY,shadow=OCHRE,bounce=DEEP,light=LIGHT,shade_depth=(3,4))
    hand=p.mask(poly((22,25),(18,27),(14,25),(12,23),(10,20),(9,17),
                     (6,14),(3,13),(2,11),(3,10),(7,11),(11,13),
                     (7,8),(5,5),(6,3),(8,4),(12,9),(15,12),
                     (13,7),(11,4),(11,2),(13,2),(15,5),(18,10),(20,14),
                     (20,11),(20,8),(22,7),(24,8),(23,11),(24,17),
                     (23,20),(24,23)))
    p.form(hand,fill=PALM,shadow=PALM_DARK,bounce=INK,light=PALM_LIGHT,
           outline=INK, shade_depth=(3,4))
    p.line(PALM_DARK,(13,18),(16,20),(18,20))
    p.line(PALM_LIGHT,(11,16),(13,17),(14,17))
    p.line("#b98c65",(6,5),(7,6)); p.line("#b98c65",(12,3),(13,4))
    return p.image


def strip(frames):
    width,height=frames[0].size
    image=Image.new("RGBA",(len(frames)*width,height))
    for i,frame in enumerate(frames):
        image.alpha_composite(frame,(i*width,0))
    return image


def main():
    OUT.mkdir(parents=True,exist_ok=True)
    walk=Image.new("RGBA",(96,160))
    for i,direction in enumerate(DIRECTIONS):
        walk.alpha_composite(strip([dragon(direction,frame) for frame in range(3)]),(0,40*i))
    assets={"dragon":walk, "hand":intruder_hand(), "dragon_portrait":dragon_portrait()}
    for name,draw in (("frog",frog),("egg",egg)):
        assets[name]=strip([draw(face) for face in FACES])
        assets[name+"_portrait"]=draw("still",64)
    for name,image in assets.items():
        image.save(OUT/(name+".png"),optimize=True)
    # Contact sheet makes silhouette and directional cues readable at game scale.
    preview=Image.new("RGB",(256,181),"#172a2b")
    for y in (73,126,176):
        ImageDraw.Draw(preview).line((4,y,251,y),fill="#5f6254")
    for i,name in enumerate(("dragon","frog","egg")):
        portrait=assets[name+"_portrait"]
        preview.paste(portrait,(8+80*i,3),portrait)
    for y,name in ((75,"frog"),(127,"egg")):
        im=assets[name]; preview.paste(im,(3,y),im)
    for i,an in enumerate(("south","east","north","west")):
        im=dragon(an,i%3); preview.paste(im,(191+32*(i%2),73+50*(i//2)),im)
    preview.resize((768,543),Image.Resampling.NEAREST).save(SOURCE/"cast.png",optimize=True)


if __name__=="__main__":
    main()
