package soda.rooms

import io.circe.Json
import java.util.UUID
import munit.FunSuite
import soda.Requests
import soda.identity.{Name, Password, PlayerId, Token}
import scala.compiletime.testing.typeCheckErrors

final class BoundarySuite extends FunSuite:
  private val valid = Json.obj(
    "moveX" -> Json.fromDoubleOrNull(0.5), "moveY" -> Json.fromInt(-1),
    "aimX" -> Json.fromInt(1), "aimY" -> Json.fromInt(0), "fire" -> Json.True,
    "weapon" -> Json.fromInt(2), "reload" -> Json.False, "dash" -> Json.True, "shield" -> Json.False)
  private def frame(input: Json, seq: Json = Json.fromInt(0)): Json = Json.obj("seq" -> seq,"input" -> input)
  test("account, match and request identifiers cannot be interchanged") {
    assert(typeCheckErrors("val id: MatchId = PlayerId(UUID.randomUUID())").nonEmpty)
    assert(typeCheckErrors("val id: RequestId = UUID.randomUUID()").nonEmpty)
    assert(RoomCode.read("QW007X").nonEmpty)
    assert(RoomCode.read("ABC").isEmpty)
    assert(RequestId.read(UUID.randomUUID().toString).nonEmpty)
    assert(RequestId.read("0-0-0-0-0").isEmpty)
    assert(InputSeq.read(9007199254740992L).isEmpty)
  }
  test("wire decoder rejects numeric strings, unknown actions and client state mutations") {
    assert(Requests.input(frame(valid)).nonEmpty)
    assert(Requests.input(frame(valid.deepMerge(Json.obj("shift" -> Json.True)))).isEmpty)
    assert(Requests.input(frame(valid.deepMerge(Json.obj("moveX" -> Json.fromString("1"))))).isEmpty)
    assert(Requests.input(frame(valid.deepMerge(Json.obj("weapon" -> Json.fromDoubleOrNull(1.5))))).isEmpty)
    assert(Requests.input(frame(valid.deepMerge(Json.obj("shield" -> Json.fromString("true"))))).isEmpty)
    assert(Requests.input(frame(valid, Json.fromString("1"))).isEmpty)
    assert(Requests.input(frame(valid, Json.fromInt(-1))).isEmpty)
  }
  test("nickname, password and bearer are validated at the boundary") {
    assertEquals(Name.read("  奶蛙  ").map(_.value), Some("奶蛙"))
    assert(Name.read("\u0000frog").isEmpty)
    assert(Password.read("七个字符").isEmpty)
    assert(Password.read("奶泡乱斗的本地口令").nonEmpty)
    assert(Token.read("x" * 43).nonEmpty)
    assert(Token.read("x" * 42 + "=").isEmpty)
  }
