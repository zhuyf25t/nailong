extends RefCounted

const INK := Color("#27243d")
const NIGHT := Color("#232338")
const SHADOW := Color("#17192a")
const DARK := Color("#37344d")
const STEEL := Color("#58536a")
const MUTE := Color("#bdb4bd")
const PAPER := Color("#ffefd1")
const LIGHT := Color("#fff6df")
const MINT := Color("#8ce5c1")
const GREEN := Color("#387e70")
const BERRY := Color("#f3a1ad")
const GOLD := Color("#ffca72")

var regular := SystemFont.new()
var bold := SystemFont.new()
var mono := SystemFont.new()
var _textures: Dictionary[String, Texture2D] = {}

func _init() -> void:
	regular.font_names = PackedStringArray(["Microsoft YaHei UI", "Microsoft YaHei", "Noto Sans CJK SC", "sans-serif"])
	bold.font_names = regular.font_names
	bold.font_weight = 750
	mono.font_names = PackedStringArray(["Consolas", "Cascadia Mono", "monospace"])
	mono.font_weight = 700

func place(parent: Control, node: Control, at: Rect2) -> void:
	node.position = at.position
	node.size = at.size
	parent.add_child(node)

func quad(parent: Control, at: Rect2, color: Color) -> ColorRect:
	var node := ColorRect.new()
	node.color = color
	node.mouse_filter = Control.MOUSE_FILTER_IGNORE
	place(parent, node, at)
	return node

func frame(parent: Control, at: Rect2, fill: Color, edge: Color, width := 2) -> Control:
	var node := Control.new()
	node.mouse_filter = Control.MOUSE_FILTER_IGNORE
	place(parent, node, at)
	quad(node, Rect2(Vector2.ZERO, at.size), edge)
	quad(node, Rect2(Vector2(width,width), at.size - Vector2(width*2,width*2)), fill)
	return node

func line(parent: Control, caption: String, at: Rect2, pixels: int, color: Color,
		weight := false, align := HORIZONTAL_ALIGNMENT_LEFT, digits := false) -> Label:
	var node := Label.new()
	node.text = caption
	node.mouse_filter = Control.MOUSE_FILTER_IGNORE
	node.horizontal_alignment = align
	node.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	node.clip_text = true
	node.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	node.add_theme_font_override("font", mono if digits else (bold if weight else regular))
	node.add_theme_font_size_override("font_size", pixels)
	node.add_theme_color_override("font_color", color)
	place(parent, node, at)
	return node

func texture(path: String) -> Texture2D:
	if _textures.has(path):
		return _textures[path]
	if ResourceLoader.exists(path):
		var item := load(path) as Texture2D
		if item != null:
			_textures[path] = item
			return item
	return null

func picture(parent: Control, path: String, at: Rect2, mode := TextureRect.STRETCH_KEEP_ASPECT_CENTERED) -> TextureRect:
	var node := TextureRect.new()
	node.mouse_filter = Control.MOUSE_FILTER_IGNORE
	node.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	node.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	node.stretch_mode = mode
	node.texture = texture(path)
	place(parent, node, at)
	return node

func box(fill: Color, edge: Color, width := 2, bottom := 3) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = fill
	style.border_color = edge
	style.set_border_width_all(width)
	style.border_width_bottom = bottom
	style.anti_aliasing = false
	style.content_margin_left = 10
	style.content_margin_right = 10
	style.content_margin_top = 0
	style.content_margin_bottom = 0
	return style

func paint(button: Button, fill: Color, foreground: Color, outline: Color) -> void:
	button.add_theme_stylebox_override("normal", box(fill, outline))
	button.add_theme_stylebox_override("hover", box(fill.lightened(0.10), GOLD, 2, 3))
	button.add_theme_stylebox_override("pressed", box(fill.darkened(0.07), GOLD, 2, 2))
	button.add_theme_stylebox_override("disabled", box(fill.darkened(0.21), outline))
	var focus := box(Color.TRANSPARENT, BERRY, 2, 2)
	focus.draw_center = false
	button.add_theme_stylebox_override("focus", focus)
	for state in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color"]:
		button.add_theme_color_override(state, foreground)
	button.add_theme_color_override("font_disabled_color", foreground.lerp(fill, 0.45))

func button(parent: Control, caption: String, at: Rect2, fill: Color, foreground: Color,
		outline: Color, pixels := 19) -> Button:
	var node := Button.new()
	node.text = caption
	node.focus_mode = Control.FOCUS_ALL
	node.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	node.add_theme_font_override("font", bold)
	node.add_theme_font_size_override("font_size", pixels)
	paint(node, fill, foreground, outline)
	place(parent, node, at)
	return node

func input(parent: Control, hint: String, at: Rect2, secret := false) -> LineEdit:
	var node := LineEdit.new()
	node.placeholder_text = hint
	node.secret = secret
	node.caret_blink = true
	node.add_theme_font_override("font", regular)
	node.add_theme_font_size_override("font_size", 20)
	node.add_theme_color_override("font_color", INK)
	node.add_theme_color_override("font_placeholder_color", Color("#806e73"))
	node.add_theme_color_override("caret_color", INK)
	node.add_theme_color_override("selection_color", Color("#a8dfc6"))
	node.add_theme_color_override("font_selected_color", INK)
	node.add_theme_stylebox_override("normal", box(LIGHT, Color("#bcab99"), 2, 2))
	node.add_theme_stylebox_override("focus", box(LIGHT, GREEN, 3, 3))
	place(parent, node, at)
	return node
