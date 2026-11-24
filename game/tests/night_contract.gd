extends SceneTree

const Wire = preload("res://night/state.gd")
const Sample = preload("res://night/input.gd")
const Api = preload("res://night/api.gd")
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
	var story := {"step":"observe_windows","room":"maintenance","objective":"看哪扇窗慢了两秒。","cue":"hatch",
		"stageTick":40,"cueId":1,"round":0,"sleepTicks":0,"sleepMax":0,"braceTicks":0,"braceMax":0,
		"tiles":[{"x":216,"y":190,"state":"warn","ticks":20}],
		"people":[{"kind":"monitor","slot":1,"x":240.0,"y":76.0}],"marks":[{"kind":"window","x":240,"y":117}]}
	var observed := view.duplicate(true)
	observed.story = story
	_expect(not Wire.snapshot(observed).is_empty(), "visible campaign story accepted")
	for pair: Array in [["room",2],["stageTick",-1],["cueId",0.5],["objective","x".repeat(241)],
			["round",4],["sleepTicks",1],["braceTicks",1],["sleepMax",-1],["braceMax","14"],
			["marks",[{"kind":"gate","x":481,"y":20}]],["people",[{"kind":"monitor","slot":9,"x":240,"y":88}]],
			["tiles",[{"x":216,"y":190,"state":"instant_win","ticks":0}]],["tiles",[{"x":216,"y":190,"state":"hole","ticks":-1}]]]:
		bad = observed.duplicate(true)
		bad.story[pair[0]] = pair[1]
		_expect(Wire.snapshot(bad).is_empty(), "invalid story " + str(pair[0]))
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
	controls.move = Vector2.RIGHT
	controls.press("probe", Vector2.UP)
	controls.holding = true
	_expect(controls.sample(3).action == "probe" and controls.sample(4).action == "hold" and controls.sample(5).action == "hold", "held mouse repeats on simulation input frames")
	controls.press("throw", Vector2.LEFT)
	controls.release_all()
	var blurred := controls.sample(6)
	_expect(blurred.action == "none" and blurred.mx == 0 and blurred.my == 0, "focus loss releases movement and pending gesture")
	_relay_controls()
	_relay_wire(observed)
	print("Night typed client contract ", "PASS" if errors == 0 else "FAIL")
	quit(errors)

func _relay_controls() -> void:
	var controls := Sample.new()
	controls.move = Vector2.LEFT
	controls.relay_left(true,Vector2.UP,true)
	controls.relay_left(true,Vector2.RIGHT,true)
	controls.move = Vector2.DOWN
	controls.press("probe",Vector2.RIGHT)
	controls.move = Vector2.RIGHT
	controls.relay_left(false,Vector2(-0.6,-0.8),false)
	controls.relay_left(false,Vector2.DOWN,true)
	var down := controls.sample(0)
	var probe := controls.sample(1)
	var up := controls.sample(2)
	_expect(down.action == "catch" and down.mx == -1.0 and down.ay == -1.0, "one physical catch with its own motion")
	_expect(probe.action == "probe" and probe.my == 1.0 and probe.ax == 1.0, "second button stays independent")
	_expect(up.action == "release" and up.mx == 1.0 and is_equal_approx(up.ax,-0.6), "release retains raw free aim beyond floor")
	_expect(controls.sample(3).action == "none", "no synthesized catch or duplicate release")
	controls.relay_left(true,Vector2.DOWN,false)
	controls.relay_left(false,Vector2.DOWN,true)
	_expect(not controls.has_edges(), "hovering into floor while button is held does not catch")
	for i in 6:
		controls.relay_left(true,Vector2.LEFT,true)
		controls.relay_left(false,Vector2.RIGHT,true)
	for i in 12:
		var next := controls.sample(i)
		_expect(next.action == ("catch" if i % 2 == 0 else "release"), "queued input burst " + str(i))
	controls.relay_left(true,Vector2.LEFT,true)
	controls.release_all()
	controls.relay_left(false,Vector2.UP,true)
	_expect(not controls.has_edges(), "stale release after pause or scene transition is ignored")

