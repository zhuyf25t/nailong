extends RefCounted

# Each cue is an ordered list of speaker/text pairs. The play clock and the
# subtitle clock are independent: several events can arrive in one HTTP batch.
const CUES := {
	"warm": [["奶蛙","瞄准上方二号窗，点左键。"],["奶蛙","第四顶工帽怎么挂我边上啦？"]],
	"knock": [["车间声","[窗台上响了两下。玻璃背面又响了一下。]"]],
	"tile_warn": [["脚下","[瓷砖松了一下。]"]],
	"tile_open": [["脚下","[釉面碎开。下面有人吸气。]"]],
	"tile_fall": [["奶龙","我刚才，踩到了谁的手？"]],
	"saw_hand": [["地板下面","[一只手托着砖。指甲在背面慢慢刮过。]"]],
	"route_blocked": [["奶蛋","站到蓝台直投，或到中间的黄台借墙。"]],
	"hatch": [["井口","[梯子下面响起刚才那一声交班铃。]"]],
	"wrong_window": [["观测仪","这段影像对不上。再走两步，停一下。"]],
	"watch_longer": [["观测仪","采样太短。再走，再停，等两秒。"]],
	"delay_found": [["监控录音","[自己的脚步声，迟了两秒才响。]"]],
	"delay_open": [["铁门","[身后传来踏板下沉的声音。门开了。]"]],
	"archive_turn": [["第一夜录像","[本来背对镜头的奶龙转过脸。]"]],
	"ledger": [["奶龙","这是我的签名。可我还没来过这里。"]],
	"record_start": [["录音机","[磁带开始转动。]"]],
	"seal_early": [["录制台","磁带还在转。站上黄踏板，连续录满两秒。"]],
	"plate_ready": [["录制台","[响了一声。] 录满两秒，点左键封存。"]],
	"replay_start": [["录音机","[脚步回放。磁带里多了一层呼吸。]"]],
	"retry_gate": [["铁门","[铁闩落下。回到录制台可以重录。]"]],
	"press_warn": [["左侧滚轮","[左边响了两下，印刷机正在起动。]"]],
	"press_shadow": [["印刷机","[左边的压辊追上来了！] 向右跑。"]],
	"press_caught": [["录音机","[压辊撞上磁带盒，带子倒转。] 第二段重新回放。"]],
	"tape_rewind": [["录音机","[裂砖落下，磁带倒转。] 从这段回放再来。"]],
	"sill_wait": [["末闸","[闸板挡住去路。] 在右侧标线上按住 D 或 →。"]],
	"sill_missed": [["末闸","[闸板砸了下来。] 回到门前，按住 D 或 → 再过。"]],
	"press_slam": [["末闸","[铁闸轰然砸在你的身后。]"]],
	"gate_pass": [["铁门","[铁闩在身后扣紧。]"]],
	"echo_hold": [["另一个奶龙","我扶着。按住 D，向右跑！"]],
	"sleep_show": [["奶蛋","看清奶蛙在哪扇窗。等它合眼，就只听机器。"]],
	"sleep_close": [["车间声","[四扇窗同时合眼。机座下开始换轨。]"]],
	"brace_light": [["机座","[稳机杆发出刺耳的颤音。]"]],
	"brace_set": [["机座","[杆柄归位，震动平息。]"]],
	"hand_warn": [["地面","[地板缝里传来指甲轻叩的声音。]"]],
	"ward_slip": [["机器","[一只手攥住了脚踝。卷带倒回本轮。]"]],
	"brace_missed": [["机器","[稳机杆撞到底。卷带倒回本轮。]"]],
	"wake_chime": [["车间声","[一声短铃。四扇窗睁开了眼。]"]],
	"wake_answer": [["奶蛙","……嗯？"]],
	"wrong_bottle": [["假窗口","[瓶子在空嗓子里滚动。本轮重新开始。]"]],
	"round_clear": [["奶蛙","收到了。让我再睡一会儿。"]],
	"ward_face": [["出票口","[出票口传来湿漉漉的呼吸。]"],["打卡机录音","瞄准，点左键。"]],
	"ward_clear": [["厂内广播","车辆已到，请三位员工到南门打卡。"]],
}

