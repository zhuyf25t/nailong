extends Control

const Print = preload("res://night/ui_print.gd")
const Story = preload("res://night/story_ui.gd")
const RECEIPTS := {
	"catch":"接住了。继续按住左键，可带着瓶走。","miss":"手里还空着。先松开左键，等瓶颈进圈再按。",
	"lower":"瓶子滑到下层。追向新的落点，还有一次补接机会。","break":"玻璃碎了。这趟会补发一瓶。",
	"retry":"本趟重新发瓶。看新白圈，再去截瓶。","release":"瓶已脱手。看它能否穿过收货槽。",
	"loop":"瓶子进了回收带。跟着刻痕，去下一处白圈接回它。","switch":"拨片转动，轨道已经改向。",
	"cap_bounce":"盖子在铁板上弹了一次。","pipe":"瓶盖敲响了管口。","hand_warn":"脚下有动静。离开钢钉翘起的位置。",
	"hand_strike":"柜下的手扑出来了，先横移脱身。","window_hit":"撞到窗沿。看准槽口开合后再松手。",
	"late":"没赶上收货槽。去下层落点补接。","sign":"收货铃响了，这瓶已签收。",
	"side_face":"玻璃里还有一张脸。留意下一趟来瓶。","empty":"盖用光了。走到补给架旁补盖。",
	"hiss":"瓶塞在嘶响。带着瓶先横移，手会扑向你刚站过的位置。"
}
var p:Print
var edge:Story.TicketEdge
var counter:Label
var caps:Label
var head:Label
var instruction:Label
var key:Label
var timing:Label
var receipt:Label
var clock:CatchMeter
var key_bg:ColorRect
var stamps:Array[ColorRect]=[]
var stamp_text:Array[Label]=[]
var _key := ""
var _last_tick := -1
var _last_event := -1
var _message := ""
var _until := -1
var _true_slot := -1
var _cap_unanswered := false
var _routed := false
var _loop_played := false
var _recaught := false

func build(printer:Print) -> void:
	p = printer
	name = "RelayTicket"
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	p.art(self,0,0,268,587,"slip")
	edge = Story.TicketEdge.new()
	edge.mouse_filter = Control.MOUSE_FILTER_IGNORE
	p.place(self,edge,0,0,264,580)
	p.rect(self,0,0,264,6,Print.TEAL)
	p.line(self,17,14,164,39,"回收线",29,Print.INK,1)
	p.line(self,160,19,87,33,"BELT / R",14,Print.TEAL,2,HORIZONTAL_ALIGNMENT_RIGHT)
	p.art(self,17,62,230,2,"rule",Print.MUTED_INK)
	counter = p.line(self,17,70,152,46,"",22,Print.INK,1,HORIZONTAL_ALIGNMENT_LEFT,"RelayOrders")
	caps = p.line(self,155,73,92,41,"",16,Print.MUTED_INK,1,HORIZONTAL_ALIGNMENT_RIGHT,"RelayCaps")
	for i in 3:
		var x := 17+78*i
		stamps.append(p.rect(self,x,126,72,30,Print.PAPER_SHADE))
		stamp_text.append(p.line(self,x,125,72,31,["找圈","接瓶","送窗"][i],16,Print.INK,1,HORIZONTAL_ALIGNMENT_CENTER))
	head = p.line(self,17,173,232,39,"",24,Print.TEAL,1,HORIZONTAL_ALIGNMENT_LEFT,"RelayStep")
	instruction = p.paragraph(self,17,217,229,119,"",17,Print.INK)
	instruction.name = "RelayInstruction"
	key_bg = p.rect(self,17,341,230,45,Print.TEAL)
	key = p.line(self,20,341,224,45,"",21,Print.WHITE,1,HORIZONTAL_ALIGNMENT_CENTER,"RelayKey")
	clock = CatchMeter.new()
	clock.mouse_filter = Control.MOUSE_FILTER_IGNORE
	p.place(self,clock,17,400,230,17)
	timing = p.line(self,17,420,230,31,"",15,Print.MUTED_INK,1,HORIZONTAL_ALIGNMENT_CENTER,"RelayTiming")
	p.art(self,17,464,230,2,"rule",Print.MUTED_INK)
	p.line(self,17,472,227,27,"现场回执",15,Print.TEAL,1)
	receipt = p.paragraph(self,17,501,230,76,"",15,Print.MUTED_INK)
	receipt.name = "RelayFeedback"

