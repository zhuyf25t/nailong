extends Control

signal closed

const Print = preload("res://night/ui_print.gd")
const TABS := ["首夜接送","瓶盖验窗","漏接与改道","回声诱敌"]
const TITLES := ["第一夜怎么过","看瓶盖停在哪里","瓶子掉下去，还能接","让瓶子替你出声"]
const FIGURES := ["白圈是接瓶点。瓶颈进圈才按住左键，准星指向收货槽才松手。","同一枚盖经过手掌，停住与穿过去会有不同的回执。","实线是本趟轨道。下层带给你一次新的接瓶机会。","瓶底的三道刻痕把脚步、管响和铃声留了下来。"]
const STEPS := [
	[["先去白圈旁等瓶","按 WASD 或方向键移动奶龙。看清货瓶沿哪条轨道来，提前站到白圈旁，先松开鼠标左键。"],
	 ["瓶颈进圈时按住左键","看到“现在按住左键”就按下并保持。右侧浅绿刻度是接瓶时间；后几夜最短约 0.25 秒，要提前站好。"],
	 ["瞄准收货槽，再松开","接稳后仍可走动。把鼠标移到收货槽中央再松手。铃响算签收，转身找下一圈；弹回的瓶也要再接。"]],
	[["把准星对准窗里的手掌","从第二夜起，朝候选窗口点右键弹盖。视线跟着盖走；带着货瓶时也能弹盖。"],
	 ["盖停在真伙伴手里","假手也会伸出来，盖却会穿过去。看见穿掌就验另一窗。盖飞空了，重新瞄准手掌再点右键。"],
	 ["把货送进移动的槽口","记住亲手验过的窗。带瓶挪到合适角度，瞄准开启的槽口松开左键。盖用完时走近补给架。"]],
	[["先看新的落点","漏接或没投进窗，货瓶会滑到下层带。看新的圈，横移去接；再次摔碎才从这趟开头补发。"],
	 ["把盖打进道岔拨片","右键对准拨片，命中会看见轨道改向。反弹盖可以打带白边的铁板，再敲拨片或远处管口。"],
	 ["空出双手再去截瓶","将手中瓶瞄向回收入口，松手送上带。看它滚向哪个落点，跑去白圈再接。"]],
	[["留意脚下的材质","铁板会把脚步声传进管道，胶垫能消声。瓶底的刻痕显示它记住的声音。"],
	 ["让一瓶声音沿带移动","带着瓶走过铁板，或朝管口弹盖；把装着声响的瓶送上回收带。它会按原来的间隔重放。"],
	 ["趁怪物转身去接回","看管钉移向哪里，侧移避开手影。末班要赶在睡眠环归零前完成回收；错过醒铃就重守本轮。"]]
]
const DUTIES := {
	6:["检修回收","把带声的瓶送过检修门","监视器 → 带声诱瓶 → 延迟踏板",[
		["找出慢两秒的录像","送完两趟，去南侧井口。走两步、停一下，走到迟了两秒才停的窗前，点左键核验。"],
		["把声音放上回收带","站上铁板录到脚步，也可以朝管口弹盖。把带声的瓶送入回收口，观察管里的东西移开。"],
		["接回瓶，用回影压门","赶到新落点按住左键接回，瞄准门槽松开。踏板上站一会再向右走，两秒前的你会扶住门。"]]],
	7:["替身压线","让瓶子先穿过闸","录制踩板 → 弹盖开槽 → 接瓶送货 → 末闸向右",[
		["站满两秒，左键封存","查台账，到录制台点左键。走上黄踏板站满两秒，看到“左键 · 封存”再点一下。"],
		["第二道门，先把瓶送过去","回放时边跑边瞄。右键打货槽拨片，白圈旁按住左键接货，再朝闸后的槽口松手。左侧压辊会追上来。"],
		["末闸前按住 D 或 →","踏到门前白线，按住右方向。回影抬闸约 1.2 秒，保持向右就能过；错过只从门前再试。"]]],
	8:["末班回收","别叫醒奶蛙","睡眠环归零前办完回收，醒铃后近窗验收",[
		["守住奶蛙的窗和机器","开眼先认窗，闭帘后追它的移动。稳机杆亮起，走近按住左键约 0.7 秒。脚下冒气就先躲开。"],
		["稳好首杆，醒铃前办完","第二轮用右键弹盖拨岔。第三轮把带声的瓶送上带，诱开假窗，再去白圈接回。环归零还没办完，就重守本轮。"],
		["办完后等醒铃，再去窗边","走到候选窗前点右键。看见回应再贴近那扇窗，点左键递瓶。错投或第二次错探从本轮再来。"]]]
}

