package routes

import cats.effect.IO
import cats.syntax.semigroupk.*
import org.http4s.HttpApp
import org.http4s.HttpRoutes
import org.http4s.implicits.*
import services.books.routes.BooksRoutes
import services.user.routes.UserRoutes
import system.api.APIMessageRouter

object ApiRouter:

  private val allRoutes: HttpRoutes[IO] =
    HealthRouter.routes <+> APIMessageRouter.routes(
      UserRoutes.apiMessages ++ BooksRoutes.apiMessages,
      UserRoutes.resolveUserToken
    )

  val httpApp: HttpApp[IO] = allRoutes.orNotFound
