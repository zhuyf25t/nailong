package soda.sim

import io.circe.Json
import io.circe.syntax.*

/** The only encoder from authoritative simulation state to the v1 wire representation. */
object Wire:
  private def fighter(w: World, f: Fighter): Json = Json.obj(
    "seat" -> f.seat.index.asJson, "team" -> f.team.wire.asJson,
    "x" -> f.position.x.asJson, "y" -> f.position.y.asJson, "aimX" -> f.aim.x.asJson, "aimY" -> f.aim.y.asJson,
    "hp" -> f.hp.value.asJson, "respawnTicks" -> f.respawnTicks.asJson, "invulnTicks" -> f.invulnTicks.asJson,
    "shieldTicks" -> f.shieldTicks.asJson, "shieldCd" -> f.shieldCd.asJson, "dashCd" -> f.dashCd.asJson,
    "weapon" -> f.weapon.index.asJson, "ammo" -> f.inventory.map(_.rounds).asJson,
    "reloadTicks" -> f.magazine.loading.asJson, "kills" -> f.kills.asJson, "deaths" -> f.deaths.asJson,
    "carrying" -> w.carrying(f.seat).map(_.wire).asJson)

  private def result(value: Outcome): Json = value match
    case Outcome.Winner(s) => Json.obj("kind" -> "player".asJson, "seat" -> s.index.asJson, "team" -> Json.Null)
    case Outcome.TeamWinner(t) => Json.obj("kind" -> "team".asJson, "seat" -> Json.Null, "team" -> t.wire.asJson)
    case Outcome.Draw => Json.obj("kind" -> "draw".asJson, "seat" -> Json.Null, "team" -> Json.Null)

  def state(w: World): Json = Json.obj(
    "tick" -> w.tick.asJson, "remainingTicks" -> (Engine.timeLimit - w.tick).max(0).asJson, "mode" -> w.mode.wire.asJson,
    "fighters" -> w.fighters.map(fighter(w, _)).asJson,
    "shots" -> w.shots.map(s => Json.obj("id" -> s.id.asJson, "owner" -> s.owner.index.asJson,
      "x" -> s.position.x.asJson, "y" -> s.position.y.asJson, "dx" -> s.velocity.x.asJson,
      "dy" -> s.velocity.y.asJson, "weapon" -> s.weapon.index.asJson)).asJson,
    "pickups" -> w.pickups.map(b => Json.obj("x" -> b.position.x.asJson, "y" -> b.position.y.asJson,
      "cooldown" -> b.cooldown.asJson)).asJson,
    "flags" -> w.flags.map { f =>
      val pos = f.carrier.fold(f.home)(s => w.fighter(s).position)
      Json.obj("team" -> f.team.wire.asJson, "x" -> pos.x.asJson, "y" -> pos.y.asJson,
        "carrier" -> f.carrier.map(_.index).asJson)
    }.asJson,
    "scores" -> Json.obj("mint" -> w.scores.mint.asJson, "berry" -> w.scores.berry.asJson),
    "events" -> w.events.map(e => Json.obj("id" -> e.id.asJson, "tick" -> e.tick.asJson,
      "kind" -> e.kind.wire.asJson, "seat" -> e.seat.index.asJson, "x" -> e.point.x.asJson,
      "y" -> e.point.y.asJson, "target" -> e.target.map(_.index).asJson)).asJson,
    "result" -> w.result.map(result).asJson)
