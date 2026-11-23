extends SceneTree
## Run after importing the Godot project, passing this file to --script.

func _initialize() -> void:
	for id in ["dragon", "egg", "frog"]:
		if not _check_actor(id):
			push_error("Character asset check failed: %s" % id)
			quit(1)
			return
	print("CAST PASS: 3 portraits, 72 game frames, transparency and directional poses")
	quit(0)

func _check_actor(id: String) -> bool:
	var base := "res://assets/characters/" + id
	var portrait := ResourceLoader.load(base + "_portrait.png") as Texture2D
	var sheet := ResourceLoader.load(base + "_sheet.png") as Texture2D
	if not portrait or not sheet:
		return false
	if portrait.get_size() != Vector2(80, 80) or sheet.get_size() != Vector2(192, 128):
		return false
	var face := portrait.get_image()
	var pixels := sheet.get_image()
	if not face or not pixels or face.get_pixel(0, 0).a != 0.0:
		return false
	var face_bounds := face.get_used_rect()
	if face_bounds.size.x < 50 or face_bounds.size.y < 60:
		return false
	for row in range(4):
		var poses: Array[Image] = []
		for col in range(6):
			var sample := pixels.get_region(Rect2i(32*col, 32*row, 32, 32))
			var bounds := sample.get_used_rect()
			if bounds.size.x < 15 or bounds.size.y < 20:
				return false
			if bounds.position.x < 1 or bounds.position.y < 1 or bounds.end.x > 31 or bounds.end.y > 31:
				return false
			poses.append(sample)
		if poses[0].get_data() == poses[1].get_data() or poses[2].get_data() == poses[4].get_data():
			return false
		if row > 0:
			var front := pixels.get_region(Rect2i(0, 0, 32, 32))
			if front.get_data() == poses[0].get_data():
				return false
	return true
