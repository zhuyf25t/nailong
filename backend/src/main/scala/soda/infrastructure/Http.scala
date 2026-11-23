package soda.infrastructure

import cats.effect.IO
import io.circe.{Decoder, Json}
import io.circe.parser.parse
import io.circe.syntax.*
import java.nio.ByteBuffer
import java.nio.charset.StandardCharsets.UTF_8
import org.http4s.{Request, Response, Status}
import org.http4s.circe.*
import scala.util.Try

object Http:
  def error(s: Status, code: String, message: String): IO[Response[IO]] =
    IO.pure(Response[IO](s).withEntity(Json.obj("code" -> code.asJson, "message" -> message.asJson)))

  def body[A: Decoder](req: Request[IO], fields: Set[String])(next: A => IO[Response[IO]]): IO[Response[IO]] =
    req.body.take(4097).compile.to(Array).flatMap { bytes =>
      val decoded = for
        _ <- Option.when(bytes.length <= 4096)(())
        text <- Try(UTF_8.newDecoder.decode(ByteBuffer.wrap(bytes)).toString).toOption
        json <- parse(text).toOption
        obj <- json.asObject.filter(_.keys.toSet == fields)
        result <- json.as[A].toOption
      yield result
      decoded.fold(error(Status.BadRequest, "invalid_request", "请求字段、数据类型或格式不正确。"))(next)
    }
