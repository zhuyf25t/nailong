package soda.rooms

import java.time.Instant
import java.util.UUID
import soda.identity.PlayerId
import soda.sim.{Mode, Seat, Verdict}

final case class MatchId(value: UUID)

opaque type RequestId = UUID
object RequestId:
  def read(raw: String): Option[RequestId] =
    scala.util.Try(UUID.fromString(raw)).toOption.filter(_.toString.equalsIgnoreCase(raw))

opaque type RoomCode = String
object RoomCode:
  def read(raw: String): Option[RoomCode] = Option.when(raw.matches("[A-Z0-9]{6}"))(raw)
  def random(): RoomCode =
    val alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    val rng = java.util.concurrent.ThreadLocalRandom.current()
    Vector.fill(6)(alphabet.charAt(rng.nextInt(alphabet.length))).mkString
  extension (code: RoomCode) def value: String = code

opaque type InputSeq = Long
object InputSeq:
  def read(n: Long): Option[InputSeq] = Option.when(n >= 0 && n <= 9007199254740991L)(n)
  extension (seq: InputSeq) def value: Long = seq

enum Skin(val wire: String):
  case Dragon extends Skin("dragon")
  case Egg extends Skin("egg")
  case Frog extends Skin("frog")

object Skin:
  def read(raw: String): Option[Skin] = values.find(_.wire == raw)

final case class Standing(player: PlayerId, skin: Skin, score: Int, outcome: Verdict)
final case class Finished(id: MatchId, code: RoomCode, mode: Mode, endedAt: Instant, standings: Vector[Standing])

enum RoomError(val code: String, val message: String):
  case Missing extends RoomError("room_not_found", "没有找到这个房间，检查六位房间码。")
  case Full extends RoomError("room_full", "四个席位都已有玩家。")
  case Ended extends RoomError("match_ended", "本局已结束，请创建新房间。")
  case Forbidden extends RoomError("not_a_member", "你的席位已离开，请重新加入房间。")
  case Reused extends RoomError("request_id_conflict", "这个请求编号已用于另一项操作。")
  case Expired extends RoomError("membership_ended", "原来的席位已离开，请重新加入。")
  case Busy extends RoomError("room_limit", "本机正在运行多场比赛，请稍后创建。")
