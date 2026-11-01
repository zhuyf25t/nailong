import cats.effect.{IO, IOApp}
import com.comcast.ip4s.{Port, host, port}
import services.books.tables.book.BookTableInitializer
import services.books.tables.borrowrecord.BorrowRecordTableInitializer
import services.user.tables.users.UserTableInitializer
import services.user.tables.usersession.UserSessionTableInitializer
import system.DatabaseSession
import routes.ApiRouter
import org.http4s.ember.server.EmberServerBuilder
import org.http4s.server.Server
import org.http4s.server.middleware.Logger
import org.typelevel.log4cats.slf4j.Slf4jLogger

object Main extends IOApp.Simple:

  private val logger = Slf4jLogger.getLogger[IO]
  private val httpPort: Port =
    sys.env
      .get("HTTP_PORT")
      .orElse(sys.env.get("PORT"))
      .flatMap(_.toIntOption)
      .flatMap(Port.fromInt)
      .getOrElse(port"8080")

  private val httpApp =
    Logger.httpApp(logHeaders = true, logBody = false)(ApiRouter.httpApp)

  private val serverResource: cats.effect.Resource[IO, Server] =
    for
      _ <- DatabaseSession.initialize
      _ <- cats.effect.Resource.eval(
        DatabaseSession.withTransactionConnection(connection =>
          for
            _ <- UserTableInitializer.initialize(connection)
            _ <- UserSessionTableInitializer.initialize(connection)
            _ <- BookTableInitializer.initialize(connection)
            _ <- BorrowRecordTableInitializer.initialize(connection)
            _ <- BookTableInitializer.seedSamples(connection)
          yield ()
        )
      )
      server <- EmberServerBuilder
        .default[IO]
        .withHost(host"0.0.0.0")
        .withPort(httpPort)
        .withHttpApp(httpApp)
        .build
    yield server

  override def run: IO[Unit] =
    for
      _ <- logger.info(s"Starting library backend on http://0.0.0.0:${httpPort.value}")
      _ <- serverResource.useForever
    yield ()