var p := Print.new()
var _page_layer: Control
var _page := 0
var _continue_label := "返回游戏"
var _night := 0
var _count := 4
var _require_all := false
var _read:Dictionary[int,bool] = {}

func open(continue_label:String,night:=0,require_all:=false) -> void:
	_continue_label = continue_label
	_night = night
	_require_all = require_all
	_read.clear()
	_count = 5 if DUTIES.has(night) and not require_all else 4
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	show_page(4 if _count==5 else 0)

func show_page(index:int) -> void:
	_page = clampi(index,0,_count-1)
	_read[_page] = true
	if is_instance_valid(_page_layer):
		remove_child(_page_layer)
		_page_layer.queue_free()
	_page_layer = p.area(self,0,0,1280,720,"RulesPage")
	p.art(_page_layer,0,0,1280,720,"wall")
	p.rect(_page_layer,0,0,1280,59,Print.COAL)
	p.rect(_page_layer,0,57,1280,2,Print.RIM)
	p.art(_page_layer,29,9,37,35,"bottles",Print.LAMP)
	p.line(_page_layer,76,5,216,48,"玩法说明",28,Print.WHITE,1)
	p.line(_page_layer,925,8,326,43,"第 %d 页 / 共 %d 页"%[_page+1,_count],19,Print.GREEN,1,HORIZONTAL_ALIGNMENT_RIGHT,"RulesPageNumber")
	var spacing := 248 if _count==5 else 310
	var duty:Array = DUTIES.get(_night,[])
	for i in _count:
		var tab_name:String = duty[0] if i==4 else TABS[i]
		var tab := p.button(_page_layer,30+i*spacing,76,spacing-18,45,"%02d    %s"%[i+1,tab_name],"RulesTab%d"%(i+1),show_page.bind(i),0 if i==_page else 2,18)
		if i==_page:
			p.rect(tab,0,41,spacing-18,4,Print.LAMP)
	p.line(_page_layer,29,139,1200,53,duty[1] if _page==4 else TITLES[_page],39,Print.WHITE,1,HORIZONTAL_ALIGNMENT_LEFT,"RulesPageTitle")
	var frame := p.area(_page_layer,28,204,655,430)
	p.art(frame,0,0,655,430,"plate")
	var diagram := Diagram.new()
	diagram.page = _page
	diagram.night = _night
	diagram.ink = p
	diagram.mouse_filter = Control.MOUSE_FILTER_IGNORE
	diagram.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	p.place(frame,diagram,10,10,635,381)
	p.line(frame,15,394,623,28,duty[2] if _page==4 else FIGURES[_page],15,Print.DULL)
	var detail := p.area(_page_layer,700,204,552,430)
	p.art(detail,0,0,552,430,"paper")
	for i in 3:
		var y := 27+i*128
		var item: Array = duty[3][i] if _page==4 else STEPS[_page][i]
		p.rect(detail,21,y+6,35,30,Print.TEAL)
		p.line(detail,21,y+5,35,31,"%02d"%(i+1),17,Print.WHITE,2,HORIZONTAL_ALIGNMENT_CENTER)
		p.line(detail,68,y,457,42,item[0],22,Print.INK,1)
		var body := p.paragraph(detail,68,y+43,453,75,item[1],18,Print.MUTED_INK)
		body.name = "RuleDetail%d"%(i+1)
		if i < 2:
			p.art(detail,21,y+117,501,2,"rule",Print.PAPER_SHADE)
	p.rect(_page_layer,0,652,1280,68,Print.COAL)
	p.rect(_page_layer,0,652,1280,2,Print.RIM)
	var prev := p.button(_page_layer,28,666,127,40,"← 上一页","RulesPrevButton",show_page.bind(_page-1),2,16)
	prev.disabled = _page == 0
	var next := p.button(_page_layer,166,666,127,40,"下一页 →","RulesNextButton",show_page.bind(_page+1),2,16)
	next.disabled = _page == _count-1
	var missing := PackedStringArray()
	if _require_all:
		for i in 4:
			if not _read.has(i):
				missing.append(str(i+1))
		var progress := "四页已读，可以开始试工。" if missing.is_empty() else "请翻阅第 %s 页，可直接点上方页签。"%("、".join(missing))
		p.line(_page_layer,312,665,593,44,progress,17,Print.WHITE,0,HORIZONTAL_ALIGNMENT_LEFT,"RulesReadingProgress")
	var confirm := p.button(_page_layer,918,663,332,48,_continue_label,"RulesContinueButton",_confirm,0,20)
	confirm.disabled = not missing.is_empty()
	# Opening the manual is a deliberate break. A held Enter cannot dismiss the first page.
	confirm.focus_mode = Control.FOCUS_CLICK

