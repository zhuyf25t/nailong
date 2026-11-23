class_name SodaUI
extends Control

signal login_requested(player_name: String, password: String)
signal create_requested(mode: String, skin: String)
signal join_requested(code: String, skin: String)
signal leave_requested
signal history_requested
signal lobby_requested
signal logout_requested
signal rematch_requested

const K := preload("res://ui/ui_kit.gd")
const SKINS: Array[String] = ["dragon", "egg", "frog"]
const NAMES: Array[String] = ["奶龙", "奶蛋", "奶蛙"]
const COLORS: Array[Color] = [K.GOLD, K.BERRY, K.MINT]
const WEAPONS: Array[String] = ["奶泡", "糖星", "珍珠"]
const GLYPHS: Array[String] = ["bubble", "star", "pearl"]
const CAPS: Array[int] = [12,4,3]
const KEY_ART := "res://assets/keyart/title.png"
const WORDMARK := "res://ui/art/wordmark.png"
const TROPHY := "res://assets/trophy/winner.png"

var kit := K.new()
var page: Control
var player_name := ""
var username_input: LineEdit
var password_input: LineEdit
var code_input: LineEdit
var selected_skin := 0
var selected_mode := "ctf"
var _room_code := ""
var _screen := ""
var _busy := false
var _last_login := ""
var _action_buttons: Array[Button] = []
var _selection: Array[Button] = []
var _mode_tiles: Array[Button] = []
var _selection_ticks: Array[Label] = []
var _mode_ticks: Array[Label] = []
var _notice: Label
var _notice_time := 0.0
var _portrait: TextureRect
var _clock: Label
var _score: Label
var _fighter_name: Label
var _hp_data: Label
var _hp_fill: ColorRect
var _ammo: Label
var _weapon: Label
var _weapon_icon: TextureRect
var _dash: Label
var _shield: Label
var _effect: Label
var _flags: Label
var _names: Array[Label] = []
var _points: Array[Label] = []
var _faces: Array[TextureRect] = []
var _markers: Array[ColorRect] = []
var _slots: Array[ColorRect] = []

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	if page == null:
		show_login()

func _process(delta: float) -> void:
	if _notice_time > 0:
		_notice_time -= delta
		if _notice_time <= 0 and is_instance_valid(_notice):
			_notice.get_parent().hide()

func _clear(next: String) -> void:
	if is_instance_valid(page):
		remove_child(page)
		page.queue_free()
	page = Control.new()
	page.mouse_filter = Control.MOUSE_FILTER_IGNORE
	page.size = Vector2(1280,720)
	add_child(page)
	_screen = next
	_notice = null
	_notice_time = 0
	username_input = null
	password_input = null
	code_input = null
	_portrait = null
	_action_buttons.clear()
	_selection.clear()
	_selection_ticks.clear()
	_mode_tiles.clear()
	_mode_ticks.clear()
	_names.clear()
	_points.clear()
	_faces.clear()
	_markers.clear()
	_slots.clear()

func _reg(button: Button, action: Callable) -> Button:
	button.pressed.connect(action)
	button.disabled = _busy
	_action_buttons.append(button)
	return button

func _portrait_path(index: int) -> String:
	return "res://assets/characters/%s_portrait.png" % SKINS[clampi(index, 0, 2)]

func _glyph_path(key: String) -> String:
	return "res://ui/art/%s.png" % key

func _ui_background() -> void:
	kit.quad(page, Rect2(0,0,1280,720), K.NIGHT)
	for x in range(0,1280,16):
		kit.quad(page, Rect2(x,70,8,2), K.STEEL)
		kit.quad(page, Rect2(x+8,670,8,2), K.DARK)

