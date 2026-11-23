extends SceneTree

const BASE := "res://assets/night/horror/"


func _initialize() -> void:
	var ok := true
	ok = _check("torn_hand", Vector2i(32, 64), 3, true) and ok
	ok = _check("palm_mark", Vector2i(34, 30), 1, true) and ok
	ok = _check("glass_grin", Vector2i(64, 56), 3, true) and ok
	ok = _check("woodcut_screen", Vector2i(84, 40), 1, true) and ok
	ok = _check("frog_ring", Vector2i(56, 56), 3, true) and ok
	ok = _check("window_lunge", Vector2i(80, 72), 3, true) and ok
	ok = _check("clock_jaw", Vector2i(192, 104), 3, false) and ok
	ok = _check("ending_dawn", Vector2i(320, 180), 1, false) and ok
	if ok:
		print("NIGHT HORROR PASS: 8 imported textures, 18 distinct frames, correct transparency.")
	quit(0 if ok else 1)


func _check(id: String, frame_size: Vector2i, count: int, transparent: bool) -> bool:
	var texture := ResourceLoader.load(BASE + id + ".png") as Texture2D
	if texture == null or Vector2i(texture.get_size()) != frame_size * Vector2i(count, 1):
		push_error("Missing texture or incorrect strip dimensions: " + id)
		return false
	var image := texture.get_image()
	var seen_frames: Array[PackedByteArray] = []
	for i in count:
		var atlas := AtlasTexture.new()
		atlas.atlas = texture
		atlas.region = Rect2(Vector2(i * frame_size.x, 0), frame_size)
		var frame := image.get_region(Rect2i(atlas.region))
		if frame.get_used_rect().size == Vector2i.ZERO:
			push_error("Empty frame: " + id)
			return false
		if (frame.get_pixel(0, 0).a == 0.0) != transparent:
			push_error("Unexpected corner alpha: " + id)
			return false
		if seen_frames.has(frame.get_data()):
			push_error("Duplicate frame: " + id)
			return false
		seen_frames.append(frame.get_data())
	return true
