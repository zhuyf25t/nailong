package soda.parkour

import cats.effect.IO
import io.circe.Json
import org.http4s.{HttpRoutes, Request, Response, Status}
import org.http4s.circe.*
import org.http4s.dsl.io.*
import org.typelevel.ci.CIString
import soda.identity.*
import soda.infrastructure.Http

private[parkour] object Requests:
  private def field(j: Json, key: String): Option[Json] = j.hcursor.downField(key).focus
  private def text(j: Json, key: String): Option[String] = field(j, key).flatMap(_.asString)
  private def number(j: Json, key: String): Option[Double] =
    field(j, key).flatMap(_.asNumber).map(_.toDouble).filter(v => v.isFinite && v >= -1.0 && v <= 1.0)

  def login(j: Json): Option[Login] = for
    name <- text(j, "name").flatMap(Name.read)
    password <- text(j, "password").flatMap(Password.read)
  yield Login(name, password)

  def start(j: Json): Option[StartId] = text(j, "requestId").flatMap(StartId.read)

  def input(j: Json): Option[(InputSequence, InputSample)] = for
    seq <- field(j, "seq").flatMap(_.asNumber).flatMap(_.toLong).flatMap(InputSequence.from)
    mx <- number(j, "mx")
    my <- number(j, "my")
    action <- text(j, "action").flatMap(Action.read)
  yield (seq, InputSample(seq.value, mx, my, action))

final class Routes(accounts: Accounts, shifts: ParkourShifts):
  private val invalid = Http.error(Status.BadRequest, "invalid_request", "请求字段、编号、数值范围或类型无效。")
  private val unauthorized = Http.error(Status.Unauthorized, "unauthorized", "请重新登录。")

  private def authorise(req: Request[IO])(next: Identity => IO[Response[IO]]): IO[Response[IO]] =
    req.headers.get(CIString("Authorization")).map(_.head.value).filter(_.startsWith("Bearer "))
      .flatMap(v => Token.read(v.drop(7))) match
      case None => unauthorized
      case Some(token) => accounts.resolve(token).flatMap(_.fold(unauthorized)(next))

  private def decode[A](req: Request[IO], fields: Set[String])(read: Json => Option[A])
                       (use: A => IO[Response[IO]]): IO[Response[IO]] =
    Http.body[Json](req, fields)(body => read(body).fold(invalid)(use))

  private def inRun(req: Request[IO], raw: String)(next: (PlayerId, RunId) => IO[Response[IO]]): IO[Response[IO]] =
    authorise(req)(user => RunId.read(raw).fold(invalid)(id => next(user.player, id)))

  private def respond(outcome: Either[ParkourProblem, Json]): IO[Response[IO]] = outcome match
    case Right(data) => Ok(data)
    case Left(problem) =>
      val status = if problem == ParkourProblem.NotFound then Status.NotFound else Status.Conflict
      Http.error(status, problem.code, problem.message)

  val all: HttpRoutes[IO] = HttpRoutes.of[IO] {
    case req @ POST -> Root / "v1" / "sessions" =>
      decode(req, Set("name", "password"))(Requests.login) { login =>
        accounts.login(login).flatMap {
          case Some((token, user)) => Ok(Json.obj("token" -> Json.fromString(token.value),
            "name" -> Json.fromString(user.name.value)))
          case None => Http.error(Status.Unauthorized, "invalid_credentials", "昵称和口令没有匹配。")
        }
      }
    case req @ POST -> Root / "v1" / "parkour" / "start" => authorise(req) { user =>
      decode(req, Set("requestId"))(Requests.start) { request =>
        shifts.start(user.player, request).flatMap(respond)
      }
    }
    case req @ GET -> Root / "v1" / "parkour" / "run" / raw =>
      inRun(req, raw)((player, id) => shifts.get(player, id).flatMap(respond))
    case req @ POST -> Root / "v1" / "parkour" / "run" / raw / "input" => inRun(req, raw) { (player, id) =>
      decode(req, Set("seq", "mx", "my", "action"))(Requests.input) { (seq, sample) =>
        shifts.input(player, id, seq, sample).flatMap(respond)
      }
    }
  }
