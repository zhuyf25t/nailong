package routes

import cats.effect.IO
import io.circe.syntax.*
import org.http4s.HttpRoutes
import org.http4s.circe.CirceEntityEncoder.*
import org.http4s.dsl.io.*
import system.objects.HealthResponse
import org.typelevel.log4cats.slf4j.Slf4jLogger

object HealthRouter:

  private val logger = Slf4jLogger.getLogger[IO]

  val routes: HttpRoutes[IO] = HttpRoutes.of[IO] {
    case GET -> Root / "api" / "health" =>
      for
        _ <- logger.info("HealthRouter received GET /api/health")
        response <- Ok(HealthResponse(status = "ok", service = "library-backend").asJson)
      yield response
  }
