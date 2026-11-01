package services.system.api

import cats.effect.IO
import io.circe.{Json, parser}
import io.circe.syntax.*
import java.nio.ByteBuffer
import java.nio.charset.StandardCharsets
import java.sql.Connection
import org.http4s.{HttpRoutes, Request, Response, Status}
import org.http4s.circe.CirceEntityEncoder.*
import org.http4s.dsl.io.*
import org.typelevel.log4cats.slf4j.Slf4jLogger
import services.player.objects.AuthenticatedPlayer
import services.system.DatabaseSession
import services.system.objects.{ErrorCode, ErrorResponse, HttpError}
import scala.util.Try

object APIMessageRouter:
  private val logger = Slf4jLogger.getLogger[IO]
  private val maxRequestBytes = 16384

  def routes(
    messages: List[RegisteredAPIMessage],
    database: DatabaseSession,
    resolveToken: (String, Connection) => IO[AuthenticatedPlayer]
  ): HttpRoutes[IO] =
    require(messages.map(_.apiName).distinct.size == messages.size, "Duplicate API registration")
    val byName = messages.map(message => message.apiName -> message).toMap
    HttpRoutes.of[IO] {
      case request @ POST -> Root / "api" / apiName => handleErrors {
        for
          message <- IO.fromOption(byName.get(apiName))(HttpError.notFound("API 不存在。"))
          payload <- readPayload(request)
          result <- database.transaction { connection =>
            for
              prepared <- preparePayload(message, payload, connection, resolveToken)
              result <- message.planJson(prepared, connection)
            yield result
          }
          response <- Ok(result)
        yield response
      }
    }

  private def readPayload(request: Request[IO]): IO[Json] =
    request.body.take(maxRequestBytes + 1L).compile.toVector.flatMap { bytes =>
      if bytes.size > maxRequestBytes then IO.raiseError(HttpError.validation("请求过大。"))
      else
        for
          text <- IO.fromEither(Try(StandardCharsets.UTF_8.newDecoder().decode(ByteBuffer.wrap(bytes.toArray)).toString)
            .toEither.left.map(_ => HttpError.validation("请求必须使用合法 UTF-8 编码。")))
          json <- IO.fromEither(parser.parse(text).left.map(_ => HttpError.validation("请求不是合法 JSON。")))
          obj <- if json.isObject then IO.pure(json) else IO.raiseError(HttpError.validation("请求必须是 JSON 对象。"))
        yield obj
    }

  private def preparePayload(
    message: RegisteredAPIMessage,
    payload: Json,
    connection: Connection,
    resolveToken: (String, Connection) => IO[AuthenticatedPlayer]
  ): IO[Json] =
    if !message.requiresUserToken then IO.pure(payload)
    else
      for
        obj <- IO.fromOption(payload.asObject)(HttpError.validation("请求必须是 JSON 对象。"))
        _ <- IO.raiseWhen(obj.contains("playerId") || obj.contains("sessionId"))(HttpError.validation("身份字段由服务器决定。"))
        token <- IO.fromEither(payload.hcursor.get[String]("userToken").left.map(_ => HttpError.unauthorized()))
        _ <- IO.raiseUnless(token.length == 43 && token.matches("[A-Za-z0-9_-]+"))(HttpError.unauthorized("登录已失效，请重新登录。"))
        identity <- resolveToken(token, connection)
      yield Json.fromJsonObject(obj.remove("userToken").add("playerId", identity.playerId.asJson).add("sessionId", identity.sessionId.asJson))

  private def handleErrors(operation: IO[Response[IO]]): IO[Response[IO]] =
    operation.handleErrorWith {
      case error: HttpError =>
        val status = error.code match
          case ErrorCode.ValidationError => Status.BadRequest
          case ErrorCode.Unauthorized => Status.Unauthorized
          case ErrorCode.Forbidden => Status.Forbidden
          case ErrorCode.NotFound => Status.NotFound
          case ErrorCode.Conflict => Status.Conflict
          case ErrorCode.InternalError => Status.InternalServerError
        IO.pure(Response[IO](status).withEntity(ErrorResponse(error.code, error.message).asJson))
      case error => logger.error(error)("API operation failed") *>
        IO.pure(Response[IO](Status.InternalServerError).withEntity(ErrorResponse(ErrorCode.InternalError, "服务暂时不可用，请稍后重试。").asJson))
    }
