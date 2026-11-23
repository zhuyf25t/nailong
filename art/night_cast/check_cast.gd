extends SceneTree

const BASE := "res://assets/night/cast/"


func _initialize() -> void:
	var ok := true
	ok = _sheet("dragon", Vector2i(32, 40), 3, 4) and ok
	ok = _sheet("frog", Vector2i(48, 48), 4, 1) and ok
	ok = _sheet("egg", Vector2i(48, 48), 4, 1) and ok
	for actor: String in ["dragon", "frog", "egg"]:
		ok = _sheet(actor + "_portrait", Vector2i(64, 64), 1, 1) and ok
	ok = _sheet("hand", Vector2i(32, 40), 1, 1) and ok
	for actor: String in ["frog", "egg"]:
		var image := (load(BASE + actor + ".png") as Texture2D).get_image()
		var left := image.get_region(Rect2i(48, 0, 48, 48)).get_used_rect()
		var right := image.get_region(Rect2i(96, 0, 48, 48)).get_used_rect()
		if right.end.x - left.end.x < 3 or right.position.x - left.position.x < 3:
			push_error("Reaching silhouette is ambiguous: " + actor)
			ok = false
	if ok:
		print("NIGHT CAST PASS: seven Godot textures, twenty distinct poses, both reach silhouettes.")
	quit(0 if ok else 1)


func _sheet(id: String, size: Vector2i, columns: int, rows: int) -> bool:
	var texture := ResourceLoader.load(BASE + id + ".png") as Texture2D
	if texture == null or Vector2i(texture.get_size()) != size * Vector2i(columns, rows):
		push_error("Unexpected imported dimensions for " + id)
		return false
	var sprite := Sprite2D.new()
	sprite.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	sprite.texture = texture
	sprite.hframes = columns
	sprite.vframes = rows
	var seen: Array[PackedByteArray] = []
	var image := texture.get_image()
	var ok := true
	for row in range(rows):
		for column in range(columns):
			sprite.frame_coords = Vector2i(column, row)
			var pixels := image.get_region(Rect2i(sprite.frame_coords * size, size))
			var bounds := pixels.get_used_rect()
			if pixels.get_pixel(0,0).a > 0.0 or bounds.size.x < size.x / 2 or bounds.size.y < size.y / 2:
				push_error("Empty or clipped frame in " + id)
				ok = false
			var data := pixels.get_data()
			if seen.has(data):
				push_error("Duplicate pose in " + id)
				ok = false
			seen.append(data)
	sprite.free()
	return ok
