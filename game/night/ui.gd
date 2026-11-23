class_name NightUI
extends Control

signal guest_requested
signal login_requested(nickname:String,password:String)
signal logout_requested
signal start_requested(night:int)
signal roster_requested
signal leave_requested
signal mute_requested(muted:bool)
signal rules_requested
signal rules_closed

const Print = preload("res://night/ui_print.gd")
const Rulebook = preload("res://night/rules.gd")
const CAST := "res://assets/night/cast/"
const TITLE_PATH := "res://assets/night/title.png"
const LATCH_PATH := "res://assets/night/latch.webp"
const CLOCKOUT_PATH := "res://assets/night/clockout.webp"
const BOTTLE_PATH := "res://assets/night/props/pressure_bottle.png"
const NAMES := ["暖灯试工","第二扇窗","毛玻璃","隔离护栏","三个笑脸","停电预演","逆向流水线","最后一班"]
const LESSONS := [
	"鼠标瞄准上方 2 号窗的窗台，点左键送汽水。送满三瓶，走到下方南门打卡。",
	"看上单瓶盖记录，把鼠标放到奶龙另一侧，点右键弹盖。把汽水投给伸手追这枚瓶盖的伙伴。",
	"玻璃变得模糊。弹盖后留意窗内稍迟的伸手动作，再决定往哪边投。",
	"隔板挡住直线路线。后两单要借侧墙反弹，把瓶子送到真伙伴手里。",
	"三扇窗都亮起来。两个身影记着上单的方向，只有一个会追这枚瓶盖。",
	"照明回路间歇熄灯。看窗沿的左右手势，在暖灯暗下去时也能判断。",
	"脚下的传送带会横向推人。盯住伙伴，出手前修正自己的位置。",
	"三扇窗、暗灯和传送带同时运转。最后一瓶必须经过侧墙。送完三瓶，到南门打卡。"]
const WINDOW_COUNTS := [1,2,2,2,3,3,3,3]
const SECONDS := [0,52,47,52,44,40,38,36]
const ENVIRONMENT := ["暖灯","双窗","延迟","反弹","三窗","停电","传送带","综合交班"]

var p := Print.new()
var _screen := ""
var _sheet: Control
var _notice: Label
var _notice_bg: ColorRect
var _mute_button: Button
var _world: Control
var _dialog: Control
var _manual: Control
var _profile: Dictionary = {}
var _player := ""
var _guest_name := ""
var _muted := false
var _busy := false
var _login_form := false
var _selected := 1
var _last_tick := -1
var _last_event_id := -1
var _event_until := 0
var _event_caption := ""
var _last_order := 0
var _last_delivered := 0
var _probed_this_order := false
var _hud: Dictionary[String,Label] = {}
var _inspection: Control
var _gauge: Control
var _optional: Control
var _pressure_bars: Array[ColorRect] = []
var _portrait: TextureRect
var _portrait_actor := ""
var _leave_button: Button
var _postcards: Dictionary[String,Texture2D] = {}
var _pending_postcards: Array[String] = []
var _photo: TextureRect
var _photo_path := ""

func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	for source:String in [TITLE_PATH,LATCH_PATH,CLOCKOUT_PATH]:
		if ResourceLoader.exists(source) and ResourceLoader.load_threaded_request(source,"Texture2D")==OK:
			_pending_postcards.append(source)
	set_process(not _pending_postcards.is_empty())

func _process(_delta:float) -> void:
	for i in range(_pending_postcards.size()-1,-1,-1):
		var path := _pending_postcards[i]
		var state := ResourceLoader.load_threaded_get_status(path)
		if state==ResourceLoader.THREAD_LOAD_LOADED:
			var tex := ResourceLoader.load_threaded_get(path) as Texture2D
			_postcards[path] = tex
			if is_instance_valid(_photo) and _photo_path==path:
				_photo.texture = tex
		if state!=ResourceLoader.THREAD_LOAD_IN_PROGRESS:
			_pending_postcards.remove_at(i)
	set_process(not _pending_postcards.is_empty())