func update_ticket(view:Dictionary,story:Dictionary,r:Dictionary) -> void:
	var night := int(view.get("night",1))
	var tick := int(r.get("tick",0))
	var order := int(view.get("order",1))
	var leg := str(r.get("leg","dispatch"))
	var line_key := "%s/%s/%d/%d"%[view.get("runId",""),leg,order,story.get("round",0)]
	if line_key!=_key or tick<_last_tick:
		_key = line_key
		_last_event = -1
		_true_slot = -1
		_cap_unanswered = false
		_routed = false
		_loop_played = false
		_recaught = false
		_message = ""
		_until = -1
	_last_tick = tick
	edge.night = night
	_events(r,tick)
	var available := int(r.get("caps",0))
	caps.text = "瓶盖 × %d"%available if night>1 else ""
	counter.text = "签收 %d / %d"%[int(view.get("delivered",0)),2 if night==6 else 3]
	var chapter := leg!="dispatch"
	if chapter:
		counter.text = {"maintenance":"检修带","signature":"末闸货槽","frog_switch":"守夜 · 拨岔","frog_lure":"守夜 · 诱窗"}.get(leg,"回收线")
	var at:Dictionary = view.get("player",{})
	var player := Vector2(float(at.get("x",240)),float(at.get("y",220)))
	var bottle := _cargo(r.get("bottles",[]))
	var state := str(bottle.get("state",""))
	var eta := int(bottle.get("eta",-1))
	var span := maxi(1,int(bottle.get("window",9)))
	var target := Vector2(float(bottle.get("catchX",240)),float(bottle.get("catchY",180)))
	var delta := target-player
	var near := delta.length()<=maxf(8.0,float(bottle.get("radius",14)))
	var can_catch := bool(bottle.get("catchable",false))
	var rail := state in ["inbound","lower","loop"]
	var selected := 0
	var action := ""
	var label := ""
	var text := ""
	var timer := ""
	var live := false
	var objective := str(r.get("objective",""))
	if r.get("stage") in ["signed","complete"] or state=="signed":
		selected = 2
		label = "收货铃响了"
		action = "已经签收"
		text = "这瓶送到了。留意下一趟亮起的接瓶圈。" if not chapter else str(story.get("objective",objective))
		if not chapter and night==6 and order>=2:
			action = "下一站  ·  检修口"
			text = "两趟货都送到了。铃响后，走到车间南侧检修口。"
		elif not chapter and order>=3:
			action = "下一站  ·  南门"
			text = "三趟都送到了。铃响后，走到车间下方的南门打卡。"
	elif state=="held":
		selected = 2
		label = "瓶在你手里"
		action = "瞄准后松开左键"
		text = "保持左键按下，把鼠标移到上方收货槽中央，再松开左键送瓶。"
		if _true_slot>=0:
			text = "刚才 %d 号窗拦住了瓶盖。带瓶对准它移动的槽口，在槽口开启时松开左键。"%(_true_slot+1)
		elif night>=2:
			text = "左键继续按住，右键向窗中那只手弹盖。盖被拦住后，瞄准该窗松开左键。"
		timer = "手上有瓶，仍可移动和弹盖"
	elif state=="flight":
		selected = 2
		label = "瓶已脱手"
		action = "看收货槽"
		text = "留意收货铃。若瓶子滑落，转身去下层白圈接回它。"
	elif rail:
		selected = 1 if near or can_catch else 0
		if can_catch:
			label = "瓶颈进圈了"
			action = "现在按住左键"
			text = "在场地内按下左键并保持。看到“瓶在你手里”后再瞄准收货槽。"
			live = true
		elif not near:
			label = "补接下层来瓶" if state=="lower" else ("去接回你的瓶" if state=="loop" else "走到接瓶圈")
			action = "向%s移动"%_direction(delta)
			text = "按 WASD 或方向键往%s走，让奶龙站到轨道上的白圈旁。等瓶颈靠近。"%_direction(delta)
		else:
			label = "等瓶颈进圈"
			action = "先松开左键"
			text = "站在圈旁看瓶颈。亮圈时再按住左键，手指一直按着才能带瓶。"
		timer = "可接 %.2f 秒  ·  %s"%[span/20.0,"进圈" if can_catch else ("%.1f 秒后到圈"%(eta/20.0) if eta>0 else "正经过")]
	else:
		label = "等下一趟来瓶"
		action = "留意轨道"
		text = objective if not objective.is_empty() else "朝亮起来的接瓶圈移动，等下一瓶经过。"
	var running:bool = r.get("stage")=="running"
	var routed := bool(r.get("routed",_routed))
	var recaught := bool(r.get("recaught",_recaught))
	var opens_slot:bool = (leg=="signature" and r.get("route")!="right") or leg=="frog_switch"
	if running and (opens_slot or (night==5 and not routed)):
		label = "先拨开货槽" if leg=="signature" else ("给奶蛙改道" if leg=="frog_switch" else "先分开两瓶")
		action = "右键  ·  打拨片"
		text = "将鼠标对准黄铜道岔拨片，点右键。盖命中才会改道；手上有瓶也能弹盖。"
		timer = "拨片转动后，再追货瓶的接瓶圈"
		selected = 0
	elif running and state=="held" and leg in ["frog_lure","maintenance"] and not recaught:
		if bottle.get("sounds",[]).is_empty():
			label = "给瓶子录下声音"
			action = "按住瓶  ·  踩铁板"
			text = "先带瓶走过铁板，或用右键弹盖敲管。瓶底有刻痕，就能用它把东西引走。"
		else:
			label = "把声音送上带"
			action = "瞄入口  ·  松左键"
			text = "把准星移到回收带入口，松开左键。听瓶中脚步重放，再去新的圈接回它。"
	elif running and state=="held" and leg in ["maintenance","signature"]:
		label = "把货送过闸"
		action = "瞄货槽  ·  松左键"
		text = "带瓶调整角度，把准星瞄到闸后的收货槽中央，再松开左键。"
	elif running and state=="held" and bottle.get("kind")=="echo":
		label = "手里是回声瓶"
		action = "瞄回收口  ·  松手"
		text = "将空瓶送上侧带，空出手。回到货瓶的接瓶圈，准备接真正要交的货。"
	elif running and leg=="frog_lure" and state=="loop":
		text = "追到回声瓶的新白圈。等它放出瓶里的响声，瓶颈进圈时按住左键接回。"
	if state=="held" and not bottle.get("sounds",[]).is_empty():
		var marks := PackedStringArray()
		for sound:Dictionary in bottle.sounds:
			marks.append({"step":"脚步","pipe":"管响","bell":"铃声"}.get(sound.get("kind"),"声"))
		timer = "瓶底刻痕  ·  "+"／".join(marks)
	var brace := _active_brace(story,player)
	if brace:
		label = "脚边的稳机杆"
		action = "按住左键稳机"
		text = "先在亮杆旁按住左键，直至稳住。再离开杆座，到接瓶圈操作。"
	var on_watch := leg.begins_with("frog_")
	var sleep_left := maxi(0,int(story.get("sleepTicks",0)))
	var labels := ["找圈","接瓶","送窗"]
	if on_watch:
		var seconds_left := ceili(sleep_left/2.0)/10.0
		timer = "第 %d 轮  ·  距醒铃 %.1f 秒"%[int(story.get("round",1)),seconds_left]
		if leg=="frog_switch":
			labels = ["稳首杆","弹盖","守窗"]
			selected = 1
		else:
			labels = ["先接瓶","录声上带","接回"]
			selected = 2 if state=="loop" or recaught else (1 if state in ["held","flight"] else 0)
		if leg=="frog_switch" and not brace:
			text = "醒铃前把准星对准黄铜拨片，点右键。看见拨片转动就完成改道。"
	if leg=="signature" and Story.press_state(story)=="press_shadow":
		timer = "左侧压辊已逼近  ·  继续向右"
	for i in 3:
		stamp_text[i].text = labels[i]
		stamps[i].color = Print.TEAL if i==selected else Print.PAPER_SHADE
		stamp_text[i].add_theme_color_override("font_color",Print.WHITE if i==selected else Print.MUTED_INK)
	head.text = label
	instruction.text = text
	key.text = action
	key_bg.color = Color("#874537") if live else Print.TEAL
	timing.text = timer
	timing.add_theme_color_override("font_color",Color("#802e31") if on_watch and sleep_left<=60 else Print.MUTED_INK)
	clock.visible = rail and leg!="frog_switch"
	if rail:
		clock.set_catch(eta,span,can_catch)
	if tick<_until and not _message.is_empty():
		receipt.text = _message
	elif available==0 and night>1:
		receipt.text = "盖架在场边。走近架子补盖，再对准手掌、管口或拨片。"
	elif on_watch:
		receipt.text = "醒铃前拨开道岔；错过就从本轮重来。" if leg=="frog_switch" else "醒铃前引开假窗，接回放过声的瓶；超时重守本轮。"
	elif not chapter and night>1 and not objective.is_empty():
		receipt.text = objective
	else:
		receipt.text = "接住时才按，带瓶时按住，瞄准后松开。" if night==1 else "白圈是接瓶位置。瓶底刻痕记录最近的声音。"