func _header() -> void:
	kit.quad(page, Rect2(0,0,1280,66), K.INK)
	kit.quad(page, Rect2(0,64,1280,2), K.STEEL)
	kit.picture(page, WORDMARK, Rect2(24,11,222,42))
	kit.quad(page, Rect2(262,18,2,30), K.STEEL)
	kit.line(page,"奶泡乱斗",Rect2(279,9,140,48),29,K.PAPER,true)

func _pill(parent: Control, caption: String, at: Rect2, fill: Color, ink: Color, font_size := 15) -> Label:
	kit.quad(parent, at, fill)
	return kit.line(parent,caption,at,font_size,ink,true,HORIZONTAL_ALIGNMENT_CENTER)

func _footer() -> void:
	kit.quad(page,Rect2(0,682,1280,38),K.SHADOW)
	var x := 25
	for pair: Array in [["WASD","移动",52],["左键","发射",43],["1 / 2 / 3","换弹种",82],["R","装填",29],["右键","短跳",43],["Q","糖壳",29]]:
		var w := int(pair[2])
		_pill(page,pair[0],Rect2(x,690,w,22),K.DARK,K.PAPER,14)
		kit.line(page,pair[1],Rect2(x+w+7,688,55,26),15,K.MUTE)
		x += w+80
	kit.line(page,"汽水灌装间",Rect2(1070,686,184,30),16,K.MINT,true,HORIZONTAL_ALIGNMENT_RIGHT)

func _build_notice() -> void:
	var at := Rect2(338,679,604,39) if _screen == "match" else Rect2(420,70,440,46)
	var banner := kit.frame(page,at,K.PAPER,K.INK,3)
	banner.mouse_filter = Control.MOUSE_FILTER_IGNORE
	banner.z_index = 5
	_notice = kit.line(banner,"",Rect2(12,4,at.size.x-24,at.size.y-8),16,K.INK,true,HORIZONTAL_ALIGNMENT_CENTER)
	banner.hide()

func set_notice(message: String) -> void:
	if not is_instance_valid(_notice):
		return
	_notice.text = message
	_notice.tooltip_text = message
	_notice.get_parent().visible = not message.is_empty()
	_notice_time = 6

func set_busy(busy: bool) -> void:
	_busy = busy
	for button in _action_buttons:
		if is_instance_valid(button):
			button.disabled = busy

func _art_and_selection() -> void:
	kit.frame(page,Rect2(24,84,702,402),K.INK,K.STEEL,2)
	kit.picture(page,KEY_ART,Rect2(28,88,694,394),TextureRect.STRETCH_KEEP_ASPECT_COVERED)
	kit.quad(page,Rect2(24,482,702,4),K.MINT)
	kit.line(page,"选择选手",Rect2(24,497,126,37),25,K.PAPER,true)
	kit.line(page,"三种外观 · 同等属性",Rect2(153,500,280,32),15,K.MUTE)
	for i in 3:
		var x := 24 + 236*i
		var btn := kit.button(page,"",Rect2(x,541,229,108),K.DARK,K.PAPER,K.STEEL)
		btn.name = "Skin_%s" % SKINS[i]
		btn.tooltip_text = "选择" + NAMES[i]
		kit.picture(btn,_portrait_path(i),Rect2(4,12,80,80))
		kit.line(btn,NAMES[i],Rect2(91,17,125,38),24,K.PAPER,true)
		var tick := kit.line(btn,"",Rect2(92,58,126,26),15,COLORS[i],true)
		_selection_ticks.append(tick)
		_selection.append(btn)
		_reg(btn,_choose_skin.bind(i))
	_choose_skin(selected_skin)

func _choose_skin(index: int) -> void:
	selected_skin = index
	for i in _selection.size():
		var active := i == index
		kit.paint(_selection[i],Color("#45415b") if active else K.DARK,K.PAPER,COLORS[i] if active else K.STEEL)
		_selection_ticks[i].text = "●  已选择" if active else "选择"
		_selection_ticks[i].modulate = Color.WHITE if active else Color("#acabbd")
	if is_instance_valid(_portrait):
		_portrait.texture = kit.texture(_portrait_path(index))

