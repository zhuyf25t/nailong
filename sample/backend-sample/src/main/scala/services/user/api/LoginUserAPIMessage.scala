package services.user.api

import cats.effect.IO
import services.user.objects.{StoredUser, UserProfile}
import services.user.objects.apiTypes.AuthResponse
import services.user.tables.users.UserTable
import services.user.tables.usersession.UserSessionTable
import system.HttpError
import system.api.APIMessage

import java.nio.charset.StandardCharsets
import java.security.{MessageDigest, SecureRandom}
import java.sql.Connection
import java.time.Instant
import java.time.temporal.ChronoUnit
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec

final case class LoginUserAPIMessage(
  username: String,
  password: String
) extends APIMessage[AuthResponse]:

  private val secureRandom = SecureRandom()
  private val PasswordIterations = 120000
  private val PasswordKeyLength = 256

  override def plan(connection: Connection): IO[AuthResponse] =
    val cleanUsername = normalizeUsername(username)
    val cleanPassword = password.trim

    for
      stored <- UserTable.findByUsername(connection, cleanUsername).flatMap {
        case Some(user) => IO.pure(user)
        case None => IO.raiseError(HttpError.Unauthorized("账号不存在，请检查用户名。"))
      }
      valid <- IO.blocking(hashPassword(cleanPassword, stored.passwordSalt) == stored.passwordHash)
      _ <- if valid then IO.unit else IO.raiseError(HttpError.Unauthorized("密码错误，请重新输入。"))
      response <- createSession(connection, stored)
    yield response

  private def createSession(connection: Connection, stored: StoredUser): IO[AuthResponse] =
    for
      token <- IO.blocking(randomToken())
      hash = tokenHash(token)
      expiresAt = Instant.now().plus(8, ChronoUnit.HOURS)
      _ <- UserSessionTable.insert(connection, hash, stored.id, expiresAt)
    yield AuthResponse(
      ok = true,
      token = Some(token),
      user = Some(profileFromStored(stored)),
      message = None
    )

  private def profileFromStored(user: StoredUser): UserProfile =
    UserProfile(
      id = user.id,
      username = user.username,
      role = user.role,
      createdAt = user.createdAt
    )

  private def normalizeUsername(username: String): String =
    username.trim.toLowerCase

  private def randomToken(): String =
    val bytes = Array.ofDim[Byte](32)
    secureRandom.nextBytes(bytes)
    toHex(bytes)

  private def hashPassword(password: String, saltHex: String): String =
    val keySpec = PBEKeySpec(password.toCharArray, fromHex(saltHex), PasswordIterations, PasswordKeyLength)
    val keyFactory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
    toHex(keyFactory.generateSecret(keySpec).getEncoded)

  private def tokenHash(token: String): String =
    val digest = MessageDigest.getInstance("SHA-256")
    toHex(digest.digest(token.getBytes(StandardCharsets.UTF_8)))

  private def toHex(bytes: Array[Byte]): String =
    bytes.map(byte => f"${byte & 0xff}%02x").mkString

  private def fromHex(hex: String): Array[Byte] =
    hex.grouped(2).map(Integer.parseInt(_, 16).toByte).toArray
