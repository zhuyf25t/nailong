package system.api

import cats.effect.IO
import io.circe.{Decoder, Encoder, Json}
import io.circe.syntax.*
import system.HttpError

import java.sql.Connection
import scala.reflect.ClassTag

trait APIMessage[Response]:
  def plan(connection: Connection): IO[Response]

trait APIWithTokenMessage[Response] extends APIMessage[Response]

trait NoRequestMessage[Response] extends APIMessage[Response]

final case class RegisteredAPIMessage(
  apiName: String,
  requiresUserToken: Boolean,
  planJson: (Json, Connection) => IO[Json]
)

object APIMessage:

  private[api] def apiNameFromClassName(className: String): String =
    val objectName = className.stripSuffix("$")
    val baseName = objectName.stripSuffix("APIMessage")
    s"${baseName}API".toLowerCase

object RegisteredAPIMessage:

  def api[Message <: APIMessage[Response], Response](using
    Decoder[Message],
    Encoder[Response],
    ClassTag[Message]
  ): RegisteredAPIMessage =
    build[Message, Response](requiresUserToken = false)

  def apiWithToken[Message <: APIWithTokenMessage[Response], Response](using
    Decoder[Message],
    Encoder[Response],
    ClassTag[Message]
  ): RegisteredAPIMessage =
    build[Message, Response](requiresUserToken = true)

  def noRequest[Message <: NoRequestMessage[Response], Response](message: => Message)(using
    Encoder[Response],
    ClassTag[Message]
  ): RegisteredAPIMessage =
    RegisteredAPIMessage(
      apiName = nameOf[Message],
      requiresUserToken = false,
      planJson = (_, connection) => message.plan(connection).map(_.asJson)
    )

  private def build[Message <: APIMessage[Response], Response](requiresUserToken: Boolean)(using
    Decoder[Message],
    Encoder[Response],
    ClassTag[Message]
  ): RegisteredAPIMessage =
    RegisteredAPIMessage(
      apiName = nameOf[Message],
      requiresUserToken = requiresUserToken,
      planJson = (payload, connection) =>
        for
          message <- IO.fromEither(
            payload.as[Message].left.map(error => HttpError.BadRequest(s"请求体格式错误：${error.getMessage}"))
          )
          response <- message.plan(connection)
        yield response.asJson
    )

  private def nameOf[Message](using classTag: ClassTag[Message]): String =
    APIMessage.apiNameFromClassName(classTag.runtimeClass.getSimpleName)