func _menu_shell(screen: String) -> Control:
	_clear(screen)
	_ui_background()
	_header()
	_footer()
	_art_and_selection()
	var panel := kit.frame(page,Rect2(747,84,508,565),K.PAPER,K.SHADOW,3)
	kit.quad(panel,Rect2(3,3,502,6),K.MINT)
	return panel

func show_login() -> void:
	player_name = ""
	var p := _menu_shell("login")
	kit.line(page,"未登录",Rect2(1089,12,162,37),16,K.MUTE,false,HORIZONTAL_ALIGNMENT_RIGHT)
	kit.line(p,"选手登记",Rect2(30,35,338,65),44,K.INK,true)
	kit.line(p,"登录后可开房、加入好友或查看战绩。",Rect2(31,105,455,34),17,K.STEEL)
	_portrait = kit.picture(p,_portrait_path(selected_skin),Rect2(396,26,80,80))
	kit.quad(p,Rect2(30,155,448,2),Color("#cebcab"))
	kit.line(p,"昵称",Rect2(30,180,200,30),18,K.INK,true)
	username_input = kit.input(p,"输入选手昵称",Rect2(30,216,448,55))
	username_input.name = "Nickname"
	username_input.max_length = 32
	username_input.text = _last_login
	kit.line(p,"密码",Rect2(30,292,200,30),18,K.INK,true)
	password_input = kit.input(p,"8–128 个字符",Rect2(30,328,448,55),true)
	password_input.name = "Password"
	password_input.max_length = 128
	username_input.text_submitted.connect(func(_value: String) -> void: password_input.grab_focus())
	password_input.text_submitted.connect(func(_value: String) -> void: _submit_login())
	var enter := _reg(kit.button(p,"进入大厅  →",Rect2(30,417,448,59),K.MINT,K.INK,K.GREEN,23),_submit_login)
	enter.name = "Login"
	kit.line(p,"首次使用的昵称将自动注册。",Rect2(30,486,448,34),16,K.STEEL,false,HORIZONTAL_ALIGNMENT_CENTER)
	_build_notice()

func _submit_login() -> void:
	if _busy:
		return
	var nick := username_input.text.strip_edges()
	if nick.is_empty() or password_input.text.is_empty():
		set_notice("请填写昵称和密码。")
		return
	if password_input.text.length() < 8:
		set_notice("密码至少需要 8 个字符。")
		password_input.grab_focus()
		return
	_last_login = nick
	login_requested.emit(nick, password_input.text)

func show_lobby(nickname: String) -> void:
	player_name = nickname
	_last_login = nickname
	var p := _menu_shell("lobby")
	kit.line(page,nickname,Rect2(745,14,246,36),19,K.MINT,true,HORIZONTAL_ALIGNMENT_RIGHT)
	_reg(kit.button(page,"战绩",Rect2(1011,14,110,36),K.DARK,K.PAPER,K.STEEL,16),func() -> void: history_requested.emit()).name = "History"
	_reg(kit.button(page,"退出账号",Rect2(1131,14,124,36),K.DARK,K.PAPER,K.STEEL,16),func() -> void: logout_requested.emit()).name = "Logout"
	kit.line(p,"开一场比赛",Rect2(28,23,451,58),38,K.INK,true)
	kit.line(p,"四个席位，空位由 AI 选手补齐。",Rect2(30,85,448,29),17,K.STEEL)
	_add_mode(p,"汽水夺旗","两队护送汽水旗，先送回 2 面获胜。","flag",0,131)
	_add_mode(p,"奶泡乱斗","四人各自争分，先获 8 次击破。","star",1,211)
	_choose_mode(selected_mode)
	var create := _reg(kit.button(p,"创建房间  →",Rect2(28,305,452,56),K.MINT,K.INK,K.GREEN,22),
			func() -> void: create_requested.emit(selected_mode,SKINS[selected_skin]))
	create.name = "CreateRoom"
	kit.quad(p,Rect2(28,389,452,2),Color("#cebcab"))
	kit.line(p,"加入好友",Rect2(28,407,350,42),25,K.INK,true)
	code_input = kit.input(p,"输入 6 位房间码",Rect2(28,461,297,54))
	code_input.name = "RoomCode"
	code_input.max_length = 6
	code_input.text_submitted.connect(func(_value: String) -> void: _join())
	var join := _reg(kit.button(p,"加入",Rect2(335,461,145,54),K.INK,K.PAPER,K.SHADOW,21),_join)
	join.name = "JoinRoom"
	_build_notice()

