extends RefCounted

const BG := Color("#172324")
const INK := Color("#222b2b")
const COAL := Color("#152020")
const PANEL := Color("#233231")
const RIM := Color("#526159")
const DULL := Color("#a6b2a4")
const PAPER := Color("#f1ddb0")
const PAPER_HI := Color("#fff0c9")
const PAPER_SHADE := Color("#d5bd8a")
const MUTED_INK := Color("#625948")
const TEAL := Color("#35655b")
const GREEN := Color("#a8c7a2")
const RED := Color("#9a493a")
const LAMP := Color("#f2b65e")
const ALERT := Color("#f39b77")
const WHITE := Color("#faeac7")

var book := SystemFont.new()
var heavy := SystemFont.new()
var type := SystemFont.new()
var _textures: Dictionary[String,Texture2D] = {}

func _init() -> void:
	book.font_names = PackedStringArray(["Microsoft YaHei UI","Microsoft YaHei","Noto Sans CJK SC","DengXian","sans-serif"])
	heavy.font_names = book.font_names
	heavy.font_weight = 750
	type.font_names = PackedStringArray(["Cascadia Mono","Consolas","Courier New","monospace"])
	type.font_weight = 700

func place(parent: Control, node: Control, x: float, y: float, w: float, h: float) -> void:
	node.position = Vector2(x,y)
	node.size = Vector2(w,h)
	parent.add_child(node)

func area(parent: Control, x: int,y: int,w: int,h: int, key := "") -> Control:
	var node := Control.new()
	node.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if not key.is_empty():
		node.name = key
	place(parent,node,x,y,w,h)
	return node

func rect(parent: Control,x: int,y: int,w: int,h: int,tint: Color) -> ColorRect:
	var node := ColorRect.new()
	node.color = tint
	node.mouse_filter = Control.MOUSE_FILTER_IGNORE
	place(parent,node,x,y,w,h)
	return node

func line(parent: Control,x: int,y: int,w: int,h: int,txt: String,pixels: int,tint: Color,
		kind := 0,align := HORIZONTAL_ALIGNMENT_LEFT,id := "") -> Label:
	var node := Label.new()
	node.text = txt
	node.horizontal_alignment = align
	node.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	node.mouse_filter = Control.MOUSE_FILTER_IGNORE
	node.clip_text = true
	node.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	node.add_theme_font_override("font",type if kind == 2 else (heavy if kind == 1 else book))
	node.add_theme_font_size_override("font_size",pixels)
	node.add_theme_color_override("font_color",tint)
	if not id.is_empty():
		node.name = id
	place(parent,node,x,y,w,h)
	return node

func paragraph(parent: Control,x:int,y:int,w:int,h:int,s:String,pixels:int,tint:Color, strong := false) -> Label:
	var node := line(parent,x,y,w,h,s,pixels,tint,1 if strong else 0)
	node.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	node.add_theme_constant_override("line_spacing",1)
	node.vertical_alignment = VERTICAL_ALIGNMENT_TOP
	return node

func box(fill: Color,edge: Color,stroke := 2) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = fill
	style.border_color = edge
	style.set_border_width_all(stroke)
	style.anti_aliasing = false
	style.content_margin_left = 12
	style.content_margin_right = 12
	style.content_margin_top = 0
	style.content_margin_bottom = 0
	return style

func button(parent: Control,x:int,y:int,w:int,h:int,txt:String,id:String,action:Callable,theme := 0,fs := 18) -> Button:
	var b := Button.new()
	b.name = id
	b.text = txt
	b.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	b.add_theme_font_override("font",heavy)
	b.add_theme_font_size_override("font_size",fs)
	var bg := [TEAL, PAPER,PANEL,RED][theme] as Color
	var fg := INK if theme == 1 else WHITE
	var border := [Color("#264a43"),PAPER_SHADE,RIM,Color("#72382f")][theme] as Color
	b.add_theme_stylebox_override("normal",box(bg,border))
	b.add_theme_stylebox_override("hover",box(bg.lightened(0.13),LAMP if theme != 1 else TEAL))
	b.add_theme_stylebox_override("pressed",box(bg.darkened(0.16),LAMP))
	b.add_theme_stylebox_override("disabled",box(bg.darkened(0.05),border))
	var focus := box(Color.TRANSPARENT,LAMP,2)
	focus.draw_center = false
	b.add_theme_stylebox_override("focus",focus)
	for key: String in ["font_color","font_hover_color","font_pressed_color","font_focus_color"]:
		b.add_theme_color_override(key,fg)
	b.add_theme_color_override("font_disabled_color",fg.lerp(bg,0.35))
	if action.is_valid():
		b.pressed.connect(action)
	place(parent,b,x,y,w,h)
	return b

