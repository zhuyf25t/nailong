package system.api

import cats.effect.IO
import io.circe.Json
import io.circe.syntax.*
import org.http4s.{HttpRoutes, InvalidMessageBodyFailure, Response, Status}
import org.http4s.circe.CirceEntityCodec.*
import org.http4s.circe.CirceEntityEncoder.*
import org.http4s.dsl.io.*
import system.{DatabaseSession, HttpError}
import system.objects.ErrorResponse

import java.sql.Connection

object APIMessageRouter:

  def routes(
    apiMessages: List[RegisteredAPIMessage],
    resolveUserToken: (String, Connection) => IO[Json]
  ): HttpRoutes[IO] =
    val apiMessagesByName = apiMessages.map(apiMessage => normalize(apiMessage.apiName) -> apiMessage).toMap

    HttpRoutes.of[IO] {
      case req @ POST -> Root / "api" / apiName =>
        handleErrors {
          for
            apiMessage <- IO.fromOption(apiMessagesByName.get(normalize(apiName)))(
              HttpError.NotFound(s"不支持的 API：$apiName")
            )
            response <- runAPIMessage(req, apiMessage, resolveUserToken)
          yield response
        }
    }

  private def runAPIMessage(
    req: org.http4s.Request[IO],
    apiMessage: RegisteredAPIMessage,
    resolveUserToken: (String, Connection) => IO[Json]
  ): IO[Response[IO]] =
    for
      payload <- req.as[Json]
      response <- DatabaseSession.withTransactionConnection(connection =>
        for
          backendPayload <- preparePayload(apiMessage, payload, connection, resolveUserToken)
          response <- apiMessage.planJson(backendPayload, connection)
        yield response
      )
      httpResponse <- Ok(response)
    yield httpResponse

  private def normalize(apiName: String): String =
    apiName.trim.toLowerCase

  private def preparePayload(
    apiMessage: RegisteredAPIMessage,
    payload: Json,
    connection: Connection,
    resolveUserToken: (String, Connection) => IO[Json]
  ): IO[Json] =
    if apiMessage.requiresUserToken then
      for
        userToken <- extractUserToken(payload)
        userIdJson <- resolveUserToken(userToken, connection)
        backendPayload <- replaceUserTokenWithUserId(payload, userIdJson)
      yield backendPayload
    else IO.pure(payload)

  private def extractUserToken(payload: Json): IO[String] =
    payload.hcursor.get[String]("userToken") match
      case Right(value) if value.trim.nonEmpty => IO.pure(value.trim)
      case _ => IO.raiseError(HttpError.Unauthorized("请先登录。"))

  private def replaceUserTokenWithUserId(payload: Json, userIdJson: Json): IO[Json] =
    payload.asObject match
      case Some(value) =>
        IO.pure(Json.fromJsonObject(value.remove("userToken").add("userId", userIdJson)))
      case None =>
        IO.raiseError(HttpError.BadRequest("请求体格式错误：需要 JSON 对象。"))

  private def handleErrors(action: IO[Response[IO]]): IO[Response[IO]] =
    action.handleErrorWith {
      case error: InvalidMessageBodyFailure =>
        BadRequest(ErrorResponse(error.getMessage).asJson)
      case error: HttpError.BadRequest =>
        BadRequest(ErrorResponse(error.getMessage).asJson)
      case error: HttpError.Unauthorized =>
        IO.pure(Response[IO](Status.Unauthorized).withEntity(ErrorResponse(error.getMessage).asJson))
      case error: HttpError.Forbidden =>
        Forbidden(ErrorResponse(error.getMessage).asJson)
      case error: HttpError.Conflict =>
        Conflict(ErrorResponse(error.getMessage).asJson)
      case error: HttpError.NotFound =>
        NotFound(ErrorResponse(error.getMessage).asJson)
      case error =>
        InternalServerError(ErrorResponse(error.getMessage).asJson)
    }
