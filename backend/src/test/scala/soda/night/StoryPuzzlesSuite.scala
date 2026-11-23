package soda.night

import java.util.UUID
import munit.FunSuite
import scala.compiletime.testing.typeCheckErrors

final class StoryPuzzlesSuite extends FunSuite:
  private val runId = new UUID(0,42)
  private def story(w: NightWorld): StoryView = StoryPuzzles.view(w,w.puzzle.get)
  private def make(n: Int, seed: Long = 0, tape: Vector[NightPoint] = Vector.empty): NightWorld =
    NightEngine.start(NightLevel.from(n).get,seed,tape)
  private def ticks(w: NightWorld,n: Int,input: NightInput = NightInput.idle): NightWorld =
    (0 until n).foldLeft(w)((a,_) => NightEngine.step(a,input))
  private def click(w: NightWorld,edge: String = "throw"): NightWorld =
    NightEngine.step(w,NightInput.from(0,0,0,-1,edge).get)
  private def walk(w: NightWorld,to: NightPoint,until: NightWorld => Boolean = _ => false): NightWorld =
    def move(now: NightWorld): NightWorld =
      val dx = to.x - now.player.x
      val dy = to.y - now.player.y
      val scale = now.player.distance(to).max(4)
      NightEngine.step(now,NightInput.from(dx/scale,dy/scale,0,-1,"none").get)
    Iterator.iterate(w)(move).take(180).find(now => now.player.distance(to) < 0.1 || until(now))
      .getOrElse(fail(s"Cannot reach $to from ${w.player}, ${w.puzzle.map(_ => story(w).step)}"))
  private def locate(w: NightWorld,kind: String): NightPoint =
    val m = story(w).marks.find(_.kind == kind).getOrElse(fail(s"$kind absent from ${story(w).marks}"))
    NightPoint(m.x,m.y)
  private def activate(w: NightWorld,kind: String): NightWorld = click(walk(w,locate(w,kind)))

  // Read the same window reaction a Godot client sees, then shoot the physical bottle.
  private def deliver(w: NightWorld): NightWorld =
    val (direction,ax) = if w.memory == Direction.Left then ("right",1.0) else ("left",-1.0)
    val observed = ticks(NightEngine.step(w,NightInput.from(0,0,ax,0,"probe").get),12)
    val windows = NightWire.snapshot(observed,runId,0).hcursor.get[Vector[io.circe.Json]]("windows").toOption.get
    val finger = windows.filter(_.hcursor.get[String]("look").toOption.contains(direction))
    assertEquals(finger.size,1)
    val x = Vector(104,240,376)(finger.head.hcursor.get[Int]("slot").toOption.get)
    val dx = x - observed.player.x
    val dy = 78 - observed.player.y
    val scale = math.hypot(dx,dy)
    val shot = NightEngine.step(observed,NightInput.from(0,0,dx/scale,dy/scale,"throw").get)
    Iterator.iterate(shot)(NightEngine.step(_,NightInput.idle)).take(50)
      .find(_.delivered == w.delivered+1).getOrElse(fail("Bottle never reached the responding window"))
  private def observe(seed: Int,tape: Vector[NightPoint]): NightWorld =
    val first = deliver(make(6,seed,tape))
    assert(first.puzzle.isEmpty)
    val second = deliver(first)
    assertEquals(story(second).step,"enter_hatch")
    activate(second,"hatch")

  test("a probe lasts six ticks and identifies the real forty-tick delay in all six window layouts") {
    val tape = Vector(NightPoint(220,189),NightPoint(213,204),NightPoint(332,218))
    val layouts = (0 until 6).map { seed =>
      val watched = ticks(observe(seed,tape),48)
      assert(story(watched).objective.contains("第一夜存档"))
      val pulse = click(watched,"probe")
      def lit(v: NightWorld) = story(v).people.filter(_.kind == "monitor_probe").map(_.slot)
      val live = lit(pulse)
      assertEquals(live.size,1)
      assertEquals(lit(ticks(pulse,5)),live)
      assert(lit(ticks(pulse,6)).isEmpty)
      assert(lit(ticks(pulse,39)).isEmpty)
      val delayed = lit(ticks(pulse,40))
      assertEquals(delayed.size,1)
      assertNotEquals(delayed,live)
      assert(lit(ticks(pulse,46)).isEmpty)
      val archivedSlot = (0 until 3).filterNot(i => (delayed ++ live).contains(i)).head
      val rendered = (0 until 12).map(i => story(ticks(pulse,i)).people(archivedSlot))
      assertEquals(rendered.map(p => math.round((p.x - Vector(104,240,376)(archivedSlot))/0.11 + 240)).toSet,
        tape.map(_.x.toLong).toSet)
      val windows = story(watched).marks
      def choose(w: NightWorld,slot: Int) = click(walk(w,NightPoint(windows(slot).x,windows(slot).y)))
      val wrong = choose(ticks(pulse,46),live.head)
      assertEquals(story(wrong).cue,"wrong_window")
      assertEquals(story(wrong).step,"observe_windows")
      assertEquals(story(choose(wrong,delayed.head)).step,"delay_door")
      live.head -> delayed.head
    }
    assertEquals(layouts.distinct.size,6)
  }

  test("two deliveries lead through a physical two-second relay door, archive turn and exit") {
    val watched = observe(0,Vector.empty)
    assert(story(watched).objective.contains("岗位示范带"))
    val premature = click(walk(watched,NightPoint(240,117)))
    assertEquals(story(premature).cue,"watch_longer")
    val relay = click(ticks(premature,40))
    assertEquals(story(relay).step,"delay_door")
    // Circumvent the plate by going above it. Even a pure right input cannot cross the wall.
    val above = walk(relay,NightPoint(110,120))
    val atWall = ticks(above,60,NightInput.from(1,0,0,-1,"none").get)
    assert(atWall.player.x < 276)
    assertEquals(story(atWall).step,"delay_door")
    val plate = walk(atWall,locate(relay,"plate"))
    val held = ticks(plate,38)
    val crossing = walk(held,NightPoint(281,178))
    assertEquals(story(crossing).step,"old_turn")
    val turn = activate(crossing,"old_tape")
    assertEquals(story(turn).cue,"archive_turn")
    assertEquals(story(ticks(turn,29)).people.head.kind,"archive_turn")
    val exit = ticks(turn,30)
    assertEquals(story(exit).step,"exit_maintenance")
    val won = walk(exit,locate(exit,"exit"),_.phase == NightPhase.Won)
    assertEquals(won.phase,NightPhase.Won)
    assertEquals(ticks(won,100),won)
  }

  private def firstPanel: NightWorld = activate(make(7),"ledger")
  private def recordPlate(w: NightWorld,holdTicks: Int): NightWorld =
    val recording = activate(w,"panel")
    val plate = walk(recording,locate(recording,"plate"))
    click(ticks(plate,holdTicks))
  private def zoneTwo: NightWorld =
    val replay = recordPlate(firstPanel,80)
    walk(replay,NightPoint(240,174),w => story(w).step == "record_two")
  private def passSecondGate(replay: NightWorld): NightWorld =
    val above = walk(replay,NightPoint(319,145))
    val around = walk(above,NightPoint(350,145))
    walk(around,NightPoint(428,164),w => story(w).step == "help_hold")

  test("recordings replay exact footfalls; empty or completed tapes retry only the current door") {
    val ready = firstPanel
    val empty = click(activate(ready,"panel"))
    assertEquals(story(empty).step,"record_one")
    assertEquals(story(empty).cue,"retry_gate")
    val record = activate(empty,"panel")
    val up = NightInput.from(0,-1,0,-1,"none").get
    val detour = ticks(record,12,up)
    val plate = walk(detour,locate(detour,"plate"))
    val replay = click(ticks(plate,45))
    val echo = story(ticks(replay,12)).people.head
    assertEquals(NightPoint(echo.x,echo.y),detour.player)
    assertEquals(echo.kind,"echo")
    val tooLate = ticks(replay,179)
    assertEquals(story(tooLate).step,"record_one")
    val second = zoneTwo
    assertEquals(story(second).step,"record_two")
    val cleared = click(activate(second,"panel"))
    assertEquals(story(cleared).step,"record_two")
    assertEquals(cleared.player,NightPoint(260,186))
  }

  test("second gate has a dividing wall, fragile lower approach, traversable upper route and ten-tick last sill") {
    val ready = zoneTwo
    val replay = recordPlate(ready,85)
    val side = ticks(replay,30,NightInput.from(1,0,0,-1,"none").get)
    assert(side.player.x < 329)
    val lower = walk(replay,NightPoint(309,208))
    val crumb = walk(lower,NightPoint(351,208),w => story(w).step == "record_two")
    val fell = ticks(crumb,12)
    assertEquals(story(fell).step,"record_two")
    assertEquals(story(fell).cue,"retry_gate")
    // Cut around the lower tip without lingering on the fragile tile.
    val lowerTip = walk(replay,NightPoint(323,198))
    val onBrick = walk(lowerTip,NightPoint(338,198))
    assert(story(onBrick).tiles.exists(_.state == StoryTileState.Warn))
    val offBrick = walk(onBrick,NightPoint(350,183))
    val shortCut = walk(offBrick,NightPoint(428,164),w => story(w).step == "help_hold")
    assertEquals(story(shortCut).step,"help_hold")
    val longTape = recordPlate(fell,85)
    val assist = passSecondGate(longTape)
    assert(assist.tick-longTape.tick >= 85,"The extra hold starts only after the player's recording has ended")
    assert(assist.player.x < 410,"The final sill must stay latched for the entire recording")
    assertEquals(story(assist).step,"help_hold")
    assertEquals(story(ticks(assist,9)).step,"help_hold")
    val missed = ticks(assist,10)
    assertEquals(story(missed).step,"record_two")
    val finalAssist = passSecondGate(recordPlate(missed,85))
    val across = walk(finalAssist,NightPoint(415,164))
    val exit = ticks(across,10)
    assertEquals(story(exit).step,"exit_signature")
    val won = walk(exit,locate(exit,"exit"),_.phase == NightPhase.Won)
    assertEquals(won.phase,NightPhase.Won)
    assertEquals(ticks(won,50),won)
  }

  test("unrecognised cue or a different chapter's stage cannot enter the authoritative state") {
    assert(typeCheckErrors("""val cue: StoryCue = "invent_a_cue" """).nonEmpty)
    assert(typeCheckErrors("""val step: SignatureStep = MaintenanceStep.Delay""").nonEmpty)
  }
