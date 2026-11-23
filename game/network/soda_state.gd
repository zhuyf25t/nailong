class_name SodaState
extends RefCounted

enum Mode { FFA, CTF }
enum Avatar { DRAGON, EGG, FROG }
enum Team { MINT, BERRY }
enum Weapon { FOAM, STAR, PEARL }

const MODES := ["ffa", "ctf"]
const SKINS := ["dragon", "egg", "frog"]
const TEAMS := ["mint", "berry"]
const MAGAZINES := [12, 4, 3]
const EVENT_KINDS := ["fire", "hit", "pop", "respawn", "dash", "shield", "heal", "take", "return", "capture", "reload"]
const OUTCOMES := ["win", "loss", "draw"]
const DURATION_TICKS := 2400

class Fighter:
	var seat: int
	var name: String
	var skin: Avatar
	var human: bool
	var team: Team
	var pos: Vector2
	var aim: Vector2
	var hp: int
	var respawn_ticks: int
	var invuln_ticks: int
	var shield_ticks: int
	var shield_cd: int
	var dash_cd: int
	var weapon: Weapon
	var ammo: PackedInt32Array
	var reload_ticks: int
	var kills: int
	var deaths: int
	var carrying: int

class Shot:
	var id: int
	var owner: int
	var pos: Vector2
	var velocity: Vector2
	var weapon: Weapon

class Pickup:
	var pos: Vector2
	var cooldown: int

class Flag:
	var team: Team
	var pos: Vector2
	var carrier: int

class MatchEvent:
	var id: int
	var tick: int
	var kind: StringName
	var seat: int
	var pos: Vector2
	var target: int

class MatchResult:
	var kind: StringName
	var seat: int
	var team: int

class History:
	var match_id: String
	var code: String
	var mode: Mode
	var skin: Avatar
	var score: int
	var outcome: StringName
	var ended_at: String

var match_id: String
var code: String
var you: int
var ack: int
var tick: int
var remaining_ticks: int
var mode: Mode
var fighters: Array[Fighter] = []
var shots: Array[Shot] = []
var pickups: Array[Pickup] = []
var flags: Array[Flag] = []
var events: Array[MatchEvent] = []
var scores: PackedInt32Array
var result: MatchResult

static func number(value: Variant, low: float, high: float) -> bool:
	return (typeof(value) == TYPE_FLOAT or typeof(value) == TYPE_INT) and is_finite(float(value)) and value >= low and value <= high

static func integer(value: Variant, low: int, high: int) -> bool:
	return number(value, low, high) and float(value) == floor(float(value))

static func _word(value: Variant, vocabulary: Array) -> bool:
	return typeof(value) == TYPE_STRING and value in vocabulary

static func _string(value: Variant, low: int, high: int) -> bool:
	return typeof(value) == TYPE_STRING and value.length() >= low and value.length() <= high

static func _array(value: Variant, low: int, high: int) -> bool:
	return typeof(value) == TYPE_ARRAY and value.size() >= low and value.size() <= high

static func valid_code(value: Variant) -> bool:
	if not _string(value, 6, 6):
		return false
	for ch: String in str(value):
		if not ch in "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ":
			return false
	return true

static func valid_id(value: Variant) -> bool:
	if not _string(value, 36, 36):
		return false
	for i in 36:
		var ch: String = value[i]
		if i in [8, 13, 18, 23]:
			if ch != "-":
				return false
		elif not ch in "0123456789abcdefABCDEF":
			return false
	return true

static func _on_map(obj: Dictionary) -> bool:
	return number(obj.get("x"), 0, 480) and number(obj.get("y"), 0, 288)

static func _pos(obj: Dictionary) -> Vector2:
	return Vector2(obj.x, obj.y)

static func _nullable_seat(obj: Dictionary, key: String) -> bool:
	return obj.has(key) and (obj[key] == null or integer(obj[key], 0, 3))

