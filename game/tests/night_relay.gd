extends RefCounted

## All decisions use the public intercept rings, cap trajectories and window reactions.
## Mouse-down and mouse-up enter the live viewport independently, with movement in between.
var h: SceneTree
var combo_start := -1
var combo_ms := 0
var receipt_scope := ""
var logged_signal := -1

func _trace(action: String, at: Vector2) -> void:
	var tick := int(h._state().tick)
	var now := Time.get_ticks_msec()
	if combo_start < 0:
		combo_start = tick
		combo_ms = now
	print("RETURN LINE INPUT | %04d ms | server +%02d ticks | %s | player %s | aim %s" %
		[now-combo_ms, tick-combo_start, action, h._position(), at])

func _init(host: SceneTree) -> void:
	h = host

func view() -> Dictionary:
	var relay: Variant = h._story().get("relay")
	return relay if relay is Dictionary else {}

func observe(state: Dictionary) -> void:
	var relay: Variant = state.get("story",{}).get("relay")
	if not relay is Dictionary: return
	var scope := "%s/%d/%s" % [state.runId,state.order,relay.leg]
	if scope != receipt_scope:
		receipt_scope = scope
		logged_signal = -1
	for event: Dictionary in relay.events:
		if int(event.id) > logged_signal:
			logged_signal = int(event.id)
			if event.kind in ["catch","release","window_hit","late","sign","hand_strike","break","lower","loop","switch"]:
				print("Factory action ",state.night,"/",state.order," ",relay.leg," ",event.atTick," ",event.kind," ",Vector2(event.x,event.y))

func _bottle(kind: String) -> Dictionary:
	for bottle: Dictionary in view().get("bottles", []):
		if bottle.kind == kind: return bottle
	return {}

func _pane(slot: int) -> Dictionary:
	for pane: Dictionary in view().get("windows", []):
		if int(pane.slot) == slot: return pane
	return {}

func _mouse(down: bool, at: Vector2) -> void:
	var screen: Vector2 = h.app.world.world_to_screen(at)
	var motion := InputEventMouseMotion.new()
	motion.position = screen
	motion.global_position = screen
	h.root.push_input(motion, true)
	var edge := InputEventMouseButton.new()
	edge.position = screen
	edge.global_position = screen
	edge.button_index = MOUSE_BUTTON_LEFT
	edge.pressed = down
	h.root.push_input(edge, true)

func _last_event() -> int:
	var latest := -1
	for event: Dictionary in view().get("events", []):
		latest = maxi(latest, int(event.id))
	return latest

func _key(code: Key, down: bool) -> void:
	var edge := InputEventKey.new()
	edge.keycode = code
	edge.physical_keycode = code
	edge.pressed = down
	Input.parse_input_event(edge)
	Input.flush_buffered_events()

func _event_after(after: int, kinds: Array, slot := -1) -> Dictionary:
	for event: Dictionary in view().get("events", []):
		if int(event.id) > after and event.kind in kinds and (slot < 0 or int(event.slot) == slot):
			return event
	return {}

func _diagnose(label: String) -> bool:
	var relay := view()
	var summary := []
	for bottle: Dictionary in relay.get("bottles",[]):
		summary.append([bottle.kind,bottle.state,bottle.eta,bottle.catchable,bottle.catchX,bottle.catchY])
	return h._fail("%s; leg=%s stage=%s bottles=%s cap=%s last signals=%s" % [label, relay.get("leg"),relay.get("stage"),summary,relay.get("cap"),relay.get("events",[]).slice(-5)])