func _postcard(parent:Control,x:int,y:int,w:int,h:int,path:String) -> void:
	_photo_path = path
	_photo = TextureRect.new()
	_photo.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_photo.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_photo.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	_photo.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	_photo.texture = _postcards.get(path)
	p.place(parent,_photo,x,y,w,h)

func _reset(mode:String) -> void:
	if is_instance_valid(_world) and _world.get_parent() != null:
		_world.get_parent().remove_child(_world)
	if is_instance_valid(_sheet):
		remove_child(_sheet)
		_sheet.queue_free()
	_screen = mode
	_dialog = null
	_notice = null
	_notice_bg = null
	_mute_button = null
	_leave_button = null
	_hud.clear()
	_pressure_bars.clear()
	_portrait = null
	_portrait_actor = ""
	_photo = null
	_photo_path = ""
	_sheet = p.area(self,0,0,1280,720,"NightPage")
	p.art(_sheet,0,0,1280,720,"wall")
	if rules_open():
		_sheet.hide()

func _top(section:String) -> void:
	p.rect(_sheet,0,0,1280,54,Print.COAL)
	p.rect(_sheet,0,52,1280,2,Print.RIM)
	p.art(_sheet,28,7,36,35,"bottles",Print.LAMP)
	p.line(_sheet,74,6,142,41,"深夜汽水厂",24,Print.WHITE,1)
	p.rect(_sheet,218,17,2,21,Print.RIM)
	p.line(_sheet,236,5,250,42,section,17,Print.DULL)
	if _screen in ["title","roster","play","result"]:
		p.button(_sheet,888,9,121,35,"玩法说明","RulesButton",func(): rules_requested.emit(),2,15)
	_mute_button = p.button(_sheet,1153,9,99,35,"","MuteButton",_toggle_mute,2,15)
	_update_mute()

func _footer(text:String) -> void:
	p.rect(_sheet,0,664,1280,56,Print.COAL)
	p.rect(_sheet,0,664,1280,2,Print.RIM)
	p.line(_sheet,30,671,1170,38,text,16,Print.DULL)

func _notices(x:=28,y:=618,w:=1224) -> void:
	_notice_bg = p.rect(_sheet,x,y,w,38,Color("#873d32"))
	_notice = p.line(_sheet,x+12,y,w-24,38,"",17,Print.WHITE,1,HORIZONTAL_ALIGNMENT_LEFT,"Notice")
	_notice_bg.hide()
	_notice.hide()

func set_notice(message:String) -> void:
	if not is_instance_valid(_notice):
		return
	_notice.text = message
	_notice.visible = not message.is_empty()
	_notice_bg.visible = _notice.visible

func set_muted(value:bool) -> void:
	_muted = value
	_update_mute()

func _toggle_mute() -> void:
	set_muted(not _muted)
	mute_requested.emit(_muted)

func _update_mute() -> void:
	if is_instance_valid(_mute_button):
		_mute_button.text = "声音  关" if _muted else "声音  开"
		_mute_button.tooltip_text = "切换音效；所有判断都有可见线索。"

func set_guest_name(value:String) -> void:
	_guest_name = value
	if _screen == "title" and not _login_form:
		_draw_title()

func set_busy(value:bool) -> void:
	_busy = value
	if is_instance_valid(_sheet):
		for b in _sheet.find_children("*","Button",true,false):
			if b.has_meta("network"):
				(b as Button).disabled = _busy

func _network(b:Button) -> Button:
	b.set_meta("network",true)
	b.disabled = _busy
	return b

func show_title() -> void:
	_login_form = false
	_draw_title()

func _account() -> void:
	_login_form = true
	_draw_title()
	var field := _sheet.find_child("NicknameEdit",true,false) as LineEdit
	if field:
		field.grab_focus()

