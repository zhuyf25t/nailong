package soda.night

import java.util.UUID
import scala.util.Try

private def canonicalUUID(raw: String): Option[UUID] =
  Try(UUID.fromString(raw)).toOption.filter(_.toString.equalsIgnoreCase(raw))

opaque type RunId = UUID
object RunId:
  def fresh(): RunId = UUID.randomUUID()
  def read(raw: String): Option[RunId] = canonicalUUID(raw)
  private[night] def fromDatabase(id: UUID): RunId = id
  extension (id: RunId) def uuid: UUID = id

opaque type StartId = UUID
object StartId:
  def read(raw: String): Option[StartId] = canonicalUUID(raw)
  extension (id: StartId) def uuid: UUID = id

opaque type InputSequence = Long
object InputSequence:
  def from(value: Long): Option[InputSequence] =
    Option.when(value >= 0 && value <= 9007199254740991L)(value)
  extension (seq: InputSequence) def value: Long = seq

enum NightProblem(val code: String, val message: String):
  case NotFound extends NightProblem("run_not_found", "这份夜班没有开始，或已经被新的夜班替换。")
  case Locked extends NightProblem("night_locked", "请先完成前一夜并到南门打卡。")
  case Reused extends NightProblem("request_id_conflict", "这个开班编号已用于另一个夜班。")
  case Replaced extends NightProblem("run_replaced", "之前的开班请求已经结束。请重新开班。")
  case Busy extends NightProblem("input_queue_full", "动作太快，请稍后重试。")
