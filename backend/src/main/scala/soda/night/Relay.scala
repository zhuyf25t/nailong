package soda.night

enum ParcelKind(val wire: String):
  case Cargo extends ParcelKind("cargo")
  case Echo extends ParcelKind("echo")

private[night] enum ParcelState:
  case Rail(belt: Belt, from: NightPoint, to: NightPoint, start: Int, centre: Int, played: Int)
  case Held
  case Flying(at: NightPoint, velocity: NightPoint, ticks: Int, toInlet: Boolean)
  case Signed(at: NightPoint)

private[night] final case class Parcel(id: Int,kind: ParcelKind,state: ParcelState,sounds: Vector[EchoBeat],
                                       rescued: Boolean = false,sealedTape: Boolean = false,playbackAt: Option[Int] = None)
private[night] final case class CapFlight(at: NightPoint, velocity: NightPoint, bounced: Boolean, through: Set[Int],tripped: Boolean = false)
private[night] final case class PaneTouch(reaction: PaneReaction, until: Int)
private[night] final case class Layout(first: NightPoint, covered: NightPoint, branch: NightPoint, inlet: NightPoint,
                                      toggle: NightPoint,rack: NightPoint, source: NightPoint)

final case class Relay private[night] (
    leg: RelayLeg, tick: Int, stage: RelayStage, clean: Boolean, recording: Vector[EchoBeat],
    private[night] val parcels: Vector[Parcel], private[night] val cap: Option[CapFlight],
    private[night] val caps: Int, private[night] val switched: Boolean, private[night] val routed: Boolean,
    private[night] val recaught: Boolean, private[night] val returned: Boolean,
    private[night] val touch: Map[Int,PaneTouch], private[night] val hunter: RelayHunter,
    private[night] val lastStep: NightPoint, private[night] val soundAt: Int,
    private[night] val lastHeard: Option[(EchoKind,Int)], private[night] val signedAt: Int,
    private[night] val events: Vector[RelayEvent], private[night] val n: Int,
    private[night] val rawTape: Vector[(EchoKind,Int)] = Vector.empty,
    private[night] val holdSpot: Option[(NightPoint,Int)] = None, private[night] val attempt: Int = 0,
    private[night] val switchedAt: Option[Int] = None
):
  def complete: Boolean = stage == RelayStage.Complete
  def lurePoint: Option[NightPoint] = parcels.collectFirst {
    case p if (p.state match
      case ParcelState.Rail(Belt.Loop,_,_,_,_,played) => played > 0
      case _ => false) =>
      Relay.position(p,tick,NightPoint(0,0))
  }
  private[night] def emit(kind: RelaySignal, point: NightPoint, slot: Int = -1): Relay =
    val next = events.lastOption.fold(1)(_.id + 1)
    copy(events = (events :+ RelayEvent(next,kind,point,slot,tick)).takeRight(16))
  private[night] def put(p: Parcel): Relay = copy(parcels = parcels.map(old => if old.id == p.id then p else old))