func _add_mode(parent: Control,title: String,description: String,icon: String,index: int,y: int) -> void:
	var tile := kit.button(parent,"",Rect2(28,y,452,71),K.LIGHT,K.INK,K.STEEL)
	tile.name = "ModeCTF" if index == 0 else "ModeFFA"
	kit.picture(tile,_glyph_path(icon),Rect2(13,19,32,32))
	kit.line(tile,title,Rect2(61,5,320,33),21,K.INK,true)
	kit.line(tile,description,Rect2(61,38,342,25),15,K.STEEL)
	var tick := kit.line(tile,"",Rect2(400,19,38,32),22,K.GREEN,true,HORIZONTAL_ALIGNMENT_CENTER)
	_mode_ticks.append(tick)
	_mode_tiles.append(tile)
	_reg(tile,_choose_mode.bind("ctf" if index == 0 else "ffa"))

func _choose_mode(mode: String) -> void:
	selected_mode = mode
	for i in _mode_tiles.size():
		var active := (i == 0) == (mode == "ctf")
		kit.paint(_mode_tiles[i],Color("#d4edcf") if active else K.LIGHT,K.INK,K.GREEN if active else Color("#c5b6a4"))
		_mode_ticks[i].text = "◆" if active else "◇"

func _join() -> void:
	if _busy:
		return
	var code := code_input.text.strip_edges().to_upper()
	if not SodaState.valid_code(code):
		set_notice("房间码由 6 位英文字母或数字组成。")
		code_input.grab_focus()
		return
	join_requested.emit(code,SKINS[selected_skin])

