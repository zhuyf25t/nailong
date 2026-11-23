package soda.night

opaque type NightLevel = Int

object NightLevel:
  def from(number: Int): Option[NightLevel] = Option.when(number >= 1 && number <= 8)(number)
  extension (level: NightLevel)
    def value: Int = level
    def windows: Vector[WindowSlot] =
      if level == 1 then Vector(WindowSlot.Center)
      else if level <= 4 then Vector(WindowSlot.West, WindowSlot.East)
      else WindowSlot.values.toVector
    def seconds: Option[Int] = Vector(None, Some(52), Some(47), Some(52), Some(44), Some(40), Some(38), Some(36))(level - 1)
    def requiresBank(order: Int): Boolean = (level == 4 && order >= 2) || (level == 8 && order == 3)
    def fogDelay: Int = if level < 3 then 0 else if level == 3 || level == 8 then 12 else 8

enum WindowSlot(val index: Int, val x: Double):
  case West extends WindowSlot(0, 104)
  case Center extends WindowSlot(1, 240)
  case East extends WindowSlot(2, 376)

enum Direction(val wire: String):
  case Left extends Direction("left")
  case Right extends Direction("right")

enum NightPhase(val wire: String):
  case Serving extends NightPhase("serving")
  case Escaping extends NightPhase("escaping")
  case Clockout extends NightPhase("clockout")
  case Won extends NightPhase("won")
  case Escaped extends NightPhase("escaped")
  case Lost extends NightPhase("lost")

enum NightAction:
  case Idle, Probe, Toss, Pause, Resume

final case class NightPoint(x: Double, y: Double):
  def distance(other: NightPoint): Double = math.hypot(x - other.x, y - other.y)

final class NightInput private (val mx: Double, val my: Double, val ax: Double, val ay: Double, val action: NightAction):
  def withoutAction: NightInput = new NightInput(mx, my, ax, ay, NightAction.Idle)

object NightInput:
  val idle: NightInput = new NightInput(0, 0, 0, -1, NightAction.Idle)
  def from(mx: Double, my: Double, ax: Double, ay: Double, action: String): Option[NightInput] =
    val edge = action match
      case "none" => Some(NightAction.Idle)
      case "probe" => Some(NightAction.Probe)
      case "throw" => Some(NightAction.Toss)
      case "pause" => Some(NightAction.Pause)
      case "resume" => Some(NightAction.Resume)
      case _ => None
    edge.filter(_ => Vector(mx, my, ax, ay).forall(n => n.isFinite && math.abs(n) <= 1.0))
      .map(new NightInput(mx, my, ax, ay, _))

enum NightEvent(val wire: String):
  case Start extends NightEvent("start")
  case Probe extends NightEvent("probe")
  case Throw extends NightEvent("throw")
  case Bounce extends NightEvent("bounce")
  case Miss extends NightEvent("miss")
  case Blocked extends NightEvent("blocked")
  case Deliver extends NightEvent("deliver")
  case Intruder extends NightEvent("intruder")
  case Lever extends NightEvent("lever")
  case Escape extends NightEvent("escape")
  case Lost extends NightEvent("lost")
  case Clockout extends NightEvent("clockout")
  case Won extends NightEvent("won")

private[night] final case class Bottle(at: NightPoint, vx: Double, vy: Double, bounced: Boolean)
private[night] final case class Gesture(direction: Direction, reveal: Int, expires: Int):
  def visible(tick: Int): Boolean = reveal <= tick && tick < expires

private[night] enum ShiftStage:
  case Serving(pressure: Option[Int], lastProbe: Option[Direction], gesture: Option[Gesture], bottle: Option[Bottle], pristine: Boolean)
  case Escaping(ticks: Int, latched: Boolean, hunter: NightPoint, risesUntil: Int)
  case Clockout, Won, Escaped, Lost

final case class NightWorld private[night] (
    night: NightLevel,
    private[night] val seed: Long,
    tick: Int,
    delivered: Int,
    clean: Int,
    player: NightPoint,
    memory: Direction,
    private[night] val stage: ShiftStage,
    event: NightEvent,
    eventId: Long
):
  def phase: NightPhase = stage match
    case _: ShiftStage.Serving => NightPhase.Serving
    case _: ShiftStage.Escaping => NightPhase.Escaping
    case ShiftStage.Clockout => NightPhase.Clockout
    case ShiftStage.Won => NightPhase.Won
    case ShiftStage.Escaped => NightPhase.Escaped
    case ShiftStage.Lost => NightPhase.Lost

  def order: Int = (delivered + 1).min(3)
  def bank: Boolean = night.requiresBank(order)
  def dim: Boolean = (night.value == 6 || night.value == 8) && tick % 140 >= 88 && tick % 140 < 122
  def belt: Int =
    if night.value < 7 || phase != NightPhase.Serving then 0
    else if (tick / 96 + order) % 2 == 0 then 1 else -1

  // SplitMix64 finalizer gives independent, reproducible draws without a mutable RNG.
  private def draw(salt: Long, choices: Int): Int =
    val key = seed + 0x9e3779b97f4a7c15L * (order.toLong * 8 + salt)
    val a = (key ^ (key >>> 30)) * 0xbf58476d1ce4e5b9L
    val b = (a ^ (a >>> 27)) * 0x94d049bb133111ebL
    Math.floorMod(b ^ (b >>> 31), choices.toLong).toInt

  private[night] def recipient: WindowSlot = night.windows(draw(1, night.windows.size))
  def actor: String = if (order + night.value) % 2 == 0 then "frog" else "egg"
  def lever: Direction = if draw(2, 2) == 0 then Direction.Left else Direction.Right
  private[night] def emit(cue: NightEvent): NightWorld = copy(event = cue, eventId = eventId + 1)
