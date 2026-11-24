package soda.parkour

import io.circe.Json

object ParkourWire:
  private def point(at: Vec): Json = Json.obj("x" -> Json.fromDoubleOrNull(at.x), "y" -> Json.fromDoubleOrNull(at.y))
  private def cell(at: Cell): Json = Json.arr(Json.fromInt(at.col), Json.fromInt(at.row))
  private def cells(values: Set[Cell]): Json = Json.fromValues(values.toVector.sortBy(c => (c.row, c.col)).map(cell))

  private def signJson(sign: SignDef): Json = Json.obj(
    "cell" -> cell(sign.cell),
    "pages" -> Json.fromValues(sign.pages.map(Json.fromString)),
    "removed" -> Json.fromBoolean(sign.removed),
    "final" -> Json.fromBoolean(sign.finalSign)
  )

  private def roomJson(room: RoomDef): Json = Json.obj(
    "level" -> Json.fromInt(room.level),
    "phase" -> Json.fromString(Phase.wire(room.phase)),
    "walls" -> cells(room.walls),
    "hazards" -> cells(room.hazards),
    "signs" -> Json.fromValues(room.signs.map(signJson)),
    "checkpoints" -> Json.fromValues(room.checkpoints.map(c => Json.obj("cell" -> cell(c.cell),
      "removed" -> Json.fromBoolean(c.removed)))),
    "mushroom" -> room.mushroom.fold(Json.Null)(cell),
    "spawn" -> cell(room.spawn),
    "exit" -> cell(room.exit),
    "creep" -> Json.fromBoolean(room.creep),
    "behind" -> Json.fromBoolean(room.behindHazard),
    "moving" -> Json.fromValues(room.moving.map(m => Json.obj(
      "x" -> Json.fromDoubleOrNull(m.x), "y" -> Json.fromDoubleOrNull(m.y),
      "w" -> Json.fromDoubleOrNull(m.w), "h" -> Json.fromDoubleOrNull(m.h),
      "minY" -> Json.fromDoubleOrNull(m.minY), "maxY" -> Json.fromDoubleOrNull(m.maxY),
      "step" -> Json.fromDoubleOrNull(m.step), "every" -> Json.fromInt(m.every)))),
    "script" -> Json.fromString(room.script.toString)
  )

  def rooms: Json = Json.fromValues(ParkourLevels.rooms.map(roomJson))

  private def eventJson(event: Event): Json = Json.obj(
    "id" -> Json.fromLong(event.id), "kind" -> Json.fromString(event.kind),
    "x" -> Json.fromDoubleOrNull(event.x), "y" -> Json.fromDoubleOrNull(event.y))

  private def box(at: HazardBox): Json = Json.obj(
    "x" -> Json.fromDoubleOrNull(at.x), "y" -> Json.fromDoubleOrNull(at.y),
    "w" -> Json.fromDoubleOrNull(at.w), "h" -> Json.fromDoubleOrNull(at.h))

  def snapshot(world: World, runId: String, ack: Long): Json =
    val reading = world.reading.map(r => Json.obj(
      "cell" -> cell(r.cell), "page" -> Json.fromInt(r.page),
      "ticksLeft" -> Json.fromInt(r.ticksLeft), "final" -> Json.fromBoolean(r.finalSign)))
    val dead = world.dead.map(d => Json.obj(
      "kind" -> Json.fromString(Phase.wire(d.kind)), "ticks" -> Json.fromInt(d.ticks),
      "prompt" -> Json.fromBoolean(d.prompt)))
    val teleport = world.teleport.map(t => Json.obj(
      "target" -> cell(t.target), "x" -> Json.fromDoubleOrNull(t.target.center.x),
      "y" -> Json.fromDoubleOrNull(t.target.center.y), "ticks" -> Json.fromInt(t.ticks)))
    val transition = world.transition.map(t => Json.obj(
      "fromLevel" -> Json.fromInt(t.fromLevel), "fromPhase" -> Json.fromString(Phase.wire(t.fromPhase)),
      "toLevel" -> Json.fromInt(t.toLevel), "toPhase" -> Json.fromString(Phase.wire(t.toPhase)),
      "direction" -> Json.fromInt(t.direction), "ticks" -> Json.fromInt(t.ticks),
      "total" -> Json.fromInt(ParkourGeometry.TransitionTicks)))
    val switching = world.switch.map(s => Json.obj(
      "from" -> Json.fromString(Phase.wire(s.from)), "to" -> Json.fromString(Phase.wire(s.to)),
      "ticks" -> Json.fromInt(s.ticks), "total" -> Json.fromInt(ParkourGeometry.SwitchTicks)))
    Json.obj(
      "runId" -> Json.fromString(runId),
      "ack" -> Json.fromLong(ack),
      "tick" -> Json.fromLong(world.tick),
      "level" -> Json.fromInt(world.level),
      "phase" -> Json.fromString(Phase.wire(world.phase)),
      "layout" -> Json.fromString(Phase.wire(world.definition.phase)),
      "player" -> point(world.player),
      "facing" -> point(world.facing),
      "checkpoint" -> world.checkpoint.fold(Json.Null)(c => point(c.center)),
      "reading" -> reading.fold(Json.Null)(identity),
      "dead" -> dead.fold(Json.Null)(identity),
      "teleport" -> teleport.fold(Json.Null)(identity),
      "transition" -> transition.fold(Json.Null)(identity),
      "switch" -> switching.fold(Json.Null)(identity),
      "creepX" -> world.creepX.fold(Json.Null)(Json.fromDoubleOrNull),
      "bars" -> Json.fromValues(world.bars.map(bar => box(HazardBox(bar.x, bar.y, bar.w, bar.h)))),
      "glitch" -> world.glitch.fold(Json.Null)(box),
      "scary" -> world.scary.fold(Json.Null)(box),
      "ending" -> Json.fromString(world.ending.toString.toLowerCase),
      "collected" -> Json.fromBoolean(world.collected),
      "events" -> Json.fromValues(world.events.map(eventJson))
    )

  def start(world: World, runId: String): Json = Json.obj(
    "runId" -> Json.fromString(runId),
    "rooms" -> rooms,
    "view" -> snapshot(world, runId, -1)
  )
