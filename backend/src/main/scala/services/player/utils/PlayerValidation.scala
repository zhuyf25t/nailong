package services.player.utils

import cats.effect.IO
import services.system.objects.HttpError
import java.nio.charset.StandardCharsets
import java.util.Locale

object PlayerValidation:
  private[player] def normalizeUsername(value: String): String = value.trim.toLowerCase(Locale.ROOT)

  private[player] def validateUsername(value: String): IO[Unit] =
    if value.matches("[a-z0-9_]{3,24}") then IO.unit
    else IO.raiseError(HttpError.validation("用户名须为 3–24 个英文字母、数字或下划线。"))

  private[player] def validateNickname(value: String): IO[Unit] =
    val length = value.codePointCount(0, value.length)
    if length >= 1 && length <= 24 && !value.exists(Character.isISOControl) then IO.unit
    else IO.raiseError(HttpError.validation("昵称须为 1–24 个字符，不能包含控制字符。"))

  private[player] def validatePassword(value: String): IO[Unit] =
    val characters = value.codePointCount(0, value.length)
    val bytes = value.getBytes(StandardCharsets.UTF_8).length
    if characters >= 8 && bytes <= 128 then IO.unit
    else IO.raiseError(HttpError.validation("密码至少 8 个字符，UTF-8 长度不能超过 128 字节。"))