func _confirm() -> void:
	if not _require_all or _read.size()==4:
		closed.emit()

class Diagram extends Control:
	const FLOOR := preload("res://assets/night/factory/floor.png")
	const DRAGON := preload("res://assets/night/cast/dragon.png")
	const FROG := preload("res://assets/night/cast/frog.png")
	const EGG := preload("res://assets/night/cast/egg.png")
	const HAND := preload("res://assets/night/cast/hand.png")
	const GOLD := Color("#ffd174")
	const MINT := Color("#b7f1ac")
	var page := 0
	var night := 0
	var ink

	func box(x:int,y:int,w:int,h:int,color:Color) -> void:
		draw_rect(Rect2(x,y,w,h),color)

	func tag(x:int,y:int,txt:String,c:Color,fs:=12) -> void:
		var tw := ceili(ink.heavy.get_string_size(txt,HORIZONTAL_ALIGNMENT_LEFT,-1,fs).x)
		box(x,y,tw+12,fs+8,Print.COAL)
		box(x,y,3,fs+8,c)
		draw_string(ink.heavy,Vector2(x+7,y+fs+1),txt,HORIZONTAL_ALIGNMENT_LEFT,-1,fs,c)

	func arrow(start:Vector2,end:Vector2,col:Color) -> void:
		var delta := end-start
		if delta.length()<3:
			return
		var u := delta.normalized()
		var pos := 0.0
		while pos<delta.length()-7:
			var a := start+u*pos
			var b := start+u*minf(pos+5.0,delta.length()-6)
			draw_line(a,b,Print.COAL,4.0)
			draw_line(a,b,col,2.0)
			pos += 8.0
		var side := Vector2(-u.y,u.x)
		draw_colored_polygon(PackedVector2Array([end,end-u*9.0+side*4.0,end-u*9.0-side*4.0]),col)

	func sprite(tex:Texture2D,frame:int,w:int,h:int,dest:Rect2) -> void:
		draw_texture_rect_region(tex,dest,Rect2(frame*w,0,w,h))

	func window_at(cx:int,actor:Texture2D,frame:int) -> void:
		sprite(actor,frame,48,48,Rect2(cx-22,30,44,44))

	func dragon_at(x:int,y:int) -> void:
		draw_texture_rect_region(DRAGON,Rect2(x-16,y-36,32,40),Rect2(0,80,32,40))

	func bottle_at(x:int,y:int,echo:=false) -> void:
		box(x-4,y-11,8,3,Print.ALERT)
		box(x-3,y-8,6,5,Print.WHITE)
		box(x-6,y-3,12,17,Print.TEAL)
		box(x-4,y+2,8,5,MINT if echo else GOLD)

	func _draw() -> void:
		draw_set_transform(Vector2.ZERO,0,Vector2(size.x/480.0,size.y/288.0))
		if page==4:
			_equipment()
			return
		box(0,0,480,288,Print.BG)
		match page:
			0:
				draw_texture_rect(FLOOR,Rect2(0,0,480,288),false)
				window_at(240,FROG,0)
				box(36,160,390,12,Color("#4c594e"))
				box(36,162,390,2,GOLD)
				for x in range(42,426,14): box(x,166,5,2,Print.DULL)
				draw_arc(Vector2(193,150),14,0,TAU,24,Print.WHITE,3)
				bottle_at(130,149)
				arrow(Vector2(147,150),Vector2(176,150),MINT)
				dragon_at(192,201)
				arrow(Vector2(226,143),Vector2(239,77),GOLD)
				tag(23,108,"来瓶",MINT,13)
				tag(222,170,"① 站白圈旁",GOLD,12)
				tag(29,213,"② 瓶颈入圈 · 按住左键",MINT,13)
				tag(254,67,"③ 瞄准槽口 · 松手",GOLD,12)
				tag(237,223,"你 · 奶龙",GOLD,12)
			1:
				for i in 2:
					var x := 15+i*231
					box(x,38,216,154,Print.RIM)
					box(x+3,41,210,148,Color("#32463e"))
					sprite(FROG,1,48,48,Rect2(x+60,51,103,103))
					draw_circle(Vector2(x+83,125),4,GOLD)
					arrow(Vector2(x+22,142),Vector2(x+79,127),GOLD)
					if i==1: arrow(Vector2(x+91,121),Vector2(x+187,94),Print.ALERT)
					tag(x+10,204,"拦住 · 这窗可收货" if i==0 else "穿掌 · 再验另一窗",MINT if i==0 else Print.ALERT,12)
				tag(20,10,"右键把盖弹向手掌",GOLD)
			2:
				for i in 2:
					var y := 92+104*i
					box(45,y,381,12,Print.RIM)
					box(45,y+2,381,2,GOLD if i==0 else MINT)
					for x in range(51,424,13): box(x,y+6,4,2,Print.DULL)
				bottle_at(242,81)
				arrow(Vector2(250,102),Vector2(353,175),Print.ALERT)
				arrow(Vector2(337,185),Vector2(185,185),MINT)
				draw_arc(Vector2(160,180),15,0,TAU,24,Print.WHITE,3)
				dragon_at(155,235)
				tag(20,28,"上层来瓶",GOLD)
				tag(252,114,"漏接 · 滑向下层",Print.ALERT)
				tag(165,227,"新白圈 · 可以补接",MINT)
			3:
				tag(18,22,"先让瓶子录下声音",GOLD)
				bottle_at(94,105,true)
				arrow(Vector2(112,110),Vector2(360,110),MINT)
				for i in 3:
					var x := 143+i*79
					draw_circle(Vector2(x,109),9,Print.TEAL)
					tag(x-19,138,["脚步","管响","铃声"][i],MINT,11)
				draw_texture_rect(HAND,Rect2(325,169,34,43),false)
				arrow(Vector2(251,213),Vector2(330,178),Print.ALERT)
				tag(32,239,"瓶子在带上重放，柜下的手会循声过去。",GOLD,12)

	func _equipment() -> void:
		box(0,0,480,288,Print.BG)
		if night==6:
			for i:int in 3:
				var x := 13+154*i
				box(x,34,139,133,Print.RIM)
				box(x+3,37,133,127,Color("#314841"))
				dragon_at(x+47+i*15,133)
				tag(x+10,175,["现场录像","两秒延迟","旧班录像"][i],GOLD,14)
			tag(16,228,"认出延迟录像，再用带声的瓶把东西引开。",MINT,13)
		elif night==7:
			tag(18,13,"录制",GOLD)
			box(60,64,34,20,Print.TEAL)
			arrow(Vector2(97,74),Vector2(177,74),GOLD)
			box(180,80,69,8,GOLD)
			dragon_at(215,80)
			tag(265,48,"站满 2 秒",GOLD)
			tag(265,77,"左键封存",MINT)
			box(15,115,450,2,Print.RIM)
			tag(18,129,"回放时拨开货槽，先送瓶",Print.ALERT)
			box(46,191,63,25,Print.RED)
			for x in [49,72,94]:
				draw_circle(Vector2(x,214),6,Print.RIM)
			dragon_at(245,211)
			arrow(Vector2(121,201),Vector2(212,201),Print.ALERT)
			arrow(Vector2(257,201),Vector2(397,201),MINT)
			box(367,162,12,22,Print.RED)
			box(358,216,29,3,GOLD)
			tag(23,234,"左侧压辊",Print.ALERT)
			tag(241,234,"先送瓶 · 再按 D 过闸",MINT)
		else:
			var points := [Vector2(240,57),Vector2(363,139),Vector2(240,225),Vector2(116,139)]
			for i in 4:
				var at:Vector2 = points[i]
				var next_at:Vector2 = points[(i+1)%4]
				var u := at.direction_to(next_at)
				arrow(at+u*32,next_at-u*33,Print.DULL)
				box(int(at.x)-20,int(at.y)-18,40,33,Print.RIM)
				if i==0:
					sprite(FROG,0,48,48,Rect2(at.x-18,at.y-20,36,36))
			tag(198,119,"稳机杆",GOLD,14)
			tag(24,15,"开眼认窗",GOLD)
			tag(290,237,"醒后近窗右键试探",MINT)
