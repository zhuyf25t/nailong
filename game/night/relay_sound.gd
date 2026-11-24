extends Node

const CLIPS := ["belt_motor", "neck_approach", "neck_open", "grip_lock", "lower_belt",
	"belt_break", "route_toggle", "plate_step", "pipe_rim", "receipt_chime",
	"plate_step_inside", "pipe_rim_inside", "receipt_chime_inside", "pipe_nails", "relay_face", "bottle_hiss"]
const FOLEY := {
	"incoming":["lower_belt",0.30], "miss":["blocked",0.44], "lower":["lower_belt",0.61],
	"break":["belt_break",0.72], "release":["throw",0.66], "loop":["route_toggle",0.42],
	"cap_caught":["grip_lock",0.39], "cap_through":["relay",0.36], "pipe":["pipe_rim",0.70],
	"step":["plate_step",0.46], "hiss":["bottle_hiss",0.70], "hand_warn":["pipe_nails",0.67], "hand_strike":["blocked",0.82],
	"window_hit":["glass_1",0.62], "late":["lower_belt",0.52], "empty":["blocked",0.28]
}
const ECHO := {"replay_step":"plate_step_inside", "replay_pipe":"pipe_rim_inside", "replay_bell":"receipt_chime_inside"}
const TICK_SECONDS := 0.05

var active := false
var hunt_gain := 0.0
var _sounds: Dictionary[String,AudioStreamWAV]
var _buses: Array[StringName] = []
var _effects: Array[AudioStreamPlayer] = []
var _beats: Array[AudioStreamPlayer] = []
var _echoes: Array[AudioStreamPlayer] = []
var _motor := AudioStreamPlayer.new()
var _face := AudioStreamPlayer.new()
var _muted := false
var _paused := false
var _clock := 0.0
var _critical_until := 0.0
var _silence_until := 0.0
var _take := ""
var _last_id := -1
var _last_tick := -1
var _near_rings: Dictionary = {}
var _open_panes: Dictionary = {}
var _next_slit := 0.0
var _hunter := "quiet"
var _schedule: Array[Dictionary] = []
var _echo_start := -1.0
var _echo_origin := -1
var _fourth_index := 0
var _motor_level := 0.0

func setup(library: Dictionary[String,AudioStreamWAV]) -> void:
	_sounds = library
	for i in 5:
		if i == 2:
			_buses.append(&"Master")
			continue
		var index := AudioServer.bus_count
		AudioServer.add_bus()
		var bus := StringName("ReturnPipe_%d_%d" % [get_instance_id(),i])
		AudioServer.set_bus_name(index,bus)
		var pan := AudioEffectPanner.new()
		pan.pan = (i - 2) * 0.40
		AudioServer.add_bus_effect(index,pan)
		_buses.append(bus)
	add_child(_motor)
	add_child(_face)
	var loop := library["belt_motor"]
	loop.loop_mode = AudioStreamWAV.LOOP_FORWARD
	loop.loop_end = roundi(loop.get_length() * loop.mix_rate)
	_motor.stream = loop
	_motor.volume_db = -80.0
	for group in [_effects, _beats, _echoes]:
		# Separate lanes keep footsteps from stealing a catch or a bottle-memory voice.
		for i in 4:
			var player := AudioStreamPlayer.new()
			group.append(player)
			add_child(player)

func _exit_tree() -> void:
	stop()
	for bus in _buses:
		if bus != &"Master":
			var index := AudioServer.get_bus_index(bus)
			if index > 0:
				AudioServer.remove_bus(index)

func _play(pool: Array[AudioStreamPlayer], key: String, gain: float, x: float) -> void:
	if _muted or _paused or _clock < _silence_until:
		return
	var voice := pool[0]
	for player in pool:
		if not player.playing:
			voice = player
			break
		if player.get_playback_position() > voice.get_playback_position():
			voice = player
	voice.bus = _buses[clampi(roundi(x / 120.0),0,4)]
	voice.stream = _sounds[key]
	voice.volume_linear = gain
	voice.play()

