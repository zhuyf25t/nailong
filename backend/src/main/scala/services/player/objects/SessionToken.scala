package services.player.objects

import io.circe.{Decoder, Encoder}

/** 只在登录响应和请求认证边界使用；数据库只保存摘要。 */
final case class SessionToken(value: String)

object SessionToken:
  given Encoder[SessionToken] = Encoder.encodeString.contramap(_.value)
  given Decoder[SessionToken] = Decoder.decodeString.emap { value =>
    if value.matches("[A-Za-z0-9_-]{43}") then Right(SessionToken(value))
    else Left("会话令牌格式错误。")
  }
