"""Draw the Soda Scramble cast on integer pixel grids. Requires Pillow."""

from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageOps

ART = Path(__file__).resolve().parent
ASSETS = ART.parents[1] / "game" / "assets" / "characters"
INK = "#30253e"
CREAM = "#fff1ce"
PINK = "#ec8e83"
YELLOW = ("#ffd36c", "#ed9e53", "#be6c47")
MINT = ("#9ce3ad", "#61b7a2", "#437f84")
YOLK = ("#ffb950", "#e8894e", "#be6054")
SHELL = ("#fff1d8", "#e2cbb8", "#b89db5")
BERRY = ("#ed667a", "#bc4a69", "#934462")
TEAL = ("#61c9bd", "#419698", "#3a6d83")


def oval(x0, y0, x1, y1):
    return "ellipse", (x0, y0, x1, y1)


def poly(*points):
    return "polygon", points


def rect(x0, y0, x1, y1):
    return "rectangle", (x0, y0, x1, y1)


def mask(size, shapes):
    result = Image.new("L", size)
    draw = ImageDraw.Draw(result)
    for kind, coords in shapes:
        getattr(draw, kind)(coords, fill=255)
    return result


def moved(matte, x, y):
    result = Image.new("L", matte.size)
    result.paste(matte, (x, y))
    return result