func _catch(kind := "cargo", required_rail := "", capture := "", combo := false) -> bool:
	var limit := Time.get_ticks_msec() + 15000
	var pressed_tick := -100
	var pressed := false
	var fired := false
	var left_down := false
	while Time.get_ticks_msec() < limit:
		var bottle := _bottle(kind)
		if bottle.is_empty(): return _diagnose("no visible " + kind + " to intercept")
		if bottle.state == "held":
			if left_down: _key(KEY_A,false)
			h._release_keys()
			if not capture.is_empty(): await h._capture(capture)
			return true
		var at := Vector2(bottle.catchX,bottle.catchY)
		var tick := int(h._state().tick)
		if required_rail.is_empty() or bottle.state == required_rail:
			if not required_rail.is_empty() and not capture.is_empty() and int(bottle.eta) > 3 and int(bottle.eta) < 16:
				await h._capture(capture)
			if combo and not fired and int(bottle.eta) > 24:
				h._release_keys()
				await h.process_frame
				continue
			if combo:
				var needs_left: bool = h._position().x > at.x + 2
				if needs_left != left_down:
					_key(KEY_A,needs_left)
					left_down = needs_left
			else:
				var stand := at + Vector2(0,6) if int(h._state().night) == 3 else at
				h._direction(stand - h._position())
			if combo and not fired and int(bottle.eta) <= 17 and left_down:
				var pipe := Vector2(418,112)
				for p: Dictionary in view().get("pipes",[]):
					if float(p.x) >= pipe.x: pipe = h._point(p)
				var reflected := Vector2(2 * 468.0 - pipe.x, pipe.y)
				var cursor: Vector2 = h._position() + h._position().direction_to(reflected) * 90.0
				_trace("A held moving left / right mouse at right rail",cursor)
				h._click_world(cursor, MOUSE_BUTTON_RIGHT)
				fired = true
			if bool(bottle.catchable) and not pressed:
				if combo: _trace("left mouse down / catch",at)
				if int(h._state().night) == 1 and int(h._state().order) == 1:
					var key := h._find("RelayKey") as Label
					if key == null or not key.is_visible_in_tree() or not key.text.contains("左键"): return _diagnose("the first physical interception lacks a visible mouse hint")
				_mouse(true, at)
				pressed_tick = tick
				pressed = true
				if int(h._state().night) == 1 and int(h._state().order) == 1: await h._capture("03-first-catch")
		else:
			h._release_keys()
		if pressed and tick - pressed_tick >= 4:
			_mouse(false, at)
			pressed = false
		await h.process_frame
	return _diagnose("missed the " + kind + " intercept on " + required_rail)

func _replenish() -> bool:
	if int(view().get("caps",0)) > 0: return true
	if not await h._walk(h._point(view().rack), 8, "replenish caps at the visible rack"): return false
	if not await h._until(func(): return int(view().get("caps",0)) > 0, 3, "rack refills caps"): return false
	if view().leg == "dispatch" and int(h._state().night) >= 3:
		return await h._walk(Vector2(365,151), 5, "leave the sounding floor with a full rack of caps")
	return true

func _shoot_cap(target: Vector2) -> bool:
	if not await _replenish(): return false
	if not await h._until(func(): return view().get("cap") == null, 3, "previous cap leaves the rail"): return false
	h._click_world(target, MOUSE_BUTTON_RIGHT)
	return true

func _switch() -> bool:
	var start: String = view().route
	if not await _shoot_cap(h._point(view()["switch"])): return false
	return await h._until(func(): return view().get("route",start) != start or view().get("stage") == "complete", 2, "cap physically strikes the switch")

func _recipient() -> int:
	var windows: Array = view().get("windows", [])
	if windows.size() == 1: return int(windows[0].slot)
	for candidate: Dictionary in windows:
		var slot := int(candidate.slot)
		var fork: Vector2 = h._point(view()["switch"])
		var outlet: Vector2 = h._point(_pane(slot))
		if Geometry2D.get_closest_point_to_segment(fork,h._position(),outlet).distance_to(fork) <= 13:
			var sidestep: Vector2 = h._position() + Vector2(36 if h._position().x >= fork.x else -36,0)
			sidestep.x = clampf(sidestep.x,26,454)
			if not await h._walk(sidestep,6,"clear the switch before probing the glass"): return -1
		var before := _last_event()
		if not await _shoot_cap(h._point(_pane(slot))): return -1
		if not await h._until(func(): return not _event_after(before, ["cap_caught","cap_through"], slot).is_empty(), 3, "read the cap at window %d" % slot): return -1
		if not _event_after(before,["cap_caught"],slot).is_empty(): return slot
		if int(h._state().night) == 2: await h._capture("04-cap-through")
	h._fail("no window physically caught a cap")
	return -1