func _draw_title() -> void:
	_reset("title")
	_top("夜班考勤室")
	var art := p.area(_sheet,28,76,748,554)
	p.art(art,0,0,748,554,"plate")
	p.art(art,8,8,732,486,"fallback")
	_postcard(art,8,8,732,486,TITLE_PATH)
	p.rect(art,8,494,732,3,Print.LAMP)
	p.art(art,24,515,178,21,"word",Print.GREEN)
	p.line(art,225,501,494,46,"单人像素悬疑 · 八个夜班",18,Print.WHITE,0,HORIZONTAL_ALIGNMENT_RIGHT)
	var card := p.area(_sheet,798,76,454,554)
	p.art(card,0,0,454,554,"paper")
	p.line(card,24,24,394,26,"出 勤 凭 证",16,Print.TEAL,1)
	p.line(card,22,54,405,60,"夜班只有三只",47,Print.INK,1)
	p.art(card,24,126,399,2,"rule",Print.MUTED_INK)
	if not _login_form:
		p.line(card,24,161,401,43,"今晚，你替奶龙值班。",28,Print.INK,1)
		p.paragraph(card,24,220,393,75,"打烊前，把三瓶汽水送到伙伴手里。\n厂里多出来的那一只，记得上一单。",20,Print.MUTED_INK)
		var caption := "领取本机工牌" if _guest_name.is_empty() else "使用本机工牌"
		_network(p.button(card,24,322,400,59,caption+"   →","GuestButton",func(): guest_requested.emit(),0,23))
		p.button(card,24,393,400,49,"使用昵称与口令","AccountButton",_account,1,19)
		var identity := "班次进度随工牌保存" if _guest_name.is_empty() else "本机工牌  /  "+_guest_name
		p.line(card,24,459,402,31,identity,16,Print.MUTED_INK)
	else:
		p.line(card,25,144,390,30,"登记工牌",22,Print.INK,1)
		var nick := p.input(card,24,185,400,"昵称（1–32 字）","NicknameEdit")
		var secret := p.input(card,24,245,400,"口令（至少 8 字）","PasswordEdit",true)
		var submit := func(): login_requested.emit(nick.text,secret.text)
		nick.text_submitted.connect(func(_v:String): secret.grab_focus())
		secret.text_submitted.connect(func(_v:String):
			if not _busy: submit.call())
		_network(p.button(card,24,315,400,55,"登记并打卡   →","LoginButton",submit,0,22))
		p.button(card,24,382,400,45,"返回本机工牌","BackButton",show_title,1,17)
		p.paragraph(card,24,442,394,54,"新昵称首次登记会建档；旧工牌用原口令登录。",16,Print.MUTED_INK)
	p.art(card,25,511,141,17,"barcode",Print.INK)
	p.line(card,174,501,246,38,"NIGHT SHIFT  /  01—08",15,Print.MUTED_INK,2,HORIZONTAL_ALIGNMENT_RIGHT)
	_footer("移动   WASD / 方向键       瞄准   鼠标       右键  弹瓶盖       左键  投汽水")
	_notices(28,620,1224)

func show_roster(profile:Dictionary,nickname:String) -> void:
	_profile = profile
	_player = nickname
	_selected = clampi(int(profile.get("unlocked",1)),1,8)
	_draw_roster()

func _choose(n:int) -> void:
	_selected = n
	_draw_roster()