class Paper:
    def __init__(self, size):
        self.im = Image.new("RGBA", (size, size))
        self.d = ImageDraw.Draw(self.im)

    def ink(self, color, *shapes):
        for kind, coords in shapes:
            getattr(self.d, kind)(coords, fill=color)

    def line(self, color, pts, width=1):
        self.d.line(pts, fill=color, width=width)

    def layer(self, colors, *shapes, rim=1, shade=(2, 3)):
        matte = mask(self.im.size, shapes)
        if rim:
            self.im.paste(INK, mask=matte.filter(ImageFilter.MaxFilter(2 * rim + 1)))
        base, mid, deep = colors
        dx, dy = shade
        self.im.paste(deep, mask=matte)
        broad = ImageChops.multiply(matte, moved(matte, -max(1, dx // 2), -max(1, dy // 2)))
        self.im.paste(mid, mask=broad)
        lit = ImageChops.multiply(matte, moved(matte, -dx, -dy))
        self.im.paste(base, mask=lit)


def eye(p, x, y, wide=5, h=7, looking=1):
    p.ink(INK, oval(x, y, x + wide, y + h), rect(x + 1, y, x + wide - 1, y + 1))
    p.ink("#795064", rect(x + 2, y + h - 1, x + wide - 1, y + h))
    p.ink("#fff9eb", rect(x + looking, y + 1, x + looking + 1, y + 2))


def blush(p, x, y, w=7):
    p.ink(PINK, oval(x, y, x+w, y+3))
    p.line("#ffb69b", [(x+2,y+1),(x+1,y+2)])
    if w > 5:
        p.line("#ffb69b", [(x+5,y+1),(x+4,y+2)])


def portrait_dragon():
    p = Paper(80)
    # Back spines and the two waffle-coloured horns.
    p.layer(BERRY, poly((18,26),(10,25),(12,33),(19,36)), shade=(2,2))
    p.layer(BERRY, poly((16,37),(7,38),(13,45),(19,45)), shade=(2,2))
    p.layer(BERRY, poly((17,49),(9,53),(17,57),(22,53)), shade=(2,2))
    p.layer(YELLOW, poly((20,58),(13,60),(7,58),(5,54),(4,63),(9,69),(18,71),(26,68)))
    p.layer(YELLOW, oval(16,44,65,75), oval(14,14,62,55), oval(34,29,71,53),
            rim=2, shade=(6,8))
    p.ink("#ffe7a0", poly((19,27),(21,21),(26,17),(33,15),(41,15),(41,17),(32,18),(26,20),(23,23),(21,28)))
    p.layer(("#ffe8b2","#d9a372","#a9756d"),
            poly((21,17),(22,12),(24,8),(28,6),(29,7),(28,14),(29,16),(26,20)), shade=(2,4))
    p.layer(("#ffe8b2","#d9a372","#a9756d"),
            poly((48,14),(49,10),(53,5),(56,4),(56,10),(54,17),(51,17)), shade=(2,4))
    p.ink("#fff4c3", rect(25,10,26,13), rect(53,8,54,10))
    p.ink("#f3ad58", poly((29,19),(32,18),(36,19),(32,21)))
    p.ink("#f3ad58", poly((36,17),(39,17),(42,18),(39,20)))
    p.ink("#efaa56", poly((21,30),(21,27),(24,26),(26,27),(23,28)))
    p.ink("#935948", poly((31,28),(34,26),(37,26),(37,27),(33,28)))
    p.ink("#935948", poly((54,25),(57,24),(59,25),(57,26)))
    eye(p,31,31,6,8); eye(p,55,28,4,6)
    blush(p,22,40,9)
    p.ink("#b86949", rect(60,35,61,36), rect(66,34,67,35))
    p.line(INK,[(42,43),(44,46),(50,47),(58,46),(63,43)],2)
    p.ink(CREAM,poly((47,47),(50,47),(49,50)))
    p.ink("#fff1b1",oval(28,52,58,73))
    p.ink("#f4c887",poly((29,64),(33,67),(39,68),(37,69),(31,67)))
    # A single petrol-blue strap, with a brass candy buckle.
    p.layer(TEAL,poly((21,48),(24,49),(28,55),(34,61),(41,65),(56,68),(56,72),(45,71),(33,66),(24,58)),shade=(1,2))
    p.ink(INK,poly((33,60),(38,63),(36,68),(31,65)))
    p.ink("#ffe29a",poly((33,61),(36,63),(35,66),(32,64)))
    p.layer(YELLOW,oval(15,52,26,65),shade=(3,3))
    p.ink("#ffdc86",rect(17,53,20,55))
    p.layer(YELLOW,oval(57,48,67,58),shade=(2,3))
    p.ink("#fff0a5",rect(60,49,62,50))
    return p.im


def portrait_egg():
    p = Paper(80)
    p.layer(TEAL, poly((12,48),(17,43),(27,45),(29,64),(18,69),(12,66)),
            shade=(3,3))
    p.ink("#a5eddf",rect(14,53,16,56))
    p.layer(YOLK,oval(16,21,64,64),oval(35,30,69,53),rim=2,shade=(6,7))
    # The broken top and bottom both belong to the same speckled eggshell.
    p.layer(SHELL,poly((15,38),(14,29),(16,21),(20,15),(26,10),(34,7),(43,6),(50,7),
                       (57,10),(62,15),(65,21),(66,25),(60,24),(55,29),(49,24),(44,30),
                       (38,25),(32,32),(27,28),(23,35),(19,31)),
            rim=2,shade=(5,6))
    p.line("#bf9caa",[(18,23),(22,23),(24,19),(28,19),(29,14),(32,13)],1)
    p.ink("#ead6ba",rect(34,14,36,15),rect(39,11,40,12),rect(55,17,56,18))
    p.ink("#fffaf0",poly((20,21),(22,16),(29,12),(33,11),(31,14),(25,16),(24,19)))
    p.ink("#c38672",poly((31,34),(33,32),(36,32),(36,33),(33,34)))
    eye(p,31,37,5,7); eye(p,54,34,4,6)
    blush(p,22,45,8); blush(p,61,41,5)
    p.layer(("#ffda8c","#ed9450","#af6252"),poly((43,42),(47,40),(54,41),(57,43),(52,45),(47,45)),shade=(1,2))
    p.line(INK,[(47,47),(50,48),(53,46)])
    p.layer(SHELL,poly((14,56),(20,59),(24,52),(31,59),(36,54),(42,61),(49,55),(54,59),
                       (59,53),(63,56),(65,52),(66,60),(65,66),(60,72),(51,75),(37,76),
                       (25,74),(18,70),(15,65)),rim=2,shade=(4,6))
    p.line("#b592a9",[(24,69),(28,68),(30,71),(35,70),(38,74)])
    p.ink("#dcc7b7",rect(42,67,44,68),rect(47,69,48,70))
    p.layer(TEAL,poly((18,53),(21,52),(27,58),(34,62),(45,66),(53,66),(54,70),
                      (44,70),(32,66),(23,60)),shade=(2,2))
    p.ink(INK,rect(33,62,38,66)); p.ink("#f8d58d",rect(34,63,37,65))
    p.layer(YOLK,poly((16,48),(19,47),(25,52),(28,56),(26,59),(20,58),(16,55)),shade=(2,2))
    p.ink("#ffd37f",rect(18,49,20,50))
    p.layer(YOLK,poly((62,46),(67,42),(70,43),(70,47),(66,53),(63,53)),shade=(2,3))
    return p.im


def portrait_frog():
    p = Paper(80)
    p.layer(BERRY,poly((21,48),(19,55),(13,61),(7,62),(10,67),(17,65),(13,71),
                        (21,67),(28,55)),shade=(3,3))
    p.layer(MINT,oval(15,43,64,75),rim=2,shade=(6,6))
    p.ink("#e7ecc0",oval(29,53,58,73))
    p.layer(MINT,oval(12,19,65,55),oval(18,7,39,32),oval(43,5,62,29),
            oval(34,27,70,50),rim=2,shade=(5,7))
    for x,y in ((19,10),(44,8)):
        p.ink("#5aa78f",oval(x,y,x+16,y+19))
        p.ink("#fff0c8",oval(x+1,y+1,x+15,y+16))
        eye(p,x+6,y+3,6,10)
    p.ink("#c6f0ba",poly((15,29),(17,25),(21,23),(24,23),(22,25),(19,26),(17,30)))
    p.ink("#66b498",rect(36,25,38,27),rect(40,27,41,28),rect(62,30,64,31))
    blush(p,17,37,10); blush(p,61,32,6)
    p.ink("#508e84",rect(43,32,44,33),rect(52,31,53,32))
    p.line(INK,[(30,38),(34,41),(42,43),(50,43),(57,41),(61,38)],2)
    p.ink("#f7b49c",rect(43,44,49,45))
    p.layer(BERRY,poly((17,47),(29,51),(46,54),(58,51),(63,48),(63,54),(56,59),(43,63),
                       (33,59),(20,55)),shade=(3,4))
    p.ink("#ff998d",poly((21,49),(26,50),(31,52),(29,53),(23,51)))
    p.layer(("#ffe29a","#e8ab6a","#b07166"),poly((44,54),(48,57),(45,61),(41,58)),shade=(1,2))
    p.layer(MINT,oval(14,56,27,66),shade=(2,3)); p.ink("#b7efb7",rect(16,57,20,58))
    p.layer(MINT,oval(56,55,67,64),shade=(2,3))
    p.ink("#8ac7a2",rect(35,68,37,69),rect(40,70,42,71))
    return p.im


def tiny_eye(p, x, y, blink):
    if blink:
        p.ink(INK, rect(x,y+1,x+2,y+1))
    else:
        p.ink(INK, rect(x,y,x+1,y+2), rect(x+1,y-1,x+1,y-1))
        p.ink(CREAM, rect(x,y,x,y))


def dragon_body(p, view, blink, swing):
    side = view == "east"
    back = view == "north"
    p.layer(YELLOW, poly((9,20),(7,22),(4,20),(3,18),(3,23),(6,26),(12,26)))
    for x,y in ((6,11),(5,15),(6,19)):
        p.layer(BERRY,poly((x+2,y-1),(x-1,y-1),(x+1,y+2),(x+3,y+2)),shade=(1,1))
    p.layer(YELLOW,oval(7,11,24,26),oval(7,7,24,22),
            oval(16,12,27 if side else 25,20) if not back else oval(7,8,24,20),
            shade=(3,4))
    p.layer(("#ffe9b4","#d5a573","#96695d"),poly((9,9),(10,6),(12,4),(13,4),(13,8),(12,10)),shade=(1,2))
    p.layer(("#ffe9b4","#d5a573","#96695d"),poly((19,7),(20,4),(22,3),(22,6),(21,9)),shade=(1,2))
    if back:
        for x,y in ((15,9),(15,13),(14,17)):
            p.ink("#c96564", poly((x,y),(x+2,y+1),(x+1,y+3),(x-1,y+2)))
        p.layer(TEAL,rect(11,18,20,24),shade=(2,2))
        p.ink("#b2e4ce",rect(12,20,18,20))
    else:
        p.ink("#ffe7a2",rect(13,9,15,9),rect(11,10,13,10))
        p.ink("#ffedac",oval(13,19,22,25))
        if side:
            tiny_eye(p,18,12,blink)
            p.ink(PINK,rect(14,15,17,16))
            p.ink("#b7784c",rect(25,14,25,14))
            p.line(INK,[(20,17),(22,18),(25,17)])
        else:
            tiny_eye(p,12,13,blink); tiny_eye(p,20,12,blink)
            p.ink(PINK,rect(9,16,11,17),rect(23,15,24,16))
            p.line(INK,[(15,17),(17,18),(20,17)])
        p.line("#37797e",[(10,18),(14,22),(20,24)],2)
        p.ink("#ffd981",rect(15,21,16,22))
    x,y = (10,21+swing) if not back else (8,20+swing)
    p.ink("#e9a34f",oval(x,y,x+3,y+3))
    p.ink("#ffda82",rect(x,y,x+2,y+1))


def egg_body(p, view, blink, swing):
    side = view == "east"
    back = view == "north"
    p.layer(TEAL,rect(5,17,11,23),shade=(1,2))
    p.layer(YOLK,oval(7,8,24,25),oval(15,13,26 if side else 24,21),shade=(3,3))
    cap = poly((7,16),(7,11),(9,7),(13,4),(17,3),(21,4),(24,7),(25,11),
               (22,10),(20,13),(17,11),(14,14),(12,12),(9,16),(8,14))
    if back:
        cap = poly((6,16),(7,10),(9,6),(13,4),(18,3),(22,5),(25,9),(26,14),
                   (25,17),(23,15),(21,18),(18,15),(15,18),(12,15),(9,18),(8,16))
    p.layer(SHELL,cap,shade=(3,3))
    p.line("#c8a8a6",[(9,9),(11,9),(12,7),(14,7)])
    p.ink("#fff8e9",rect(13,6,15,6))
    if not back:
        if side:
            tiny_eye(p,19,14,blink)
            p.layer(YOLK,poly((23,16),(26,15),(28,16),(26,18),(23,18)),shade=(1,1))
            p.ink(PINK,rect(15,17,18,18))
        else:
            tiny_eye(p,13,15,blink); tiny_eye(p,21,14,blink)
            p.ink("#af674b",poly((17,17),(19,16),(21,17),(19,18)))
            p.ink(PINK,rect(10,18,12,19))
    p.layer(SHELL,poly((7,21),(10,22),(12,20),(15,23),(18,21),(21,23),(24,20),
                       (25,23),(23,26),(20,27),(13,27),(9,25)),shade=(2,2))
    if back:
        p.layer(TEAL,rect(11,19,20,24),shade=(2,2))
        p.ink("#9de2d2",rect(12,20,18,20))
    else:
        p.line("#3f8d91",[(9,19),(13,22),(20,25)],2)
        p.ink("#f6cf80",rect(14,22,15,23))
    p.ink("#f7b55b",oval(8,19+swing,11,21+swing))


def frog_body(p, view, blink, swing):
    side = view == "east"
    back = view == "north"
    p.layer(BERRY,poly((10,18),(8,20),(4,21),(5,22),(3,24),(8,23),(12,20)),shade=(1,2))
    p.layer(MINT,oval(8,15,24,26),oval(6,8,25,20),oval(7,5,15,13),oval(18,4,25,12),
            oval(18,11,27 if side else 24,18),shade=(3,3))
    if back:
        p.ink("#c3edba",rect(8,7,11,7),rect(19,6,21,6))
        p.ink("#63aa93",rect(12,12,14,13),rect(16,14,17,15))
    elif side:
        p.ink("#d0eec1",oval(8,6,12,10))
        p.ink("#fff1cf",oval(18,5,24,12))
        tiny_eye(p,22,8,blink)
        p.ink(PINK,rect(14,14,17,15))
        p.line(INK,[(19,16),(22,17),(25,15)])
    else:
        p.ink("#fff1cf",oval(8,6,14,12),oval(18,5,24,11))
        tiny_eye(p,11,8,blink); tiny_eye(p,21,7,blink)
        p.ink(PINK,rect(8,14,11,15),rect(22,13,24,14))
        p.line(INK,[(13,15),(16,17),(20,16)])
    if not back:
        p.ink("#dfefbd",oval(13,21,22,25))
    p.layer(BERRY,poly((8,18),(13,20),(20,20),(24,18),(24,20),(21,22),
                       (17,23),(12,22),(9,21)),shade=(1,2))
    if not back:
        p.ink("#ffe9a3",rect(17,20,18,21))
    p.ink("#65b69a",oval(8,21+swing,12,24+swing))
    p.ink("#a7e4b0",rect(9,21+swing,11,22+swing))


CAST = {
    "dragon": (portrait_dragon, dragon_body, YELLOW),
    "egg": (portrait_egg, egg_body, YOLK),
    "frog": (portrait_frog, frog_body, MINT),
}
DIRECTIONS = ("south","east","north","west")


def battle_frame(kind, view, frame):
    _, body, palette = CAST[kind]
    p = Paper(32)
    pose = (0, 0, -1, 0, 1, 0)[frame]
    crouch = 1 if frame in (1,3,5) else 0
    for x,offset in ((10,pose),(20,-pose)):
        dx = offset*2 if view in ("east","west") else 0
        p.layer(palette,oval(x+dx,24+offset,x+dx+4,28+offset),shade=(1,2))
    torso = Paper(32)
    body(torso, "east" if view == "west" else view, frame == 1, pose)
    p.im.alpha_composite(torso.im,(0,crouch))
    return ImageOps.mirror(p.im) if view == "west" else p.im


def draw_assets():
    ASSETS.mkdir(parents=True, exist_ok=True)
    preview = Image.new("RGB", (300,119), "#c5ddd0")
    for index,(kind,(portrait,_,_)) in enumerate(CAST.items()):
        sheet = Image.new("RGBA",(192,128))
        for row,view in enumerate(DIRECTIONS):
            for col in range(6):
                sheet.paste(battle_frame(kind,view,col),(32*col,32*row))
        sheet.save(ASSETS / f"{kind}_sheet.png", optimize=True)
        head = portrait()
        head.save(ASSETS / f"{kind}_portrait.png", optimize=True)
        preview.paste(head,(100*index+10,3),head)
        for column,(view,frame) in enumerate((("south",0),("east",2),("north",4))):
            sample = battle_frame(kind,view,frame)
            preview.paste(sample,(100*index+2+column*32,83),sample)
    preview.resize((900,357), Image.Resampling.NEAREST).save(ART / "cast-preview.png")


if __name__ == "__main__":
    draw_assets()
