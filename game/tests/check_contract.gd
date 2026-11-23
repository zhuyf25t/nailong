extends SceneTree

var _errors := 0

func _initialize() -> void:
	var seats: Array = []
	var fighters: Array = []
	for i in 4:
		seats.append({"slot": i, "name": "糖豆", "skin": "dragon", "human": i == 0})
		fighters.append({"seat":i,"team":"mint" if i % 2 == 0 else "berry","x":40,"y":40,"aimX":1,"aimY":0,
			"hp":100,"respawnTicks":0,"invulnTicks":25,"shieldTicks":0,"shieldCd":0,"dashCd":0,
			"weapon":0,"ammo":[12,4,3],"reloadTicks":0,"kills":0,"deaths":0,"carrying":null})
	var view := {"code":"ABCD93","matchId":SodaApi.uuid(),"you":0,"ack":-1,"seats":seats,
		"state":{"tick":0,"remainingTicks":2400,"mode":"ffa","fighters":fighters,"shots":[],
		"pickups":[{"x":88,"y":120,"cooldown":0}],"flags":[],"scores":{"mint":0,"berry":0},"events":[],"result":null}}
	_expect(SodaState.decode(JSON.parse_string(JSON.stringify(view))) != null, "valid wire")
	var bad := view.duplicate(true)
	bad.state.fighters[0].ammo[2] = 4
	_expect(SodaState.decode(bad) == null, "magazine bounds")
	bad = view.duplicate(true)
	bad.seats[1].slot = 0
	_expect(SodaState.decode(bad) == null, "duplicate seat")
	bad = view.duplicate(true)
	bad.state.events = [{"tick":0,"id":1,"kind":"server_override","seat":0,"target":null,"x":5,"y":5}]
	_expect(SodaState.decode(bad) == null, "event enum")
	bad = view.duplicate(true)
	bad.state.result = {"kind":"team","seat":0,"team":"mint"}
	_expect(SodaState.decode(bad) == null, "winner type")
	bad = view.duplicate(true)
	bad.state.fighters[1].x = 612
	_expect(SodaState.decode(bad) == null, "world bounds")
	bad = view.duplicate(true)
	bad.state.fighters[1].erase("carrying")
	_expect(SodaState.decode(bad) == null, "explicit nullable required")
	_expect(SodaState.decode_history({"matchId":SodaApi.uuid(), "code":"ABCD93","mode":"ctf","skin":"egg",
		"score":1,"outcome":"win","endedAt":"2026-11-23T09:13:14.103Z"}) != null, "time format")
	var intent := SodaInput.new()
	intent.shield_pressed = true
	_expect(intent.sample().shield and not intent.sample().shield, "consume input edge once")
	intent.fire_pressed = true
	intent.firing = false
	_expect(intent.sample().fire and not intent.sample().fire, "short click survives between two packets")
	print("Soda typed contract ", "PASS" if _errors == 0 else "FAIL")
	quit(_errors)

func _expect(ok: bool, label: String) -> void:
	if not ok:
		_errors += 1
		push_error("Contract failed: " + label)
