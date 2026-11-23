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
import scala.io.Source
import scala.util.Using
import soda.identity.{Accounts, Identities}
import soda.infrastructure.{Database,Http,Sql}
import soda.rooms.{Results,Rooms}
import soda.sim.Arena

object Main extends IOApp.Simple:
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

  private def app(db: Database, accounts: Accounts, rooms: Rooms): HttpApp[IO] =
    val health = HttpRoutes.of[IO] { case GET -> Root / "health" =>
      db.transaction(c => Sql.statement(c,"SELECT 1")(s => Sql.first(s)(_.getInt(1)))).attempt.flatMap {
        case Right(Some(1)) => Ok(Json.obj("status" -> Json.fromString("ok"), "game" -> Json.fromString("soda")))
        case _ => Http.error(Status.ServiceUnavailable,"db_unavailable","数据库暂时不可用。")
      }
    }
    val router = health <+> new Routes(accounts,rooms).all
    cats.data.Kleisli { req =>
      router.run(req).value.flatMap(_.fold(Http.error(Status.NotFound,"not_found","接口不存在。"))(IO.pure))
        .handleErrorWith(e => IO.println(s"Request failed: ${e.getClass.getSimpleName}") *>
          Http.error(Status.InternalServerError,"internal_error","请求暂时无法处理。"))
    }

  val run: IO[Unit] = (for
    host <- Resource.eval(bindHost)
    arena <- Resource.eval(IO.blocking {
      val raw = Using.resource(Source.fromResource("arena.json")(using scala.io.Codec.UTF8))(_.mkString)
      Arena.fromJson(raw).fold(msg => throw new IllegalArgumentException(msg), arena => arena)
    })
    db <- Database.resource
    _ <- Resource.eval(db.transaction { c => Identities.initialize(c); Results.initialize(c) })
    rooms <- Rooms.start(arena,new Results(db))
    _ <- EmberServerBuilder.default[IO].withHost(host).withPort(port"8737")
      .withHttpApp(app(db,new Accounts(db),rooms)).build
  yield ()).use(_ => awaitStop)