const HEADINGS := {
	"supply":"先去取瓶","route":"选一条送货路","enter_hatch":"打开检修井","observe_windows":"比对三段录像",
	"delay_door":"借回影压板","old_turn":"查看旧录像","exit_maintenance":"离开检修间",
	"check_signature":"核对考勤簿","record_one":"录制第一段","take_one":"录下压板动作",
	"play_one":"穿过第一道闸","record_two":"录制第二段","take_two":"录下压板动作",
	"play_two":"穿过第二道闸","sill_wait":"到末闸标线","help_hold":"按住 D 向右冲","sill_clear":"闸落在身后","exit_signature":"往右下班",
	"sleep_reveal":"认住奶蛙的窗","sleep_watch":"守住机器","wake_probe":"醒了，试探","wake_toss":"送给回应的窗",
	"ward_face":"出票口","ward_exit":"去东南门"
}

const TIMED := ["double_thanks","saw_hand","archive_turn","plate_ready","press_warn","press_shadow","press_caught",
	"sill_wait","sill_missed","echo_hold","press_slam","tape_rewind","ward_face","ward_clear"]
const AMBIENT := ["knock","tile_warn","tile_open","hatch","delay_found","delay_open","record_start",
	"replay_start","gate_pass","sleep_close","brace_light","brace_set","hand_warn","wake_chime","wake_answer"]

class CaptionGroup:
	var cue:String
	var lines:Array
	var next := 0

	func _init(event:String,copy:Array) -> void:
		cue = event
		lines = copy

var _waiting: Array[CaptionGroup] = []
var _playing: CaptionGroup
var current: Array = []
var _remaining := 0.0
var _last_cue := ""
var _last_phase := ""
var _last_event := -1
var _last_speaker := "奶蛙"
var _ambient_ticks:Dictionary[String,int] = {}
var _press_state := ""
var terminal := false

func clear() -> void:
	_waiting.clear()
	_playing = null
	current = []
	_remaining = 0.0
	_last_cue = ""
	_last_phase = ""
	_last_event = -1
	_ambient_ticks.clear()
	_press_state = ""
	_last_speaker = "奶蛙"
	terminal = false

func submit(view:Dictionary) -> void:
	var night := int(view.get("night",1))
	var story:Dictionary = view.get("story",{})
	var room := str(story.get("room","factory"))
	var phase := str(view.get("phase","serving"))
	var cue := str(story.get("cue","none"))
	var tick := int(view.get("tick",0))
	var serial := "%s/%s/%d"%[room,cue,int(story.get("cueId",0))]
	if serial!=_last_cue:
		_last_cue = serial
		# A row can contain several crumbling tiles. Caption the audible pattern
		# once instead of letting repeated ambient cracks drown out dialogue.
		var minor := cue in ["tile_warn","tile_open","retry_gate","watch_longer","hand_warn","wake_answer","seal_early"]
		if room=="sleepward" and cue=="wrong_window":
			_enqueue(cue,[["窗框","[空响。再试一扇，别再认错了。]"]])
		elif cue=="double_thanks":
			_enqueue(cue,[[_last_speaker,"谢谢。"],["窗台下面","……谢谢。"]])
		elif not minor or tick-int(_ambient_ticks.get(cue,-200))>=85:
			_enqueue(cue,CUES.get(cue,[]))
			if minor:
				_ambient_ticks[cue] = tick
	var press := press_state(story)
	if press!=_press_state:
		_press_state = press
		var rewinding := cue in ["press_caught","tape_rewind"] and press=="press_warn"
		if not press.is_empty() and not rewinding:
			_enqueue(press,CUES[press])
	var windows:Array = view.get("windows",[])
	if not windows.is_empty():
		_last_speaker = "奶蛋" if windows[0].get("actor")=="egg" else "奶蛙"
	if phase!=_last_phase and phase=="escaping":
		_enqueue("escaping",[["柜台下","[门闩弹开。一只手在地板上拖行。]"]])
	var event_id := int(view.get("eventId",0))
	if event_id!=_last_event and view.get("event","")=="lever":
		_enqueue("lever",[["南门","[拉杆咔哒一声。南门解锁。]"]])
	if phase!=_last_phase and phase=="won" and night!=8:
		_enqueue("won",[["打卡钟","[钢印落下，齿轮咬住了新的工单。]"]])
	_last_event = event_id
	_last_phase = phase
	terminal = phase in ["won","lost","escaped"]
	advance(0)

