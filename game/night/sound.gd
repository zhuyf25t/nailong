class_name NightSound
extends Node

const SOUND_DIR := "res://assets/night/audio/"
const CLIPS := ["plant", "radio", "pursuit", "cap_left", "cap_right", "throw",
	"bounce_left", "bounce_right", "blocked", "deliver", "chuckle", "relay",
	"latch", "lever", "clockout", "shutter", "pressure", "glass_0", "glass_1", "glass_2"]
const STORY_CLIPS := ["two_answers", "brick_crack", "brick_drop", "brick_palm", "well_breath", "well_close",
	"tape_gate", "ink_roller", "press_strike", "hand_loan", "sleep_gallery",
	"wheel_left", "wheel_right", "rubber_pulse", "wake_face", "dawn"]
const STORY_FOLEY := {
	"knock":["glass_1", 0.24], "double_thanks":["two_answers", 0.71], "tile_warn":["brick_crack", 0.36],
	"tile_open":["brick_drop", 0.52], "tile_fall":["brick_drop", 0.64],
	"saw_hand":["brick_palm", 0.78], "supply_ready":["cap_right", 0.29],
	"route_blocked":["glass_0", 0.30], "hatch":["tape_gate", 0.63],
	"wrong_window":["tape_gate", 0.44], "delay_found":["tape_gate", 0.67],
	"delay_open":["lever", 0.53], "archive_turn":["well_close", 0.84],
	"ledger":["press_strike", 0.57], "record_start":["tape_gate", 0.58],
	"seal_early":["blocked", 0.29], "plate_ready":["deliver", 0.39],
	"press_warn":["wheel_left", 0.40], "press_shadow":["wheel_left", 0.57],
	"press_caught":["press_strike", 0.84], "sill_wait":["latch", 0.47], "sill_missed":["press_strike", 0.77],
	"press_slam":["press_strike", 0.91], "tape_rewind":["tape_gate", 0.67],
	"replay_start":["press_strike", 0.64], "retry_gate":["blocked", 0.44],
	"gate_pass":["lever", 0.55], "echo_hold":["hand_loan", 0.64],
	"sleep_show":["glass_1", 0.30], "sleep_close":["shutter", 0.42],
	"brace_light":["relay", 0.37], "brace_set":["rubber_pulse", 0.71],
	"hand_warn":["brick_crack", 0.31], "ward_slip":["brick_drop", 0.64],
	"brace_missed":["blocked", 0.54], "wake_chime":["deliver", 0.39],
	"wrong_bottle":["shutter", 0.62], "round_clear":["deliver", 0.56],
	"ward_face":["wake_face", 0.87], "ward_clear":["dawn", 0.82]
}

# Offline audio capture can opt into mixing even when no output device is present.
var mix_without_device := false
var _sounds: Dictionary[String, AudioStreamWAV] = {}
var _plant: AudioStreamPlayer
var _radio: AudioStreamPlayer
var _pursuit: AudioStreamPlayer
var _space: AudioStreamPlayer
var _story_voice: AudioStreamPlayer
var _press_player: AudioStreamPlayer
var _press_bus: StringName
var _press_state := ""
var _press_gain := 0.0
var _press_pitch := 0.82
var _voices: Array[AudioStreamPlayer] = []
var _targets := Vector3.ZERO
var _muted := false
var _closing := false
var _paused := false
var _run_id := ""
var _phase := "menu"
var _night := 1
var _dim := false
var _last_tick := -1
var _last_event := -1
var _last_pressure_second := -1
var _last_delivered := 0
var _window_looks: Dictionary[int, String] = {}
var _room := ""
var _step := ""
var _story_id := -1
var _quiet_until := -1
var _last_foley_tick: Dictionary[String, int] = {}
var _space_gain := 0.0
var _wheel_points := PackedVector2Array()
var _wheel_tick := -1
var _wheel_travel := 0.0
var _wheel_sounded := -1000


func _ready() -> void:
	if AudioServer.get_driver_name() == "Dummy" and not mix_without_device:
		set_process(false)
		return
	for key: String in CLIPS + STORY_CLIPS:
		_sounds[key] = load(SOUND_DIR + key + ".wav") as AudioStreamWAV
	_plant = _layer("plant")
	_radio = _layer("radio")
	_pursuit = _layer("pursuit")
	_press_player = _layer("ink_roller")
	var index := AudioServer.bus_count
	AudioServer.add_bus()
	_press_bus = StringName("StampPress_%d"%get_instance_id())
	AudioServer.set_bus_name(index,_press_bus)
	var pan := AudioEffectPanner.new()
	pan.pan = -0.65
	AudioServer.add_bus_effect(index,pan)
	_press_player.bus = _press_bus
	_space = AudioStreamPlayer.new()
	_story_voice = AudioStreamPlayer.new()
	add_child(_space)
	add_child(_story_voice)
	for i in 8:
		var voice := AudioStreamPlayer.new()
		add_child(voice)
		_voices.append(voice)
	_set_mix()