func _beat(key: String, amp: float, x: float) -> void:
	if _clock >= _critical_until:
		for voice in _effects:
			if voice.playing:
				voice.volume_linear *= 0.57
	_critical_until = _clock + 0.24
	_play(_beats,key,amp,x)

func background_gain() -> float:
	if _clock < _silence_until:
		return 0.0
	return 0.38 if _clock < _critical_until else 1.0

func _process(delta: float) -> void:
	if _paused:
		return
	_clock += delta
	while not _schedule.is_empty() and float(_schedule[0].due) <= _clock:
		var beat: Dictionary = _schedule.pop_front()
		_play(_echoes,beat.key,0.72,beat.x)
	var level := _motor_level * background_gain() if active and not _muted else 0.0
	if level > 0.0 and not _motor.playing:
		_motor.volume_db = -80.0
		_motor.play()
	if _motor.playing:
		_motor.volume_linear = lerpf(_motor.volume_linear,level,1.0-exp(-delta*11.0))
		if level == 0.0 and _motor.volume_linear < 0.001:
			_motor.stop()

func _clear_echo() -> void:
	_schedule.clear()
	_echo_start = -1.0

func leave() -> void:
	if not active:
		return
	active = false
	_take = ""
	_motor_level = 0.0
	hunt_gain = 0.0
	_clear_echo()

func stop() -> void:
	leave()
	_clear_echo()
	_fourth_index = 0
	_silence_until = 0.0
	_critical_until = 0.0
	for p in _effects + _beats + _echoes + [_motor, _face]:
		p.stop()

func mute(value: bool) -> void:
	_muted = value
	if value:
		_clear_echo()
		for p in _effects + _beats + _echoes + [_motor, _face]:
			p.stop()

func pause_mix(value: bool) -> void:
	_paused = value
	for p in _effects + _beats + _echoes + [_motor, _face]:
		if p.has_stream_playback():
			p.stream_paused = value

func fourth_bottle(story: Dictionary, fresh_run: bool) -> void:
	var track: Array = story.get("fourthSounds",[])
	var stage_tick := int(story.get("stageTick",0))
	var x := 240.0
	for person: Dictionary in story.get("people",[]):
		if person.kind == "empty_bottle":
			x = float(person.x)
			break
	var due := 12
	for i in track.size():
		var sample: Dictionary = track[i]
		if i > 0:
			due += int(sample.gap)
		if due > stage_tick:
			break
		if i >= _fourth_index:
			if not fresh_run:
				_queue_echo({"kind":"replay_" + String(sample.kind),"x":x,"atTick":due})
			_fourth_index = i + 1

func _queue_echo(event: Dictionary) -> void:
	if _muted or _paused or _clock < _silence_until:
		return
	var tick := int(event.atTick)
	var due := _echo_start + (tick - _echo_origin) * TICK_SECONDS
	if _echo_start < 0.0 or due < _clock - 0.16:
		# Late batches keep the gaps between the new events instead of collapsing them.
		_echo_start = _clock
		_echo_origin = tick
		due = _clock
	_schedule.append({"due":due,"key":ECHO[event.kind],"x":float(event.x)})