func _enqueue(cue:String,lines:Array) -> void:
	if lines.is_empty():
		return
	var group := CaptionGroup.new(cue,lines)
	if cue not in TIMED:
		_waiting.append(group)
		return
	# Discard only sounds or responses made obsolete by this specific event.
	# An exchange is one group: ward_clear can never interrupt ward_face's voice.
	for i in range(_waiting.size()-1,-1,-1):
		if _obsolete(_waiting[i].cue,cue):
			_waiting.remove_at(i)
	if _playing!=null and _obsolete(_playing.cue,cue):
		_playing = null
		current = []
		_remaining = 0.0
	var pos := 0
	while pos<_waiting.size() and _waiting[pos].cue in TIMED:
		pos += 1
	_waiting.insert(pos,group)

func _obsolete(previous:String,incoming:String) -> bool:
	if previous in AMBIENT:
		return true
	match incoming:
		"archive_turn":
			return previous in ["wrong_window","watch_longer"]
		"ward_face","ward_clear":
			return previous in ["sleep_show","round_clear","ward_slip","wrong_window","brace_missed","wrong_bottle"]
		"plate_ready","press_warn","press_shadow","press_caught","sill_wait","sill_missed","echo_hold","press_slam","tape_rewind":
			return previous in ["seal_early","plate_ready","press_warn","press_shadow","press_caught","retry_gate",
				"sill_wait","sill_missed","echo_hold","tape_rewind"]
	return false

static func press_state(story:Dictionary) -> String:
	if story.get("step")!="play_two":
		return ""
	var visible := ""
	for mark:Dictionary in story.get("marks",[]):
		if mark.get("kind")=="press_shadow":
			return "press_shadow"
		if mark.get("kind")=="press_warn":
			visible = "press_warn"
	return visible

func advance(seconds:float) -> void:
	_remaining -= seconds
	if not current.is_empty() and _remaining>0.0:
		return
	if _playing!=null and _playing.next>=_playing.lines.size():
		_playing = null
	if _playing==null and not _waiting.is_empty():
		_playing = _waiting.pop_front()
	if _playing!=null:
		current = _playing.lines[_playing.next]
		_playing.next += 1
		# The face occupies 36 server ticks (1.8 s). Its breath appears immediately;
		# the recording starts while the face is still on screen and remains readable.
		_remaining = 1.05 if _playing.cue=="ward_face" and _playing.next==1 else clampf(1.1 + str(current[1]).length()*0.10,2.1,4.6)
	elif not terminal:
		current = []

# Scalloped paper edge and dried finger trails on the physical ticket. Drawn
# in its margins so the objective is legible throughout all eight shifts.
class TicketEdge extends Control:
	var night := 1:
		set(value):
			if night!=value:
				night = value
				queue_redraw()

	func _draw() -> void:
		if night<2:
			return
		var rng := RandomNumberGenerator.new()
		rng.seed = 785
		var stain := Color("#a65d49") if night<6 else Color("#752e30")
		var amount := 4 if night==2 else 10+(night-3)*13
		for i in amount:
			var right := i%3!=0
			var y := rng.randi_range(5,maxi(8,int(size.y)-22))
			var width := rng.randi_range(2,5 if night<6 else 10)
			var x:float = size.x-5-width if right else 3.0
			draw_rect(Rect2(x,y,width,rng.randi_range(3,12)),stain)
			if night>=6 and i%4==0:
				draw_rect(Rect2(x+1,y,2,rng.randi_range(13,28)),stain.darkened(0.12))
		if night>=6:
			for i in range(3):
				var x := size.x-92+i*12
				for j in 6:
					draw_rect(Rect2(x+j,7+j*3,3,3),stain)

class SleepDial extends Control:
	var lit := 16
	var awake := false

	func update_state(left:int,total:int,woke:bool) -> void:
		var value := clampi(ceili(16.0*float(left)/maxi(1,total)),0,16)
		if value!=lit or awake!=woke:
			lit = value
			awake = woke
			queue_redraw()

	func _draw() -> void:
		var center := size*0.5
		var active := Color("#913b37") if awake or lit<=4 else Color("#39665e")
		for i in 16:
			var angle := -PI*0.5+TAU*float(i)/16.0
			var mark := (center + Vector2(cos(angle),sin(angle))*30.0).round()
			draw_rect(Rect2(mark-Vector2(3,3),Vector2(6,6)),active if i<lit or awake else Color("#a28e79"))
