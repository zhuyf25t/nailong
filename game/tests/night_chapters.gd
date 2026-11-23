extends RefCounted

## Drives the same room markers, moving window images, floor warnings and buttons
## available to the player. The host sends physical input through the main scene.
var h: SceneTree

func _init(host: SceneTree) -> void:
	h = host

func _step() -> String:
	return str(h._story().get("step", ""))

func _wait_step(expected: String, secs := 5) -> bool:
	return await h._until(func(): return _step() == expected, secs, "expected story step " + expected)

func _near_mark(kind: String) -> bool:
	var mark: Dictionary = h._marker(kind)
	if mark.is_empty(): return h._fail("missing room marker " + kind)
	return await h._walk(h._point(mark), 10, "reach " + kind)

func _interact() -> void:
	h._click_world(h._position() + Vector2(0,-30), MOUSE_BUTTON_LEFT)

func _use_mark(kind: String, expected: String) -> bool:
	if not await _near_mark(kind): return false
	_interact()
	return await _wait_step(expected)

func _ticks(duration: int) -> bool:
	var goal := int(h._state().tick) + duration
	return await h._until(func(): return int(h._state().tick) >= goal, 4.0 + duration * 0.1, "normal clock ticks")

func _observe_delay() -> int:
	var marks: Array = h._story().marks.filter(func(m): return m.kind == "window")
	marks.sort_custom(func(a,b): return a.x < b.x)
	if marks.size() != 3: h._fail("three marked monitors required"); return -1
	var positions := {}
	var error := [0.0,0.0,0.0]
	var sample_count := 0
	var waved := false
	var begin := int(h._state().tick)
	var last := -1
	var deadline := Time.get_ticks_msec() + 15000
	while int(h._state().tick) - begin <= 110:
		if Time.get_ticks_msec() > deadline: h._fail("observe monitors"); return -1
		var tick := int(h._state().tick)
		if tick != last:
			last = tick
			var elapsed := tick - begin
			positions[tick] = h._position()
			# Record an asymmetric walk with three distinct turns. Compare each
			# image now to where our own character stood two seconds earlier.
			var target := Vector2(178,142) if elapsed < 37 else (Vector2(315,190) if elapsed < 77 else Vector2(224,220))
			h._direction(target - h._position())
			if elapsed >= 64 and not waved:
				h._click_world(h._position()+Vector2(35,-24), MOUSE_BUTTON_RIGHT)
				waved = true
			var prior := tick - 40
			if positions.has(prior) and elapsed > 47:
				var people: Array = h._story().people.filter(func(p): return str(p.kind).begins_with("monitor"))
				if people.size() != 3: h._fail("expected three visible monitor images"); return -1
				for p: Dictionary in people:
					var slot := int(p.slot)
					if slot < 0 or slot >= marks.size(): h._fail("invalid monitor position"); return -1
					var past: Vector2 = positions[prior]
					var projection := Vector2(marks[slot].x + (past.x - 240.0)*0.11,76.0 + (past.y - 180.0)*0.10)
					error[slot] += h._point(p).distance_squared_to(projection)
				sample_count += 1
				if elapsed >= 104 and not _actors("monitor_probe").is_empty():
					await h._capture("08-maintenance-monitors")
		await h.process_frame
	h._release_keys()
	if sample_count < 12: h._fail("too few observations to distinguish the delay"); return -1
	var best := error.find(error.min())
	var sorted := error.duplicate()
	sorted.sort()
	if sorted[1] - sorted[0] < sample_count: h._fail("two monitor traces are indistinguishable " + str(error)); return -1
	await h._capture("08-maintenance-monitors")
	if not await h._walk(h._point(marks[best]), 10, "stand below the delayed monitor"): return -1
	print("Night 6 compared ", sample_count, " visible monitor frames; selected window ", best+1)
	return best

