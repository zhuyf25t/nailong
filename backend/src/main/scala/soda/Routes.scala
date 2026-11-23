package soda

import cats.effect.IO
import io.circe.Json
import org.http4s.{HttpRoutes, Request, Response, Status}
import org.http4s.circe.*
import org.http4s.dsl.io.*
import org.typelevel.ci.CIString
import soda.identity.*
import soda.infrastructure.Http
import soda.rooms.*
import soda.sim.{Controls, Mode, Weapon}

private[soda] object Requests:
  def string(j: Json, key: String): Option[String] = j.hcursor.downField(key).focus.flatMap(_.asString)
  private def field(j: Json, key: String): Option[Json] = j.hcursor.downField(key).focus
  def login(j: Json): Option[Login] = for
    n <- string(j,"name").flatMap(Name.read)
    p <- string(j,"password").flatMap(Password.read)
  yield Login(n,p)

  def input(j: Json): Option[(InputSeq,Controls)] = for
    seq <- field(j,"seq").flatMap(_.asNumber).flatMap(_.toLong).flatMap(InputSeq.read)
    obj <- field(j,"input").flatMap(_.asObject)
    if obj.keys.toSet == Set("moveX","moveY","aimX","aimY","fire","weapon","reload","dash","shield")
    x <- obj("moveX").flatMap(_.asNumber).map(_.toDouble)
    y <- obj("moveY").flatMap(_.asNumber).map(_.toDouble)
    ax <- obj("aimX").flatMap(_.asNumber).map(_.toDouble)
    ay <- obj("aimY").flatMap(_.asNumber).map(_.toDouble)
    fire <- obj("fire").flatMap(_.asBoolean)
    w <- obj("weapon").flatMap(_.asNumber).flatMap(_.toInt).flatMap(Weapon.fromIndex)
    reload <- obj("reload").flatMap(_.asBoolean)
    dash <- obj("dash").flatMap(_.asBoolean)
    shield <- obj("shield").flatMap(_.asBoolean)
    controls <- Controls.from(x,y,ax,ay,fire,w,reload,dash,shield).toOption
  yield (seq,controls)

final class Routes(accounts: Accounts, rooms: Rooms):
  private val invalid = Http.error(Status.BadRequest,"invalid_request","请求字段、编号、数值范围或类型无效。")
  private val unauthorized = Http.error(Status.Unauthorized,"unauthorized","请重新登录。")
  private def authorise(req: Request[IO])(next: Identity => IO[Response[IO]]): IO[Response[IO]] =
    req.headers.get(CIString("Authorization")).map(_.head.value).filter(_.startsWith("Bearer "))
      .flatMap(v => Token.read(v.drop(7))) match
      case None => unauthorized
      case Some(token) => accounts.resolve(token).flatMap(_.fold(unauthorized)(next))

  private def decodeBody[A](req: Request[IO], fields: Set[String])(decode: Json => Option[A])
                           (use: A => IO[Response[IO]]): IO[Response[IO]] =
    Http.body[Json](req,fields)(j => decode(j).fold(invalid)(use))
  private def inRoom(req: Request[IO], raw: String)(use: (Identity, RoomCode) => IO[Response[IO]]): IO[Response[IO]] =
    authorise(req)(u => RoomCode.read(raw).fold(invalid)(c => use(u,c)))
  private def response(result: Either[RoomError,Json]): IO[Response[IO]] = result match
    case Right(json) => Ok(json)
    case Left(e) =>
      val status = e match
        case RoomError.Missing => Status.NotFound
        case RoomError.Forbidden => Status.Forbidden
        case _ => Status.Conflict
      Http.error(status,e.code,e.message)

  val all: HttpRoutes[IO] = HttpRoutes.of[IO] {
    case req @ POST -> Root / "v1" / "sessions" =>
      decodeBody(req,Set("name","password"))(Requests.login) { login =>
        accounts.login(login).flatMap {
          case Some((token,user)) => Ok(Json.obj("token" -> Json.fromString(token.value),"name" -> Json.fromString(user.name.value)))
          case None => Http.error(Status.Unauthorized,"invalid_credentials","昵称和口令没有匹配。")
        }
      }
    case req @ POST -> Root / "v1" / "rooms" => authorise(req) { u =>
      decodeBody(req,Set("requestId","mode","skin")) { j =>
        for
          id <- Requests.string(j,"requestId").flatMap(RequestId.read)
          m <- Requests.string(j,"mode").flatMap(s => Mode.values.find(_.wire == s))
          skin <- Requests.string(j,"skin").flatMap(Skin.read)
        yield (id,m,skin)
      } { (id,m,skin) => rooms.create(u,id,m,skin).flatMap(response) }
    }
    case req @ POST -> Root / "v1" / "rooms" / raw / "join" => inRoom(req,raw) { (u,code) =>
      decodeBody(req,Set("requestId","skin")) { j =>
        for
          id <- Requests.string(j,"requestId").flatMap(RequestId.read)
          skin <- Requests.string(j,"skin").flatMap(Skin.read)
        yield (id,skin)
      } { (id,skin) => rooms.join(u,id,code,skin).flatMap(response) }
    }
    case req @ GET -> Root / "v1" / "rooms" / raw => inRoom(req,raw)((u,c) => rooms.snapshot(u,c).flatMap(response))
    case req @ POST -> Root / "v1" / "rooms" / raw / "input" => inRoom(req,raw) { (u,code) =>
      decodeBody(req,Set("seq","input"))(Requests.input)((seq,intent) => rooms.input(u,code,seq,intent).flatMap(response))
    }
    case req @ POST -> Root / "v1" / "rooms" / raw / "leave" => inRoom(req,raw) { (u,code) =>
      Http.body[Json](req,Set.empty)(_ => rooms.leave(u,code).flatMap(r => response(r.map(_ => Json.obj("left" -> Json.True)))))
    }
    case req @ GET -> Root / "v1" / "history" => authorise(req)(u => rooms.history(u).flatMap(j => Ok(j)))
  }