func _exit_tree() -> void:
	_stop_all()
	if _press_bus!=&"":
		var index := AudioServer.get_bus_index(_press_bus)
		if index>0:
			AudioServer.remove_bus(index)


func shutdown() -> void:
	if _closing:
		return
	_closing = true
	set_process(false)
	if _radio == null:
		return
	_stop_all()
	# Stop commands cross the mixer thread. Leave it time to release its playing streams.
	var drain_seconds := clampf(AudioServer.get_output_latency() + 0.12, 0.18, 0.40)
	await get_tree().create_timer(drain_seconds, true, false, true).timeout


func _stop_all() -> void:
	for player: AudioStreamPlayer in [_plant, _radio, _pursuit, _space, _story_voice, _press_player]:
		if is_instance_valid(player):
			player.stop()
	for voice in _voices:
		if is_instance_valid(voice):
			voice.stop()


func _layer(key: String) -> AudioStreamPlayer:
	var player := AudioStreamPlayer.new()
	var clip := _sounds[key]
	clip.loop_mode = AudioStreamWAV.LOOP_FORWARD
	clip.loop_end = roundi(clip.get_length() * clip.mix_rate)
	player.stream = clip
	player.volume_db = -80.0
	add_child(player)
	return player


func _set_mix() -> void:
	# Bed gains are independent so the lamp relay can audibly swallow the waltz.
	_space_gain = 0.0
	if _room == "maintenance" and _step != "enter_hatch":
		_targets = Vector3(0.10, 0.014, 0.0)
		_space_gain = 0.60
		return
	if _room == "signatures" and _step != "check_signature":
		_targets = Vector3(0.09, 0.0, 0.0)
		_space_gain = 0.0 if _step == "exit_signature" else 0.54
		if _press_gain>0.0:
			_space_gain = 0.15
			_targets.z = 0.20 if _press_state=="press_shadow" else 0.05
		if _step == "help_hold" or _quiet_until > _last_tick:
			_targets = Vector3.ZERO
			_space_gain = 0.0
		return
	if _room == "sleepward":
		match _step:
			"sleep_reveal":
				_targets = Vector3(0.13, 0.095, 0.0)
				_space_gain = 0.28
			"sleep_watch":
				_targets = Vector3(0.12, 0.0, 0.0)
				_space_gain = 0.56
			"ward_face":
				_targets = Vector3.ZERO
			_:
				_targets = Vector3(0.095, 0.0, 0.0)
		if _quiet_until > _last_tick:
			_targets = Vector3.ZERO
			_space_gain = 0.0
		return
	match _phase:
		"menu":
			_targets = Vector3(0.13, 0.43, 0.0)
		"serving":
			var radio_gain := lerpf(0.35, 0.14, float(_night - 1) / 7.0)
			_targets = Vector3(0.30, radio_gain if not _dim else 0.021, 0.0)
		"escaping":
			_targets = Vector3(0.12, 0.0, 0.60)
		"clockout":
			_targets = Vector3(0.19, 0.27, 0.0)
		"won":
			_targets = Vector3(0.08, 0.25, 0.0)
		_:
			_targets = Vector3(0.11, 0.0, 0.0)


func _process(delta: float) -> void:
	if _closing or _paused or _muted or _radio == null:
		return
	var blend := 1.0 - exp(-delta * 5.0)
	_mix_layer(_plant, _targets.x, blend)
	_mix_layer(_radio, _targets.y, blend)
	_mix_layer(_pursuit, _targets.z, blend)
	_mix_layer(_press_player, _press_gain, blend)
	_press_player.pitch_scale = lerpf(_press_player.pitch_scale,_press_pitch,blend)
	if _space.stream != null:
		_mix_layer(_space, _space_gain, blend)
	var radio_pitch := 0.93 if _dim and _phase == "serving" else 1.0
	_radio.pitch_scale = lerpf(_radio.pitch_scale, radio_pitch, blend)


func _mix_layer(player: AudioStreamPlayer, target: float, blend: float) -> void:
	if not player.playing:
		if target <= 0.0:
			return
		player.volume_db = -80.0
		player.play()
	player.volume_linear = lerpf(player.volume_linear, target, blend)
	if target <= 0.0 and player.volume_linear < 0.001:
		player.stop()


func set_muted(muted: bool) -> void:
	_muted = muted
	if muted and _radio != null:
		_plant.volume_db = -80.0
		_radio.volume_db = -80.0
		_pursuit.volume_db = -80.0
		_stop_all()