func maintenance() -> bool:
	if not await _wait_step("enter_hatch") or not await _use_mark("hatch", "observe_windows"): return false
	if await _observe_delay() < 0: return false
	_interact()
	if not await _wait_step("delay_door"): return false
	if not await _near_mark("plate") or not await _ticks(44): return false
	var gate: Dictionary = h._marker("gate")
	if gate.is_empty(): gate = h._marker("gate_open")
	if gate.is_empty(): return h._fail("missing delayed-echo gate")
	if not await h._move_to(h._point(gate)+Vector2(16,0), func(): return _step() == "old_turn", "use the delayed double to open the gate"): return false
	if not await _near_mark("old_tape"): return false
	_interact()
	if not await h._until(func(): return h._story().get("cue") == "archive_turn", 5, "first-night recording turns toward the player"): return false
	if not await h._until(func(): return h._has_caption(), 2, "visible speaker and caption with audio muted"): return false
	await h._capture("09-archive-turn")
	if not await _wait_step("exit_maintenance"): return false
	return await _exit_room("exit")

func _exit_room(kind: String) -> bool:
	var mark: Dictionary = h._marker(kind)
	if mark.is_empty(): return h._fail("missing chamber exit")
	return await h._move_to(h._point(mark), func(): return h._phase() == "won" or h._phase() == "clockout", "cross the chamber exit")

func _record(ordinal: String) -> bool:
	if not await _use_mark("panel", "take_" + ordinal): return false
	if not await _near_mark("plate") or not await _ticks(52): return false
	_interact()
	return await _wait_step("play_" + ordinal)

func signatures() -> bool:
	if not await _wait_step("check_signature") or not await _use_mark("ledger", "record_one"): return false
	if not await _record("one"): return false
	if not await h._move_to(Vector2(254,174), func(): return _step() == "record_two", "cross the first gate alongside the recorded courier"): return false
	if not await _record("two"): return false
	if not await h._walk(Vector2(316,147), 5, "reach the upper aisle before the dividing wall"): return false
	if not await h._walk(Vector2(346,147), 5, "pass the divider on the upper side"): return false
	await h._capture("10-recorded-footsteps")
	if not await h._move_to(Vector2(428,164), func(): return _step() == "help_hold", "cross the recorded second gate"): return false
	if not await h._move_to(Vector2(433,164), func(): return _step() == "exit_signature", "cross the sill while the copy grants half a second"): return false
	return await _exit_room("exit")

func _actors(kind: String) -> Array:
	return h._story().get("people", []).filter(func(person): return person.kind == kind)

func _nearest(candidates: Array, previous: Vector2) -> Vector2:
	var best := Vector2.INF
	for candidate: Dictionary in candidates:
		var at: Vector2 = h._point(candidate)
		if at.distance_squared_to(previous) < best.distance_squared_to(previous): best = at
	return best

func _mouse_held(pressed: bool) -> void:
	var point: Vector2 = h.app.world.world_to_screen(h._position() + Vector2(0,-22))
	var button := InputEventMouseButton.new()
	button.button_index = MOUSE_BUTTON_LEFT
	button.pressed = pressed
	button.position = point
	button.global_position = point
	h.root.push_input(button, true)

