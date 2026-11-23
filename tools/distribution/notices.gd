extends SceneTree


func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	var output := FileAccess.open(args[0], FileAccess.WRITE)
	if output == null:
		quit(1)
		return
	output.store_line(Engine.get_license_text())
	output.store_line(JSON.stringify(Engine.get_copyright_info(), "\t"))
	output.store_line(JSON.stringify(Engine.get_license_info(), "\t"))
	output.close()
	quit(0)