func show_match(room_code: String, mode: String, _seat: int) -> void:
	_clear("match")
	_room_code = room_code
	# Cover only the space outside the low-resolution arena. All four margins
	# ignore mouse input so a shot at the outermost tile still reaches the game.
	kit.quad(page,Rect2(0,0,1280,88),K.NIGHT)
	kit.quad(page,Rect2(0,88,24,576),K.NIGHT)
	kit.quad(page,Rect2(984,88,296,576),K.NIGHT)
	kit.quad(page,Rect2(0,664,1280,56),K.NIGHT)
	_header()
	_footer()
	for stripe: Rect2 in [Rect2(20,84,968,4),Rect2(20,664,968,4),Rect2(20,88,4,576),Rect2(984,88,4,576)]:
		kit.quad(page,stripe,K.STEEL)
	_pill(page,"汽水夺旗" if mode == "ctf" else "奶泡乱斗",Rect2(425,17,106,31),K.MINT if mode == "ctf" else K.BERRY,K.INK,17)
	_clock = kit.line(page,"02:00",Rect2(550,2,133,59),40,K.PAPER,true,HORIZONTAL_ALIGNMENT_CENTER,true)
	_score = kit.line(page,"",Rect2(688,11,219,43),23,K.GOLD,true,HORIZONTAL_ALIGNMENT_CENTER)
	var copy_button := kit.button(page,"房间  " + room_code,Rect2(923,14,185,36),K.DARK,K.PAPER,K.STEEL,17)
	copy_button.tooltip_text = "复制房间码"
	copy_button.pressed.connect(func() -> void:
		DisplayServer.clipboard_set(room_code)
		set_notice("已复制房间码 " + room_code))
	_reg(kit.button(page,"离开房间",Rect2(1122,14,132,36),K.DARK,K.PAPER,K.STEEL,16),
			func() -> void: leave_requested.emit()).name = "LeaveRoom"
	var rail := kit.frame(page,Rect2(1002,84,253,584),K.DARK,K.STEEL,2)
	kit.quad(rail,Rect2(2,2,249,5),K.MINT)
	_portrait = kit.picture(rail,_portrait_path(selected_skin),Rect2(9,16,56,56))
	_fighter_name = kit.line(rail,"",Rect2(72,13,169,34),20,K.PAPER,true)
	_effect = kit.line(rail,"",Rect2(73,49,165,24),14,K.MINT,true)
	kit.line(rail,"生命",Rect2(13,85,64,23),15,K.PAPER,true)
	_hp_data = kit.line(rail,"100 / 100",Rect2(97,80,142,28),16,K.MINT,true,HORIZONTAL_ALIGNMENT_RIGHT,true)
	kit.quad(rail,Rect2(13,112,226,12),K.SHADOW)
	_hp_fill = kit.quad(rail,Rect2(15,114,222,8),K.MINT)
	kit.quad(rail,Rect2(13,139,226,2),K.STEEL)
	_weapon_icon = kit.picture(rail,_glyph_path("bubble"),Rect2(13,157,32,32))
	_weapon = kit.line(rail,"",Rect2(56,147,116,40),20,K.PAPER,true)
	_ammo = kit.line(rail,"",Rect2(146,150,92,38),18,K.GOLD,true,HORIZONTAL_ALIGNMENT_RIGHT)
	for i in 3:
		var chip := kit.quad(rail,Rect2(13+76*i,197,69,24),K.INK)
		_slots.append(chip)
		kit.line(chip,str(i+1),Rect2(1,0,24,24),15,K.PAPER,true,HORIZONTAL_ALIGNMENT_CENTER,true)
		kit.picture(chip,_glyph_path(GLYPHS[i]),Rect2(32,4,16,16))
	kit.picture(rail,_glyph_path("jump"),Rect2(13,245,26,26))
	kit.line(rail,"短跳",Rect2(48,241,56,30),16,K.PAPER,true)
	_dash = kit.line(rail,"",Rect2(106,241,133,30),16,K.MINT,true,HORIZONTAL_ALIGNMENT_RIGHT)
	kit.picture(rail,_glyph_path("shell"),Rect2(13,279,26,26))
	kit.line(rail,"糖壳",Rect2(48,275,56,30),16,K.PAPER,true)
	_shield = kit.line(rail,"",Rect2(106,275,133,30),16,K.MINT,true,HORIZONTAL_ALIGNMENT_RIGHT)
	kit.quad(rail,Rect2(13,317,226,2),K.STEEL)
	kit.line(rail,"参赛选手",Rect2(13,327,147,31),19,K.PAPER,true)
	kit.line(rail,"击破",Rect2(170,329,69,28),15,K.MUTE,false,HORIZONTAL_ALIGNMENT_RIGHT)
	for i in 4:
		var y := 370+37*i
		_markers.append(kit.quad(rail,Rect2(13,y,4,26),K.STEEL))
		_faces.append(kit.picture(rail,_portrait_path(i%3),Rect2(22,y-2,30,30)))
		_names.append(kit.line(rail,"",Rect2(59,y-2,146,30),16,K.PAPER))
		_points.append(kit.line(rail,"",Rect2(205,y-2,32,30),18,K.GOLD,true,HORIZONTAL_ALIGNMENT_RIGHT,true))
	kit.quad(rail,Rect2(13,525,226,2),K.STEEL)
	_flags = kit.line(rail,"",Rect2(13,535,228,38),14,K.MINT,true,HORIZONTAL_ALIGNMENT_CENTER)
	_build_notice()