func _draw_roster() -> void:
	_reset("roster")
	_top("夜班名册")
	p.button(_sheet,1021,9,120,35,"换工牌","LogoutButton",func(): logout_requested.emit(),2,15)
	p.line(_sheet,30,72,630,55,"选一个夜班",41,Print.WHITE,1)
	var cleared: Array = _profile.get("cleared",[])
	var unlocked := clampi(int(_profile.get("unlocked",1)),1,8)
	p.line(_sheet,31,130,251,32,"员工  "+_player,18,Print.DULL)
	p.line(_sheet,292,130,460,32,"已打卡 %d / 8     单班最佳无失误 %d / 3"%[cleared.size(),int(_profile.get("bestClean",0))],17,Print.DULL,0,HORIZONTAL_ALIGNMENT_RIGHT)
	for idx in 8:
		var n := idx+1
		var x := 30+(idx%2)*372
		var y := 181+floori(idx/2.0)*105
		var active := n==_selected
		var locked := n>unlocked
		var card := p.button(_sheet,x,y,356,90,"","Night"+str(n),_choose.bind(n),0 if active else 2)
		card.disabled = locked
		var accent:Color = Print.LAMP if active else (Print.GREEN if not locked else Print.RIM)
		p.rect(card,0,0,5,90,accent)
		p.line(card,15,11,60,64,"%02d"%n,31,accent,2)
		p.line(card,82,8,258,37,NAMES[idx],22,Print.WHITE if not locked else Print.DULL,1)
		var state := "已打卡" if n in cleared else ("未解锁" if locked else "可值班")
		p.line(card,83,46,254,26,"%s   ·   %s"%[state,ENVIRONMENT[idx]],15,Print.DULL if not active else Print.WHITE)
	var paper := p.area(_sheet,787,80,465,548)
	p.art(paper,0,0,465,548,"paper")
	p.line(paper,24,24,252,28,"当 班 通 知",16,Print.TEAL,1)
	p.line(paper,267,28,163,28,"SHIFT  %02d / 08"%_selected,16,Print.MUTED_INK,2,HORIZONTAL_ALIGNMENT_RIGHT)
	p.line(paper,23,57,412,55,NAMES[_selected-1],42,Print.INK,1)
	p.art(paper,24,129,412,2,"rule",Print.MUTED_INK)
	p.line(paper,25,151,280,32,"交班任务",19,Print.TEAL,1)
	p.paragraph(paper,24,193,280,99,LESSONS[_selected-1],19,Print.INK)
	p.image(paper,324,148,90,143,BOTTLE_PATH)
	p.rect(paper,24,312,411,2,Print.PAPER_SHADE)
	p.line(paper,26,328,181,31,"取货窗",17,Print.MUTED_INK)
	p.line(paper,191,326,239,36,"%d 扇"%WINDOW_COUNTS[_selected-1],22,Print.INK,1,HORIZONTAL_ALIGNMENT_RIGHT)
	p.line(paper,26,372,181,31,"每单时限",17,Print.MUTED_INK)
	var seconds:int = SECONDS[_selected-1]
	p.line(paper,190,367,240,39,"宽限 · 不计时" if seconds==0 else "%d 秒"%seconds,22,Print.INK,1,HORIZONTAL_ALIGNMENT_RIGHT)
	_network(p.button(paper,24,434,412,58,"上第 %d 夜   →"%_selected,"StartButton",func(): start_requested.emit(_selected),0,23))
	p.art(paper,26,519,110,12,"barcode",Print.MUTED_INK)
	p.line(paper,142,505,288,35,"THREE BOTTLES / SHIFT",15,Print.MUTED_INK,2,HORIZONTAL_ALIGNMENT_RIGHT)
	_footer("每夜三单。送完后走到南门，打卡才算下班。")
	_notices(28,620,1224)

func gameplay_blocked() -> bool:
	return _screen != "play" or is_instance_valid(_dialog) or rules_open()

func rules_open() -> bool:
	return is_instance_valid(_manual)

func show_rules(continue_label:String="返回游戏") -> void:
	if rules_open():
		return
	var focus := get_viewport().gui_get_focus_owner()
	if focus:
		focus.release_focus()
	if is_instance_valid(_sheet):
		_sheet.hide()
	_manual = Rulebook.new()
	_manual.name = "RulesManual"
	_manual.z_index = 100
	_manual.closed.connect(func(): rules_closed.emit())
	add_child(_manual)
	_manual.open(continue_label)

func hide_rules() -> void:
	if not rules_open():
		return
	var previous := _manual
	_manual = null
	remove_child(previous)
	previous.queue_free()
	if is_instance_valid(_sheet):
		_sheet.show()