object Relay:
  private def pt(x: Double,y: Double): NightPoint = NightPoint(x,y)
  private val pipes = Vector(pt(64,112),pt(418,112))
  private def add(a: NightPoint,b: NightPoint): NightPoint = pt(a.x+b.x,a.y+b.y)
  private def lerp(a: NightPoint,b: NightPoint,t: Double): NightPoint =
    val k = t.max(0).min(1)
    pt(a.x+(b.x-a.x)*k,a.y+(b.y-a.y)*k)

  private def layout(leg: RelayLeg): Layout = leg match
    case RelayLeg.Maintenance => Layout(pt(204,178),pt(202,196),pt(258,178),pt(224,177),pt(240,152),pt(164,178),pt(140,124))
    case RelayLeg.Signature => Layout(pt(314,148),pt(296,172),pt(353,142),pt(337,165),pt(313,139),pt(260,186),pt(268,112))
    case _ => Layout(pt(164,212),pt(300,238),pt(304,174),pt(256,193),pt(292,156),pt(240,220),pt(235,153))

  private def window(n: Int): Int = if n <= 2 then 11 else if n <= 5 then 7 else 5
  private def radius(n: Int): Int = if n <= 2 then 14 else if n <= 5 then 12 else 10
  private def duration(player: NightPoint,to: NightPoint,n: Int): Int =
    (math.ceil(player.distance(to)/4).toInt + 15).max(if n <= 2 then 40 else 30)
  private def rail(p: Parcel,b: Belt,from: NightPoint,to: NightPoint,t: Int,arrives: Int): Parcel =
    p.copy(state=ParcelState.Rail(b,from,to,t,arrives,0))

  def start(w: NightWorld,leg: RelayLeg): Relay =
    val n = w.night.value
    val l = layout(leg)
    val old = w.firstNightSounds.takeRight(3)
    val times = old.scanRight(0)((b,next) => next-b.gap).tail
    val initial = Relay(leg,0,RelayStage.Running,true,old,Vector.empty,None,3,false,false,false,false,
      Map.empty,RelayHunter(pt(240,95),pt(240,95),ListenState.Quiet,0),w.player,-1,None,0,Vector.empty,n)
    spawn(initial.copy(rawTape=old.zip(times).map((b,t) => (b.kind,t))),w,l)

  private def spawn(r: Relay,w: NightWorld,l: Layout): Relay =
    val paired = r.leg == RelayLeg.Dispatch && r.n == 5
    val destination = if r.leg != RelayLeg.Dispatch then l.first else (r.n,w.order) match
      case (2,2) => pt(294,211)
      case (2,3) => pt(210,192)
      case (3,1) => pt(168,155)
      case (3,2) => pt(300,153)
      case (3,3) => pt(220,157)
      case (4,2) => pt(316,207)
      case (4,3) => pt(211,176)
      case (5,_) => pt(312,210)
      case _ => l.first
    val eta = r.tick + duration(w.player,destination,r.n) + (if paired then 45 else 0)
    val sealedTape = w.firstNightSounds.nonEmpty && (r.leg==RelayLeg.Maintenance || r.leg==RelayLeg.FrogLure)
    val cargo = Parcel(1,ParcelKind.Cargo,ParcelState.Rail(Belt.Inbound,l.source,destination,r.tick,eta,0),
      if sealedTape then w.firstNightSounds else r.recording,sealedTape=sealedTape)
    val echo = Option.when(paired)(Parcel(2,ParcelKind.Echo,
      ParcelState.Rail(Belt.Inbound,pt(185,156),l.first,r.tick,eta-37,0),w.firstNightSounds,sealedTape=w.firstNightSounds.nonEmpty)).toVector
    r.copy(parcels=cargo +: echo,cap=None,caps=3,switched=false,routed=false,recaught=false,returned=false,
      touch=Map.empty,lastStep=w.player,hunter=RelayHunter(pt(240,95),pt(240,95),ListenState.Quiet,0),
      lastHeard=None,holdSpot=None,switchedAt=None).emit(RelaySignal.Incoming,l.source)

  private[night] def position(p: Parcel,t: Int,player: NightPoint): NightPoint = p.state match
    case ParcelState.Held => player
    case ParcelState.Flying(at,_,_,_) => at
    case ParcelState.Signed(at) => at
    case ParcelState.Rail(b,from,to,start,centre,_) =>
      val part = (t-start).toDouble / (centre-start).max(1)
      if b == Belt.Loop && part < 0.43 then lerp(from,pt((from.x+to.x)/2,from.y-18),part/0.43)
      else if b == Belt.Loop then lerp(pt((from.x+to.x)/2,from.y-18),to,(part-0.43)/0.57)
      else lerp(from,to,part)

  private def catchable(p: Parcel,w: NightWorld,r: Relay): Boolean = p.state match
    case ParcelState.Rail(_,_,_,_,centre,_) =>
      (centre-r.tick).abs <= window(r.n)/2 && w.player.distance(position(p,r.tick,w.player)) <= radius(r.n)
    case _ => false

  private def panes(w: NightWorld,r: Relay): Vector[RelayWindow] =
    val points = r.leg match
      case RelayLeg.FrogLure | RelayLeg.FrogSwitch => Vector.empty
      case RelayLeg.Maintenance => Vector((1,pt(342,178)))
      case RelayLeg.Signature => Vector((1,pt(424,163)))
      case RelayLeg.Dispatch => w.night.windows.map(s => (s.index,pt(s.x,78)))
    points.map { (slot,base) =>
      val moving = r.leg == RelayLeg.Dispatch && r.n >= 2
      val at = if moving then pt(base.x+math.sin((r.tick+slot*11)*0.07)*6,base.y) else base
      val phase = (r.tick+slot*9)%56
      val open = (!moving || phase < 39) && (r.leg != RelayLeg.Signature || r.switched)
      val remaining = if !open then 0 else if moving then 39-phase else -1
      val baseWidth = if r.n <= 2 then 19.0 else 13.0
      val width = if moving && phase>=31 && open then baseWidth*(0.4+0.6*(39-phase)/8) else baseWidth
      val hit = r.touch.get(slot).filter(_.until > r.tick)
      RelayWindow(slot,at,width,open,hit.fold(PaneReaction.None)(_.reaction),hit.fold(0)(_.until-r.tick),remaining)
    }

  private def real(w: NightWorld,r: Relay,slot: Int): Boolean = r.leg != RelayLeg.Dispatch || w.recipient.index == slot
  private def frog(r: Relay): Boolean = r.leg == RelayLeg.FrogSwitch || r.leg == RelayLeg.FrogLure
  private def velocity(in: NightInput,speed: Double): NightPoint =
    val d = math.hypot(in.ax,in.ay)
    if d < 0.00001 then pt(0,-speed) else pt(in.ax/d*speed,in.ay/d*speed)
  private def along(a: NightPoint,b: NightPoint,p: NightPoint): Double =
    val dx = b.x-a.x
    val dy = b.y-a.y
    val len = dx*dx+dy*dy
    if len == 0 then 0 else ((p.x-a.x)*dx+(p.y-a.y)*dy)/len
  private def nearSegment(a: NightPoint,b: NightPoint,p: NightPoint,rad: Double): Boolean =
    lerp(a,b,along(a,b,p)).distance(p) <= rad
  private def directed(a: NightPoint,v: NightPoint,to: NightPoint): Boolean =
    val distant = pt(a.x+v.x*35,a.y+v.y*35)
    along(a,distant,to)>0 && nearSegment(a,distant,to,8)

  private def hear(r: Relay,k: EchoKind,at: NightPoint): Relay =
    if r.n < 3 then r
    else
      val chain = k == EchoKind.Step && r.lastHeard.exists((prev,t) => prev == EchoKind.Step && r.tick-t <= 26)
      val mood = if chain then ListenState.Chase else ListenState.Turn
      val h = r.hunter
      val next = if h.state == ListenState.Warn || h.state == ListenState.Strike then h else h.copy(target=at,state=mood,ticks=32)
      r.copy(hunter=next,lastHeard=Some((k,r.tick)))

  private def remember(r: Relay,k: EchoKind,at: NightPoint): Relay =
    val raw = (r.rawTape.filter((_,t) => r.tick-t <= 100) :+ (k,r.tick)).takeRight(3)
    val track = raw.zipWithIndex.map { case ((kind,t),i) => EchoBeat(kind,if i==0 then 0 else t-raw(i-1)._2) }
    val ready = r.copy(recording=track,rawTape=raw,soundAt=r.tick,parcels=r.parcels.map { p =>
      if p.state == ParcelState.Held && !p.sealedTape then p.copy(sounds=track) else p
    })
    hear(ready,k,at)

  private def diverted(r: Relay,p: Parcel,at: NightPoint,w: NightWorld): Relay =
    val l = layout(r.leg)
    val destination = if r.switched || r.leg != RelayLeg.Dispatch then l.branch else pt(204,178)
    val next = rail(p.copy(sounds=if p.sounds.isEmpty then r.recording else p.sounds,playbackAt=None),Belt.Loop,at,destination,r.tick,
      r.tick+duration(w.player,destination,r.n)+12)
    r.put(next).emit(RelaySignal.Loop,at)

  private def toggle(r: Relay,w: NightWorld): Relay =
    val l = layout(r.leg)
    val next = remember(r.copy(switched = !r.switched,routed=true,switchedAt=Some(r.tick)),EchoKind.Pipe,l.toggle).emit(RelaySignal.Switch,l.toggle)
    val forked = next.parcels.foldLeft(next) { (acc,p) => p.state match
      case ParcelState.Rail(Belt.Inbound,_,_,_,_,_) if p.kind == ParcelKind.Echo || next.leg==RelayLeg.FrogSwitch =>
        diverted(acc,p,position(p,r.tick,w.player),w)
      case ParcelState.Rail(Belt.Loop,_,_,_,centre,played) if centre-r.tick > 17 =>
        val to = if next.switched then l.branch else l.first
        val here = position(p,r.tick,w.player)
        acc.put(p.copy(state=ParcelState.Rail(Belt.Loop,here,to,r.tick,r.tick+duration(w.player,to,r.n),played)))
      case _ => acc
    }
    forked

  private def reset(r: Relay,w: NightWorld,at: NightPoint): Relay =
    spawn(r.copy(clean=false,stage=RelayStage.Running,attempt=r.attempt+1).emit(RelaySignal.Break,at)
      .emit(RelaySignal.Retry,layout(r.leg).source),w,layout(r.leg))

  def restart(w: NightWorld,r: Relay,at: NightPoint): Relay = reset(r,w,at)

  private def rescue(r: Relay,p: Parcel,w: NightWorld,at: NightPoint): Relay =
    val target = layout(r.leg).covered
    if p.rescued then reset(r,w,at) else
      r.copy(clean=false).put(rail(p.copy(rescued=true),Belt.Lower,at,target,r.tick,r.tick+duration(w.player,target,r.n)+6))
        .emit(RelaySignal.Lower,at)

  private def input(w: NightWorld,r: Relay,in: NightInput): Relay = in.action match
    case NightAction.Probe if r.cap.isEmpty && r.caps > 0 =>
      r.copy(cap=Some(CapFlight(w.player,velocity(in,24),false,Set.empty)),caps=r.caps-1).emit(RelaySignal.CapFire,w.player)
    case NightAction.Probe if r.caps == 0 => r.emit(RelaySignal.Empty,w.player)
    case NightAction.Catch if !r.parcels.exists(_.state == ParcelState.Held) =>
      r.parcels.find(catchable(_,w,r)) match
        case None => r.emit(RelaySignal.Miss,w.player)
        case Some(p) =>
          val looped = p.state match
            case ParcelState.Rail(Belt.Loop,_,_,_,_,played) => played > 0
            case _ => false
          val next = r.put(p.copy(state=ParcelState.Held,sounds=if p.sounds.nonEmpty then p.sounds else r.recording))
            .copy(recaught=r.recaught || looped).emit(RelaySignal.Catch,w.player)
          if r.leg == RelayLeg.FrogLure && looped then next.copy(stage=RelayStage.Complete) else next
    case NightAction.Release => r.parcels.find(_.state == ParcelState.Held).fold(r) { p =>
      val v = velocity(in,16)
      val toInlet = directed(w.player,v,layout(r.leg).inlet)
      r.put(p.copy(state=ParcelState.Flying(w.player,v,0,toInlet))).emit(RelaySignal.Release,w.player)
    }
    case _ => r

  private def sign(w: NightWorld,r: Relay,p: Parcel,pane: RelayWindow): Relay =
    val at = pane.at
    if !real(w,r,pane.slot) || !pane.open || p.kind == ParcelKind.Echo ||
        (r.leg == RelayLeg.Maintenance && !r.recaught) || (r.n == 5 && !r.routed) then
      rescue(r.emit(if pane.open then RelaySignal.WindowHit else RelaySignal.Late,at,pane.slot),p,w,at)
    else if r.n == 1 && w.delivered == 2 && !r.returned then
      val to = layout(r.leg).covered
      r.copy(returned=true).put(rail(p,Belt.Lower,at,to,r.tick,r.tick+duration(w.player,to,r.n)))
        .emit(RelaySignal.Lower,at,pane.slot)
    else remember(r.put(p.copy(state=ParcelState.Signed(at))),EchoKind.Bell,at)
      .copy(stage=RelayStage.Signed,signedAt=r.tick).emit(RelaySignal.Sign,at,pane.slot)

  private def flyParcel(w: NightWorld,r: Relay,p: Parcel,at: NightPoint,v: NightPoint,t: Int,toInlet: Boolean): Relay =
    val end = add(at,v)
    val l = layout(r.leg)
    if toInlet && nearSegment(at,end,l.inlet,8) then
      val next = if p.kind==ParcelKind.Echo then r.copy(routed=true) else r
      diverted(next,p,l.inlet,w)
    else panes(w,r).find(s => nearSegment(at,end,s.at,s.halfWidth)) match
      case Some(s) => sign(w,r,p,s)
      case None if end.x < 10 || end.x > 470 || end.y < 65 || end.y > 282 || t >= 48 =>
        val impact = pt(end.x.max(10).min(470),end.y.max(65).min(282))
        rescue(r.emit(RelaySignal.WindowHit,impact),p,w,impact)
      case _ => r.put(p.copy(state=ParcelState.Flying(end,v,t+1,toInlet)))

  private def capSegment(w: NightWorld,r: Relay,c: CapFlight,end: NightPoint): Relay =
    val l = layout(r.leg)
    if !c.tripped && nearSegment(c.at,end,l.toggle,8) then
      capSegment(w,toggle(r,w),c.copy(tripped=true),end)
    else if pipes.exists(nearSegment(c.at,end,_,10)) then
      val pipe = pipes.minBy(_.distance(end))
      remember(r.copy(cap=None),EchoKind.Pipe,pipe).emit(RelaySignal.Pipe,pipe)
    else
      val hit = panes(w,r).find(s => !c.through.contains(s.slot) && nearSegment(c.at,end,s.at,s.halfWidth))
      hit match
        case Some(pane) =>
          val genuine = real(w,r,pane.slot)
          val reaction = if genuine then PaneReaction.Caught else PaneReaction.Through
          val next = r.copy(touch=r.touch.updated(pane.slot,PaneTouch(reaction,r.tick+30)))
            .emit(if genuine then RelaySignal.CapCaught else RelaySignal.CapThrough,pane.at,pane.slot)
          if genuine then next.copy(cap=None)
          else next.copy(cap=Some(c.copy(at=end,through=c.through+pane.slot)))
        case _ if end.y <= 60 || end.y >= 278 =>
          val at = pt(end.x.max(12).min(468),end.y.max(60).min(278))
          remember(r.copy(cap=None),EchoKind.Pipe,at).emit(RelaySignal.Pipe,at)
        case _ => r.copy(cap=Some(c.copy(at=end)))

  private def flyCap(w: NightWorld,r: Relay,c: CapFlight): Relay =
    val end = add(c.at,c.velocity)
    if end.x < 12 || end.x > 468 then
      val wallX = if end.x < 12 then 12.0 else 468.0
      val fraction = (wallX-c.at.x)/c.velocity.x
      val wall = lerp(c.at,end,fraction)
      val first = capSegment(w,r,c,wall)
      first.cap.fold(first) { current =>
        if c.bounced then remember(first.copy(cap=None),EchoKind.Pipe,wall).emit(RelaySignal.Pipe,wall)
        else
          val bounced = current.copy(at=wall,velocity=pt(-c.velocity.x,c.velocity.y),bounced=true)
          val ringing = remember(first,EchoKind.Pipe,wall).emit(RelaySignal.CapBounce,wall)
          capSegment(w,ringing,bounced,pt(2*wallX-end.x,end.y))
      }
    else capSegment(w,r,c,end)

  private def onBelt(w: NightWorld,r: Relay,p: Parcel,line: ParcelState.Rail): Relay =
    val at = position(p,r.tick,w.player)
    if r.tick > line.centre + window(r.n)/2 then
      if p.kind == ParcelKind.Echo && r.routed then r.copy(parcels=r.parcels.filterNot(_.id==p.id))
      else if line.belt == Belt.Lower then reset(r,w,at)
      else rescue(r,p,w,at)
    else if line.belt == Belt.Loop && line.played < p.sounds.size then
      val due = p.sounds.take(line.played+1).drop(1).map(_.gap).sum
      val playbackStart = p.playbackAt.getOrElse(r.tick)
      if r.tick-playbackStart >= due then
        val k = p.sounds(line.played).kind
        val signal = k match
          case EchoKind.Step => RelaySignal.ReplayStep
          case EchoKind.Pipe => RelaySignal.ReplayPipe
          case EchoKind.Bell => RelaySignal.ReplayBell
        val next = hear(r.put(p.copy(state=line.copy(played=line.played+1),playbackAt=Some(playbackStart))),k,at).emit(signal,at)
        // Several marks can share a timestamp.
        onBelt(w,next,next.parcels.find(_.id == p.id).getOrElse(p),line.copy(played=line.played+1))
      else r
    else r

  private def floorNoise(w: NightWorld,r: Relay): Relay =
    if w.player.distance(r.lastStep) < 14 then r
    else
      val advanced = r.copy(lastStep=w.player)
      val onRubber = w.player.x < 142 || w.player.x > 350
      if onRubber then advanced else remember(advanced,EchoKind.Step,w.player).emit(RelaySignal.Step,w.player)

  private def bottleHiss(w: NightWorld,r: Relay): Relay =
    if r.n < 3 || !r.parcels.exists(_.state==ParcelState.Held) then r.copy(holdSpot=None)
    else r.holdSpot match
      case Some((at,t)) if at.distance(w.player) < 16 =>
        if r.tick-t == 35 then r.emit(RelaySignal.Hiss,w.player)
        else if r.tick-t >= 50 && r.hunter.state != ListenState.Warn && r.hunter.state != ListenState.Strike then
          r.copy(holdSpot=Some((w.player,r.tick)),hunter=RelayHunter(r.hunter.at,w.player,ListenState.Warn,16))
            .emit(RelaySignal.HandWarn,w.player)
        else r
      case _ => r.copy(holdSpot=Some((w.player,r.tick)))

  private def hunt(w: NightWorld,r: Relay): Relay =
    val h = r.hunter
    h.state match
      case ListenState.Quiet => r
      case ListenState.Warn if h.ticks <= 1 =>
        val attacked = r.copy(hunter=h.copy(state=ListenState.Strike,ticks=6)).emit(RelaySignal.HandStrike,h.target)
        if w.player.distance(h.target) <= 12 then reset(attacked,w,h.target) else attacked
      case ListenState.Strike if h.ticks <= 1 => r.copy(hunter=h.copy(state=ListenState.Quiet,ticks=0))
      case ListenState.Warn | ListenState.Strike => r.copy(hunter=h.copy(ticks=h.ticks-1))
      case _ =>
        val distance = h.at.distance(h.target)
        val chase = h.state == ListenState.Chase
        val nextAt = lerp(h.at,h.target,(if chase then 2.8 else 1.5)/distance.max(0.001))
        if chase && distance < 18 then
          r.copy(hunter=h.copy(at=nextAt,state=ListenState.Warn,ticks=14)).emit(RelaySignal.HandWarn,h.target)
        else if h.ticks <= 1 then r.copy(hunter=h.copy(at=nextAt,state=ListenState.Quiet,ticks=0))
        else r.copy(hunter=h.copy(at=nextAt,ticks=h.ticks-1))

  def step(w: NightWorld,previous: Relay,in: NightInput): Relay = previous.stage match
    case RelayStage.Complete => previous
    case RelayStage.Signed =>
      val next = previous.copy(tick=previous.tick+1)
      if next.tick-next.signedAt >= 24 then next.copy(stage=RelayStage.Complete)
      else if next.tick-next.signedAt == 1 && next.n >= 4 then
        next.emit(RelaySignal.SideFace,next.parcels.headOption.fold(w.player)(position(_,next.tick,w.player)))
      else next
    case RelayStage.Running =>
      val next = previous.copy(tick=previous.tick+1)
      val l = layout(next.leg)
      val stocked = if next.cap.isEmpty && w.player.distance(l.rack)<=17 then next.copy(caps=3) else next
      val moved = input(w,floorNoise(w,stocked),in)
      val pinged = moved.cap.fold(moved)(flyCap(w,moved,_))
      val after = pinged.parcels.foldLeft(pinged) { (acc,original) =>
        if acc.stage != RelayStage.Running || acc.attempt != pinged.attempt then acc
        else acc.parcels.find(_.id==original.id).fold(acc) { p => p.state match
          case line: ParcelState.Rail => onBelt(w,acc,p,line)
          case ParcelState.Flying(at,v,t,toInlet) => flyParcel(w,acc,p,at,v,t,toInlet)
          case _ => acc
        }
      }
      if after.leg==RelayLeg.FrogSwitch && after.routed && after.switchedAt.exists(t => after.tick-t>=20) then
        after.copy(stage=RelayStage.Complete)
      else if after.stage == RelayStage.Running && after.attempt==pinged.attempt then hunt(w,bottleHiss(w,after)) else after

  def view(w: NightWorld,r: Relay): RelayView =
    val l = layout(r.leg)
    val bottles = r.parcels.map { p =>
      val at = position(p,r.tick,w.player)
      val (state,to,eta,track) = p.state match
        case ParcelState.Rail(b,from,dest,_,centre,_) =>
          val look = b match
            case Belt.Inbound => ParcelLook.Inbound
            case Belt.Lower => ParcelLook.Lower
            case Belt.Loop => ParcelLook.Loop
          val via = Option.when(b==Belt.Loop)(pt((from.x+dest.x)/2,from.y-18))
          (look,dest,centre-r.tick,Vector(from)++via++Vector(dest))
        case ParcelState.Held => (ParcelLook.Held,at,-1,Vector.empty)
        case _: ParcelState.Flying => (ParcelLook.Flight,at,-1,Vector.empty)
        case _: ParcelState.Signed => (ParcelLook.Signed,at,-1,Vector.empty)
      RelayBottleView(p.id,p.kind,state,at,to,eta,window(r.n),radius(r.n),catchable(p,w,r),p.sounds,track)
    }
    val objective = r.stage match
      case RelayStage.Signed | RelayStage.Complete => "签收铃响了。看一眼身后的玻璃。"
      case _ if r.leg == RelayLeg.FrogSwitch => "右键弹盖，打中黄铜拨片，替奶蛙改道。"
      case _ if r.n == 5 && !r.routed => "两瓶相撞前，右键打中黄铜拨片，把空瓶分去侧带。"
      case _ if r.parcels.exists(_.state==ParcelState.Held) =>
        if (r.leg == RelayLeg.Maintenance || r.leg == RelayLeg.FrogLure) && !r.recaught then
          "踩响铁板或敲响管口，再瞄准内侧进带口松开左键，让瓶子替你出声。"
        else if r.leg == RelayLeg.Signature && !r.switched then "按住瓶子移动，右键弹盖拨开末端槽，再瞄准收货槽松开。"
        else if r.n == 1 then "瞄准上方2号窗，松开左键送出汽水。"
        else "右键弹盖试窗，真手会截住盖子。瞄准露出的窗缝松开左键。"
      case _ => "走到轨道白圈，等瓶颈到手边时按下左键接住。"
    RelayView(r.leg,r.tick,r.stage,r.switched,r.caps,r.clean,bottles,r.cap.map(c=>RelayCapView(c.at,c.bounced)),
      panes(w,r),l.toggle,l.rack,l.inlet,pipes,r.hunter,r.events,objective,r.routed,r.recaught)