func _cooldown(ticks: int) -> String:
	return "就绪" if ticks <= 0 else "%.1f 秒" % (float(ticks)/20.0)

func _mode_title(mode: SodaState.Mode) -> String:
	return "汽水夺旗" if mode == SodaState.Mode.CTF else "奶泡乱斗"

func _team_title(team: int) -> String:
	return "薄荷" if team == SodaState.Team.MINT else "草莓"

func display_snapshot(state: SodaState, local_seat: int) -> void:
	if _screen != "match" or local_seat < 0 or local_seat >= state.fighters.size():
		return
	var fighter := state.fighters[local_seat]
	var secs := ceili(float(state.remaining_ticks) / 20.0)
	_clock.text = "%02d:%02d" % [floori(float(secs)/60.0),secs%60]
	_clock.modulate = K.BERRY if secs <= 15 else Color.WHITE
	var is_ctf := state.mode == SodaState.Mode.CTF
	if is_ctf:
		_score.text = "薄荷 %d : %d 草莓" % [state.scores[0], state.scores[1]]
	else:
		_score.text = "击破 %d / 8" % fighter.kills
	_fighter_name.text = fighter.name
	_portrait.texture = kit.texture(_portrait_path(fighter.skin))
	_hp_data.text = "%d / 100" % fighter.hp
	_hp_fill.size.x = 222.0 * (float(fighter.hp)/100.0)
	_hp_fill.color = K.MINT if fighter.hp > 55 else (K.GOLD if fighter.hp > 28 else K.BERRY)
	_effect.text = ("%s队 · " % _team_title(fighter.team) if is_ctf else "") + NAMES[fighter.skin]
	if fighter.respawn_ticks > 0:
		_effect.text = "复活倒计时 %.1f 秒" % (float(fighter.respawn_ticks)/20.0)
	elif fighter.carrying >= 0:
		_effect.text = "携带%s旗" % _team_title(fighter.carrying)
	elif fighter.invuln_ticks > 0:
		_effect.text = "出生保护"
	_weapon.text = WEAPONS[fighter.weapon]
	_weapon_icon.texture = kit.texture(_glyph_path(GLYPHS[fighter.weapon]))
	_ammo.text = "%d / %d" % [fighter.ammo[fighter.weapon],CAPS[fighter.weapon]]
	if fighter.reload_ticks > 0:
		_ammo.text = "装填 %.1f" % (float(fighter.reload_ticks)/20.0)
	for i in _slots.size():
		_slots[i].color = K.GREEN if i == fighter.weapon else K.INK
	_dash.text = _cooldown(fighter.dash_cd)
	_shield.text = "生效 %.1f 秒" % (float(fighter.shield_ticks)/20.0) if fighter.shield_ticks > 0 else _cooldown(fighter.shield_cd)
	for f: SodaState.Fighter in state.fighters:
		_faces[f.seat].texture = kit.texture(_portrait_path(f.skin))
		var label := f.name
		if f.seat == local_seat:
			label += " · 我"
		elif not f.human:
			label += " · AI"
		_names[f.seat].text = label
		_names[f.seat].tooltip_text = label
		_points[f.seat].text = str(f.kills)
		_markers[f.seat].color = (K.MINT if f.team == SodaState.Team.MINT else K.BERRY) if is_ctf else (K.GOLD if f.seat == local_seat else K.STEEL)
	if is_ctf:
		var flag_text := PackedStringArray()
		for flag: SodaState.Flag in state.flags:
			flag_text.append("%s旗%s" % [_team_title(flag.team),"在家" if flag.carrier < 0 else "被夺"])
		_flags.text = " · ".join(flag_text)
	else:
		_flags.text = "先获 8 次击破者胜"

