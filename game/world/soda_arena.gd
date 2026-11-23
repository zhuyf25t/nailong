class_name SodaArena extends Control

const Ink = preload("res://world/arena_ink.gd")
const NATIVE_SIZE := Vector2i(480, 288)

var _viewport := SubViewport.new()
var _ink := Ink.new()
var _view: SodaState
var _local_seat := -1
var _font := SystemFont.new()

func _ready() -> void:
	custom_minimum_size = Vector2(NATIVE_SIZE) * 2.0
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	clip_contents = true
	texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	_font.font_names = PackedStringArray(["Microsoft YaHei UI", "Noto Sans CJK SC", "Segoe UI"])
	_font.font_weight = 650
	_viewport.size = NATIVE_SIZE
	_viewport.disable_3d = true
	_viewport.world_2d = World2D.new()
	_viewport.canvas_item_default_texture_filter = Viewport.DEFAULT_CANVAS_ITEM_TEXTURE_FILTER_NEAREST
	_viewport.render_target_update_mode = SubViewport.UPDATE_DISABLED
	add_child(_viewport)
	_viewport.add_child(_ink)
	visibility_changed.connect(_sync_activity)
	_sync_activity()

func reset_match() -> void:
	_view = null
	_local_seat = -1
	_ink.clear_match()
	_sync_activity()
	queue_redraw()

func apply_snapshot(s: SodaState, local_seat: int) -> void:
	_ink.accept(s, local_seat)
	_view = s
	_local_seat = local_seat
	_sync_activity()
	queue_redraw()

func _sync_activity() -> void:
	if not is_node_ready():
		return
	var active := is_visible_in_tree() and _view != null
	_viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS if active else SubViewport.UPDATE_DISABLED
	_ink.set_process(active)
	set_process(active)

func world_mouse() -> Vector2:
	return get_local_mouse_position() * Vector2(NATIVE_SIZE) / size.max(Vector2.ONE)

func point_in_arena() -> bool:
	return is_visible_in_tree() and Rect2(Vector2.ZERO, size).has_point(get_local_mouse_position())

func local_position() -> Vector2:
	return _ink.screen_position(_local_seat)

func _process(_dt: float) -> void:
	_ink.cursor = world_mouse()
	_ink.cursor_on = point_in_arena() and get_window().has_focus()
	queue_redraw()

func _draw() -> void:
	if not is_node_ready() or _view == null:
		return
	draw_texture_rect(_viewport.get_texture(), Rect2(Vector2.ZERO, size), false)
	var scale_factor := size / Vector2(NATIVE_SIZE)
	for fighter in _view.fighters:
		if fighter.respawn_ticks > 0 or fighter.hp <= 0:
			continue
		var pos: Vector2 = _ink.screen_position(fighter.seat) * scale_factor
		_draw_badge(fighter, pos, scale_factor)

func _draw_badge(fighter: SodaState.Fighter, pos: Vector2, scale_factor: Vector2) -> void:
	var own := fighter.seat == _local_seat
	var name_text := fighter.name.strip_edges()
	if name_text.length() > 7:
		name_text = name_text.substr(0, 6) + "…"
	if own:
		name_text = "▼ " + name_text
	var font_size := maxi(9, roundi(6.0 * scale_factor.y))
	var text_width := _font.get_string_size(name_text, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size).x
	var width := ceili(text_width) + 8
	var top := pos.y - 30.0 * scale_factor.y
	if top < 1:
		top = pos.y + 14.0 * scale_factor.y
	var left := clampf(roundf(pos.x - width * 0.5), 1.0, size.x - width - 1.0)
	var rect := Rect2(left, roundf(top), width, font_size + 5)
	draw_rect(rect, Color("#27243ce8"))
	var color: Color = _ink.actor_color(fighter.seat)
	draw_rect(Rect2(rect.position, Vector2(2, rect.size.y)), color)
	var text_y := rect.position.y + _font.get_ascent(font_size)
	draw_string(_font, Vector2(left + 4, text_y), name_text, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size, Color("#fff6de") if own else Color("#eee5d5"))
	var hp_width := roundf((rect.size.x - 4) * float(fighter.hp) / 100.0)
	draw_rect(Rect2(left + 2, rect.end.y - 2, hp_width, 2), color)