func show_play(world:Control) -> void:
	_reset("play")
	_world = world
	_last_tick = -1
	_last_event_id = -1
	_last_order = 0
	_last_delivered = 0
	_probed_this_order = false
	_event_until = 0
	_event_caption = ""
	_top("出货间")
	_hud["NightTitle"] = p.line(_sheet,418,4,525,43,"",22,Print.WHITE,1,HORIZONTAL_ALIGNMENT_CENTER,"NightTitle")
	_leave_button = p.button(_sheet,1021,9,120,35,"离开本班","LeaveButton",_confirm_leave,2,15)
	p.rect(_sheet,16,62,968,584,Print.COAL)
	p.rect(_sheet,18,64,964,580,Print.RIM)
	var dock := p.area(_sheet,20,66,960,576,"WorldDock")
	dock.clip_contents = true
	if is_instance_valid(_world):
		if _world.get_parent():
			_world.get_parent().remove_child(_world)
		dock.add_child(_world)
		_world.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var ticket := p.area(_sheet,996,62,268,587)
	p.art(ticket,0,0,268,587,"slip")
	p.rect(ticket,0,0,264,6,Print.RED)
	p.line(ticket,17,13,166,45,"交班票",30,Print.INK,1)
	p.line(ticket,160,24,83,27,"SHIFT",17,Print.MUTED_INK,2,HORIZONTAL_ALIGNMENT_RIGHT)
	p.art(ticket,17,62,230,2,"rule",Print.MUTED_INK)
	p.line(ticket,17,79,105,26,"已签收",17,Print.MUTED_INK)
	_hud["OrderValue"] = p.line(ticket,16,107,148,47,"0 / 3",34,Print.INK,2,HORIZONTAL_ALIGNMENT_LEFT,"OrderValue")
	_portrait = p.image(ticket,179,75,61,61,CAST+"frog_portrait.png")
	_hud["ActorValue"] = p.line(ticket,141,133,115,28,"",15,Print.TEAL,1,HORIZONTAL_ALIGNMENT_CENTER,"ActorValue")
	p.rect(ticket,16,169,232,2,Print.PAPER_SHADE)
	_hud["PhaseValue"] = p.line(ticket,17,181,232,38,"",24,Print.TEAL,1,HORIZONTAL_ALIGNMENT_LEFT,"PhaseValue")
	_hud["TaskValue"] = p.paragraph(ticket,17,228,229,115,"",19,Print.INK)
	_hud["TaskValue"].name = "TaskValue"
	_inspection = p.area(ticket,0,351,260,94,"InspectionRecord")
	p.art(_inspection,17,0,231,2,"rule",Print.MUTED_INK)
	p.line(_inspection,17,12,131,29,"上单瓶盖记录",16,Print.MUTED_INK)
	_hud["MemoryValue"] = p.line(_inspection,140,9,105,34,"",20,Print.RED,1,HORIZONTAL_ALIGNMENT_RIGHT,"MemoryValue")
	p.line(_inspection,17,51,122,29,"本次试探",16,Print.MUTED_INK)
	_hud["ProbeValue"] = p.line(_inspection,132,48,113,34,"",18,Print.INK,1,HORIZONTAL_ALIGNMENT_RIGHT,"ProbeValue")
	_gauge = p.area(ticket,0,448,260,85,"PressureGauge")
	p.rect(_gauge,16,0,232,2,Print.PAPER_SHADE)
	_hud["ClockLabel"] = p.line(_gauge,17,13,121,28,"瓶内压力",16,Print.MUTED_INK)
	_hud["PressureValue"] = p.line(_gauge,121,8,126,38,"",20,Print.INK,1,HORIZONTAL_ALIGNMENT_RIGHT,"PressureValue")
	for i in 14:
		_pressure_bars.append(p.rect(_gauge,17+i*16,55,13,11,Print.PAPER_SHADE))
	_optional = p.area(ticket,0,394,263,118,"OptionalPractice")
	p.art(_optional,17,0,231,2,"rule",Print.PAPER_SHADE)
	p.line(_optional,17,14,230,29,"选做 · 试弹瓶盖",16,Print.MUTED_INK,1)
	_hud["OptionalProbe"] = p.paragraph(_optional,17,49,230,67,"",16,Print.MUTED_INK)
	_hud["IdleLeverNote"] = p.line(ticket,17,506,235,31,"两侧地面是应急杆，平时不用。",15,Print.MUTED_INK,0,HORIZONTAL_ALIGNMENT_LEFT,"IdleLeverNote")
	_inspection.hide()
	_gauge.hide()
	_optional.hide()
	p.art(ticket,17,550,71,13,"barcode",Print.MUTED_INK)
	p.line(ticket,105,542,140,30,"DELIVERY LOG",13,Print.MUTED_INK,2,HORIZONTAL_ALIGNMENT_RIGHT)
	_footer("")
	_hud["Controls"] = p.line(_sheet,24,672,750,38,"WASD / 方向键 移动     鼠标 瞄准     右键 弹盖     左键 投瓶",17,Print.WHITE)
	_hud["EventValue"] = p.line(_sheet,729,672,520,38,"",17,Print.LAMP,1,HORIZONTAL_ALIGNMENT_RIGHT,"EventValue")
	_notices(27,608,945)

