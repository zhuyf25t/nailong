package services.player.utils

import cats.effect.IO
import services.player.objects.{SessionToken, StoredPlayer}
import java.nio.charset.StandardCharsets
import java.security.{MessageDigest, SecureRandom}
import java.util.{Base64, HexFormat}
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec

object PlayerSecrets:
  private[player] val passwordIterations: Int = 600000
  private lazy val secureRandom = new SecureRandom()

  private[player] def newSalt(): IO[String] = IO.blocking {
    val bytes = new Array[Byte](16)
    secureRandom.nextBytes(bytes)
    HexFormat.of().formatHex(bytes)
  }

  private[player] def newToken(): IO[SessionToken] = IO.blocking {
    val bytes = new Array[Byte](32)
    secureRandom.nextBytes(bytes)
    SessionToken(Base64.getUrlEncoder.withoutPadding().encodeToString(bytes))
  }

  private[player] def hashPassword(password: String, salt: String, iterations: Int): IO[String] = IO.blocking {
    val specification = new PBEKeySpec(password.toCharArray, HexFormat.of().parseHex(salt), iterations, 256)
    try HexFormat.of().formatHex(SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(specification).getEncoded)
    finally specification.clearPassword()
  }

  private[player] def verifyPassword(password: String, stored: Option[StoredPlayer]): IO[Boolean] =
    // 不存在的账号仍执行相同的 KDF，登录响应不会泄露用户名是否已注册。
    val salt = stored.map(_.passwordSalt).getOrElse("00000000000000000000000000000000")
    val iterations = stored.map(_.passwordIterations).getOrElse(passwordIterations)
    val expected = stored.map(_.passwordHash).getOrElse("0" * 64)
    hashPassword(password, salt, iterations).map { actual =>
      val equal = MessageDigest.isEqual(HexFormat.of().parseHex(actual), HexFormat.of().parseHex(expected))
      equal && stored.isDefined
    }

  private[player] def hashToken(token: SessionToken): IO[String] = IO.blocking {
    HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(token.value.getBytes(StandardCharsets.US_ASCII)))
  }
