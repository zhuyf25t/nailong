package soda.parkour

final case class Reading(cell: Cell, page: Int, ticksLeft: Int, finalSign: Boolean)

final case class Death(kind: Phase, ticks: Int):
  def prompt: Boolean = ticks >= ParkourGeometry.DeathPromptTicks

final case class Teleport(target: Cell, ticks: Int)

final case class HazardBox(x: Double, y: Double, w: Double, h: Double)

final case class Bar(x: Double, y: Double, w: Double, h: Double,
                     minY: Double, maxY: Double, step: Double, every: Int)

final case class Transition(fromLevel: Int, fromPhase: Phase, toLevel: Int, toPhase: Phase,
                            direction: Int, ticks: Int)

final case class Switch(from: Phase, to: Phase, ticks: Int)

enum Ending:
  case None, Rush, Lying, Collected

final case class Event(id: Long, kind: String, x: Double, y: Double)

final case class World(level: Int,
                       definition: RoomDef,
                       basePhase: Phase,
                       phase: Phase,
                       tick: Long,
                       player: Vec,
                       facing: Vec,
                       checkpoint: Option[Cell],
                       activeSigns: Set[Cell],
                       activeCheckpoints: Set[Cell],
                       reading: Option[Reading],
                       dead: Option[Death],
                       teleport: Option[Teleport],
                       transition: Option[Transition],
                       switch: Option[Switch],
                       creepX: Option[Double],
                       bars: Vector[Bar],
                       glitch: Option[HazardBox],
                       glitchVx: Double,
                       scary: Option[HazardBox],
                       scaryVx: Double,
                       scaryStopX: Double,
                       ending: Ending,
                       endingTicks: Int,
                       collected: Boolean,
                       events: Vector[Event],
                       nextEvent: Long,
                       pendingRemoval: Vector[(Long, Cell)],
                       enteredAt: Long,
                       triggered: Boolean,
                       toggles: Int,
                       finished: Boolean)

object ParkourWorld:
  val EventLimit: Int = 12

  def enter(definition: RoomDef, tick: Long, checkpoint: Option[Cell],
            collected: Boolean, spawnAt: Option[Vec] = None): World =
    val activeSigns = definition.signs.filterNot(_.removed).map(_.cell).toSet
    val activeCheckpoints = definition.checkpoints.filterNot(_.removed).map(_.cell).toSet
    val point = spawnAt.orElse(checkpoint.map(_.center)).getOrElse(definition.spawn.center)
    val creep = if definition.creep then Some(ParkourGeometry.Width)
    else if definition.behindHazard then Some(point.x + ParkourGeometry.CellSize)
    else None
    val removals = (definition.signs.filter(_.removed).map(_.cell) ++
      definition.checkpoints.filter(_.removed).map(_.cell)).map(cell => (tick + 4, cell))
    World(definition.level, definition, definition.phase, definition.phase, tick, point,
      Vec(if definition.phase == Phase.Warm then 1 else -1, 0),
      checkpoint, activeSigns, activeCheckpoints, None, None, None, None, None, creep,
      definition.moving.map(m => Bar(m.x, m.y, m.w, m.h, m.minY, m.maxY, m.step, m.every)),
      None, 0, None, 0, 0, Ending.None, 0, collected, Vector.empty, 1, removals, tick,
      triggered = false, toggles = 0, finished = false)

  def fresh(tick: Long = 0): World =
    enter(ParkourLevels.room(1, Phase.Warm), tick, None, collected = false)
