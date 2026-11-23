class_name NightInput
extends RefCounted

var move := Vector2.ZERO
var aim := Vector2.UP
var _edges: Array[Dictionary] = []

func press(action: String, direction: Vector2) -> void:
	if action not in ["probe", "throw"] or direction.length_squared() < 0.0001:
		return
	# Remember the pointer at the instant of each click, even if the next packet is delayed.
	if _edges.size() < 4:
		_edges.append({"action":action, "aim":direction.normalized()})

func release_all() -> void:
	move = Vector2.ZERO
	_edges.clear()

func sample(seq: int) -> Dictionary:
	var direction := aim.normalized()
	var action := "none"
	if not _edges.is_empty():
		var edge: Dictionary = _edges.pop_front()
		direction = edge.aim
		action = edge.action
	return {"seq":seq, "mx":move.x, "my":move.y, "ax":direction.x, "ay":direction.y, "action":action}