func _watch() -> Vector2:
	var revealed := _actors("sleep_frog")
	if revealed.size() != 1: h._fail("a single frog should be visible before the blinds close"); return Vector2.INF
	var last: Vector2 = h._point(revealed[0])
	# Test the early cap and throw inside the same interaction radius as a valid
	# wake-up delivery. A click from the middle of the room would prove nothing.
	if not await h._walk(last, 15, "approach the uncovered window before lights-out"): return Vector2.INF
	if not await _wait_step("sleep_watch", 5): return Vector2.INF
	var total := int(h._story().sleepMax)
	var last_tick := -1
	var braced_stations: Dictionary = {}
	var held := false
	var tested_early := false
	var deadline := Time.get_ticks_msec() + 50000
	while _step() == "sleep_watch":
		if Time.get_ticks_msec() > deadline: h._fail("watch timer stopped"); return Vector2.INF
		var tick := int(h._state().tick)
		if tick == last_tick:
			await h.process_frame
			continue
		last_tick = tick
		var story: Dictionary = h._story()
		var shutters := _actors("sleep_shutter")
		if shutters.size() != 4: h._fail("the four closed windows must look alike"); return Vector2.INF
		var next := _nearest(shutters,last)
		if next.distance_to(last) > 65: h._fail("lost physical continuity of the tracked window"); return Vector2.INF
		last = next
		if not tested_early:
			h._click_world(last, MOUSE_BUTTON_RIGHT)
			h._click_world(last, MOUSE_BUTTON_LEFT)
			tested_early = true
		if not _actors("wake_look").is_empty(): h._fail("a sleeping window responded to early input"); return Vector2.INF
		var brace: Dictionary = h._marker("brace")
		var full: Dictionary = h._marker("brace_on")
		if not full.is_empty(): braced_stations[h._point(full)] = true
		var hand := h._marker("hand_warn") as Dictionary
		if hand.is_empty(): hand = h._marker("hand")
		var danger: bool = not hand.is_empty() and h._point(hand).distance_to(h._position()) < 25
		if danger:
			if held: _mouse_held(false); held = false
			var away: Vector2 = Vector2(240,202) - h._point(hand)
			if away.length() < 2: away = Vector2.RIGHT
			h._direction(away.normalized()*32)
		elif not brace.is_empty() and not braced_stations.has(h._point(brace)):
			var station: Vector2 = h._point(brace)
			if h._position().distance_to(station) > 10:
				h._direction(station - h._position())
			else:
				h._release_keys()
				if not held: _mouse_held(true); held = true
		else:
			h._release_keys()
			if held: _mouse_held(false); held = false
		if total-int(story.sleepTicks) >= 100: await h._capture("11-shutter-swap")
		await h.process_frame
	if held: _mouse_held(false)
	h._release_keys()
	if braced_stations.size() != int(h._story().round) or not tested_early or _step() != "wake_probe": h._fail("finish guarding the sleeping frog"); return Vector2.INF
	return last

func _wake(tracked: Vector2, deliberate_error: bool) -> bool:
	var windows := _actors("wake_window")
	if windows.size() != 4: return h._fail("four quiet windows at the chime")
	if not await h._walk(tracked, 12, "approach the physically tracked window before ringing its cap"): return false
	h._click_world(tracked, MOUSE_BUTTON_RIGHT)
	if not await _wait_step("wake_toss"): return false
	var looks := _actors("wake_look")
	if looks.size() != 1 or h._point(looks[0]).distance_to(tracked) > 28: return h._fail("early waking glance must agree with the tracked physical shutter")
	await h._capture("13-awake")
	var chosen: Vector2 = h._point(looks[0])
	if deliberate_error:
		for w: Dictionary in windows:
			if h._point(w).distance_to(chosen) > 80:
				chosen = h._point(w)
				break
	if not await h._walk(chosen, 12, "approach the chosen window with the soda"): return false
	h._click_world(chosen, MOUSE_BUTTON_LEFT)
	return true

func clockhall() -> bool:
	var wrong_tested := false
	for round_number: int in [1,2,2,3]:
		if not await _wait_step("sleep_reveal"): return false
		if int(h._story().round) != round_number: return h._fail("wrong bottle should retry the current round")
		var tracked := await _watch()
		if not tracked.is_finite(): return false
		var wrong := round_number == 2 and not wrong_tested
		if wrong: wrong_tested = true
		if not await _wake(tracked, wrong): return false
		if wrong:
			if not await _wait_step("sleep_reveal") or h._story().cue != "wrong_bottle": return h._fail("wrong bottle restarts the second round")
		if round_number != 3 and not await _wait_step("sleep_reveal"): return false
	if not await _wait_step("ward_face"): return false
	if not await h._until(func(): return _step() == "ward_face" and int(h._story().stageTick) >= 22, 2, "four windows reach the foreground"): return false
	if not await h._until(func(): return h._has_caption(), 1, "caption during the final scare"): return false
	await h._capture("14-face")
	if not await _wait_step("ward_exit", 5): return false
	return await _exit_room("exit")
