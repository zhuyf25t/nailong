package services.system.routes

import cats.effect.IO
import cats.syntax.all.*
import io.circe.syntax.*
import org.http4s.{HttpApp, HttpRoutes}
import org.http4s.circe.CirceEntityEncoder.*
import org.http4s.dsl.io.*
import services.player.api.ResolvePlayerTokenAPIMessage
import services.player.routes.PlayerRoutes
import services.records.routes.RecordsRoutes
import services.training.routes.TrainingRoutes
import services.system.DatabaseSession
import services.system.api.APIMessageRouter
import services.system.objects.HealthResponse

object ApiRouter:
  def httpApp(database: DatabaseSession): HttpApp[IO] =
    val health = HttpRoutes.of[IO] {
      case GET -> Root / "api" / "health" =>
        database.transaction(connection => IO.blocking(connection.isValid(2))).flatMap { healthy =>
          if healthy then Ok(HealthResponse("ok", "nailong-backend").asJson)
          else ServiceUnavailable(HealthResponse("unavailable", "nailong-backend").asJson)
        }.handleErrorWith(_ => ServiceUnavailable(HealthResponse("unavailable", "nailong-backend").asJson))
    }
    val api = APIMessageRouter.routes(
      PlayerRoutes.apiMessages ++ TrainingRoutes.apiMessages ++ RecordsRoutes.apiMessages,
      database,
      (token, connection) => ResolvePlayerTokenAPIMessage(token).plan(connection)
    )
    (health <+> api).orNotFound
