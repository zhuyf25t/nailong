package soda.night

import io.circe.Json
import java.util.UUID

object NightWire:
  def snapshot(world: NightWorld, runId: UUID, ack: Long, paused: Boolean = false): Json =
    val serving = world.stage match
      case stage: ShiftStage.Serving if world.puzzle.isEmpty => Some(stage)
      case _ => None
    val chase = world.stage match
      case stage: ShiftStage.Escaping => Some(stage)
      case _ => None
    val gesture = serving.flatMap(_.gesture)
    val visible = gesture.filter(_.visible(world.tick))
    val windows = world.night.windows.map { slot =>
      val direction = visible.map(g => world.looks(slot,g.direction))
      Json.obj("slot" -> Json.fromInt(slot.index), "actor" -> Json.fromString(world.actor),
        "look" -> Json.fromString(direction.fold("still")(_.wire)))
    }
    val bottle = serving.flatMap(_.bottle).fold(Json.Null) { b =>
      Json.obj("x" -> Json.fromDoubleOrNull(b.at.x), "y" -> Json.fromDoubleOrNull(b.at.y),
        "vx" -> Json.fromDoubleOrNull(b.vx), "vy" -> Json.fromDoubleOrNull(b.vy),
        "bounced" -> Json.fromBoolean(b.bounced))
    }
    val story = world.puzzle.fold(FactoryFloor.view(world))(StoryPuzzles.view(world,_))
    Json.obj(
      "runId" -> Json.fromString(runId.toString), "ack" -> Json.fromLong(ack), "tick" -> Json.fromInt(world.tick),
      "paused" -> Json.fromBoolean(paused),
      "night" -> Json.fromInt(world.night.value), "order" -> Json.fromInt(world.order), "phase" -> Json.fromString(world.phase.wire),
      "player" -> Json.obj("x" -> Json.fromDoubleOrNull(world.player.x), "y" -> Json.fromDoubleOrNull(world.player.y)),
      "windows" -> Json.fromValues(windows), "memory" -> Json.fromString(world.memory.wire),
      "probe" -> Json.fromString(gesture.fold("none")(_.direction.wire)),
      "probeTicks" -> Json.fromInt(visible.fold(0)(_.expires - world.tick)),
      "pressure" -> Json.fromInt(serving.flatMap(_.pressure).getOrElse(-1)),
      "bank" -> Json.fromBoolean(world.bank), "dim" -> Json.fromBoolean(world.dim), "belt" -> Json.fromInt(world.belt),
      "lever" -> Json.fromString(world.lever.wire), "latched" -> Json.fromBoolean(chase.exists(_.latched)),
      "escapeTicks" -> Json.fromInt(chase.fold(0)(_.ticks)), "bottle" -> bottle,
      "chase" -> chase.fold(Json.Null)(s => Json.obj("x" -> Json.fromDoubleOrNull(s.hunter.x), "y" -> Json.fromDoubleOrNull(s.hunter.y))),
      "event" -> Json.fromString(world.event.wire), "eventId" -> Json.fromLong(world.eventId),
      "delivered" -> Json.fromInt(world.delivered),"story" -> story.json)
