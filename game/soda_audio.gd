class_name SodaAudio
extends Node

var _clips: Dictionary = {}
var _voices: Array[AudioStreamPlayer] = []
var _voice := 0
var _seen := {}
var _last_tick := -1

func _ready() -> void:
	var tones := {"foam": Vector3(460, 180, 0.065), "star": Vector3(810, 185, 0.08),
		"pearl": Vector3(230, 66, 0.16), "hit": Vector3(290, 170, 0.045),
		"pop": Vector3(430, 65, 0.19), "heal": Vector3(465, 780, 0.16),
		"dash": Vector3(330, 740, 0.08), "shield": Vector3(265, 529, 0.2),
		"take": Vector3(440, 880, 0.18), "return": Vector3(520, 390, 0.10),
		"capture": Vector3(520, 1040, 0.27), "reload": Vector3(250, 310, 0.055)}
	for key: String in tones:
		_clips[key] = _tone(tones[key])
	for i in 8:
		var player := AudioStreamPlayer.new()
		add_child(player)
		_voices.append(player)

func _tone(spec: Vector3) -> AudioStreamWAV:
	var count := maxi(1, roundi(spec.z * 22050))
	var buffer := PackedByteArray()
	buffer.resize(count * 2)
	var wave := 0.0
	for i in count:
		var t := float(i) / count
		wave += lerpf(spec.x, spec.y, t) * TAU / 22050.0
		var envelope := minf(1.0, i / 45.0) * pow(1.0 - t, 1.6)
		var tone := sin(wave) * 0.7 + signf(sin(wave * 2.0)) * 0.14
		buffer.encode_s16(i * 2, roundi(tone * envelope * 16000.0))
	var audio := AudioStreamWAV.new()
	audio.format = AudioStreamWAV.FORMAT_16_BITS
	audio.mix_rate = 22050
	audio.data = buffer
	return audio

func reset() -> void:
	_seen.clear()
	_last_tick = -1
	for voice in _voices:
		voice.stop()

func update(state: SodaState) -> void:
	var current_ids := {}
	for event in state.events:
		current_ids[event.id] = true
		if _last_tick < 0 or _seen.has(event.id) or event.tick < state.tick - 3:
			continue
		var key := String(event.kind)
		if key == "fire":
			key = ["foam", "star", "pearl"][state.fighters[event.seat].weapon]
		if not _clips.has(key):
			continue
		var voice := _voices[_voice]
		_voice = (_voice + 1) % _voices.size()
		voice.stream = _clips[key]
		voice.volume_db = -11 if event.seat == state.you or event.target == state.you else -21
		voice.play()
	_seen = current_ids
	_last_tick = state.tick
