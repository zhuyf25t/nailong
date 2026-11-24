package soda.night

/* Render, sound and playthrough contract. Actor coordinates are sprite feet; mark coordinates
 * are the approach point (radius 17). Use Probe or Toss near an interactive marker.
 * UI displays objective as Chinese prose. cueId increments on cue changes and repeated actions.
 *
 * NIGHT 6 room=maintenance
 * enter_hatch: hatch(240,253) click -> observe_windows. Three window marks window at
 * (104/240/376,117). Three people kind monitor or monitor_probe, slot 0..2, x/y already
 * projected into their screen at y=62..90. No visible type identifies the answer.
 * Move/test for at least 40 ticks; right click to wave anywhere, left click by the delayed window.
 * Compare against the live and first-night windows. Wrong guess gives wrong_window, can repeat.
 * delay_door: plate(164,178), gate(276,178). Stand on plate ~30 ticks, walk right to gate;
 * ghost kind delay is your position 40 ticks ago. Crossing x=276 at y=178+-18 requires
 * delay ghost on plate. Then old_turn, old_tape at (359,172); approach & click; old actor
 * archive / archive_turn faces player for 30 ticks. exit_maintenance: exit(426,238) touch.
 *
 * NIGHT 7 room=signatures
 * check_signature: ledger(110,207) click. record_one / record_two: panel (78,218)/(260,186).
 * Start the tape, stand on the plate (164,154)/(292,217) for 40 consecutive samples,
 * then click while the seal_ready light is on. Replay returns the courier to the panel.
 * play_one/play_two: stand at gate (235,174)/(391,164) and cross to its right while echo on plate.
 * Walls block x>=gateX outside y+-18 or when closed. Gate2 has divider(329,175), blocked
 * between y=158..193, slow north route or fragile shortcut crumb(351,208) (40x32 pixels).
 * The second replay starts a warned roller from the left. A catch or broken tile
 * rewinds the sealed tape. Inside the vestibule, hold east at the stripe to clear
 * the final sill when the tape ends. A missed lift retries from the stripe.
 *
 * Night 8 lives in the independent SleepWatch domain.
 */

private[night] enum MaintenanceStep:
  case Hatch, Observe, Delay, Tape, Turning, Exit
private[night] enum SignatureStep:
  case Ledger, Ready, Record, Playback, Sill, Assist, Crossed, Exit
private[night] enum Gate(val panel: NightPoint, val plate: NightPoint, val door: NightPoint):
  case First extends Gate(NightPoint(78,218),NightPoint(164,154),NightPoint(235,174))
  case Second extends Gate(NightPoint(260,186),NightPoint(292,217),NightPoint(391,164))
private[night] final case class Frame(at: NightPoint, wave: Boolean, probe: Boolean = false)
private[night] sealed trait PuzzleScene
private[night] final case class Maintenance(stage: MaintenanceStep, live: Int, delayedSlot: Int,
                                            reel: Vector[Frame]) extends PuzzleScene:
  def delayed: Frame = reel.head
private[night] final case class Signatures(stage: SignatureStep, gate: Gate, frames: Vector[NightPoint],
                                          wear: Int = 0, sillFrame: Int = 0) extends PuzzleScene:
  def echo(age: Int): NightPoint = frames.lift(age).orElse(frames.lastOption).getOrElse(gate.panel)
private[night] final case class SleepRoom(watch: SleepWatch) extends PuzzleScene
final case class PuzzleWorld private[night](private[night] val scene: PuzzleScene, age: Int, elapsed: Int,
                                           cue: StoryCue, cueId: Int):
  private[night] def tell(signal: StoryCue): PuzzleWorld = copy(cue=signal,cueId=cueId+1)
  private[night] def enter(s: PuzzleScene, signal: StoryCue): PuzzleWorld = copy(scene=s,age=0).tell(signal)

