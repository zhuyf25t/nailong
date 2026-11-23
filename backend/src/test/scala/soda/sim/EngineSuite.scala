package soda.sim

import java.nio.file.{Files, Paths}
import munit.FunSuite
import scala.compiletime.testing.typeCheckErrors

final class EngineSuite extends FunSuite:
  private val raw = Files.readString(Paths.get("../game/data/arena.json"))
  private val arena = Arena.fromJson(raw).fold(fail(_), identity)
  private val idle = Seat.values.toVector.map(_ -> Controls.idle).toMap
  private def steps(n: Int, w: World, inputs: Map[Seat, Controls] = idle): World =
    (0 until n).foldLeft(w)((current, _) => Engine.step(arena, current, inputs))
  private def place(w: World, seat: Seat, at: Vec): World = w.put(w.fighter(seat).copy(position = at, invulnTicks = 0))
  private def directHit(w: World, owner: Seat, target: Seat, weapon: Weapon): World =
    val pos = w.fighter(target).position
    steps(1, w.copy(shots = Vector(Shot(1, owner, pos - Vec(4, 0), Vec(4, 0), weapon, 10))))

  test("bounded inputs, nominal identities and one-shot edge merging") {
    assert(typeCheckErrors("val team: Team = Seat.A").nonEmpty)
    assert(typeCheckErrors("val hp: Health = 123").nonEmpty)
    assert(typeCheckErrors("val time: SimTick = Health.full").nonEmpty)
    assert(typeCheckErrors("val time: SimTick = 50").nonEmpty)
    assert(Health.from(-1).isEmpty)
    assert(Seat.fromIndex(4).isEmpty)
    assert(Weapon.fromIndex(-1).isEmpty)
    assert(Controls.from(Double.NaN,0,0,0,false,Weapon.Foam,false,false,false).isLeft)
    assert(Controls.from(0,0,4,0,false,Weapon.Foam,false,false,false).isLeft)
    val prev = Controls.idle.copy(dash = true)
    val newer = Controls.idle.copy(shield = true, weapon = Weapon.Pearl).withPending(prev)
    assert(newer.dash && newer.shield && newer.weapon == Weapon.Pearl)
    assert(!newer.withoutEdges.dash && !newer.withoutEdges.shield)
  }

  test("map rejects open borders and guides the character between both flag stands") {
    assert(Arena.fromJson(raw.replaceFirst("####", "....")).isLeft)
    val target = arena.bases(1)
    val reached = (1 to 360).foldLeft(arena.bases(0)) { (p, _) =>
      if p.distance(target) < 3 then p
      else arena.move(p, arena.pathDirection(p, target) * 2.45)
    }
    assert(reached.distance(target) < 4, s"stuck at $reached facing $target")
  }

  test("dash sweeps solid tiles and its edge cannot bypass the cooldown") {
    val initial = place(Engine.start(arena, Mode.Ffa), Seat.A, Vec(24, 24))
    val west = Controls.idle.copy(move = Vec(-1, 0), dash = true)
    val after = steps(1, initial, idle.updated(Seat.A, west))
    assert(after.fighter(Seat.A).position.x >= 21.0)
    assertEquals(after.fighter(Seat.A).dashCd, 60)
    val again = steps(1, after, idle.updated(Seat.A, west))
    assertEquals(again.fighter(Seat.A).dashCd, 59)
    assertEquals(again.events.count(_.kind == Cue.Dash), 1)
  }

  test("wall blocks projectile, friendly fire and spawn protection are enforced") {
    val w = Engine.start(arena, Mode.Ctf)
    val wallShot = Shot(1, Seat.A, Vec(22,24), Vec(-7,0), Weapon.Pearl, 10)
    assert(steps(1, w.copy(shots = Vector(wallShot))).shots.isEmpty)
    assertEquals(directHit(w, Seat.A, Seat.B, Weapon.Pearl).fighter(Seat.B).hp.value, 100)
    val vulnerableFriend = place(w, Seat.C, w.fighter(Seat.C).position)
    assertEquals(directHit(vulnerableFriend, Seat.A, Seat.C, Weapon.Foam).fighter(Seat.C).hp.value, 100)
  }

  test("weapon slot magazines reload independently; spread uses one round for three pellets") {
    val w = place(Engine.start(arena, Mode.Ffa), Seat.A, Vec(120,24))
    val fire = Controls.idle.copy(aim = Vec(1,0), weapon = Weapon.Star, fire = true)
    val shot = steps(1, w, idle.updated(Seat.A, fire))
    assertEquals(shot.shots.size, 3)
    assertEquals(shot.fighter(Seat.A).magazine.rounds, 3)
    assertEquals(shot.fighter(Seat.A).inventory(0).rounds, 12)
    val loading = steps(1, shot, idle.updated(Seat.A, fire.copy(fire = false, reload = true)))
    assertEquals(loading.fighter(Seat.A).magazine.loading, 28)
    val complete = steps(28, loading)
    assertEquals(complete.fighter(Seat.A).inventory(1).rounds, 4)
  }

  test("shield reduces damage, a defeated carrier returns the flag, then respawns with protection") {
    val base = Engine.start(arena, Mode.Ctf)
    val stolen = steps(1, place(base, Seat.B, arena.bases(0)))
    assertEquals(stolen.carrying(Seat.B), Some(Team.Mint))
    val shielded = steps(1, stolen, idle.updated(Seat.B, Controls.idle.copy(shield = true)))
    val bounced = directHit(shielded, Seat.A, Seat.B, Weapon.Pearl)
    assertEquals(bounced.fighter(Seat.B).hp.value, 88)
    val weak = bounced.put(bounced.fighter(Seat.B).copy(hp = Health.from(1).get, shieldTicks = 0))
    val gone = directHit(weak, Seat.A, Seat.B, Weapon.Pearl)
    assertEquals(gone.fighter(Seat.B).respawnTicks, 40)
    assertEquals(gone.fighter(Seat.A).kills, 1)
    assert(gone.carrying(Seat.B).isEmpty)
    assertEquals(gone.events.count(_.kind == Cue.Return), 1)
    val revived = steps(40, gone)
    assertEquals(revived.fighter(Seat.B).hp.value, 100)
    assertEquals(revived.fighter(Seat.B).invulnTicks, 25)
  }

  test("bottles wait for an injured competitor, heal once and recharge after ten seconds") {
    val w = Engine.start(arena, Mode.Ffa)
    val entered = steps(1, place(w, Seat.A, arena.pickups.head))
    assertEquals(entered.pickups.head.cooldown, 0)
    val f = entered.fighter(Seat.A)
    val healed = steps(1, entered.put(f.copy(hp = Health.from(35).get)))
    assertEquals(healed.fighter(Seat.A).hp.value, 75)
    assertEquals(healed.pickups.head.cooldown, 200)
    val waiting = steps(199, healed)
    assertEquals(waiting.pickups.head.cooldown, 1)
    assertEquals(steps(1, waiting).fighter(Seat.A).hp.value, 100)
  }

  test("a flag can only be banked with the home flag present; two captures end the match once") {
    val w = Engine.start(arena, Mode.Ctf)
    val stolen = steps(1, place(w, Seat.A, arena.bases(1)))
    val doubleSteal = steps(1, place(stolen, Seat.B, arena.bases(0)))
    val waiting = steps(1, place(doubleSteal, Seat.A, arena.bases(0)))
    assertEquals(waiting.scores.mint, 0)
    val score = steps(1, place(stolen.copy(scores = Scores(1, 0)), Seat.A, arena.bases(0)))
    assertEquals(score.result, Some(Outcome.TeamWinner(Team.Mint)))
    assertEquals(steps(10, score), score)
    assertEquals(score.result.map(_.forSeat(Seat.D)), Some(Verdict.Loss))
  }

  test("timeout ties are explicit and FFA reaching eight pops awards the winner") {
    val w = Engine.start(arena, Mode.Ffa)
    assertEquals(steps(1, w.copy(clock = SimTick.from(2399).get)).result, Some(Outcome.Draw))
    val ahead = w.put(w.fighter(Seat.A).copy(kills = 7))
    val low = ahead.put(ahead.fighter(Seat.B).copy(hp = Health.from(2).get, invulnTicks = 0))
    assertEquals(directHit(low, Seat.A, Seat.B, Weapon.Foam).result, Some(Outcome.Winner(Seat.A)))
  }

  test("four autonomous seats navigate and finish full real-map CTF and FFA rounds deterministically") {
    Mode.values.foreach { mode =>
      val states = Iterator.iterate(Engine.start(arena, mode))(w => Engine.step(arena, w, Map.empty))
        .take(Engine.timeLimit + 1).takeWhile(_.result.isEmpty).toVector
      val last = Engine.step(arena, states.last, Map.empty)
      assert(last.result.nonEmpty)
      assert(states.forall(w => w.fighters.forall(f => arena.clear(f.position, Engine.radius))))
      assert(states.exists(_.events.exists(_.kind == Cue.Pop)))
      if mode == Mode.Ctf then
        assert(states.exists(_.events.exists(_.kind == Cue.Take)), "AI failed to steal a flag")
        assert(last.scores.mint + last.scores.berry > 0, s"AI failed to return any flag: ${last.scores}")
      assertEquals(steps(last.tick, Engine.start(arena, mode), Map.empty), last)
      println(s"$mode finished after ${last.tick} ticks; score=${last.scores}, pops=${last.fighters.map(_.kills)}, result=${last.result}")
    }
  }
