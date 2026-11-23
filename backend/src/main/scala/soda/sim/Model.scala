package soda.sim

enum Team(val wire: String):
  case Mint extends Team("mint")
  case Berry extends Team("berry")
  def other: Team = if this == Mint then Berry else Mint

enum Seat(val team: Team):
  case A extends Seat(Team.Mint)
  case B extends Seat(Team.Berry)
  case C extends Seat(Team.Mint)
  case D extends Seat(Team.Berry)
  def index: Int = ordinal

object Seat:
  def fromIndex(n: Int): Option[Seat] = values.lift(n)

enum Mode(val wire: String):
  case Ffa extends Mode("ffa")
  case Ctf extends Mode("ctf")

enum Verdict(val wire: String):
  case Win extends Verdict("win")
  case Loss extends Verdict("loss")
  case Draw extends Verdict("draw")

enum Outcome:
  case Winner(seat: Seat)
  case TeamWinner(team: Team)
  case Draw
  def forSeat(seat: Seat): Verdict = this match
    case Winner(winner) => if seat == winner then Verdict.Win else Verdict.Loss
    case TeamWinner(team) => if seat.team == team then Verdict.Win else Verdict.Loss
    case Draw => Verdict.Draw

enum Weapon(val capacity: Int, val damage: Int, val interval: Int, val loadTime: Int,
            val speed: Double, val lifetime: Int, val angles: Vector[Double]):
  case Foam extends Weapon(12, 14, 5, 20, 6.6, 46, Vector(0.0))
  case Star extends Weapon(4, 11, 12, 28, 6.2, 20, Vector(-0.145, 0.0, 0.145))
  case Pearl extends Weapon(3, 38, 17, 32, 4.0, 60, Vector(0.0))
  def index: Int = ordinal

object Weapon:
  def fromIndex(n: Int): Option[Weapon] = values.lift(n)

final case class Vec(x: Double, y: Double):
  def +(v: Vec): Vec = Vec(x + v.x, y + v.y)
  def -(v: Vec): Vec = Vec(x - v.x, y - v.y)
  def *(d: Double): Vec = Vec(x * d, y * d)
  def length: Double = math.hypot(x, y)
  def unit: Vec = if length < 0.000001 then Vec.zero else this * (1.0 / length)
  def rotate(radians: Double): Vec =
    Vec(x * math.cos(radians) - y * math.sin(radians), x * math.sin(radians) + y * math.cos(radians))
  def distance(v: Vec): Double = (this - v).length

object Vec:
  val zero: Vec = Vec(0, 0)

final case class Controls private[sim] (move: Vec, aim: Vec, fire: Boolean, weapon: Weapon,
                                       reload: Boolean, dash: Boolean, shield: Boolean):
  def withoutEdges: Controls = copy(reload = false, dash = false, shield = false)
  def released: Controls = Controls.idle.copy(weapon = weapon)
  def withPending(previous: Controls): Controls =
    copy(reload = reload || previous.reload, dash = dash || previous.dash, shield = shield || previous.shield)

object Controls:
  val idle: Controls = Controls(Vec.zero, Vec.zero, false, Weapon.Foam, false, false, false)
  def from(moveX: Double, moveY: Double, aimX: Double, aimY: Double, fire: Boolean,
           weapon: Weapon, reload: Boolean, dash: Boolean, shield: Boolean): Either[String, Controls] =
    Either.cond(Vector(moveX, moveY, aimX, aimY).forall(d => d.isFinite && d.abs <= 1),
      Controls(Vec(moveX, moveY).unit, Vec(aimX, aimY).unit, fire, weapon, reload, dash, shield),
      "Directions must contain finite components between -1 and 1")

opaque type Health = Int
object Health:
  val full: Health = 100
  def from(n: Int): Option[Health] = Option.when(n >= 0 && n <= 100)(n)
  extension (h: Health)
    def value: Int = h
    def damaged(by: Int): Health = (h - by.max(0)).max(0)
    def healed(by: Int): Health = (h.toLong + by.max(0)).min(100).toInt

