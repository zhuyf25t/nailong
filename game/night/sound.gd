class_name NightSound
extends Node

const SOUND_DIR := "res://assets/night/audio/"
const CLIPS := ["plant", "radio", "pursuit", "cap_left", "cap_right", "throw",
	"bounce_left", "bounce_right", "blocked", "deliver", "chuckle", "relay",
	"latch", "lever", "clockout", "shutter", "pressure", "glass_0", "glass_1", "glass_2"]

# Offline audio capture can opt into mixing even when no output device is present.
var mix_without_device := false
var _sounds: Dictionary[String, AudioStreamWAV] = {}
var _plant: AudioStreamPlayer
var _radio: AudioStreamPlayer
var _pursuit: AudioStreamPlayer
var _voices: Array[AudioStreamPlayer] = []
var _targets := Vector3.ZERO
var _muted := false
var _closing := false
var _run_id := ""
var _phase := "menu"
var _night := 1
var _dim := false
var _last_tick := -1
var _last_event := -1
var _last_pressure_second := -1
var _last_delivered := 0
var _window_looks: Dictionary[int, String] = {}


func _ready() -> void:
	if AudioServer.get_driver_name() == "Dummy" and not mix_without_device:
		set_process(false)
		return
	for key: String in CLIPS:
		_sounds[key] = load(SOUND_DIR + key + ".wav") as AudioStreamWAV
	_plant = _layer("plant")
	_radio = _layer("radio")
	_pursuit = _layer("pursuit")
	for i in 8:
		var voice := AudioStreamPlayer.new()
		add_child(voice)
		_voices.append(voice)
	_set_mix()


func _exit_tree() -> void:
	_stop_all()


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
	for player: AudioStreamPlayer in [_plant, _radio, _pursuit]:
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
	if _closing or _muted or _radio == null:
		return
	var blend := 1.0 - exp(-delta * 5.0)
	_mix_layer(_plant, _targets.x, blend)
	_mix_layer(_radio, _targets.y, blend)
	_mix_layer(_pursuit, _targets.z, blend)
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


func menu() -> void:
	if _phase != "menu":
		for voice in _voices:
			voice.stop()
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
	if _closing or _muted or _voices.is_empty():
		return
	for player in _voices:
		if not player.playing:
			player.stream = _sounds[key]
			player.volume_linear = gain
			player.play()
			return


func set_view(s: Dictionary) -> void:
	var current_run := String(s["runId"])
	var current_tick := int(s["tick"])
	var fresh := current_run != _run_id
	if not fresh and current_tick < _last_tick:
		return
	var previous_phase := _phase
	if fresh:
		_last_tick = -1
		_last_event = -1
		_last_pressure_second = -1
		_last_delivered = 0
		_window_looks.clear()
		for voice in _voices:
			voice.stop()
	_run_id = current_run
	_last_tick = current_tick
	_night = int(s["night"])
	_phase = String(s["phase"])
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