func _pause_mix(pause_now: bool) -> void:
	if pause_now == _paused:
		return
	_paused = pause_now
	for player: AudioStreamPlayer in [_plant, _radio, _pursuit, _space, _story_voice, _press_player]:
		if is_instance_valid(player) and player.has_stream_playback():
			player.stream_paused = pause_now
	for player in _voices:
		if player.has_stream_playback():
			player.stream_paused = pause_now


func _set_story_room(room: String) -> void:
	if room == _room:
		return
	_room = room
	_story_id = -1
	_quiet_until = -1
	_wheel_points.clear()
	_wheel_travel = 0.0
	_wheel_sounded = -1000
	_wheel_tick = -1
	_press_state = ""
	_press_gain = 0.0
	_press_pitch = 0.82
	_last_foley_tick.clear()
	if _space == null:
		return
	_space.stop()
	_space.stream = null
	var room_tracks := {"maintenance":"well_breath", "signatures":"ink_roller", "sleepward":"sleep_gallery"}
	var key := String(room_tracks.get(room, ""))
	if not key.is_empty():
		var clip := _sounds[key]
		clip.loop_mode = AudioStreamWAV.LOOP_FORWARD
		clip.loop_end = roundi(clip.get_length() * clip.mix_rate)
		_space.stream = clip


func menu() -> void:
	if _phase != "menu":
		for voice in _voices:
			voice.stop()
		if _story_voice != null:
			_story_voice.stop()
	_pause_mix(false)
	_set_story_room("")
	_step = ""
	_phase = "menu"
	_run_id = ""
	_last_event = -1
	_last_tick = -1
	_last_pressure_second = -1
	_last_delivered = 0
	_window_looks.clear()
	_dim = false
	_set_mix()


func _cue(key: String, gain: float = 0.70) -> void:
	if _closing or _paused or _muted or _voices.is_empty():
		return
	for player in _voices:
		if not player.playing:
			player.stream = _sounds[key]
			player.volume_linear = gain
			player.play()
			return


func _story_cue(cue: String) -> void:
	if not STORY_FOLEY.has(cue) or _closing or _paused or _muted or _story_voice == null:
		return
	# A held interaction can generate distinct server cue IDs several times a second.
	if _last_tick - _last_foley_tick.get(cue, -1000) < 12:
		return
	_last_foley_tick[cue] = _last_tick
	if cue in ["echo_hold", "ward_face", "wake_chime", "press_caught", "sill_missed","press_slam"]:
		_quiet_until = _last_tick + 16
		_stop_all()
	if cue in ["double_thanks", "saw_hand", "archive_turn", "echo_hold", "ward_face", "ward_clear", "press_caught", "sill_missed","press_slam"]:
		var foreground: Array = STORY_FOLEY[cue]
		_story_voice.stream = _sounds[String(foreground[0])]
		_story_voice.volume_linear = float(foreground[1])
		_story_voice.play()
	else:
		var foley: Array = STORY_FOLEY[cue]
		_cue(String(foley[0]), float(foley[1]))


func _listen_to_wheels(people: Array) -> void:
	if _last_tick == _wheel_tick:
		return
	var points := PackedVector2Array()
	for person: Dictionary in people:
		if person["kind"] == "sleep_shutter":
			points.append(Vector2(person["x"], person["y"]))
	# Slots are renumbered on screen. Use only the visible motion between nearby snapshots.
	if points.size() == 4 and _wheel_points.size() == 4 and _last_tick > _wheel_tick and _last_tick - _wheel_tick <= 8:
		var turn := 0.0
		var center := Vector2(240, 180)
		for before in _wheel_points:
			var nearest := points[0]
			for point in points:
				if before.distance_squared_to(point) < before.distance_squared_to(nearest):
					nearest = point
			var angle := (before - center).angle_to(nearest - center)
			if absf(angle) > absf(turn):
				turn = angle
		_wheel_travel += turn
		if absf(_wheel_travel) > 0.37 and _last_tick - _wheel_sounded >= 20:
			_cue("wheel_right" if _wheel_travel > 0 else "wheel_left", 0.49)
			_wheel_sounded = _last_tick
			_wheel_travel = 0.0
	else:
		_wheel_travel = 0.0
	_wheel_points = points
	_wheel_tick = _last_tick


