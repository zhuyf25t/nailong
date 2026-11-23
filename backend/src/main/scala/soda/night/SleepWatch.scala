package soda.night

private[night] enum SleepRound(val number: Int, val length: Int):
  case First extends SleepRound(1,280)
  case Second extends SleepRound(2,360)
  case Third extends SleepRound(3,440)

private[night] enum WardPhase:
  case Reveal, Sleeping, Check, Deliver, Face, Exit

private[night] final case class WardHand(at: NightPoint, born: Int):
  def damaging(age: Int): Boolean = age - born >= 30
  def tiles(age: Int): Vector[StoryTile] =
    val until = if damaging(age) then 52 else 30
    Vector(StoryTile(at.x.toInt,at.y.toInt,
      if damaging(age) then StoryTileState.Hole else StoryTileState.Warn, until - (age-born)))

private[night] final case class SleepWatch(round: SleepRound, stage: WardPhase, frog: Int, spin: Int,
                                          stabilized: Int = 0, held: Int = 0, doubts: Int = 0,
                                          hand: Option[WardHand] = None)

private[night] object SleepWatch:
  private val center = NightPoint(240,180)
  private val entry = NightPoint(240,220)
  private val outlet = NightPoint(240,146)
  private val exit = NightPoint(426,238)
  private val holdGoal = 14

  private final case class Duty(from: Int, until: Int, at: NightPoint)
  private val a = NightPoint(150,215)
  private val b = NightPoint(322,145)
  private val c = NightPoint(152,140)
  private val duties = Map(
    SleepRound.First -> Vector(Duty(42,194,a)),
    SleepRound.Second -> Vector(Duty(28,158,a),Duty(198,335,b)),
    SleepRound.Third -> Vector(Duty(22,147,a),Duty(160,286,b),Duty(300,422,c)))
  private val warnings = Map(
    SleepRound.First -> Set(205), SleepRound.Second -> Set(164), SleepRound.Third -> Set(149,289))

  def start(w: NightWorld): SleepWatch = fresh(w,SleepRound.First)

  private def fresh(w: NightWorld, round: SleepRound): SleepWatch =
    val key = w.seed ^ (0x9e3779b97f4a7c15L * round.number)
    val mixed = (key ^ (key >>> 29)) * 0xbf58476d1ce4e5b9L
    SleepWatch(round,WardPhase.Reveal,Math.floorMod(mixed >>> 3,4L).toInt,if (mixed & 1) == 0 then 1 else -1)

  // All four run on one closed rail. On higher rounds each sector's motor starts a
  // few ticks late, but every carriage brakes at its assigned quarter-turn station.
  // Motor timing depends only on starting position and leg, never on the occupant.
  private def sweep(age: Int, from: Int, to: Int, quarters: Int): Double =
    val u = ((age-from).toDouble/(to-from)).max(0.0).min(1.0)
    quarters * u * u * (3.0 - 2.0*u)

  private def offset(h: SleepWatch, age: Int, index: Int): Double =
    val t = h.stage match
      case WardPhase.Reveal => 0
      case WardPhase.Sleeping => age
      case _ => h.round.length
    def leg(number: Int, from: Int, to: Int, quarters: Int): Double =
      val delay = (index + number*3 + h.round.number) % 4 * (h.round.number-1)
      sweep(t,from+delay,to,quarters)
    val turns = h.round match
      case SleepRound.First => leg(0,40,160,1)
      case SleepRound.Second => leg(0,32,126,1) + leg(1,164,303,-2)
      case SleepRound.Third => leg(0,24,100,1) + leg(1,122,232,-2) + leg(2,265,399,3)
    turns * h.spin

  private def positions(h: SleepWatch, age: Int): Vector[NightPoint] =
    Vector.tabulate(4) { index =>
      val angle = (index + offset(h,age,index)) * math.Pi / 2.0
      NightPoint(center.x + 150 * math.sin(angle), center.y - 65 * math.cos(angle))
    }

  // Public slot is clockwise screen order starting northwest, never a persistent actor ID.
  private def screenOrder(point: NightPoint): Double =
    val theta = math.atan2((point.x-center.x)/150,(center.y-point.y)/65)
    (theta + math.Pi/4 + math.Pi*2) % (math.Pi*2)

  private def mark(p: NightPoint,k: String): StoryMark = StoryMark(p.x.round.toInt,p.y.round.toInt,k)
  private def near(a: NightPoint,b: NightPoint,r: Double): Boolean = a.distance(b) <= r
  private def stay(s: PuzzleWorld,h: SleepWatch): PuzzleTransition = PuzzleTransition.Continue(s.copy(scene=SleepRoom(h)))
  private def enter(s: PuzzleWorld,h: SleepWatch,cue: StoryCue): PuzzleTransition =
    PuzzleTransition.Continue(s.enter(SleepRoom(h),cue))
  private def reveal(w: NightWorld,s: PuzzleWorld,r: SleepRound,cue: StoryCue): PuzzleTransition =
    PuzzleTransition.Continue(s.enter(SleepRoom(fresh(w,r)),cue),Some(entry))
  private def selected(w: NightWorld,h: SleepWatch,range: Double): Option[Int] =
    positions(h,0).zipWithIndex.collectFirst { case (p,index) if near(w.player,p,range) => index }

  def step(w: NightWorld,s: PuzzleWorld,h: SleepWatch,in: NightInput): PuzzleTransition = h.stage match
    case WardPhase.Reveal if s.age >= 50 =>
      enter(s,h.copy(stage=WardPhase.Sleeping),"sleep_close")
    case WardPhase.Sleeping => watch(w,s,h,in)
    case WardPhase.Check if in.action == NightAction.Probe => selected(w,h,48) match
      case None => stay(s,h)
      case Some(i) if i == h.frog => enter(s,h.copy(stage=WardPhase.Deliver),"wake_answer")
      case Some(_) if h.doubts == 0 => stay(s.tell("wrong_window"),h.copy(doubts=1))
      case _ => reveal(w,s,h.round,"wrong_bottle")
    case WardPhase.Deliver if in.action == NightAction.Toss => selected(w,h,24) match
      case None => stay(s,h)
      case Some(i) if i != h.frog => reveal(w,s,h.round,"wrong_bottle")
      case Some(_) => h.round match
        case SleepRound.First => reveal(w,s,SleepRound.Second,"round_clear")
        case SleepRound.Second => reveal(w,s,SleepRound.Third,"round_clear")
        case SleepRound.Third => enter(s,h.copy(stage=WardPhase.Face),"ward_face")
    case WardPhase.Face if s.age >= 36 => enter(s,h.copy(stage=WardPhase.Exit),"ward_clear")
    case WardPhase.Exit if near(w.player,exit,18) => PuzzleTransition.Finish(s)
    case _ => stay(s,h)

  private def watch(w: NightWorld,s: PuzzleWorld,h: SleepWatch,in: NightInput): PuzzleTransition =
    val age = s.age
    val schedule = duties(h.round)
    val duty = schedule.lift(h.stabilized)
    val born = warnings(h.round).contains(age)
    val hand = if born then Some(WardHand(NightPoint(w.player.x.round.toDouble,w.player.y.round.toDouble),age))
      else h.hand.filter(hazard => age - hazard.born < 52)
    val unsafe = hand.exists(hazard => hazard.damaging(age) &&
      math.abs(w.player.x-hazard.at.x)<=12 && math.abs(w.player.y-hazard.at.y)<=12)
    if unsafe then reveal(w,s,h.round,"ward_slip")
    else if duty.exists(_.until < age) then reveal(w,s,h.round,"brace_missed")
    else if age >= h.round.length then
      enter(s,h.copy(stage=WardPhase.Check,hand=None,held=0),"wake_chime")
    else
      val gripping = in.action == NightAction.Hold && duty.exists(d => age >= d.from && near(w.player,d.at,18))
      val held = if gripping then h.held+1 else 0
      val secured = held == holdGoal
      val next = h.copy(stabilized=h.stabilized + (if secured then 1 else 0),held=if secured then 0 else held,hand=hand)
      if secured then stay(s.tell("brace_set"),next)
      else if duty.exists(_.from == age) then stay(s.tell("brace_light"),next)
      else if born then stay(s.tell("hand_warn"),next)
      else stay(s,next)

  def view(w: NightWorld,s: PuzzleWorld,h: SleepWatch): StoryView =
    val age = s.age
    val (step,objective) = h.stage match
      case WardPhase.Reveal =>
        val line = s.cue match
          case "ward_slip" => "手碰到了你的脚。地砖起雾后就离开原位。"
          case "brace_missed" => "稳压器熄了。下次走到亮杆边，持续按住左键。"
          case "wrong_bottle" => "它没有接住瓶子。再看一次真正奶蛙的位置。"
          case "round_clear" => "它喝到了。下一轮先记住奶蛙躺在哪扇窗。"
          case _ => "奶蛙睡着了。记住它躺在哪扇窗，闭帘以后盯住那一扇。"
        ("sleep_reveal",line)
      case WardPhase.Sleeping =>
        val text = if h.hand.exists(t => age-t.born < 30) then "脚下有东西。离开那块冒气的砖，继续盯住床窗。"
          else if duties(h.round).lift(h.stabilized).exists(d => age >= d.from) then "稳压杆亮了。走到灯旁，按住左键直到扣实，同时看住奶蛙的帘。"
          else "四扇帘在移动。盯住奶蛙入睡的那一扇，留意地砖与稳压灯。"
        ("sleep_watch",text)
      case WardPhase.Check => ("wake_probe", if h.doubts > 0 then "这扇窗没有回应。还可以检查一次，靠近选好的窗再按右键。"
        else "醒铃响了。走到你一路盯住的窗边，靠近后按右键弹盖核对。")
      case WardPhase.Deliver => ("wake_toss","它认出了瓶盖。记住刚才挥手的位置，走到窗边按左键递瓶。")
      case WardPhase.Face => ("ward_face","最后一瓶送到了。四扇窗同时朝你睁开。")
      case WardPhase.Exit => ("ward_exit","出货口熄了。趁门还开着，从东南门离开。")
    val people = positions(h,age).zipWithIndex.sortBy(row => screenOrder(row._1)).zipWithIndex.map {
      case ((p,id),slot) =>
        val kind = h.stage match
          case WardPhase.Reveal => if id == h.frog then "sleep_frog" else "sleep_decoy"
          case WardPhase.Sleeping => "sleep_shutter"
          case WardPhase.Deliver if id == h.frog && age < 18 => "wake_look"
          case WardPhase.Face => "ward_face"
          case _ => "wake_window"
        StoryPerson(p.x,p.y,kind,slot)
    }
    val watching = h.stage == WardPhase.Sleeping
    val active = duties(h.round).zipWithIndex.find((d,_) => watching && d.from <= age && age <= d.until)
    val secured = active.exists((_,index) => index < h.stabilized)
    val lever = active.map((d,_) => mark(d.at,if secured then "brace_on" else "brace")).toVector
    val hand = h.hand.toVector.map(t => mark(t.at,if t.damaging(age) then "hand" else "hand_warn"))
    val end = h.stage match
      case WardPhase.Face => Vector(mark(outlet,"spout"))
      case WardPhase.Exit => Vector(mark(exit,"exit"))
      case _ => Vector.empty
    val left = if h.stage == WardPhase.Reveal then h.round.length else if watching then h.round.length-age else 0
    StoryView(step,"sleepward",objective,s.cue,s.cueId,h.hand.toVector.flatMap(_.tiles(age)),people,lever++hand++end,
      age,h.round.number,left,h.round.length,if secured then holdGoal else h.held,holdGoal)
