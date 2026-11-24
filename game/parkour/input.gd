class_name ParkourInput
extends RefCounted

var move := Vector2.ZERO
var _action := "none"

func press_read() -> void:
	_action = "read"

func press_teleport() -> void:
	_action = "teleport"

func sample(seq: int) -> Dictionary:
	var action := _action
	_action = "none"
	return {"seq": seq, "mx": move.x, "my": move.y, "action": action}

func clear() -> void:
	move = Vector2.ZERO
	_action = "none"