func _relay_wire(view: Dictionary) -> void:
	var raw := view.duplicate(true)
	var relay := {"leg":"dispatch","tick":43,"stage":"running","route":"right","caps":2,"clean":true,"routed":true,"recaught":false,"objective":"接住汽水",
		"bottles":[{"id":1,"kind":"cargo","state":"inbound","x":150,"y":211,"catchX":145,"catchY":215,"eta":3,
			"window":10,"radius":18,"catchable":true,"sounds":[{"kind":"pipe","gap":5}],
			"track":[{"x":110,"y":190},{"x":145,"y":215}]}],
		"cap":{"x":300,"y":190,"bounced":true},
		"windows":[{"slot":0,"x":104,"y":78,"halfWidth":22,"open":true,"openTicks":-1,"reaction":"caught","ticks":7}],
		"switch":{"x":240,"y":140},"inlet":{"x":400,"y":149},"rack":{"x":88,"y":220},"pipes":[{"x":90,"y":105},{"x":400,"y":130}],
		"hunter":{"x":250,"y":200,"targetX":320,"targetY":240,"state":"warn","ticks":9},
		"events":[{"id":4,"kind":"cap_fire","x":200,"y":211,"slot":-1,"atTick":32},
			{"id":5,"kind":"cap_caught","x":104,"y":78,"slot":0,"atTick":42}]}
	raw.story.relay = relay
	var decoded := Wire.snapshot(JSON.parse_string(JSON.stringify(raw)))
	_expect(not decoded.is_empty() and decoded.story.relay.bottles[0].catchable and decoded.story.relay.events[1].kind == "cap_caught", "relay nested in an existing room")
	var bad := raw.duplicate(true)
	bad.story.relay.events.reverse()
	_expect(Wire.snapshot(bad).is_empty(),"events strictly increase")
	bad = raw.duplicate(true)
	bad.story.relay.hunter.targetX = 481
	_expect(Wire.snapshot(bad).is_empty(),"hunter target bounded")
	bad = raw.duplicate(true)
	bad.story.relay.bottles[0].sounds[0].kind = "private_trace"
	_expect(Wire.snapshot(bad).is_empty(),"unknown recorded sound")
	bad = raw.duplicate(true)
	bad.story.relay.bottles[0].catchable = 1
	_expect(Wire.snapshot(bad).is_empty(),"catch prompt is a boolean")
	bad = raw.duplicate(true)
	bad.story.relay.windows[0].openTicks = 0
	_expect(Wire.snapshot(bad).is_empty(),"open slot has positive or unlimited remaining time")
	bad = raw.duplicate(true)
	bad.story.relay.bottles[0].track.append_array([{"x":40,"y":35},{"x":90,"y":50}])
	_expect(Wire.snapshot(bad).is_empty(),"physical tracks have at most one intermediate bend")
	bad = raw.duplicate(true)
	bad.story.relay.bottles[0].state = "held"
	var held := Wire.snapshot(bad)
	_expect(not Api.input_context_changed(decoded,held),"catch acknowledgement retains queued release")
	bad.story.relay.events.append({"id":6,"kind":"retry","x":145,"y":215,"slot":-1,"atTick":43})
	var restarted := Wire.snapshot(bad)
	_expect(Api.input_context_changed(held,restarted) and not Api.input_context_changed(restarted,restarted),"only new retry flushes input")
	raw.story.relay = null
	var after := Wire.snapshot(raw)
	_expect(not after.is_empty() and Api.input_context_changed(decoded,after),"relay closes in the same old story step")
	raw.story.step = "fourth_bottle"
	raw.story.fourthSounds = [{"kind":"step","gap":0},{"kind":"pipe","gap":7},{"kind":"bell","gap":2}]
	var fourth := Wire.snapshot(raw)
	_expect(not fourth.is_empty() and fourth.story.fourthSounds[1].gap == 7, "fourth bottle preserves sound rhythms")
	raw.story.fourthSounds[0].gap = -1
	_expect(Wire.snapshot(raw).is_empty(), "invalid fourth bottle rhythm")

func _expect(value: bool, description: String) -> void:
	if not value:
		errors += 1
		push_error(description)