opaque type SimTick = Int
object SimTick:
  val start: SimTick = 0
  def from(n: Int): Option[SimTick] = Option.when(n >= 0 && n <= Engine.timeLimit)(n)
  extension (t: SimTick)
    def value: Int = t
    def next: SimTick = (t + 1).min(Engine.timeLimit)

final case class Magazine private (weapon: Weapon, rounds: Int, loading: Int):
  def advance: Magazine =
    if loading == 1 then Magazine.full(weapon)
    else if loading > 1 then copy(loading = loading - 1)
    else this
  def startReload: Magazine =
    if loading == 0 && rounds < weapon.capacity then copy(loading = weapon.loadTime) else this
  def consume: Option[Magazine] =
    Option.when(loading == 0 && rounds > 0)(copy(rounds = rounds - 1))

object Magazine:
  def full(weapon: Weapon): Magazine = Magazine(weapon, weapon.capacity, 0)
  def inventory: Vector[Magazine] = Weapon.values.toVector.map(full)

final case class Fighter private[sim] (seat: Seat, position: Vec, aim: Vec, hp: Health,
    respawnTicks: Int, invulnTicks: Int, shieldTicks: Int, shieldCd: Int, dashCd: Int,
    weapon: Weapon, inventory: Vector[Magazine], fireLock: Int, kills: Int, deaths: Int):
  def team: Team = seat.team
  def alive: Boolean = hp.value > 0
  def magazine: Magazine = inventory(weapon.index)
  def setMagazine(m: Magazine): Fighter = copy(inventory = inventory.updated(m.weapon.index, m))

object Fighter:
  private[sim] def spawn(seat: Seat, at: Vec, kills: Int = 0, deaths: Int = 0): Fighter =
    val aim = if seat.team == Team.Mint then Vec(1, 0) else Vec(-1, 0)
    Fighter(seat, at, aim, Health.full, 0, 25, 0, 0, 0, Weapon.Foam, Magazine.inventory, 0, kills, deaths)

final case class Shot(id: Int, owner: Seat, position: Vec, velocity: Vec, weapon: Weapon, life: Int)
final case class Bottle(position: Vec, cooldown: Int)
final case class Flag(team: Team, home: Vec, carrier: Option[Seat])
final case class Scores(mint: Int, berry: Int):
  def add(team: Team): Scores = team match
    case Team.Mint => copy(mint = mint + 1)
    case Team.Berry => copy(berry = berry + 1)

enum Cue(val wire: String):
  case Fire extends Cue("fire")
  case Hit extends Cue("hit")
  case Pop extends Cue("pop")
  case Respawn extends Cue("respawn")
  case Dash extends Cue("dash")
  case Shield extends Cue("shield")
  case Heal extends Cue("heal")
  case Take extends Cue("take")
  case Return extends Cue("return")
  case Capture extends Cue("capture")
  case Reload extends Cue("reload")

final case class GameEvent(id: Int, tick: Int, kind: Cue, seat: Seat, point: Vec, target: Option[Seat])
final case class World private[sim] (clock: SimTick, mode: Mode, fighters: Vector[Fighter], shots: Vector[Shot],
    pickups: Vector[Bottle], flags: Vector[Flag], scores: Scores, events: Vector[GameEvent], result: Option[Outcome]):
  def tick: Int = clock.value
  def fighter(seat: Seat): Fighter = fighters(seat.index)
  def carrying(seat: Seat): Option[Team] = flags.find(_.carrier.contains(seat)).map(_.team)
  private[sim] def put(f: Fighter): World = copy(fighters = fighters.updated(f.seat.index, f))
  private[sim] def emit(kind: Cue, seat: Seat, point: Vec, target: Option[Seat] = None): World =
    val id = events.lastOption.fold(tick * 256)(e => if e.tick == tick then e.id + 1 else tick * 256)
    copy(events = events :+ GameEvent(id, tick, kind, seat, point, target))