static func _decode_fighter(item: Variant, identity: Variant, index: int) -> Fighter:
	if typeof(item) != TYPE_DICTIONARY or typeof(identity) != TYPE_DICTIONARY:
		return null
	var obj: Dictionary = item
	var info: Dictionary = identity
	if not integer(obj.get("seat"), index, index) or not integer(info.get("slot"), index, index):
		return null
	if not _string(info.get("name"), 1, 32) or not _word(info.get("skin"), SKINS) or typeof(info.get("human")) != TYPE_BOOL:
		return null
	if not _word(obj.get("team"), TEAMS) or not _on_map(obj) or not number(obj.get("aimX"), -1.001, 1.001) or not number(obj.get("aimY"), -1.001, 1.001):
		return null
	for key: String in ["hp", "respawnTicks", "invulnTicks", "shieldTicks", "shieldCd", "dashCd", "reloadTicks", "kills", "deaths"]:
		if not integer(obj.get(key), 0, DURATION_TICKS):
			return null
	if obj.hp > 100 or (int(obj.hp) == 0) != (int(obj.respawnTicks) > 0) or not integer(obj.get("weapon"), 0, 2):
		return null
	if not _array(obj.get("ammo"), 3, 3) or not obj.has("carrying") or (obj.carrying != null and not _word(obj.carrying, TEAMS)):
		return null
	for slot in 3:
		if not integer(obj.ammo[slot], 0, MAGAZINES[slot]):
			return null
	var fighter := Fighter.new()
	fighter.seat = index
	fighter.name = info.name
	fighter.skin = SKINS.find(info.skin) as Avatar
	fighter.human = info.human
	fighter.team = TEAMS.find(obj.team) as Team
	fighter.pos = _pos(obj)
	fighter.aim = Vector2(obj.aimX, obj.aimY)
	fighter.hp = int(obj.hp)
	fighter.respawn_ticks = int(obj.respawnTicks)
	fighter.invuln_ticks = int(obj.invulnTicks)
	fighter.shield_ticks = int(obj.shieldTicks)
	fighter.shield_cd = int(obj.shieldCd)
	fighter.dash_cd = int(obj.dashCd)
	fighter.reload_ticks = int(obj.reloadTicks)
	fighter.weapon = int(obj.weapon) as Weapon
	fighter.ammo = PackedInt32Array(obj.ammo)
	fighter.kills = int(obj.kills)
	fighter.deaths = int(obj.deaths)
	fighter.carrying = TEAMS.find(obj.carrying)
	return fighter

static func _decode_shot(value: Variant) -> Shot:
	if typeof(value) != TYPE_DICTIONARY:
		return null
	var obj: Dictionary = value
	if not _on_map(obj) or not integer(obj.get("id"), 0, 2147483647) or not integer(obj.get("owner"), 0, 3) or not integer(obj.get("weapon"), 0, 2):
		return null
	if not number(obj.get("dx"), -480, 480) or not number(obj.get("dy"), -288, 288):
		return null
	var shot := Shot.new()
	shot.id = int(obj.id)
	shot.owner = int(obj.owner)
	shot.pos = _pos(obj)
	shot.velocity = Vector2(obj.dx, obj.dy)
	shot.weapon = int(obj.weapon) as Weapon
	return shot

static func _decode_event(value: Variant, current_tick: int) -> MatchEvent:
	if typeof(value) != TYPE_DICTIONARY:
		return null
	var obj: Dictionary = value
	if not _on_map(obj) or not integer(obj.get("id"), 0, 2147483647) or not integer(obj.get("tick"), 0, current_tick):
		return null
	if not _word(obj.get("kind"), EVENT_KINDS) or not integer(obj.get("seat"), 0, 3) or not _nullable_seat(obj, "target"):
		return null
	var event := MatchEvent.new()
	event.id = int(obj.id)
	event.tick = int(obj.tick)
	event.kind = StringName(obj.kind)
	event.seat = int(obj.seat)
	event.pos = _pos(obj)
	event.target = -1 if obj.target == null else int(obj.target)
	return event

static func _decode_result(obj: Variant, match_mode: Mode) -> MatchResult:
	if typeof(obj) != TYPE_DICTIONARY or not _word(obj.get("kind"), ["draw", "team", "player"]) or not _nullable_seat(obj, "seat") or not obj.has("team"):
		return null
	if (obj.kind == "team") != (obj.team != null) or (obj.kind == "player") != (obj.seat != null):
		return null
	if obj.kind == "team" and (match_mode != Mode.CTF or not _word(obj.team, TEAMS)):
		return null
	if obj.kind == "player" and match_mode != Mode.FFA:
		return null
	var won := MatchResult.new()
	won.kind = StringName(obj.kind)
	won.seat = -1 if obj.seat == null else int(obj.seat)
	won.team = TEAMS.find(obj.team)
	return won