func _listen_to_press(story:Dictionary,player:Dictionary) -> void:
	var kind := ""
	var closing := 0.0
	if _step=="play_two":
		for mark:Dictionary in story.get("marks",[]):
			if mark.get("kind")=="press_shadow":
				kind = "press_shadow"
				var gap := absf(float(player.get("x",240))-float(mark.get("x",0)))
				closing = 1.0-clampf(gap/150.0,0.0,1.0)
				break
			if mark.get("kind")=="press_warn":
				kind = "press_warn"
	if kind!=_press_state and not kind.is_empty():
		_story_cue(kind)
	_press_state = kind
	_press_gain = 0.0
	_press_pitch = 0.82
	if kind=="press_warn":
		_press_gain = 0.24
	elif kind=="press_shadow":
		_press_gain = lerpf(0.38,0.82,closing)
		_press_pitch = lerpf(0.92,1.29,closing)

func _sync_story(story: Dictionary, fresh: bool, previous_phase: String,player:Dictionary) -> void:
	_set_story_room(String(story.get("room", "")))
	_step = String(story.get("step", ""))
	var people: Array = story.get("people", [])
	if _room == "sleepward":
		_listen_to_wheels(people)
	elif _room=="signatures":
		_listen_to_press(story,player)
	var cue_id := int(story.get("cueId", -1))
	if cue_id > _story_id:
		_story_id = cue_id
		if not fresh:
			var cue := String(story.get("cue", "none"))
			if cue == "wake_answer":
				for person: Dictionary in people:
					if person["kind"] == "wake_look" and _last_tick - _last_foley_tick.get(cue, -1000) >= 12:
						var x := float(person["x"])
						var channel := 0 if x < 190 else (2 if x > 290 else 1)
						_cue("glass_" + str(channel), 0.63)
						_last_foley_tick[cue] = _last_tick
			else:
				_story_cue(cue)
	# Terminal state survives a dropped poll even if the ending cue is no longer recent.
	if not fresh and previous_phase != "won" and _phase == "won" and _night == 8 and not _last_foley_tick.has("ward_clear"):
		_story_cue("ward_clear")


func set_view(s: Dictionary) -> void:
	var current_run := String(s["runId"])
	var current_tick := int(s["tick"])
	var fresh := current_run != _run_id
	if not fresh and current_tick < _last_tick:
		return
	var previous_phase := _phase
	if fresh:
		_set_story_room("")
		_story_id = -1
		_last_foley_tick.clear()
		_last_tick = -1
		_last_event = -1
		_last_pressure_second = -1
		_last_delivered = 0
		_window_looks.clear()
		for voice in _voices:
			voice.stop()
		if _story_voice != null:
			_story_voice.stop()
	_run_id = current_run
	_last_tick = current_tick
	_night = int(s["night"])
	_phase = String(s["phase"])
	_pause_mix(bool(s.get("paused", false)))
	_sync_story(s.get("story", {}), fresh, previous_phase,s.get("player",{}))
	if _room in ["maintenance", "signatures", "sleepward"]:
		_dim = false
		_set_mix()
		return
	var dark := bool(s["dim"])
	if not fresh and dark != _dim and _phase == "serving":
		_cue("relay", 0.48)
	_dim = dark
	_set_mix()
	# The cloth and glass react only to movements already visible in the snapshot.
	var looks: Dictionary[int, String] = {}
	for window: Dictionary in s["windows"]:
		var slot := int(window["slot"])
		var look := String(window["look"])
		looks[slot] = look
		if not fresh and _phase == "serving" and look != "still" and _window_looks.get(slot, "still") != look:
			_cue("glass_" + str(slot), 0.38)
	_window_looks = looks

	var eid := int(s["eventId"])
	var name_on_wire := String(s["event"])
	# The phase must still sound correct if polling skipped the moment of the event.
	if _phase != previous_phase and _phase == "escaping":
		_cue("latch", 0.85)
	elif _phase != previous_phase and _phase in ["escaped", "lost"]:
		_cue("shutter", 0.72)
	elif _phase != previous_phase and _phase == "won":
		_cue("clockout", 0.77)
	if eid > _last_event:
		_last_event = eid
		match name_on_wire:
			"probe":
				_cue("cap_left" if s["probe"] == "left" else "cap_right")
			"throw":
				_cue("throw", 0.64)
			"bounce":
				var bottle: Variant = s["bottle"]
				if bottle is Dictionary:
					_cue("bounce_left" if float(bottle["x"]) < 240.0 else "bounce_right")
			"blocked", "miss":
				_cue("blocked", 0.60)
			"lever":
				_cue("lever", 0.80)
	var delivered := int(s["delivered"])
	if delivered > _last_delivered and not fresh:
		_cue("deliver", 0.63)
		if delivered == 1 and _night == 1:
			_cue("chuckle", 0.45)
	_last_delivered = delivered
	var pressure := int(s["pressure"])
	var seconds := ceili(float(pressure) / 20.0)
	if _phase == "serving" and seconds > 0 and seconds <= 5 and seconds != _last_pressure_second:
		_cue("pressure", 0.49)
	_last_pressure_second = seconds