func _intercept(relay: Dictionary, position: Dictionary, fresh: bool) -> void:
	var marks: Dictionary = {}
	var held := false
	var foot := Vector2(position.x,position.y)
	for bottle: Dictionary in relay.bottles:
		held = held or bottle.state == "held"
		if bottle.state not in ["inbound","lower","loop"]:
			continue
		var key := "%s/%s" % [bottle.id,bottle.state]
		var half := float(bottle.window) * 0.5
		var eta := float(bottle.eta)
		var flags: int = _near_rings.get(key,0) if eta <= half + 7.0 else 0
		var nearby := foot.distance_to(Vector2(bottle.catchX,bottle.catchY)) < float(bottle.radius) + 58.0
		if bool(bottle.catchable):
			if not fresh and not (flags & 2):
				_beat("neck_open",0.76,float(bottle.x))
			flags = 3
		elif eta > half and eta <= half + 6.0 and nearby and not (flags & 1):
			if not fresh:
				_beat("neck_approach",0.56,float(bottle.catchX))
			flags |= 1
		marks[key] = flags
	_near_rings = marks
	var panes: Dictionary = {}
	for window: Dictionary in relay.windows:
		panes[window.slot] = bool(window.open) and held
		if panes[window.slot] and not _open_panes.get(window.slot,false) and _clock >= _next_slit and not fresh:
			_play(_effects,"glass_1",0.27,float(window.x))
			_next_slit = _clock + 0.5
	_open_panes = panes

func _signal(event: Dictionary) -> void:
	var kind := String(event.kind)
	var x := float(event.x)
	if ECHO.has(kind):
		_queue_echo(event)
	elif kind == "side_face":
		_clear_echo()
		_motor.stop()
		for player in _echoes + _effects:
			player.stop()
		# Leave the just-confirmed receipt audible; nothing new plays over the breath or its tail.
		if not _paused and not _muted:
			_face.stream = _sounds["relay_face"]
			_face.volume_linear = 0.83
			_face.play()
		_silence_until = _clock + 1.18
	elif kind == "catch":
		_beat("grip_lock",0.84,x)
	elif kind == "sign":
		_beat("receipt_chime",0.74,x)
	elif kind == "cap_fire":
		_play(_effects,"cap_left" if x < 240.0 else "cap_right",0.40,x)
	elif kind == "switch":
		_play(_effects,"route_toggle",0.50,x)
		_play(_effects,"pipe_rim",0.37,x)
	elif kind == "cap_bounce":
		# The wall itself is a recorded metal surface. Keep the original pipe attack in its rebound.
		_play(_effects,"pipe_rim",0.53,x)
	elif kind == "retry":
		_clear_echo()
		_near_rings.clear()
	elif FOLEY.has(kind):
		if kind == "loop":
			_echo_start = -1.0
		var effect: Array = FOLEY[kind]
		var audible := float(effect[1]) * (0.64 if _clock < _critical_until else 1.0)
		_play(_effects,String(effect[0]),audible,x)

func update(view: Dictionary, story: Dictionary, relay: Dictionary, fresh_run: bool) -> void:
	var key := "%s/%s/%s/%s/%s/%s" % [view.runId,view.delivered,story.room,story.step,story.get("round",0),relay.leg]
	var tick := int(relay.tick)
	var fresh := key != _take or tick < _last_tick
	if fresh:
		_take = key
		_last_id = -1
		_near_rings.clear()
		_open_panes.clear()
		_clear_echo()
		_hunter = "quiet"
	_last_tick = tick
	active = true
	var baseline := (fresh_run and tick > 1) or (fresh and tick > 8)
	var hunter: Dictionary = relay.hunter
	var close := clampf(1.0 - Vector2(hunter.x,hunter.y).distance_to(Vector2(view.player.x,view.player.y)) / 240.0,0,1)
	hunt_gain = (0.16 + 0.22 * close) if hunter.state in ["chase","warn","strike"] else 0.0
	if not baseline and hunter.state == "turn" and _hunter != "turn":
		_play(_effects,"pipe_nails",0.42,float(hunter.targetX))
	_hunter = String(hunter.state)
	_motor_level = (0.19 if relay.route == "right" else 0.15) if relay.stage == "running" else 0.0
	if relay.stage == "running":
		_intercept(relay,view.player,baseline)
	for event: Dictionary in relay.events:
		if int(event.id) > _last_id:
			_last_id = int(event.id)
			if not baseline and (tick - int(event.atTick) <= 20 or ECHO.has(event.kind)):
				_signal(event)