static func decode(payload: Variant) -> SodaState:
	if typeof(payload) != TYPE_DICTIONARY or not valid_id(payload.get("matchId")) or not valid_code(payload.get("code")):
		return null
	if not integer(payload.get("you"), 0, 3) or not integer(payload.get("ack"), -1, 2147483647) or not _array(payload.get("seats"), 4, 4) or typeof(payload.get("state")) != TYPE_DICTIONARY:
		return null
	var obj: Dictionary = payload.state
	if not integer(obj.get("tick"), 0, DURATION_TICKS) or not integer(obj.get("remainingTicks"), 0, DURATION_TICKS) or not _word(obj.get("mode"), MODES):
		return null
	if not _array(obj.get("fighters"), 4, 4) or not _array(obj.get("shots"), 0, 512) or not _array(obj.get("events"), 0, 1024) or not _array(obj.get("pickups"), 0, 128):
		return null
	var flag_count := 2 if obj.mode == "ctf" else 0
	if not _array(obj.get("flags"), flag_count, flag_count) or typeof(obj.get("scores")) != TYPE_DICTIONARY or not obj.has("result"):
		return null
	if not integer(obj.scores.get("mint"), 0, DURATION_TICKS) or not integer(obj.scores.get("berry"), 0, DURATION_TICKS):
		return null
	var decoded := SodaState.new()
	decoded.match_id = payload.matchId
	decoded.code = payload.code
	decoded.you = int(payload.you)
	decoded.ack = int(payload.ack)
	decoded.tick = int(obj.tick)
	decoded.remaining_ticks = int(obj.remainingTicks)
	decoded.mode = MODES.find(obj.mode) as Mode
	decoded.scores = PackedInt32Array([int(obj.scores.mint), int(obj.scores.berry)])
	var identities := {}
	for info: Variant in payload.seats:
		if typeof(info) != TYPE_DICTIONARY or not integer(info.get("slot"), 0, 3) or identities.has(int(info.slot)):
			return null
		identities[int(info.slot)] = info
	for i in 4:
		var fighter := _decode_fighter(obj.fighters[i], identities.get(i), i)
		if fighter == null:
			return null
		decoded.fighters.append(fighter)
	for value: Variant in obj.shots:
		var shot := _decode_shot(value)
		if shot == null:
			return null
		decoded.shots.append(shot)
	for value: Variant in obj.events:
		var event := _decode_event(value, decoded.tick)
		if event == null:
			return null
		decoded.events.append(event)
	for value: Variant in obj.pickups:
		if typeof(value) != TYPE_DICTIONARY or not _on_map(value) or not integer(value.get("cooldown"), 0, DURATION_TICKS):
			return null
		var pickup := Pickup.new()
		pickup.pos = _pos(value)
		pickup.cooldown = int(value.cooldown)
		decoded.pickups.append(pickup)
	var flag_teams := {}
	for value: Variant in obj.flags:
		if typeof(value) != TYPE_DICTIONARY or not _on_map(value) or not _word(value.get("team"), TEAMS) or not _nullable_seat(value, "carrier") or flag_teams.has(value.team):
			return null
		flag_teams[value.team] = true
		var flag := Flag.new()
		flag.pos = _pos(value)
		flag.team = TEAMS.find(value.team) as Team
		flag.carrier = -1 if value.carrier == null else int(value.carrier)
		decoded.flags.append(flag)
	if obj.result != null:
		decoded.result = _decode_result(obj.result, decoded.mode)
		if decoded.result == null:
			return null
	return decoded

static func decode_history(value: Variant) -> History:
	if typeof(value) != TYPE_DICTIONARY or not valid_id(value.get("matchId")) or not valid_code(value.get("code")):
		return null
	if not _word(value.get("mode"), MODES) or not _word(value.get("skin"), SKINS) or not integer(value.get("score"), 0, DURATION_TICKS) or not _word(value.get("outcome"), OUTCOMES):
		return null
	if not _string(value.get("endedAt"), 20, 40):
		return null
	var stamp := RegEx.create_from_string("^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z|[+-]00:00)$")
	if stamp.search(value.endedAt) == null:
		return null
	var entry := History.new()
	entry.match_id = value.matchId
	entry.code = value.code
	entry.mode = MODES.find(value.mode) as Mode
	entry.skin = SKINS.find(value.skin) as Avatar
	entry.score = int(value.score)
	entry.outcome = StringName(value.outcome)
	entry.ended_at = value.endedAt
	return entry