object StoryPuzzles:
  private val hatch = NightPoint(240,253)
  private val delayPlate = NightPoint(164,178)
  private val delayGate = NightPoint(276,178)
  private val tape = NightPoint(359,172)
  private val maintenanceExit = NightPoint(426,238)
  private val ledger = NightPoint(110,207)
  private val crumb = NightPoint(351,208)
  private val divider = NightPoint(329,175)
  private val secondSill = NightPoint(410,164)
  private val standHere = NightPoint(401,164)
  private val plateHoldTicks = 40
  private val liftTicks = 24
  private val pressWarningTicks = 32
  private val upperRoute = Vector(NightPoint(260,186),NightPoint(299,150),NightPoint(351,150),NightPoint(381,164))
  private val signExit = NightPoint(433,164)
  private val slots = Vector(104,240,376)

  def start(w: NightWorld): Option[PuzzleWorld] =
    w.night.value match
      case 6 if w.delivered >= 2 =>
        val layout = Math.floorMod(w.seed,6L).toInt
        val live = layout % 3
        val scene = Maintenance(MaintenanceStep.Hatch,live,(live + 1 + layout/3) % 3,Vector(Frame(w.player,false)))
        Some(PuzzleWorld(scene,0,0,"none",0))
      case 7 => Some(PuzzleWorld(Signatures(SignatureStep.Ledger,Gate.First,Vector.empty),0,0,"none",0))
      case 8 => Some(PuzzleWorld(SleepRoom(SleepWatch.start(w)),0,0,"sleep_show",1))
      case _ => None

  private def near(a: NightPoint,b: NightPoint,radius: Double = 17.0): Boolean = a.distance(b) <= radius
  private def click(in: NightInput): Boolean = in.action == NightAction.Probe || in.action == NightAction.Toss
  private def mark(at: NightPoint,k: String): StoryMark = StoryMark(at.x.toInt,at.y.toInt,k)
  private def person(at: NightPoint,k: String,slot: Int = 0): StoryPerson = StoryPerson(at.x,at.y,k,slot)
  private def stays(s: PuzzleWorld): PuzzleTransition = PuzzleTransition.Continue(s)
  private def at(s: PuzzleWorld,p: NightPoint): PuzzleTransition = PuzzleTransition.Continue(s,Some(p))

  // Doors are physical partitions. A closed gate also blocks walking around either end.
  private def barrier(old: NightPoint,next: NightPoint,door: NightPoint,open: Boolean): NightPoint =
    if old.x < door.x && next.x >= door.x && (!open || math.abs(next.y-door.y)>18) then
      NightPoint(door.x-1,next.y)
    else next

  def constrain(w: NightWorld,s: PuzzleWorld,next: NightPoint): NightPoint = s.scene match
    case m: Maintenance if m.stage == MaintenanceStep.Delay =>
      val delayedNext = m.reel.lift(1).getOrElse(m.delayed)
      barrier(w.player,next,delayGate,near(delayedNext.at,delayPlate,15))
    case g: Signatures if g.stage == SignatureStep.Sill || g.stage == SignatureStep.Assist =>
      val inside = NightPoint(next.x.max(g.gate.door.x),next.y.max(secondSill.y-17).min(secondSill.y+17))
      barrier(w.player,inside,secondSill,open=g.stage == SignatureStep.Assist)
    case g: Signatures if g.stage == SignatureStep.Record || g.stage == SignatureStep.Playback =>
      val inDivider = g.gate == Gate.Second && math.abs(next.x-divider.x) < 5 && next.y > 158 && next.y < 193
      val guided =
        if !inDivider then next
        else if math.abs(w.player.x-divider.x) >= 5 then NightPoint(w.player.x,next.y)
        else NightPoint(next.x,w.player.y)
      barrier(w.player,guided,g.gate.door,
        g.stage == SignatureStep.Playback && near(g.echo(s.age+1),g.gate.plate,16))
    case _ => next

  def step(w: NightWorld,puzzle: PuzzleWorld,in: NightInput): PuzzleTransition =
    val s = puzzle.copy(age=puzzle.age+1,elapsed=puzzle.elapsed+1)
    s.scene match
      case m: Maintenance => maintenance(w,s,m,in)
      case g: Signatures => signatures(w,s,g,in)
      case SleepRoom(h) => SleepWatch.step(w,s,h,in)

  private def maintenance(w: NightWorld,s: PuzzleWorld,m: Maintenance,in: NightInput): PuzzleTransition =
    import MaintenanceStep.*
    val probe = in.action == NightAction.Probe
    val waving = probe || m.reel.takeRight(5).exists(_.probe)
    val next = m.copy(reel=(m.reel :+ Frame(w.player,waving,probe)).takeRight(41))
    val base = s.copy(scene=next)
    m.stage match
      case Hatch if click(in) && near(w.player,hatch) =>
        stays(base.enter(next.copy(stage=Observe),"hatch"))
      case Observe if in.action == NightAction.Toss && slots.exists(x => near(w.player,NightPoint(x,117))) =>
        val slot = slots.indexWhere(x => near(w.player,NightPoint(x,117)))
        if s.age < 40 then stays(base.tell("watch_longer"))
        else if slot != m.delayedSlot then stays(base.tell("wrong_window"))
        else
          val entry = NightPoint(110,207)
          at(base.enter(next.copy(stage=Delay,reel=Vector.fill(41)(Frame(entry,false))),"delay_found"),entry)
      case Delay if w.player.x >= delayGate.x => stays(base.enter(next.copy(stage=Tape),"delay_open"))
      case Tape if click(in) && near(w.player,tape) => stays(base.enter(next.copy(stage=Turning),"archive_turn"))
      case Turning if s.age >= 30 => stays(base.copy(scene=next.copy(stage=Exit),age=0))
      case Exit if near(w.player,maintenanceExit) => PuzzleTransition.Finish(base)
      case _ => stays(base)

  private def onCrumb(p: NightPoint): Boolean = math.abs(p.x-crumb.x) <= 20 && math.abs(p.y-crumb.y) <= 16
  private def plateTicks(g: Signatures): Int =
    g.frames.reverseIterator.take(plateHoldTicks).takeWhile(near(_,g.gate.plate,16)).length

  // This is the physical left-to-right edge of the press; the client draws the same edge.
  private def pressFront(age: Int): Double =
    (238 + (age - pressWarningTicks).max(0) * 2.8).min(Gate.Second.door.x)

  private def replay(s: PuzzleWorld,g: Signatures,signal: StoryCue): PuzzleTransition =
    at(s.enter(g.copy(stage=SignatureStep.Playback,wear=0,sillFrame=0),signal),g.gate.panel)

  private def signatures(w: NightWorld,s: PuzzleWorld,g: Signatures,in: NightInput): PuzzleTransition =
    import SignatureStep.*
    g.stage match
      case Ledger if click(in) && near(w.player,ledger) =>
        stays(s.enter(g.copy(stage=Ready),"ledger"))
      case Ready if click(in) && near(w.player,g.gate.panel) =>
        stays(s.enter(g.copy(stage=Record,frames=Vector(w.player),wear=0),"record_start"))
      case Record =>
        val recorded = g.copy(frames=(g.frames :+ w.player).takeRight(180))
        val held = plateTicks(recorded)
        val base = s.copy(scene=recorded)
        if in.action == NightAction.Toss && held == plateHoldTicks then replay(base,recorded,"replay_start")
        else if in.action == NightAction.Toss then stays(base.tell("seal_early"))
        else if held == plateHoldTicks && plateTicks(g) < held then stays(base.tell("plate_ready"))
        else stays(base)
      case Playback =>
        val strain = g.gate == Gate.Second && (onCrumb(w.player) || onCrumb(g.echo(s.age)))
        val wear = (g.wear + (if strain then 1 else 0)).min(8)
        if g.gate == Gate.Second && s.age >= pressWarningTicks && w.player.x <= pressFront(s.age) then
          replay(s,g,"press_caught")
        else if wear >= 8 && onCrumb(w.player) then replay(s,g,"tape_rewind")
        else if w.player.x >= g.gate.door.x && math.abs(w.player.y-g.gate.door.y)<=18 then
          if g.gate == Gate.First then
            at(s.enter(Signatures(Ready,Gate.Second,Vector.empty),"gate_pass"),Gate.Second.panel)
          else stays(s.enter(g.copy(stage=Sill,wear=wear,sillFrame=s.age.min(g.frames.length)),"sill_wait"))
        else stays(s.copy(scene=g.copy(wear=wear)))
      case Sill if s.age >= 20 && g.sillFrame + s.age >= g.frames.length =>
        stays(s.enter(g.copy(stage=Assist),"echo_hold"))
      case Assist if w.player.x >= secondSill.x && math.abs(w.player.y-secondSill.y)<=18 =>
        stays(s.enter(g.copy(stage=Crossed),"press_slam"))
      case Crossed if s.age >= 9 => stays(s.copy(scene=g.copy(stage=Exit),age=0))
      case Assist if s.age >= liftTicks =>
        at(s.enter(g.copy(stage=Sill,sillFrame=g.frames.length),"sill_missed"),standHere)
      case Exit if near(w.player,signExit) || (w.player.x>=signExit.x && math.abs(w.player.y-signExit.y)<=18) =>
        PuzzleTransition.Finish(s)
      case _ => stays(s)

  private val trainingTape = Vector(NightPoint(240,220),NightPoint(240,202),NightPoint(236,181),
    NightPoint(210,176),NightPoint(210,152),NightPoint(240,144),NightPoint(242,172),NightPoint(240,204))

  private def archive(w: NightWorld,t: Int): Frame =
    val trace = if w.firstNightTrace.nonEmpty then w.firstNightTrace else trainingTape
    val cycle = math.max(1,trace.length*4)
    Frame(trace((t%cycle)/4), false)

  def view(w: NightWorld,s: PuzzleWorld): StoryView =
    def output(step: String,room: String,objective: String,people: Vector[StoryPerson],marks: Vector[StoryMark],
               tiles: Vector[StoryTile] = Vector.empty): StoryView =
      StoryView(step,room,objective,s.cue,s.cueId,tiles,people,marks,s.age)
    s.scene match
      case m: Maintenance =>
        import MaintenanceStep.*
        val room = "maintenance"
        m.stage match
          case Hatch => output("enter_hatch",room,"送完两单。走到南侧检修口，点击打开。",Vector.empty,Vector(mark(hatch,"hatch")))
          case Observe =>
            val old = archive(w,s.elapsed)
            val views = slots.zipWithIndex.map { case (x,slot) =>
              val f = if slot==m.live then m.reel.last else if slot==m.delayedSlot then m.delayed else old
              StoryPerson(x+(f.at.x-240)*0.11,76+(f.at.y-180)*0.10,if f.wave then "monitor_probe" else "monitor",slot)
            }
            val tapeLabel = if w.firstNightTrace.nonEmpty then "第一夜存档" else "第一夜岗位示范带"
            output("observe_windows",room,s"三窗同时放映：现场、两秒前、$tapeLabel。右键挥手比较，再走到延迟窗前按左键。",views,slots.map(x=>mark(NightPoint(x,117),"window")))
          case Delay =>
            val open = near(m.delayed.at,delayPlate,15)
            output("delay_door",room,"站稳黄踏板一会儿，再沿灯线向右走；两秒前的你会替你压开检修门。",
              Vector(person(m.delayed.at,"delay")),Vector(mark(delayPlate,if open then "plate_on" else "plate"),
                mark(delayGate,if open then "gate_open" else "gate")))
          case Tape | Turning => output("old_turn",room,if m.stage==Tape then "去旧录像台，靠近点击读第一夜。" else "旧录像里的人，正朝你回头。",
            Vector(person(tape,if m.stage==Tape then "archive" else "archive_turn")),Vector(mark(tape,"old_tape")))
          case Exit => output("exit_maintenance",room,"录像停了。去东南出口下班。",Vector(person(tape,"archive_turn")),Vector(mark(maintenanceExit,"exit")))
      case g: Signatures =>
        import SignatureStep.*
        val room = "signatures"
        val n = if g.gate == Gate.First then "one" else "two"
        val route = if g.gate == Gate.Second then Vector(mark(divider,"divider"),mark(crumb,"crumb")) else Vector.empty
        val tiles = if g.gate == Gate.Second then Vector(StoryTile(crumb.x.toInt,crumb.y.toInt,
          if g.wear>=8 then StoryTileState.Hole else if g.wear>0 then StoryTileState.Warn else StoryTileState.Solid, (8-g.wear).max(0))) else Vector.empty
        def layout(onPlate: Boolean,door: NightPoint = g.gate.door,latched: Boolean = false) =
          Vector(mark(g.gate.panel,"panel"),mark(g.gate.plate,if onPlate then "plate_on" else "plate"),
            mark(door,if onPlate && !latched then "gate_open" else "gate")) ++ route
        g.stage match
          case Ledger => output("check_signature",room,"你还没签收，台账上已有你的签名。到签收台点击查账。",Vector.empty,Vector(mark(ledger,"ledger")))
          case Ready => output("record_"+n,room,"靠近录制台，点左键开录。走到踏板上站满两秒，等灯亮再点左键。",Vector.empty,layout(false),tiles)
          case Record =>
            val held = plateTicks(g)
            val ready = held == plateHoldTicks
            val hint = if ready then "脚别离开踏板。现在点左键封存。回放开始后，去右边过门。"
              else if held > 0 then "站住，等踏板上的格子填满。亮起「可封存」再点左键。"
              else "走到标着「踏板」的方板上，站稳两秒。"
            val lamp = Option.when(ready)(mark(g.gate.plate,"seal_ready")).toVector
            output("take_"+n,room,hint,Vector.empty,layout(held>0) ++ lamp,tiles).copy(plateTicks=Some(held))
          case Playback =>
            val e = g.echo(s.age)
            val danger = if g.gate == Gate.First then Vector.empty else
              upperRoute.map(mark(_,"route_arrow")) :+ mark(NightPoint(pressFront(s.age),164),
                if s.age < pressWarningTicks then "press_warn" else "press_shadow")
            val hint = if g.gate==Gate.First then "录像里的奶龙会踩板开门。你本人往右走，穿过亮起的门缝。"
              else "滚轮从左边追来！沿地面箭头从上方绕柱，往右穿过亮门。"
            output("play_"+n,room,hint,Vector(person(e,"echo")),layout(near(e,g.gate.plate,16)) ++ danger,tiles)
          case Sill =>
            val e = g.echo(g.sillFrame+s.age)
            output("sill_wait",room,"到门前白线，按住 D 或 →，关门时也按住。门一抬就能冲过去。",
              Vector(person(e,"echo")),layout(true,secondSill,latched=true) :+ mark(standHere,"stand_here"),tiles)
          case Assist => output("help_hold",room,"门抬起来了！按住 D 或 → 穿过去。",Vector(person(g.gate.plate,"echo")),
            layout(true,secondSill) :+ mark(standHere,"stand_here"),tiles)
          case Crossed => output("sill_clear",room,"闸落在身后了。沿着这条通道继续向右走。",
            Vector(person(g.gate.plate,"echo")),Vector(mark(secondSill,"gate"),mark(signExit,"exit")))
          case Exit => output("exit_signature",room,"它替你按住了最后一格。向东离开签收廊。",Vector(person(g.gate.plate,"echo")),Vector(mark(signExit,"exit")))
      case SleepRoom(h) => SleepWatch.view(w,s,h)
