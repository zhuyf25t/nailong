class_name NightInput
extends RefCounted

var move := Vector2.ZERO
var aim := Vector2.UP
var holding := false
var _edges: Array[Dictionary] = []
var _relay_left_down := false

func press(action: String, direction: Vector2) -> void:
	if action not in ["probe", "throw"] or direction.length_squared() < 0.0001:
		return
	_queue(action, direction)

# A borrowed bottle remains held without auto-repeating catches. Only the matching
# release of a press captured by this playfield may send it on its way.
func relay_left(down: bool, direction: Vector2, over_floor: bool) -> void:
	if down == _relay_left_down or (down and not over_floor):
		return
	_relay_left_down = down
	_queue("catch" if down else "release", direction if not direction.is_zero_approx() else aim)

func _queue(action: String, direction: Vector2) -> void:
	_edges.append({"action":action, "aim":direction.normalized(), "move":move})

func has_edges() -> bool:
	return not _edges.is_empty()

func release_all() -> void:
	move = Vector2.ZERO
	holding = false
	_relay_left_down = false
	_edges.clear()

static func neutral(seq: int, action := "none") -> Dictionary:
	return {"seq":seq, "mx":0.0, "my":0.0, "ax":0.0, "ay":-1.0, "action":action}

func sample(seq: int) -> Dictionary:
	var direction := aim.normalized()
	var motion := move
	var action := "hold" if holding else "none"
	if not _edges.is_empty():
		var edge: Dictionary = _edges.pop_front()
		direction = edge.aim
		motion = edge.move
		action = edge.action
	return {"seq":seq, "mx":motion.x, "my":motion.y, "ax":direction.x, "ay":direction.y, "action":action}