func _loop(kind := "cargo", screenshot := "") -> bool:
	var before := _last_event()
	_mouse(false, h._point(view().inlet))
	if not await h._until(func(): return _bottle(kind).get("state") == "loop" or not _event_after(before,["loop"]).is_empty(), 3, "bottle enters the short belt"): return false
	if not screenshot.is_empty(): await h._capture(screenshot)
	return true

func _send_bottle(slot: int, combo := false) -> bool:
	var pane := _pane(slot)
	if pane.is_empty(): return _diagnose("missing chosen window")
	if view().leg == "dispatch" and not combo:
		var inlet: Vector2 = h._point(view().inlet)
		var outlet: Vector2 = h._point(pane)
		if Geometry2D.get_closest_point_to_segment(inlet,h._position(),outlet).distance_to(inlet) < 14:
			for offset: Vector2 in [Vector2(-35,0),Vector2(35,0),Vector2(0,-34)]:
				var clear: Vector2 = h._position()+offset
				if Geometry2D.get_closest_point_to_segment(inlet,clear,outlet).distance_to(inlet) > 20:
					if not await h._walk(clear,5,"step around the short-belt intake before releasing the bottle"): return false
					break
	if pane.has("openTicks"):
		if not await h._until(func():
			var look := _pane(slot)
			if look.is_empty(): return false
			var flight := ceili(h._position().distance_to(h._point(look)) / 16.0)
			return look.open and (int(look.openTicks) < 0 or int(look.openTicks) >= flight+3), 4, "read enough time on the shutter for the bottle to fly"): return false
	elif view().leg == "dispatch" and int(h._state().night)>1 and not combo:
		# Wait for a fresh opening so a distant throw has time to fly across the floor.
		if pane.open and not await h._until(func(): return not _pane(slot).get("open",true), 4,"watch the shutter finish its current opening"): return false
	if not await h._until(func(): return _pane(slot).get("open",false), 4, "moving slot opens"): return false
	if combo: _trace("left mouse up / release toward acknowledged pane",h._point(_pane(slot)))
	_mouse(false, h._point(_pane(slot)))
	return true

func _await_receipt(before: int) -> bool:
	for attempt in range(3):
		var start := int(h._state().tick)
		if not await h._until(func(): return int(h._state().delivered) > before or view().get("stage") == "signed" or (int(h._state().tick)-start > 3 and _bottle("cargo").get("state") in ["inbound","loop","lower"]), 5, "see the bottle sign or visibly return onto a belt"): return false
		if int(h._state().delivered) > before or view().get("stage") == "signed":
			return await h._until(func(): return int(h._state().delivered) > before, 5, "signed receipt enters the shift ledger")
		if int(h._state().night) == 5 and view().get("route") == "left":
			if not await _switch(): return false
		if not await _catch(): return false
		if int(h._state().night) >= 3 and not await h._walk(Vector2(367,149),5,"carry the rescued bottle back to the rubber mat"): return false
		var confirmed := await _recipient()
		if confirmed < 0 or not await _send_bottle(confirmed): return false
	return _diagnose("could not turn the rescued bottle into a signed receipt")

