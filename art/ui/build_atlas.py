"""Rebuild the original Soda Scramble pixel lettering and HUD glyph atlas."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

DEST = Path(__file__).resolve().parents[2] / "game" / "ui" / "art"
DEST.mkdir(parents=True, exist_ok=True)

GLYPHS = {
    "S": ["01111","11000","11000","01110","00011","00011","11110"],
    "O": ["01110","11011","11011","11011","11011","11011","01110"],
    "D": ["11110","11011","11011","11011","11011","11011","11110"],
    "A": ["01110","11011","11011","11111","11011","11011","11011"],
    "C": ["01111","11000","11000","11000","11000","11000","01111"],
    "R": ["11110","11011","11011","11110","11100","11010","11011"],
    "M": ["11011","11111","11111","11011","11011","11011","11011"],
    "B": ["11110","11011","11011","11110","11011","11011","11110"],
    "L": ["11000","11000","11000","11000","11000","11000","11111"],
    "E": ["11111","11000","11000","11110","11000","11000","11111"],
}

def wordmark():
    mask = Image.new("L", (230, 40))
    ink = ImageDraw.Draw(mask)
    x = 3
    for letter in "SODA SCRAMBLE":
        if letter == " ":
            x += 6
            continue
        for y, row in enumerate(GLYPHS[letter]):
            for col, bit in enumerate(row):
                if bit == "1":
                    b = x + col * 3 + (6 - y) // 2
                    ink.rectangle((b, 4 + y*3, b+2, 6 + y*3), fill=255)
        x += 18
    rect = mask.getbbox()
    image = Image.new("RGBA", (rect[2] + 4, 32))
    border = mask.filter(ImageFilter.MaxFilter(3))
    def stamp(color, silhouette, dx=0, dy=0):
        image.paste(color, (dx, dy, dx+230, dy+40), silhouette)
    for how_far in (4,3,2,1):
        stamp("#321c38", border, 1, how_far)
        stamp("#d15c61", mask, 0, how_far)
    stamp("#4a2544", border)
    for row in range(4, 26):
        color = "#fff9d8" if row <= 9 else "#ffdf8b" if row < 17 else "#ffba69"
        line = Image.new("L", mask.size)
        line.paste(mask.crop((0,row,230,row+1)), (0,row))
        stamp(color, line)
    image.crop(image.getbbox()).save(DEST / "wordmark.png")

def glyphs():
    colors = {"n":"#28233e","w":"#fff4d4","m":"#81dfc0","g":"#ffcc66",
              "p":"#f3869d","t":"#53a9a6","b":"#6d79a5","o":"#ce764d"}
    icons = {
      "bubble":["................",".....nnnn.......","...nnmwwmnn.....","..nmwwmmmmmn....",
                "..nwwwmmmmtn....",".nmmwmmmmmttn...",".nmmmmmmmtttn...",".nmmmmmmmtttn...",
                "..nmmmmttttn....","..nttttttttn....","...nnttttnn.....",".....nnnn.......",
                "...........nn...","..........nmwn..","...........nn...","................"],
      "star":[".......nn.......","......ngwn......","......nggn......",".....nggggn.....",
              ".nnnnnggggnnnnn.",".ngwwwggggggogn.","..ngwwgggggogn..","...nggggggogn...",
              "....nggggogn....","...nggggggggn...","...ngggngggon...","..ngggn.ngggon..",
              "..ngnn...nngon..","..nn.......nn...","................","................"],
      "pearl":[".....nnnnnn.....","...nnppwwppnn...","..npwwwppppppn..",".npwwwppppppppn.",
               ".npwwpppnppppbn.","nppppppnnnpppbbn","npppppppnpppbbbn","nppppppppppbbbbn",
               "npppppppppbbbbbn",".nppppppbbbbbbn.",".nbbbbbbbbbbbbn.","..nbbbbbbbbbbn..",
               "...nnbbbbbbnn...",".....nnnnnn.....","................","................"],
      "jump":["................",".........nnnnn..","........nmmwn...","......nnmmmn....",
              ".....nmmmmn.....","....nmmmmn......","...nmmtttnnn....","..nmmtttttttn...",
              ".nnnnnnttttn....","......ntttn.....",".....ntttn......","....ntttn.......",
              "...nttn.........","..ntn...........","..nn............","................"],
      "shell":["................",".....nnnnnn.....","..nnnwwwmmmnnn..",".nwwwwmmmmmmttn.",
              ".nwwmmmmmmmtttn.",".nwmmmwwmmmtttn.",".nmmmwwwwmmtttn.",".nmmmmwwmmmtttn.",
              "..nmmmwmmmtttn..","..nmmmmmmttttn..","...nmmmmttttn...","....nmmttttn....",
              ".....nttttn.....","......nttn......",".......nn.......","................"],
      "flag":["................","..nnnnnnnn......","..nggpppppnnnn..","..ngwppwpppppn..",
              "..ngwppwwwpppn..","..ngwppwpppppn..","..ngwppppppnnn..","..ngwnnnnnn.....",
              "..nggn..........","..nggn..........","..nggn..........","..nggn..........",
              "..nggn..........",".nnggnn.........",".nnnnnn.........","................"],
      "crown":["................",".......nn.......",".nn...nggn...nn.",".ngn..nggn..ngn.",
               ".nggnnggggnnggn.",".ngwwgggggggggn.","..ngwgggggggon..","..nggggpggggon..",
               "..ngggpppgggon..","..nggggpggggon..","..nnnnnnnnnnnn..","..ngwwggggggon..",
               "..nnnnnnnnnnnn..","................","................","................"],
    }
    for name, rows in icons.items():
        image = Image.new("RGBA", (16,16))
        pixel = image.load()
        for y, row in enumerate(rows):
            for x, value in enumerate(row[:16]):
                if value in colors:
                    pixel[x,y] = (*bytes.fromhex(colors[value][1:]),255)
        image.save(DEST / (name + ".png"))

wordmark()
glyphs()