func _outcome(state: SodaState, local: int) -> String:
	var result := state.result
	if result == null:
		return "比赛结束"
	if result.kind == &"draw":
		return "本场平局"
	var winner := result.seat == local if result.kind == &"player" else result.team == state.fighters[local].team
	return "本场胜利" if winner else "本场惜败"

func _ranking_row(parent: Control, f: SodaState.Fighter, y: int, local: int, rank: int) -> void:
	var own := f.seat == local
	var fill := Color("#d4ead1") if own else K.LIGHT
	kit.quad(parent,Rect2(25,y,443,60),fill)
	kit.line(parent,"%02d" % rank,Rect2(31,y+7,45,45),20,K.GREEN,true,HORIZONTAL_ALIGNMENT_CENTER,true)
	kit.picture(parent,_portrait_path(f.skin),Rect2(78,y+6,46,46))
	kit.line(parent,f.name + (" · 我" if own else (" · AI" if not f.human else "")),Rect2(137,y+5,205,45),18,K.INK,own)
	kit.line(parent,"%d / %d" % [f.kills,f.deaths],Rect2(345,y+5,105,45),21,K.INK,true,HORIZONTAL_ALIGNMENT_RIGHT,true)

func show_result(state: SodaState,local_seat: int) -> void:
	if state.result == null:
		return
	_clear("result")
	_ui_background()
	_header()
	var left := kit.frame(page,Rect2(24,85,704,565),K.DARK,K.STEEL,2)
	kit.picture(left,KEY_ART,Rect2(3,3,698,559),TextureRect.STRETCH_KEEP_ASPECT_COVERED)
	kit.quad(left,Rect2(3,3,698,559),Color("#201c35db"))
	_pill(left,_mode_title(state.mode),Rect2(292,35,120,34),K.GOLD,K.INK,17)
	kit.picture(left,TROPHY,Rect2(255,86,192,192))
	kit.line(left,_outcome(state,local_seat),Rect2(12,282,680,96),65,K.PAPER,true,HORIZONTAL_ALIGNMENT_CENTER)
	var subtitle := "平分终场"
	if state.result.kind == &"team":
		subtitle = "%s队获胜　·　薄荷 %d : %d 草莓" % [_team_title(state.result.team),state.scores[0],state.scores[1]]
	elif state.result.kind == &"player":
		subtitle = "%s 获得最多击破" % state.fighters[state.result.seat].name
	kit.line(left,subtitle,Rect2(20,395,664,50),22,K.MINT,true,HORIZONTAL_ALIGNMENT_CENTER)
	kit.line(left,"房间  %s" % state.code,Rect2(20,473,664,36),18,K.PAPER,false,HORIZONTAL_ALIGNMENT_CENTER)
	var p := kit.frame(page,Rect2(746,85,508,565),K.PAPER,K.SHADOW,3)
	kit.quad(p,Rect2(3,3,502,6),K.GOLD)
	kit.line(p,"本场成绩",Rect2(26,18,325,62),38,K.INK,true)
	kit.line(p,"击破 / 出局",Rect2(330,79,119,30),15,K.STEEL,true,HORIZONTAL_ALIGNMENT_RIGHT)
	var sorted: Array[SodaState.Fighter] = state.fighters.duplicate()
	sorted.sort_custom(func(a: SodaState.Fighter,b: SodaState.Fighter) -> bool:
		return a.kills > b.kills or (a.kills == b.kills and (a.deaths < b.deaths or (a.deaths == b.deaths and a.seat < b.seat))))
	for i in sorted.size():
		_ranking_row(p,sorted[i],119+67*i,local_seat,i+1)
	_reg(kit.button(p,"再来一局  →",Rect2(25,411,456,56),K.MINT,K.INK,K.GREEN,22),func() -> void: rematch_requested.emit()).name = "Rematch"
	_reg(kit.button(p,"返回大厅",Rect2(25,486,220,48),K.LIGHT,K.INK,Color("#bfada1"),18),func() -> void: lobby_requested.emit()).name = "Lobby"
	_reg(kit.button(p,"查看战绩",Rect2(258,486,223,48),K.LIGHT,K.INK,Color("#bfada1"),18),func() -> void: history_requested.emit()).name = "History"
	_build_notice()

