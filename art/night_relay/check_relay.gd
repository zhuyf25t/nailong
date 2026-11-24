extends SceneTree

const BASE := "res://assets/night/relay/"
const SIZES := {
	"cargo": Vector2i(18, 24), "echo": Vector2i(18, 24), "pipe_rivet": Vector2i(27, 16),
	"label_hand": Vector2i(32, 44), "near_glass": Vector2i(80, 64)
}

func _initialize() -> void:
	for name_key: String in SIZES:
		if not _correct_strip(name_key, SIZES[name_key]):
			quit(1)
			return
	var full := (load(BASE + "cargo.png") as Texture2D).get_image()
	var hollow := (load(BASE + "echo.png") as Texture2D).get_image()
	if full.get_pixel(9, 11).a < 1.0 or hollow.get_pixel(9, 11).a >= 0.5:
		push_error("Empty bottle must show the belt through its shoulder.")
		quit(1)
		return
	print("RELAY ART PASS: 5 imported textures, 15 distinct frames; hollow/full glass distinguished.")
	quit(0)

func _correct_strip(name_key: String, size: Vector2i) -> bool:
	var texture := ResourceLoader.load(BASE + name_key + ".png") as Texture2D
	if texture == null or Vector2i(texture.get_size()) != size * Vector2i(3, 1):
		push_error("Wrong texture dimensions: " + name_key)
		return false
	var frames: Array[PackedByteArray] = []
	for i in 3:
		var atlas := AtlasTexture.new()
		atlas.atlas = texture
		atlas.region = Rect2(Vector2(size.x * i, 0), size)
		var crop := atlas.get_image()
		if crop == null or crop.get_size() != size or crop.get_used_rect().size == Vector2i.ZERO:
			push_error("Unexpected empty atlas frame: " + name_key)
			return false
		if frames.has(crop.get_data()):
			push_error("Duplicated atlas frame: " + name_key)
			return false
		frames.append(crop.get_data())
	return true
