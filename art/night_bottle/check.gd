extends SceneTree


func _initialize() -> void:
	var texture := load("res://assets/night/props/pressure_bottle.png") as Texture2D
	if texture == null or texture.get_size() != Vector2(96, 144):
		push_error("Expected an imported 96 x 144 bottle texture")
		quit(1)
		return
	var image := texture.get_image()
	var occupied := image.get_used_rect()
	if image.detect_alpha() != Image.ALPHA_BIT or occupied.size.y < 110:
		push_error("The bottle must have a visible body and crisp transparent margins")
		quit(1)
		return
	print("Night bottle imported: ", image.get_size(), ", opaque bounds ", occupied)
	quit()
