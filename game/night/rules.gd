extends Control

signal closed

const Print = preload("res://night/ui_print.gd")
const TABS := ["第一夜送货","第二夜辨认","漏投与护栏","遇险逃生"]
const TITLES := ["第一夜怎么过","看手伸向哪里","把瓶子送进窗台","走到亮杆，再去南门"]
const FIGURES := ["试工车间 · 两侧的备用拉杆在第一夜用不到","示例订单 · 上单向左，本次向右","侧墙反弹示意 · 第四夜第二单起出现挡板","逃生示意 · 本次亮起左杆"]
const STEPS := [
	[
		["瞄准上方 2 号窗","把鼠标移到画面上方正中的窗台。奶龙从当前位置朝鼠标瞄准。"],
		["点左键，连送三瓶","每次点左键投一瓶。看到交班票“已签收”加一再送下一瓶。第一夜没有时限，直接投就行。"],
		["走到下方南门","已签收达到 3 / 3 时，按 WASD 或方向键走进下方正中的绿标，打卡解锁第二夜。"]
	],
	[
		["读上一单的瓶盖记录","例如上一单写着“向左”。把鼠标放到奶龙身体右边，在场地内点右键，这次瓶盖就向右。"],
		["看谁跟着这次瓶盖伸手","真伙伴这次向右伸手，冒牌货仍会向左伸手。看手的方向；真伙伴可能在左窗，也可能在右窗。"],
		["再把鼠标移向真窗","瞄准真伙伴的窗台，点左键投瓶。两只动作相同就换边弹；动作消失可以再弹一次。"]
	],
	[
		["投空还能再投","没飞进窗台，签收数不会变。等瓶子停下，调整站位，重新瞄准。带时限的班次仍会计时。"],
		["先辨认真伙伴","第四夜后两单、第八夜最后一单须反弹。先弹盖看手势，记住这次应送的窗。"],
		["借两侧墙壁反弹","准星放到左墙或右墙，观察斜线，在能反弹进目标窗的位置点左键。瓶子只反弹一次。"]
	],
	[
		["柜下伸手，立刻移动","给冒牌货送了瓶，或瓶压到时，会进入追逐。看交班票提示和地面哪一侧亮起。"],
		["走近亮起的应急杆","用 WASD 或方向键靠近左侧或右侧亮杆，会自动拉下。平时不用两个地面装置。"],
		["从南门逃离","拉杆打开后立刻走进下方正中绿标，脱身可从本夜第一瓶重来。被追上也可以重试。"]
	]
]

var p := Print.new()
var _page_layer: Control
var _page := 0
var _continue_label := "返回游戏"

func open(continue_label:String) -> void:
	_continue_label = continue_label
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	show_page(0)

func show_page(index:int) -> void:
	_page = clampi(index,0,TABS.size()-1)
	if is_instance_valid(_page_layer):
		remove_child(_page_layer)
		_page_layer.queue_free()
	_page_layer = p.area(self,0,0,1280,720,"RulesPage")
	p.art(_page_layer,0,0,1280,720,"wall")
	p.rect(_page_layer,0,0,1280,59,Print.COAL)
	p.rect(_page_layer,0,57,1280,2,Print.RIM)
	p.art(_page_layer,29,9,37,35,"bottles",Print.LAMP)
	p.line(_page_layer,76,5,216,48,"玩法说明",28,Print.WHITE,1)
	p.line(_page_layer,925,8,326,43,"第 %d 页 / 共 %d 页"%[_page+1,TABS.size()],19,Print.GREEN,1,HORIZONTAL_ALIGNMENT_RIGHT,"RulesPageNumber")
	for i in TABS.size():
		var tab := p.button(_page_layer,30+i*310,76,292,45,"%02d    %s"%[i+1,TABS[i]],"RulesTab%d"%(i+1),show_page.bind(i),0 if i==_page else 2,18)
		if i==_page:
			p.rect(tab,0,41,292,4,Print.LAMP)
	p.line(_page_layer,29,139,1200,53,TITLES[_page],39,Print.WHITE,1,HORIZONTAL_ALIGNMENT_LEFT,"RulesPageTitle")
	var frame := p.area(_page_layer,28,204,655,430)
	p.art(frame,0,0,655,430,"plate")
	var diagram := Diagram.new()
	diagram.page = _page
	diagram.ink = p
	diagram.mouse_filter = Control.MOUSE_FILTER_IGNORE
	diagram.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	p.place(frame,diagram,10,10,635,381)
	p.line(frame,15,394,623,28,FIGURES[_page],15,Print.DULL)
	var detail := p.area(_page_layer,700,204,552,430)
	p.art(detail,0,0,552,430,"paper")
	for i in 3:
		var y := 27+i*128
		var item: Array = STEPS[_page][i]
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
	next.disabled = _page == TABS.size()-1
	var confirm := p.button(_page_layer,918,663,332,48,_continue_label,"RulesContinueButton",func(): closed.emit(),0,20)
	# Opening the manual is a deliberate break. A held Enter cannot dismiss the first page.
	confirm.focus_mode = Control.FOCUS_CLICK