func update_play(view:Dictionary) -> void:
	if _screen != "play":
		return
	var night := clampi(int(view.get("night",1)),1,8)
	var phase := str(view.get("phase","serving"))
	var esc := phase == "escaping"
	var out := phase == "clockout"
	var tick := int(view.get("tick",0))
	var pressure := int(view.get("escapeTicks",0)) if esc else int(view.get("pressure",-1))
	var order := clampi(int(view.get("order",1)),1,3)
	var delivered := clampi(int(view.get("delivered",0)),0,3)
	var serving := phase == "serving"
	var first := night == 1
	var windows: Array = view.get("windows",[])
	var actor := ""
	if not windows.is_empty():
		actor = str(windows[0].get("actor",""))
	if _portrait_actor != actor:
		_portrait_actor = actor
		_portrait.texture = p.texture(CAST+actor+"_portrait.png") if actor in ["egg","frog"] else null
	_hud["NightTitle"].text = "第 %d 夜   /   %s" % [night,NAMES[night-1]]
	_hud["OrderValue"].text = "%d / 3"%delivered
	var partner := "奶蛋" if actor=="egg" else ("奶蛙" if actor=="frog" else "伙伴")
	_hud["ActorValue"].text = partner
	var memory := str(view.get("memory","left"))
	_hud["MemoryValue"].text = "向左" if memory=="left" else "向右"
	var probe := str(view.get("probe","none"))
	if order!=_last_order:
		_probed_this_order = false
		_last_order = order
	if probe!="none":
		_probed_this_order = true
	_hud["ProbeValue"].text = ("向左" if probe=="left" else "向右") if probe!="none" else ("手势已收" if _probed_this_order else "待弹盖")
	_inspection.visible = serving and not first
	_gauge.visible = esc or (serving and not first)
	_optional.visible = first and serving and order>=2
	_hud["OptionalProbe"].text = "鼠标放在奶龙一侧，点右键，看%s朝哪边伸手。"%partner
	_hud["IdleLeverNote"].visible = first and serving
	_hud["Controls"].text = "鼠标移动到窗台   ·   左键投瓶" if first and serving else (
		"WASD / 方向键  移动" if out or esc else "WASD / 方向键 移动     鼠标 瞄准     右键 弹盖     左键 投瓶")
	_hud["ClockLabel"].text = "逃生时限" if esc else "瓶内压力"
	_hud["PressureValue"].text = "已交付" if out else ("不限时" if pressure<0 else "%d 秒"%ceili(pressure/20.0))
	var total := ((10 if night>=7 else 12)*20) if esc else maxi(1,int(SECONDS[night-1])*20)
	var frac := clampf(float(pressure)/float(total),0.0,1.0)
	var active_bars := (14 if out else 0) if pressure<0 else ceili(14.0*(frac if esc else (1-frac)))
	var tint:Color = Print.RED if esc or (pressure>=0 and pressure<=200) else Print.TEAL
	for i in _pressure_bars.size():
		_pressure_bars[i].color = tint if (i<active_bars) else Print.PAPER_SHADE
	var task := ""
	var task_heading := ""
	if esc:
		task_heading = "紧急撤离"
		if bool(view.get("latched",false)):
			task = "应急杆已拉下！用 WASD 或方向键走进画面下方正中的南门绿标。"
		else:
			task = "用 WASD 走到%s侧亮杆，靠近会自动拉下。再走到下方正中的南门。"%("左" if view.get("lever")=="left" else "右")
	elif out:
		task_heading = "南门打卡"
		task = "三瓶全部签收！按 WASD 或方向键，走进画面下方正中的南门绿标。"
	elif first:
		task_heading = "送第 %d 瓶"%order
		task = "鼠标对准上方 2 号窗的窗台，点左键送第 %d 瓶。"%order
	elif night==2:
		var side := "右" if memory=="left" else "左"
		if probe=="none":
			if _probed_this_order:
				task_heading = "手势已收"
				task = "记住真窗就瞄窗台点左键。要再看，把鼠标放到奶龙%s边点右键。"%side
			else:
				task_heading = "先弹瓶盖"
				task = "把鼠标放到奶龙%s边，点右键弹瓶盖。留意两扇窗的手。"%side
		elif probe==memory:
			task_heading = "换边试探"
			task = "这次和上单方向相同。把鼠标放到奶龙%s边，点右键再弹一次。"%side
		elif int(view.get("probeTicks",0))==0:
			task_heading = "等伙伴伸手"
			task = "瓶盖已弹向%s边，看两扇窗接下来的手势。"%side
		else:
			task_heading = "瞄准真窗"
			task = "看谁朝%s伸手追这枚瓶盖。鼠标对准它的窗台，点左键送汽水。"%side
	elif bool(view.get("bank",false)):
		task_heading = "借墙交货"
		task = "本单挡板已关闭。找到真窗后，瞄向左墙或右墙，让瓶子反弹入窗。"
	else:
		task_heading = "辨认真窗"
		task = "往上单相反的方向弹盖。真伙伴会追这一次的瓶盖。"
	if view.get("bottle") != null and not esc and not out:
		task_heading = "汽水在途"
		if first:
			task = "第 %d 瓶已出手，看它有没有飞进上方 2 号窗。"%order
	_hud["PhaseValue"].text = task_heading
	_hud["PhaseValue"].add_theme_color_override("font_color",Print.RED if esc else Print.TEAL)
	_hud["TaskValue"].text = task
	var event_id := int(view.get("eventId",0))
	if event_id != _last_event_id or tick < _last_tick or delivered>_last_delivered:
		var event := str(view.get("event",""))
		var captions := {"deliver":"签收了。翻看下一张订单。","throw":"汽水已经出手。","bounce":"瓶子撞上侧墙。","miss":"错过窗口。调整站位，再投一瓶。","blocked":"隔板拦住了。试一次侧墙反弹。","intruder":"柜台里面还有一只。快跑！","lever":"拉杆已开，去南门！","clockout":"最后一瓶已签收。"}
		_event_caption = str(captions.get(event,""))
		if first and event=="miss":
			_event_caption = "漏投。这瓶还能再投，瞄准上方 2 号窗的窗台。"
		elif delivered>_last_delivered:
			_event_caption = "三瓶全部签收，可以下班了。" if out else ("第 %d 瓶已签收！"%delivered)
		_event_until = tick+64
		_last_event_id = event_id
	_last_delivered = delivered
	_last_tick = tick
	if tick<_event_until and not _event_caption.is_empty():
		_hud["EventValue"].text = _event_caption
	elif esc:
		_hud["EventValue"].text = "出口在正下方" if view.get("latched",false) else "先找亮起的拉杆"
	elif out:
		_hud["EventValue"].text = "去南门打卡  ↓"
	elif view.get("dim",false):
		_hud["EventValue"].text = "停电中 · 留意窗沿方向"
	elif int(view.get("belt",0))!=0:
		_hud["EventValue"].text = "流水线正在向%s移动"%("右" if int(view.get("belt"))>0 else "左")
	else:
		_hud["EventValue"].text = "本单须反弹一次" if view.get("bank",false) else ""

