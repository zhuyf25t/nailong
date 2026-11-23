package soda.night

import io.circe.Json
import java.util.UUID
import munit.FunSuite
import scala.compiletime.testing.typeCheckErrors

final class NightEngineSuite extends FunSuite:
  private val id = UUID.fromString("12345678-0000-0000-0000-000000000001")
  private val targets = Vector(104.0, 240.0, 376.0)
  private def make(n: Int, seed: Long = 61): NightWorld = NightEngine.start(NightLevel.from(n).get, seed)
  private def packet(mx: Double = 0, my: Double = 0, ax: Double = 0, ay: Double = -1, edge: String = "none"): NightInput =
    NightInput.from(mx, my, ax, ay, edge).get
  private def advance(w: NightWorld, count: Int, sample: NightInput = NightInput.idle): NightWorld =
    (0 until count).foldLeft(w)((next, _) => NightEngine.step(next, sample))
  private def wire(w: NightWorld): Json = NightWire.snapshot(w, id, 0)
  private def windows(w: NightWorld): Vector[(Int, String)] = wire(w).hcursor.get[Vector[Json]]("windows").toOption.get.map { j =>
    (j.hcursor.get[Int]("slot").toOption.get, j.hcursor.get[String]("look").toOption.get)
  }
  private def inspect(w: NightWorld): (NightWorld, Int) =
    val last = wire(w).hcursor.get[String]("memory").toOption.get
    val direction = if last == "left" then "right" else "left"
    val probe = packet(ax = if direction == "left" then -1 else 1, edge = "probe")
    val showing = advance(NightEngine.step(w, probe), 12)
    val responding = windows(showing).collect { case (slot, look) if look == direction => slot }
    if w.night.value == 5 then
      val opposite = if direction == "left" then "right" else "left"
      val second = advance(NightEngine.step(showing,packet(ax = -probe.ax,edge="probe")),12)
      val both = responding.intersect(windows(second).collect { case (slot,look) if look == opposite => slot })
      assertEquals(responding.size,2)
      assertEquals(both.size,1)
      (second,both.head)
    else
      assertEquals(responding.size, 1)
      (showing, responding.head)

  private def fire(w: NightWorld, x: Double, y: Double): Vector[NightWorld] =
    val dx = x - w.player.x
    val dy = y - w.player.y
    val distance = math.hypot(dx, dy)
    val fired = NightEngine.step(w, packet(ax = dx / distance, ay = dy / distance, edge = "throw"))
    val frames = Iterator.iterate(fired)(NightEngine.step(_, NightInput.idle)).take(130)
      .takeWhile(next => wire(next).hcursor.downField("bottle").focus.exists(!_.isNull)).toVector
    frames :+ frames.lastOption.fold(fired)(NightEngine.step(_, NightInput.idle))
  private def deliver(w: NightWorld, wall: Direction = Direction.Left): NightWorld =
    val (showing, slot) = inspect(w)
    val x = if !showing.bank then targets(slot)
      else 2 * (if wall == Direction.Left then 12 else 468) - targets(slot)
    val result = fire(showing, x, 78)
    if showing.bank then assert(result.exists(_.event == NightEvent.Bounce))
    assertEquals(result.last.delivered, w.delivered + 1)
    result.last
  private def walk(w: NightWorld, destination: NightPoint, within: Double): NightWorld =
    def step(next: NightWorld): NightWorld =
      val dx = destination.x - next.player.x
      val dy = destination.y - next.player.y
      val length = math.hypot(dx, dy)
      NightEngine.step(next, packet(mx = dx / length, my = dy / length))
    Iterator.iterate(w)(step).take(160).find(_.player.distance(destination) <= within)
      .getOrElse(fail(s"failed to reach $destination"))

  test("night number, actions and wire input require checked constructors") {
    assert(typeCheckErrors("val night: NightLevel = 4").nonEmpty)
    assert(typeCheckErrors("val phase: NightPhase = NightAction.Toss").nonEmpty)
    assert(typeCheckErrors("new NightInput(0,0,1,0,NightAction.Probe)").nonEmpty)
    assert(NightLevel.from(-1).isEmpty && NightLevel.from(9).isEmpty)
    assert(NightInput.from(0, 0, Double.NaN, 1, "probe").isEmpty)
    assert(NightInput.from(0, Double.PositiveInfinity, 0, 1, "throw").isEmpty)
    assert(NightInput.from(-1.001, 0, 0, 1, "none").isEmpty)
    assert(NightInput.from(0, 0, 0, 1, "mark_delivered").isEmpty)
    assertEquals(packet(edge = "probe").withoutAction.action, NightAction.Idle)
  }

  test("probes follow current versus last order, including fog delay, expiry and repeated direction") {
    val w = walk(make(3),NightPoint(240,154),2)
    val initial = windows(w)
    assertEquals(initial, Vector(0 -> "still", 2 -> "still"))
    val matchMemory = advance(NightEngine.step(w, packet(ax = -1, edge = "probe")), 12)
    assertEquals(windows(matchMemory).map(_._2), Vector("left", "left"))
    val reveal = NightEngine.step(matchMemory, packet(ax = 1, edge = "probe"))
    assert(windows(advance(reveal, 11)).forall(_._2 == "still"))
    val visible = advance(reveal, 12)
    assertEquals(windows(visible).map(_._2).sorted, Vector("left", "right"))
    assertEquals(wire(visible).hcursor.get[Int]("probeTicks").toOption, Some(40))
    val real = windows(visible).collectFirst { case (slot,"right") => slot }.get
    val expired = advance(visible, 40)
    assert(windows(expired).forall(_._2 == "still"))
    val next = fire(expired, targets(real), 78).last
    assertEquals(next.memory, Direction.Right)
    assert(windows(next).forall(_._2 == "still"))
    assert(!wire(visible).noSpaces.contains("recipient"))
    assert(!wire(visible).noSpaces.contains("seed"))
  }

  test("clock, window, lighting and movement curves follow all eight briefs") {
    val pressures = Vector(-1, 1040, 940, 1040, 880, 800, -1, -1)
    val counts = Vector(1, 2, 2, 2, 3, 3, 3, 3)
    (1 to 8).foreach { n =>
      val w = make(n)
      assertEquals(wire(w).hcursor.get[Int]("pressure").toOption.get, pressures(n - 1))
      assertEquals(windows(w).size, counts(n - 1))
      assertEquals(advance(w, 100).dim, n == 6)
      assertEquals(advance(w, 130).dim, false)
      if n < 7 then assertEquals(advance(w, 5).player, w.player)
      else assert(w.puzzle.nonEmpty)
    }
    assertEquals(advance(make(1), 3000).phase, NightPhase.Serving)
    assertEquals(advance(make(1), 200, packet(mx = 1, my = -1)).player, NightPoint(464, 98))
    assertEquals(advance(make(1), 200, packet(mx = -1, my = 1)).player, NightPoint(16, 267))
    assertEqualsDouble(NightEngine.step(make(1), packet(mx = 1, my = 1)).player.distance(make(1).player), 4.0, 1e-8)
  }

  test("off-window and second-wall shots return an empty hand; rails accept only genuine side-wall trajectories") {
    val tutorial = make(1)
    assertEquals(fire(tutorial, 460, 78).last.event, NightEvent.Miss)
    assertEquals(fire(tutorial, 240, 280).last.event, NightEvent.Miss)
    val horizontal = fire(tutorial, 0, 220)
    assert(horizontal.exists(_.event == NightEvent.Bounce))
    assertEquals(horizontal.last.event, NightEvent.Miss)
    val next = walk(deliver(make(4)),NightPoint(240,174),2.1)
    assert(next.bank)
    val (showing, slot) = inspect(next)
    val blocked = fire(showing, targets(slot), 78).last
    assertEquals(blocked.event, NightEvent.Blocked)
    assertEquals(blocked.delivered, 1)
    val correct = deliver(blocked, Direction.Left)
    assertEquals(correct.clean, 1)
    val closing = deliver(correct, Direction.Right)
    assertEquals(closing.phase, NightPhase.Clockout)
    assertEquals(closing.clean, 2)
  }

  test("wrong delivery or pressure zero releases intruder; exiting before latching cannot win") {
    val (showing, slot) = inspect(make(2))
    val wrong = fire(showing, targets(if slot == 0 then 2 else 0), 78).last
    assertEquals(wrong.phase, NightPhase.Escaping)
    assertEquals(wrong.event, NightEvent.Intruder)
    val premature = walk(wrong, NightPoint(240,260), 20)
    assertEquals(premature.phase, NightPhase.Escaping)
    val toPanel = walk(premature, NightPoint(if wrong.lever == Direction.Left then 46 else 434, 220), 15)
    assertEquals(wire(toPanel).hcursor.get[Boolean]("latched").toOption, Some(true))
    val safe = walk(toPanel, NightPoint(240,260), 23)
    assertEquals(safe.phase, NightPhase.Escaped)
    assertEquals(advance(safe, 20), safe)
    val timedOut = advance(make(6), 800)
    assertEquals(timedOut.phase, NightPhase.Escaping)
    val failed = advance(timedOut, 200)
    assertEquals(failed.phase, NightPhase.Lost)
    assertEquals(advance(failed, 30), failed)
  }

  test("five delivery nights can finish on playable paths, and the sixth changes rooms after two bottles") {
    (1 to 5).foreach { n =>
      val start = if n == 3 then walk(make(n),NightPoint(240,154),2) else make(n)
      val atDoor = (1 to 3).foldLeft(start) { (w,order) =>
        val ready = if n == 4 && order == 2 then
          walk(walk(w,NightPoint(48,220),2),NightPoint(48,148),2) else w
        deliver(ready)
      }
      assertEquals(atDoor.phase, NightPhase.Clockout)
      assertEquals(atDoor.clean, 3)
      val won = walk(atDoor, NightPoint(240, 260), 23)
      assertEquals(won.phase, NightPhase.Won)
      assertEquals(advance(won, 10), won)
    }
    val story = deliver(deliver(make(6)))
    assert(story.puzzle.nonEmpty && story.delivered == 2)
    assertEquals(wire(story).hcursor.get[Int]("pressure").toOption,Some(-1))
  }

  test("counter hunter stays under the glass for 25 ticks, closes distance, catches early and can be outrun") {
    def hunter(w: NightWorld): NightPoint =
      val pos = wire(w).hcursor.downField("chase")
      NightPoint(pos.get[Double]("x").toOption.get, pos.get[Double]("y").toOption.get)
    val incident = advance(make(6), 800)
    val start = hunter(incident)
    assertEquals(start, NightPoint(240, 87))
    assertEquals(hunter(advance(incident, 25)), start)
    val moving = advance(incident, 26)
    assertEqualsDouble(hunter(moving).distance(start), 2.2, 1e-8)
    val caught = Iterator.iterate(incident)(NightEngine.step(_, NightInput.idle))
      .take(200).find(_.phase == NightPhase.Lost).getOrElse(fail("hunter never reached the idle courier"))
    assert(caught.tick - incident.tick < 100)
    assert(wire(caught).hcursor.downField("chase").focus.contains(Json.Null))

    // Run straight to the panel, then swing along the southern wall before returning.
    val side = if incident.lever == Direction.Left then 46.0 else 434.0
    val latched = walk(incident, NightPoint(side, 220), 17)
    assert(wire(latched).hcursor.get[Boolean]("latched").toOption.contains(true))
    val bypass = walk(latched, NightPoint(side, 265), 5)
    val escaped = walk(bypass, NightPoint(240, 260), 23)
    assertEquals(escaped.phase, NightPhase.Escaped)
    assert(wire(escaped).hcursor.downField("chase").focus.contains(Json.Null))

    // The deadline still closes the door even when the hunter is far from the courier.
    val deadline = incident.stage match
      case chase: ShiftStage.Escaping => incident.copy(stage = chase.copy(ticks = 1))
      case _ => fail("expected pursuit")
    assertEquals(advance(deadline, 1).phase, NightPhase.Lost)
  }

  test("draws replay exactly with one seed, and real windows vary across distinct seeds") {
    val options = (0L until 48L).map(s => inspect(make(5, s))._2).toSet
    assertEquals(options, Set(0,1,2))
    assertEquals(deliver(make(5, 2429L)), deliver(make(5, 2429L)))
  }
  test("tile warns for a full second and recovers; crossing reveals the supporting hand without a mistake") {
    val initial = make(3)
    assertEquals(fire(initial,240,78).last.event,NightEvent.Blocked)
    val standing = walk(initial,NightPoint(240,190),2)
    def tile(w: NightWorld) = w.floor.tiles.find(t => t.x == 240 && t.y == 190).get
    assertEquals(tile(standing).state,StoryTileState.Warn)
    val almost = advance(standing,tile(standing).ticks-1)
    assertEquals(almost.player,standing.player)
    val fallen = NightEngine.step(almost,NightInput.idle)
    assertEquals(fallen.player,NightPoint(240,220))
    assertEquals(fallen.floor.cue,FactoryCue.TileFall)
    assertEquals(fallen.delivered,0)
    assertEquals(tile(fallen).state,StoryTileState.Hole)
    assertEquals(tile(advance(fallen,32)).state,StoryTileState.Mend)
    assertEquals(tile(advance(fallen,48)).state,StoryTileState.Solid)
    val clean = walk(initial,NightPoint(240,154),2)
    assert(clean.floor.supplied)
    assertEquals(clean.floor.cue,FactoryCue.SawHand)
    assert(FactoryFloor.view(clean).marks.exists(_.kind == "hand"))
  }
  test("the first shift records real movement and stillness at five frames per second") {
    val still = advance(make(1),80)
    assertEquals(still.firstNightTrace,Vector.fill(21)(still.player))
    val moving = advance(still,12,packet(mx=1))
    assertEquals(moving.firstNightTrace.takeRight(3),Vector(NightPoint(256,220),NightPoint(272,220),NightPoint(288,220)))
    val tape = moving.firstNightTrace
    val six = NightEngine.start(NightLevel.from(6).get,12L,tape)
    assertEquals(advance(six,5).firstNightTrace,tape)
    assert(!wire(six).noSpaces.contains("firstNightTrace"))
  }