class Diagram extends Control:
	const FLOOR := preload("res://assets/night/factory/floor.png")
	const DRAGON := preload("res://assets/night/cast/dragon.png")
	const FROG := preload("res://assets/night/cast/frog.png")
	const EGG := preload("res://assets/night/cast/egg.png")
	const HAND := preload("res://assets/night/cast/hand.png")
	const GOLD := Color("#ffd174")
	const MINT := Color("#b7f1ac")
	var page := 0
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

	func gate(x:int) -> void:
		box(x-35,29,70,40,Color("#354540"))
		for y in range(33,68,6):
			box(x-34,y,68,2,Color("#526057"))

	func exit_mark() -> void:
		draw_rect(Rect2(220,250,40,16),MINT,false,2.0)

	func _draw() -> void:
		draw_set_transform(Vector2.ZERO,0,Vector2(size.x/480.0,size.y/288.0))
		if page==1:
			_gestures()
			return
		draw_texture_rect(FLOOR,Rect2(0,0,480,288),false)
		match page:
			0:
				gate(104)
				gate(376)
				window_at(240,FROG,0)
				arrow(Vector2(240,185),Vector2(240,79),GOLD)
				arrow(Vector2(240,224),Vector2(240,254),MINT)
				dragon_at(240,220)
				exit_mark()
				tag(144,190,"你 · 奶龙",GOLD)
				draw_line(Vector2(209,199),Vector2(222,199),GOLD,1.0)
				tag(18,190,"备用拉杆",Print.DULL,11)
				tag(400,190,"备用拉杆",Print.DULL,11)
				draw_line(Vector2(46,209),Vector2(46,216),Print.DULL,2.0)
				draw_line(Vector2(434,209),Vector2(434,216),Print.DULL,2.0)
				tag(258,78,"2 号窗台 · 点左键",GOLD)
				tag(257,235,"南门 · 签收 3 瓶后走入",MINT)
			2:
				gate(240)
				window_at(104,EGG,1)
				window_at(376,EGG,2)
				var rail_point := Vector2(12,189)
				dragon_at(130,225)
				arrow(Vector2(119,220),rail_point,GOLD)
				arrow(rail_point,Vector2(376,78),GOLD)
				draw_circle(rail_point,4,Print.WHITE)
				tag(20,159,"碰左墙一次",GOLD)
				tag(284,82,"3 号窗 · 本图目标",GOLD)
			3:
				dragon_at(225,176)
				draw_texture_rect(HAND,Rect2(300,89,34,43),false)
				draw_rect(Rect2(34,208,24,24),GOLD,false,3.0)
				arrow(Vector2(212,180),Vector2(48,219),GOLD)
				arrow(Vector2(58,227),Vector2(239,258),MINT)
				exit_mark()
				tag(21,178,"亮杆 · 走近",GOLD)
				tag(258,237,"南门 · 走入",MINT)

	func _gestures() -> void:
		box(0,0,480,288,Print.BG)
		tag(22,11,"上单瓶盖   ← 左",Print.ALERT,13)
		tag(252,11,"这次弹盖   右 →",GOLD,13)
		for i in 2:
			var x := 20+i*230
			box(x,55,209,190,Print.RIM)
			box(x+3,58,203,184,Print.COAL)
			box(x+8,64,193,126,Color("#3c5149"))
			sprite(FROG,2 if i==0 else 1,48,48,Rect2(x+42,72,125,125))
			box(x+3,192,203,5,Print.MUTED_INK)
			if i==0:
				arrow(Vector2(x+130,159),Vector2(x+182,159),MINT)
			else:
				arrow(Vector2(x+75,159),Vector2(x+26,159),Print.ALERT)
			tag(x+9,209,"1 号窗 · 手向右" if i==0 else "3 号窗 · 手向左",MINT if i==0 else Print.ALERT,13)
		tag(20,260,"这单真伙伴在左窗，手追向右侧。",MINT,13)
