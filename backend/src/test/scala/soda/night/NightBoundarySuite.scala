package soda.night

import io.circe.Json
import io.circe.parser.parse
import java.util.UUID
import munit.FunSuite
import scala.collection.immutable.Queue
import scala.compiletime.testing.typeCheckErrors
import soda.Requests
import soda.identity.{Name,Password,Token}

final class NightBoundarySuite extends FunSuite:
  private val raw = """{"seq":0,"mx":0.2,"my":-1,"ax":0,"ay":-1,"action":"probe"}"""
  private val level = NightLevel.from(2).get
  private def parseInput(source: String) = parse(source).toOption.flatMap(Requests.input)
  private def sequence(i: Int): InputSequence = InputSequence.from(i.toLong).get
  private def sample(aim: Double, action: String, walk: Double = 0) =
    NightInput.from(walk,0,aim,-1,action).get
  private def shift = Shift(RunId.fresh(),NightEngine.start(level,260L),-1,NightInput.idle,Queue.empty,0,0)

  test("request ids, player ids, sequence numbers and simulation levels cannot be substituted") {
    assert(typeCheckErrors("val id: RunId = StartId.read(UUID.randomUUID().toString).get").nonEmpty)
    assert(typeCheckErrors("val id: RunId = soda.identity.PlayerId(UUID.randomUUID())").nonEmpty)
    assert(typeCheckErrors("val q: InputSequence = 3L").nonEmpty)
    assert(typeCheckErrors("val n: NightLevel = 9").nonEmpty)
    assert(RunId.read("0-0-0-0-0").isEmpty)
    assert(StartId.read(UUID.randomUUID().toString).nonEmpty)
    assert(InputSequence.from(-1).isEmpty && InputSequence.from(9007199254740992L).isEmpty)
  }
  test("HTTP intent parser rejects fractional sequences, oversized directions, strings and invented actions") {
    assert(parseInput(raw).nonEmpty)
    assert(parseInput(raw.replace("\"seq\":0","\"seq\":0.1")).isEmpty)
    assert(parseInput(raw.replace("0.2","1e2000")).isEmpty)
    assert(parseInput(raw.replace("0.2","\"0.2\"")).isEmpty)
    assert(parseInput(raw.replace("probe","win")).isEmpty)
    assertEquals(Name.read("  奶蛙  ").map(_.value), Some("奶蛙"))
    assert(Password.read("太短").isEmpty && Token.read("xyz").isEmpty)
  }
  test("safe retries preserve tap order and original aim across a later idle sample") {
    val left = sample(-1,"probe")
    val right = sample(1,"probe")
    val accepted = shift.submit(sequence(0),left,0).toOption.get
      .submit(sequence(1),right,0).toOption.get
      .submit(sequence(2),NightInput.idle,0).toOption.get
      .submit(sequence(1),left,0).toOption.get
    val first = accepted.advance(1)
    val second = first.advance(2)
    def probe(s: Shift) = s.snapshot.hcursor.get[String]("probe").toOption
    assertEquals(accepted.actions.size,2)
    assertEquals(probe(first),Some("left"))
    assertEquals(probe(second),Some("right"))
    assertEquals(second.advance(3).world.eventId,second.world.eventId)
    assertEquals(second.ack,2L)
  }
  test("movement expires after six ticks and a full action queue leaves a retryable sequence") {
    val moving = shift.submit(sequence(0),sample(1,"none",1),0).toOption.get
    val six = (1L to 6L).foldLeft(moving)((s,t) => s.advance(t))
    assert(six.world.player.x > moving.world.player.x)
    assertEquals(six.advance(7).world.player,six.world.player)
    val full = (1 to 16).foldLeft(six)((s,n) => s.submit(sequence(n),sample(-1,"probe"),6).toOption.get)
    assertEquals(full.submit(sequence(17),sample(1,"probe"),6).left.toOption,Some(NightProblem.Busy))
    assert(full.advance(7).submit(sequence(17),sample(1,"probe"),7).isRight)
  }