func input(parent:Control,x:int,y:int,w:int,txt:String,id:String,secret := false) -> LineEdit:
	var field := LineEdit.new()
	field.name = id
	field.placeholder_text = txt
	field.secret = secret
	field.max_length = 128 if secret else 32
	field.add_theme_font_override("font",book)
	field.add_theme_font_size_override("font_size",18)
	field.add_theme_color_override("font_color",INK)
	field.add_theme_color_override("font_placeholder_color",MUTED_INK)
	field.add_theme_color_override("caret_color",TEAL)
	field.add_theme_color_override("selection_color",TEAL)
	field.add_theme_color_override("font_selected_color",WHITE)
	field.add_theme_stylebox_override("normal",box(PAPER_HI,PAPER_SHADE,2))
	field.add_theme_stylebox_override("focus",box(PAPER_HI,TEAL,2))
	place(parent,field,x,y,w,46)
	return field

func texture(path:String) -> Texture2D:
	if _textures.has(path):
		return _textures[path]
	if ResourceLoader.exists(path):
		var pic := load(path) as Texture2D
		if pic:
			_textures[path] = pic
			return pic
	return null

func image(parent:Control,x:int,y:int,w:int,h:int,path:String,cover:=false) -> TextureRect:
	var node := TextureRect.new()
	node.mouse_filter = Control.MOUSE_FILTER_IGNORE
	node.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	node.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED if cover else TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	node.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	node.texture = texture(path)
	place(parent,node,x,y,w,h)
	return node

func art(parent:Control,x:int,y:int,w:int,h:int,kind:String,tint:Color=TEAL) -> Surface:
	var node := Surface.new()
	node.mode = kind
	node.colour = tint
	node.mouse_filter = Control.MOUSE_FILTER_IGNORE
	place(parent,node,x,y,w,h)
	return node

class Surface extends Control:
	var mode := ""
	var colour := Color.WHITE
	const FONT := {
		"N":["11001","11001","11101","10101","10111","10011","10011"],
		"I":["111","010","010","010","010","010","111"],
		"G":["01111","11000","11000","11011","11001","11001","01111"],
		"H":["11001","11001","11001","11111","11001","11001","11001"],
		"T":["11111","00100","00100","00100","00100","00100","00100"],
		"S":["01111","11000","11000","01110","00011","00011","11110"],
		"F":["11111","11000","11000","11110","11000","11000","11000"]}

	func block(x:float,y:float,w:float,h:float,c:Color) -> void:
		draw_rect(Rect2(x,y,w,h),c)

	func _draw() -> void:
		var w := size.x
		var h := size.y
		match mode:
			"wall":
				block(0,0,w,h,BG)
				for y in range(0,int(h),48):
					block(0,y,w,1,Color("#20302e"))
					for x in range(0,int(w),96):
						block(x + (48 if y % 96 else 0),y,1,48,Color("#20302e"))
			"paper","slip":
				block(4,6,w-4,h-6,Color("#101a1b"))
				block(0,0,w-4,h-5,PAPER)
				block(1,0,w-6,2,PAPER_HI)
				block(1,h-8,w-5,3,PAPER_SHADE)
				if mode == "paper":
					for x in range(17,int(w)-10,28):
						block(x,10,8,4,PAPER_SHADE)
						block(x,9,8,3,COAL)
				else:
					for x in range(3,int(w)-6,12):
						block(x,h-9,5,6,BG)
			"plate":
				block(0,0,w,h,COAL)
				block(2,2,w-4,h-4,RIM)
				block(4,4,w-8,h-8,PANEL)
				for x:float in [8.0,w-12]:
					for y:float in [8.0,h-12]:
						block(x,y,4,4,RIM)
						block(x+1,y+1,2,1,COAL)
			"rule":
				for x in range(0,int(w),10):
					block(x,0,6,2,colour)
			"barcode":
				var x := 0
				var bars := [2,1,3,1,2,2,1,3,1,1,2]
				var i := 0
				while x < w-3:
					var bw: int = bars[i % bars.size()] * 2
					block(x,0,mini(bw,int(w)-x),h,colour)
					x += bw + (4 if i%4==0 else 2)
					i += 1
			"bottles":
				for i in 3:
					var xo := 2+i*10
					var yo := 5 if i==1 else 9
					block(xo+2,yo,4,3,colour)
					block(xo+2,yo+5,4,4,colour)
					block(xo,yo+9,8,14,colour)
					block(xo+2,yo+12,4,4,COAL)
			"word":
				var scale_px := maxi(1,int(h)/7)
				var pos_x := 0
				for ch in "NIGHT SHIFT":
					if ch == " ":
						pos_x += 3*scale_px
						continue
					var glyph: Array = FONT[ch]
					for yy in glyph.size():
						var row: String = glyph[yy]
						for xx in row.length():
							if row[xx] == "1":
								block(pos_x+xx*scale_px,yy*scale_px,scale_px,scale_px,colour)
					pos_x += (String(glyph[0]).length()+1)*scale_px
			"fallback":
				block(0,0,w,h,Color("#273b39"))
				for i in 3:
					var xx := 0.12*w+i*0.28*w
					block(xx,h*0.22,w*0.18,h*0.4,Color("#8b8160"))
					block(xx+5,h*0.22+6,w*0.18-10,h*0.4-12,Color("#b5a16d"))
					block(xx-7,h*0.61,w*0.2,12,TEAL)
				block(0,h*0.72,w,h*0.28,Color("#5e6551"))