func _confirm_leave() -> void:
	if is_instance_valid(_dialog):
		return
	_dialog = p.area(_sheet,0,0,1280,720,"LeaveConfirmation")
	_dialog.mouse_filter = Control.MOUSE_FILTER_STOP
	p.rect(_dialog,0,0,1280,720,Color(0.06,0.09,0.09,0.82))
	var card := p.area(_dialog,401,211,479,267)
	p.art(card,0,0,479,267,"paper")
	p.line(card,25,24,424,52,"提前离班？",33,Print.INK,1)
	p.paragraph(card,25,94,421,58,"这班的订单会重新开始。决定期间，车间时钟继续走。",18,Print.MUTED_INK)
	p.button(card,25,176,204,51,"继续送货","CancelLeaveButton",_cancel_leave,0)
	_network(p.button(card,239,176,205,51,"返回名册","ConfirmLeaveButton",func(): leave_requested.emit(),1))

func _cancel_leave() -> void:
	if is_instance_valid(_dialog):
		_sheet.remove_child(_dialog)
		_dialog.queue_free()
		_dialog = null

func show_result(view:Dictionary,profile:Dictionary={}) -> void:
	_reset("result")
	if not profile.is_empty():
		_profile = profile
	var night := clampi(int(view.get("night",1)),1,8)
	var phase := str(view.get("phase","lost"))
	var won := phase=="won"
	var escaped := phase=="escaped"
	var ending := won and night==8
	var accent:Color = Print.GREEN if won else (Print.LAMP if escaped else Print.ALERT)
	_top("夜班结算")
	var scene := p.area(_sheet,28,78,708,548)
	p.art(scene,0,0,708,548,"plate")
	p.art(scene,8,8,692,400,"fallback")
	_postcard(scene,8,8,692,400,CLOCKOUT_PATH if (won or escaped) else LATCH_PATH)
	p.rect(scene,8,408,692,3,accent)
	p.art(scene,25,440,170,21,"word",accent)
	var story := "天亮了。三只伙伴一起走出汽水厂。" if ending else ("南门的打卡钟响了。今晚可以回家了。" if won else ("南门在身后合上。工牌还在你手里。" if escaped else "柜台下的手，替你按住了打卡钟。"))
	p.paragraph(scene,25,483,662,46,story,21,Print.WHITE)
	var card := p.area(_sheet,762,78,490,548)
	p.art(card,0,0,490,548,"paper")
	p.line(card,25,25,434,30,"下 班 回 执",16,Print.TEAL,1)
	var title := "八夜全勤" if ending else ("本班已签收" if won else ("成功脱身" if escaped else "交班中断"))
	p.line(card,22,62,450,62,title,44,Print.INK if won else Print.RED,1,HORIZONTAL_ALIGNMENT_LEFT,"OutcomeTitle")
	p.art(card,25,142,431,2,"rule",Print.MUTED_INK)
	p.line(card,25,166,180,38,"夜班",19,Print.MUTED_INK)
	p.line(card,182,160,273,47,"%02d  %s"%[night,NAMES[night-1]],23,Print.INK,1,HORIZONTAL_ALIGNMENT_RIGHT)
	p.line(card,25,226,180,38,"本班签收",19,Print.MUTED_INK)
	p.line(card,182,216,273,54,"%d / 3"%int(view.get("delivered",0)),34,Print.INK,2,HORIZONTAL_ALIGNMENT_RIGHT,"CompletedOrders")
	p.rect(card,25,293,432,2,Print.PAPER_SHADE)
	var desc := "八个夜班均已解锁，可以返回名册重访任一班次。" if ending else ("下一个夜班已经解锁。" if won else ("这班要从第一瓶重新开始。" if escaped else "重试本班。遇险先找亮起的拉杆，再向南门跑。"))
	p.paragraph(card,25,315,430,58,desc,18,Print.MUTED_INK)
	if won and not ending:
		_network(p.button(card,25,379,431,55,"上第 %d 夜   →"%(night+1),"NextButton",func(): start_requested.emit(night+1),0,22))
	elif not ending:
		_network(p.button(card,25,379,431,55,"重试第 %d 夜   →"%night,"RetryButton",func(): start_requested.emit(night),0,22))
	_network(p.button(card,25,379 if ending else 445,431,55 if ending else 45,"返回夜班名册","RosterButton",func(): roster_requested.emit(),0 if ending else 1,21 if ending else 18))
	p.art(card,25,518,128,12,"barcode",Print.MUTED_INK)
	p.line(card,175,502,280,39,"SHIFT / %02d"%night,16,Print.MUTED_INK,2,HORIZONTAL_ALIGNMENT_RIGHT)
	_footer("交班记录随工牌保存。")
	_notices(28,620,1224)