func _cargo(bottles:Array) -> Dictionary:
	var cargo:Dictionary = {}
	for b:Dictionary in bottles:
		if b.get("state")=="held":
			return b
		if b.get("kind")=="cargo":
			cargo = b
	return cargo if not cargo.is_empty() else ({} if bottles.is_empty() else bottles[0])

func _direction(delta:Vector2) -> String:
	var x := "右" if delta.x>0 else "左"
	var y := "下" if delta.y>0 else "上"
	if absf(delta.x)>absf(delta.y)*2.0:
		return x
	if absf(delta.y)>absf(delta.x)*2.0:
		return y
	return x+y

func _active_brace(story:Dictionary,player:Vector2) -> bool:
	if story.get("room")!="sleepward":
		return false
	for mark:Dictionary in story.get("marks",[]):
		if mark.get("kind")=="brace" and player.distance_to(Vector2(mark.x,mark.y))<=18:
			return true
	return false

func _events(r:Dictionary,tick:int) -> void:
	var best := 0
	for e:Dictionary in r.get("events",[]):
		var id := int(e.get("id",-1))
		if id<=_last_event:
			continue
		_last_event = id
		var kind := str(e.get("kind",""))
		var message:String = RECEIPTS.get(kind,"")
		var priority := 1
		match kind:
			"retry","incoming":
				_cap_unanswered = false
				_true_slot = -1
				_routed = false
				_recaught = false
				_loop_played = false
			"loop": _loop_played = false
			"replay_step","replay_pipe","replay_bell": _loop_played = true
			"catch": _recaught = _recaught or _loop_played
			"cap_fire": _cap_unanswered = true
			"cap_caught","cap_through":
				_cap_unanswered = false
				var slot := int(e.get("slot",-1))
				if kind=="cap_caught":
					_true_slot = slot
					message = "%d 号窗拦住了盖。这扇窗可以收货。"%(slot+1)
				else:
					message = "盖穿过 %d 号窗的手。改瞄另一扇，再弹一盖。"%(slot+1)
				priority = 3
			"switch","pipe":
				_cap_unanswered = false
				if kind=="switch":
					_routed = true
			"lower","break","miss","window_hit","late","empty","hand_strike","hiss": priority = 2
		if not message.is_empty() and priority>=best:
			best = priority
			_message = message
			_until = int(e.get("atTick",tick))+54
	if _cap_unanswered and r.get("cap")==null:
		_cap_unanswered = false
		if best<2:
			_message = "这枚盖落空了。把准星移到手掌、管口或拨片，再点右键。"
			_until = tick+48

class CatchMeter extends Control:
	var eta := 0
	var span := 5
	var active := false

	func set_catch(remaining:int,width:int,ready:bool) -> void:
		if eta!=remaining or span!=width or active!=ready:
			eta = remaining
			span = width
			active = ready
			queue_redraw()

	func _draw() -> void:
		draw_rect(Rect2(0,5,size.x,6),Print.PAPER_SHADE)
		var scale := size.x/32.0
		var center := size.x*0.5
		draw_rect(Rect2(center-span*scale*0.5,2,span*scale,12),Color("#80a793"))
		draw_rect(Rect2(center-1,0,2,16),Print.TEAL)
		var cursor := clampf(center-eta*scale,3,size.x-3)
		draw_rect(Rect2(cursor-3,0,6,16),Print.RED if active else Print.INK)
