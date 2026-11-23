package soda

import cats.effect.{IO, IOApp, Resource}
import cats.syntax.all.*
import com.comcast.ip4s.*
import io.circe.Json
import java.net.{InetAddress, NetworkInterface}
import java.nio.file.{Files, Path}
import org.http4s.{HttpApp, HttpRoutes, Status}
import org.http4s.circe.*
import org.http4s.dsl.io.*
import org.http4s.ember.server.EmberServerBuilder
import scala.concurrent.duration.*
import soda.identity.{Accounts, Identities}
import soda.infrastructure.{Database,Http,Sql}
import soda.night.{NightJournal,NightShifts}

object Main extends IOApp.Simple:
  private def bindPort: IO[Port] = sys.env.get("SODA_HTTP_PORT") match
    case None => IO.pure(port"8738")
    case Some(raw) => IO.fromOption(raw.toIntOption.filter(n => n >= 1 && n <= 65535).flatMap(Port.fromInt))(
      new IllegalArgumentException("SODA_HTTP_PORT must be an integer between 1 and 65535"))

  private def bindHost: IO[Ipv4Address] = IO.blocking {
    sys.env.get("SODA_BIND_HOST") match
      case None => ipv4"127.0.0.1"
      case Some(raw) =>
        val address = Ipv4Address.fromString(raw).getOrElse(
          throw new IllegalArgumentException("SODA_BIND_HOST must be an IPv4 address assigned to this computer"))
        val inet = InetAddress.getByName(raw)
        if inet.isAnyLocalAddress || NetworkInterface.getByInetAddress(inet) == null then
          throw new IllegalArgumentException("SODA_BIND_HOST must name one local network interface")
        address
  }
  private def awaitStop: IO[Unit] = sys.env.get("SODA_STOP_FILE") match
    case None => IO.never
    case Some(file) =>
      val path = Path.of(file)
      def poll: IO[Unit] = IO.blocking(Files.exists(path)).flatMap { found =>
        if found then IO.unit else IO.sleep(300.millis) *> IO.defer(poll)
      }
      poll

  private def app(db: Database, accounts: Accounts, shifts: NightShifts): HttpApp[IO] =
    val health = HttpRoutes.of[IO] { case GET -> Root / "health" =>
      db.transaction(c => Sql.statement(c,"SELECT 1")(s => Sql.first(s)(_.getInt(1)))).attempt.flatMap {
        case Right(Some(1)) => Ok(Json.obj("status" -> Json.fromString("ok"), "game" -> Json.fromString("nightshift")))
        case _ => Http.error(Status.ServiceUnavailable,"db_unavailable","数据库暂时不可用。")
      }
    }
    val router = health <+> new Routes(accounts,shifts).all
    cats.data.Kleisli { req =>
      router.run(req).value.flatMap(_.fold(Http.error(Status.NotFound,"not_found","接口不存在。"))(IO.pure))
        .handleErrorWith(e => IO.println(s"Request failed: ${e.getClass.getSimpleName}") *>
          Http.error(Status.InternalServerError,"internal_error","请求暂时无法处理。"))
    }

  val run: IO[Unit] = (for
    host <- Resource.eval(bindHost)
    port <- Resource.eval(bindPort)
    db <- Database.resource
    _ <- Resource.eval(db.transaction { c => Identities.initialize(c); NightJournal.initialize(c) })
    shifts <- NightShifts.resource(new NightJournal(db))
    _ <- EmberServerBuilder.default[IO].withHost(host).withPort(port)
      .withHttpApp(app(db,new Accounts(db),shifts)).build
  yield ()).use(_ => awaitStop)
