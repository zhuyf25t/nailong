package soda.night

import munit.FunSuite
import scala.annotation.tailrec

final class SleepWatchSuite extends FunSuite:
  private def newRun(seed: Long = 29): NightWorld = NightEngine.start(NightLevel.from(8).get,seed)
  private def view(w: NightWorld): StoryView = StoryPuzzles.view(w,w.puzzle.get)
  private def pos(p: StoryPerson): NightPoint = NightPoint(p.x,p.y)
  private def pos(m: StoryMark): NightPoint = NightPoint(m.x,m.y)
  private def input(action: String,dx: Double = 0,dy: Double = 0): NightInput =
    val length = math.hypot(dx,dy).max(1)
    NightInput.from(dx/length,dy/length,0,-1,action).get
  private def towards(w: NightWorld,target: NightPoint,action: String = "none"): NightInput =
    input(action,target.x-w.player.x,target.y-w.player.y)
  private def tick(w: NightWorld,count: Int,in: NightInput = NightInput.idle): NightWorld =
    (0 until count).foldLeft(w)((world,_) => NightEngine.step(world,in))
  private def walk(w: NightWorld,target: NightPoint,radius: Double): NightWorld =
    Iterator.iterate(w)(world => NightEngine.step(world,towards(world,target))).take(140)
      .find(_.player.distance(target)<=radius).getOrElse(fail(s"unreachable $target"))

  private def dutyInput(w: NightWorld,v: StoryView): NightInput =
    val hand = v.marks.find(m => m.kind == "hand_warn" || m.kind == "hand").map(pos)
    val brace = v.marks.find(_.kind == "brace").map(pos)
    hand.filter(_.distance(w.player)<28) match
      case Some(p) => towards(w,NightPoint(if p.x < 240 then p.x+40 else p.x-40,p.y))
      case None => brace.fold(NightInput.idle)(p => towards(w,p,"hold"))

  // Play one full round using only the visible frog, then nearest visible centre after
  // each tick. In particular no test retrieves a private frog index, seed draw or target id.
  private def follow(reveal: NightWorld): (NightWorld,NightPoint) =
    val opening = view(reveal)
    assertEquals(opening.step,"sleep_reveal")
    val frog = opening.people.filter(_.kind == "sleep_frog")
    assertEquals(frog.size,1)
    val initial = pos(frog.head)
    val sleep = tick(reveal,50)
    @tailrec def observe(w: NightWorld,prior: NightPoint,movedSlots: Set[Int],duties: Set[(Int,Int)]): (NightWorld,NightPoint) =
      val v = view(w)
      if v.step == "wake_probe" then
        assert(v.people.forall(_.kind == "wake_window"))
        assert(movedSlots.size >= 2, "visible screen slots must rotate away from a stable actor ID")
        assertEquals(duties.size,opening.round)
        (w,prior)
      else
        assertEquals(v.step,"sleep_watch")
        assertEquals(v.people.size,4)
        assert(v.people.forall(_.kind == "sleep_shutter"))
        assertEquals(v.people.map(_.slot).sorted,Vector(0,1,2,3))
        val nearest = v.people.minBy(p => pos(p).distance(prior))
        assert(pos(nearest).distance(prior)<10.0)
        assert(v.people.combinations(2).forall(pair => pos(pair(0)).distance(pos(pair(1)))>80))
        val completed = v.marks.collect { case m if m.kind == "brace_on" => (m.x,m.y) }
        observe(NightEngine.step(w,dutyInput(w,v)),pos(nearest),movedSlots+nearest.slot,duties++completed)
    observe(sleep,initial,Set.empty,Set.empty)

  private def firstLamp(): NightWorld =
    val lit = tick(newRun(),50+43)
    val target = pos(view(lit).marks.find(_.kind=="brace").get)
    walk(lit,target,16)

  test("eight-night finale has 14,18,22 seconds of sleep; nearby probes and the real toss lead to one exit") {
    def serve(w: NightWorld): NightWorld =
      val (awake,tracked) = follow(w)
      val stationary = walk(awake,NightPoint(240,180),4)
      val far = NightEngine.step(stationary,input("probe"))
      assertEquals(view(far).step,"wake_probe")
      assertEquals(view(far).cueId,view(stationary).cueId)
      val nearby = walk(far,tracked,45)
      val answer = NightEngine.step(nearby,input("probe"))
      assertEquals(view(answer).step,"wake_toss")
      assertEquals(view(answer).people.count(_.kind=="wake_look"),1)
      val quiet = tick(answer,18)
      assert(view(quiet).people.forall(_.kind == "wake_window"))
      val tooFar = NightEngine.step(quiet,input("throw"))
      assertEquals(view(tooFar).step,"wake_toss")
      val exact = walk(tooFar,tracked,22)
      NightEngine.step(exact,input("throw"))
    val start = newRun()
    assert(view(start).cueId>0 && view(start).cue=="sleep_show")
    val second = serve(start)
    assertEquals((view(second).round,view(second).sleepMax),(2,360))
    val third = serve(second)
    assertEquals((view(third).round,view(third).sleepMax),(3,440))
    val face = serve(third)
    assertEquals(view(face).step,"ward_face")
    assert(view(face).people.forall(_.kind=="ward_face"))
    assertEquals(view(tick(face,35)).step,"ward_face")
    val gate = tick(face,36)
    assertEquals(view(gate).step,"ward_exit")
    val won = walk(gate,NightPoint(426,238),18)
    assertEquals(won.phase,NightPhase.Won)
    assertEquals(tick(won,16),won)
  }

  test("simply waiting misses the lever; any interruption breaks the 14-tick hold; warned hand can be dodged") {
    val missed = tick(newRun(),50+195)
    assertEquals((view(missed).step,view(missed).cue),("sleep_reveal","brace_missed"))
    val lamp = firstLamp()
    val partial = tick(lamp,8,input("hold"))
    assertEquals(view(partial).braceTicks,8)
    val release = tick(partial,1)
    assertEquals(view(release).braceTicks,0)
    val almost = tick(release,13,input("hold"))
    assert(view(almost).marks.exists(_.kind=="brace"))
    val latched = tick(almost,1,input("hold"))
    assert(view(latched).marks.exists(_.kind=="brace_on"))
    val warning = tick(latched,205-view(latched).stageTick)
    assert(view(warning).marks.exists(_.kind=="hand_warn"))
    assertEquals(view(warning).tiles.head.state,StoryTileState.Warn)
    val safeForNow = tick(warning,29)
    assertEquals(view(safeForNow).step,"sleep_watch")
    val fell = tick(safeForNow,1)
    assertEquals((view(fell).round,view(fell).cue),(1,"ward_slip"))
    val away = tick(warning,30,input("none",1,0))
    assert(view(away).marks.exists(_.kind=="hand"))
    assertEquals(view(away).tiles.head.state,StoryTileState.Hole)
    assertEquals(view(tick(away,45)).step,"wake_probe")
  }

  test("wrong first inspection stays local; second wrong and wrong bottle replay only the current round") {
    val (awakeOne,frogOne) = follow(newRun(-145))
    val verifiedOne = NightEngine.step(walk(awakeOne,frogOne,15),input("probe"))
    val next = NightEngine.step(verifiedOne,input("throw"))
    val (awake,frog) = follow(next)
    val decoy = view(awake).people.map(pos).find(_.distance(frog)>80).get
    val decoyWatch = walk(awake,decoy,15)
    val doubtful = NightEngine.step(decoyWatch,input("probe"))
    assertEquals((view(doubtful).step,view(doubtful).cue),("wake_probe","wrong_window"))
    assert(view(doubtful).people.forall(_.kind=="wake_window"))
    val again = NightEngine.step(doubtful,input("probe"))
    assertEquals((view(again).round,view(again).cue),(2,"wrong_bottle"))
    val verified = NightEngine.step(walk(doubtful,frog,15),input("probe"))
    val stale = tick(verified,18)
    val mistake = NightEngine.step(walk(stale,decoy,15),input("throw"))
    assertEquals((view(mistake).round,view(mistake).step,view(mistake).cue),(2,"sleep_reveal","wrong_bottle"))
  }