func factory_night(night: int, count := 3) -> bool:
	for order in range(1,count+1):
		if not await h._until(func(): return view().get("leg") == "dispatch" and view().get("stage") == "running", 5, "dispatch starts"): return false
		if night == 1 and order == 1: await h._capture("03-incoming")
		if night == 5 and order == 1: await h._capture("07-two-bottles")
		if night == 5 and not await _switch(): return false
		var rail := "lower" if night == 4 and order == 3 else ""
		var combo := night == 4 and order == 1
		if not await _catch("cargo",rail,"06-lower-rescue" if not rail.is_empty() else "",combo): return false
		if combo:
			var leave: Vector2 = h._position()+Vector2(22,0)
			_trace("D / reverse carrying the bottle",leave)
			_key(KEY_D,true)
			if not await h._until(func(): return h._position().x >= leave.x, 2, "reverse direction while holding the cargo"): return false
			_key(KEY_D,false)
		if night == 3:
			if not await h._walk(Vector2(120,146), 6, "cross the cracked strip carrying the soda to the rubber mat"): return false
			if order == 1: await h._capture("05-listening-floor")
		if night == 4 and order == 2:
			if not await _loop("cargo","06-loop"): return false
			if not await _switch(): return false
			if not await _catch("cargo","","06-return-catch"): return false
		if night >= 4 and not combo:
			if not await h._walk(Vector2(365 if h._position().x >= 240 else 120,146),6,"carry the soda off the pursued steel floor"): return false
		var slot := await _recipient()
		if slot < 0: return false
		if night == 4 and order == 1: await h._capture("06-direct")
		var before := int(h._state().delivered)
		if not await _send_bottle(slot,combo): return false
		if night == 1 and order == 3:
			if not await h._until(func(): return _bottle("cargo").get("state") == "lower", 3, "the last signed bottle rebounds onto the lower belt"): return false
			if not await _catch("cargo","lower","03-rebound") or not await _send_bottle(slot): return false
		if combo:
			if not await h._until(func(): return view().get("stage") == "signed" or _bottle("cargo").get("state") == "lower",4,"see whether the direct throw landed before closing"): return false
			for e: Dictionary in view().get("events",[]):
				if e.kind in ["cap_bounce","pipe","catch","release","sign","late","window_hit"]:
					print("RETURN LINE EVENT | relay tick ", e.atTick, " | ", e.kind, " | ", Vector2(e.x,e.y))
			if _bottle("cargo").get("state") == "lower":
				if not await _catch("cargo","lower") or not await _send_bottle(slot): return false
		if not await _await_receipt(before): return false
	return true

func _carried_sound(kind: String) -> bool:
	# Walk a short hard-floor stretch with the bottle still in our hand.
	var leave: Vector2 = h._position() + Vector2(-24 if h._position().x > 240 else 24,8)
	if not await h._walk(leave, 7, "carry the bottle across the sounding floor"): return false
	if not _bottle(kind).get("sounds",[]).is_empty(): return true
	if not await _shoot_cap(Vector2(464,120)): return false
	return await h._until(func(): return not _bottle(kind).get("sounds",[]).is_empty(), 4, "visible sound notches on the carried bottle")

func maintenance() -> bool:
	if not await _catch() or not await _carried_sound("cargo"): return false
	if not await _loop("cargo","08-maintenance-relay"): return false
	if not await _catch(): return false
	var windows: Array = view().get("windows",[])
	if windows.size() != 1: return _diagnose("one marked maintenance receiver required")
	if not await _send_bottle(int(windows[0].slot)): return false
	return await h._until(func(): return view().get("stage") == "complete" or view().is_empty(), 5, "sign the maintenance cargo")

func signature() -> bool:
	var incoming := _bottle("cargo")
	if incoming.is_empty(): return _diagnose("the signature chute should start a visible bottle")
	var target := Vector2(incoming.catchX, incoming.catchY)
	h._direction(target-h._position())
	if not await _switch() or not await _catch(): return false
	var windows: Array = view().get("windows",[])
	if windows.size() != 1: return _diagnose("the signature chute needs one marked receiver")
	await h._capture("10-signature-relay")
	return await _send_bottle(int(windows[0].slot))

