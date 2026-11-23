extends SceneTree

const Wire = preload("res://night/state.gd")
const Sample = preload("res://night/input.gd")
const Factory = preload("res://night/world.gd")
var errors := 0

func _initialize() -> void:
	var view := {"runId":"27b49745-ff79-4b87-962b-56bf7239dbee","ack":-1,"tick":0,
		"night":1,"order":1,"phase":"serving","player":{"x":240,"y":220},
		"windows":[{"slot":1,"actor":"frog","look":"still"}],"memory":"left","probe":"none","probeTicks":0,
		"pressure":-1,"bank":false,"dim":false,"belt":0,"lever":"left","latched":false,"escapeTicks":0,
		"bottle":null,"chase":null,"event":"start","eventId":0,"delivered":0}
	_expect(not Wire.snapshot(JSON.parse_string(JSON.stringify(view))).is_empty(), "roundtrip")
	var factory := Factory.new()
	factory.set_view(Wire.snapshot(view))
	_expect(factory.delivery_target(Vector2(248,45)) == Vector2(240,78), "recipient body aims at the catch line")
	_expect(factory.delivery_target(Vector2(240,95)) == Vector2(240,78), "first-night teaching sign is clickable")
	for point: Vector2 in [Vector2(104,45), Vector2(376,45), Vector2(12,124)]:
		_expect(factory.delivery_target(point) == point, "closed shutters and bank rail retain free aim")
	factory.free()
	for pair: Array in [["runId","bad"],["phase","teleport"],["event","score_override"],["latched","false"],["pressure",-2],["ack",0.5],["windows",[]]]:
		var bad := view.duplicate(true)
		bad[pair[0]] = pair[1]
		_expect(Wire.snapshot(bad).is_empty(), str(pair[0]))
	var bad := view.duplicate(true)
	bad.player.x = INF
	_expect(Wire.snapshot(bad).is_empty(), "finite position")
	bad = view.duplicate(true)
	bad.erase("bottle")
	_expect(Wire.snapshot(bad).is_empty(), "explicit nullable projectile")
	bad = view.duplicate(true)
	bad.phase = "escaping"
	_expect(Wire.snapshot(bad).is_empty(), "escape has a pursuer")
	bad.chase = {"x":100,"y":90}
	_expect(not Wire.snapshot(bad).is_empty(), "server pursuer position")
	_expect(Wire.profile({"unlocked":4,"cleared":[1,2,3],"bestClean":3}).unlocked == 4, "progress")
	_expect(Wire.profile({"unlocked":4,"cleared":[1,3],"bestClean":3}).is_empty(), "missing completed night")
	var controls := Sample.new()
	controls.press("probe", Vector2.LEFT)
	controls.aim = Vector2.RIGHT
	controls.press("throw", Vector2.UP)
	var first := controls.sample(0)
	var second := controls.sample(1)
	_expect(first.action == "probe" and first.ax < 0 and second.action == "throw" and second.ay < 0, "rapid clicks retain order and aim")
	_expect(controls.sample(2).action == "none", "edge consumed once")
	print("Night typed client contract ", "PASS" if errors == 0 else "FAIL")
	quit(errors)

func _expect(value: bool, description: String) -> void:
	if not value:
		errors += 1
		push_error(description)
