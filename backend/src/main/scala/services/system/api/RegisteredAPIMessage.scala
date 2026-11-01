package services.system.api

import cats.effect.IO
import io.circe.{Decoder, Encoder, Json}
import io.circe.syntax.*
import java.sql.Connection
import java.util.Locale
import scala.reflect.ClassTag
import services.system.objects.HttpError

final case class RegisteredAPIMessage(
  apiName: String,
  requiresUserToken: Boolean,
  planJson: (Json, Connection) => IO[Json]
)

object RegisteredAPIMessage:
  def api[M <: APIMessage[R], R](using Decoder[M], Encoder[R], ClassTag[M]): RegisteredAPIMessage = build[M, R](false)
  def apiWithToken[M <: APIWithTokenMessage[R], R](using Decoder[M], Encoder[R], ClassTag[M]): RegisteredAPIMessage = build[M, R](true)
  def noRequest[M <: NoRequestMessage[R], R](message: => M)(using Encoder[R], ClassTag[M]): RegisteredAPIMessage =
    RegisteredAPIMessage(nameOf[M], false, (_, connection) => message.plan(connection).map(_.asJson))

  def nameOf[M](using tag: ClassTag[M]): String =
    tag.runtimeClass.getSimpleName.stripSuffix("$").stripSuffix("Message").toLowerCase(Locale.ROOT)

  private def build[M <: APIMessage[R], R](requiresToken: Boolean)(using Decoder[M], Encoder[R], ClassTag[M]): RegisteredAPIMessage =
    RegisteredAPIMessage(nameOf[M], requiresToken, (payload, connection) =>
      IO.fromEither(payload.as[M].left.map(_ => HttpError.validation("请求字段缺失或类型不正确。")))
        .flatMap(_.plan(connection)).map(_.asJson)
    )