func _local_stamp(iso: String) -> String:
	var timestamp := Time.get_unix_time_from_datetime_string(iso)
	var offset := int(Time.get_time_zone_from_system().get("bias",0)) * 60
	return Time.get_datetime_string_from_unix_time(timestamp+offset,true).left(16)

func show_history(items: Array[SodaState.History]) -> void:
	_clear("history")
	_ui_background()
	_header()
	kit.line(page,player_name,Rect2(872,13,376,38),19,K.MINT,true,HORIZONTAL_ALIGNMENT_RIGHT)
	var panel := kit.frame(page,Rect2(24,85,1232,564),K.PAPER,K.SHADOW,3)
	kit.quad(panel,Rect2(3,3,1226,6),K.MINT)
	kit.line(panel,"我的战绩",Rect2(28,15,603,66),40,K.INK,true)
	_reg(kit.button(panel,"返回大厅",Rect2(1032,28,170,42),K.INK,K.PAPER,K.SHADOW,17),func() -> void: lobby_requested.emit()).name = "Lobby"
	kit.quad(panel,Rect2(26,96,1178,37),K.DARK)
	for column: Array in [["结果",43,115],["参赛选手",180,215],["赛制",424,197],["得分",637,106],["房间码",772,152],["结束时间（本地）",946,240]]:
		kit.line(panel,column[0],Rect2(column[1],98,column[2],31),15,K.PAPER,true)
	if items.is_empty():
		kit.picture(panel,_glyph_path("flag"),Rect2(584,229,64,64))
		kit.line(panel,"还没有已结算的比赛",Rect2(205,315,822,44),25,K.INK,true,HORIZONTAL_ALIGNMENT_CENTER)
		kit.line(panel,"打一局后，成绩会出现在这里。",Rect2(203,366,826,33),17,K.STEEL,false,HORIZONTAL_ALIGNMENT_CENTER)
	else:
		var scroll := ScrollContainer.new()
		scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
		kit.place(panel,scroll,Rect2(26,136,1178,404))
		var rows := Control.new()
		rows.mouse_filter = Control.MOUSE_FILTER_IGNORE
		rows.custom_minimum_size = Vector2(1140,items.size()*54)
		scroll.add_child(rows)
		for i in items.size():
			var row := items[i]
			var y := i*54
			kit.quad(rows,Rect2(0,y,1150,51),K.LIGHT if i%2 == 0 else Color("#f4e3ca"))
			var outcome := "胜利" if row.outcome == &"win" else ("平局" if row.outcome == &"draw" else "惜败")
			_pill(rows,outcome,Rect2(16,y+10,77,30),K.MINT if row.outcome == &"win" else (K.GOLD if row.outcome == &"draw" else K.BERRY),K.INK)
			kit.picture(rows,_portrait_path(row.skin),Rect2(149,y+3,44,44))
			kit.line(rows,NAMES[row.skin],Rect2(198,y+6,158,39),18,K.INK,true)
			kit.line(rows,_mode_title(row.mode),Rect2(398,y+6,187,39),18,K.INK)
			kit.line(rows,str(row.score),Rect2(611,y+6,102,39),20,K.INK,true,HORIZONTAL_ALIGNMENT_LEFT,true)
			kit.line(rows,row.code,Rect2(747,y+6,149,39),18,K.INK,true,HORIZONTAL_ALIGNMENT_LEFT,true)
			kit.line(rows,_local_stamp(row.ended_at),Rect2(919,y+6,222,39),16,K.STEEL,false,HORIZONTAL_ALIGNMENT_LEFT,true)
	_build_notice()
