package services.system

import cats.effect.{IO, IOApp, Resource}
import com.comcast.ip4s.{Host, Port}
import org.http4s.ember.server.EmberServerBuilder
import org.typelevel.log4cats.slf4j.Slf4jLogger
import services.system.objects.DatabaseConfig
import services.system.routes.ApiRouter

object Main extends IOApp.Simple:
  private val logger = Slf4jLogger.getLogger[IO]

  override def run: IO[Unit] =
    val host = Host.fromString(sys.env.getOrElse("API_HOST", "127.0.0.1"))
      .getOrElse(throw new IllegalArgumentException("Invalid API_HOST"))
    val port = Port.fromString(sys.env.getOrElse("API_PORT", "8080"))
      .getOrElse(throw new IllegalArgumentException("Invalid API_PORT"))
    val server = for
      database <- DatabaseSession.resource(DatabaseConfig.fromEnvironment)
      _ <- Resource.eval(database.transaction(DatabaseInitializer.initialize))
      server <- EmberServerBuilder.default[IO].withHost(host).withPort(port)
        .withHttpApp(ApiRouter.httpApp(database)).build
      _ <- Resource.eval(logger.info(s"Nailong backend ready at http://$host:$port (PostgreSQL connected)."))
    yield server
    server.useForever
