package services.user.api

import cats.effect.IO
import services.user.objects.{StoredUser, UserProfile, UserRole}
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

final case class RegisterUserAPIMessage(
  username: String,
  password: String,
  role: Option[UserRole]
) extends APIMessage[AuthResponse]:

  private val secureRandom = SecureRandom()
  private val PasswordIterations = 120000
  private val PasswordKeyLength = 256

  override def plan(connection: Connection): IO[AuthResponse] =
    val cleanUsername = normalizeUsername(username)
    val cleanPassword = password.trim

    for
      _ <- validateUsername(cleanUsername)
      _ <- validatePassword(cleanPassword)
      existing <- UserTable.findByUsername(connection, cleanUsername)
      _ <- existing match
        case Some(_) => IO.raiseError(HttpError.Conflict("用户名已存在，请更换后重试。"))
        case None => IO.unit
      salt <- IO.blocking(generateSalt())
      passwordHash <- IO.blocking(hashPassword(cleanPassword, salt))
      stored <- UserTable.insert(
        connection = connection,
        username = cleanUsername,
        passwordHash = passwordHash,
        passwordSalt = salt,
        role = role.getOrElse(UserRole.Reader)
      )
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

  private def validateUsername(username: String): IO[Unit] =
    if username.length >= 3 && username.length <= 80 then IO.unit
    else IO.raiseError(HttpError.BadRequest("用户名长度需在 3 到 80 个字符之间。"))

  private def validatePassword(password: String): IO[Unit] =
    if password.length >= 6 then IO.unit
    else IO.raiseError(HttpError.BadRequest("密码长度至少需要 6 个字符。"))

  private def normalizeUsername(username: String): String =
    username.trim.toLowerCase

  private def generateSalt(): String =
    val bytes = Array.ofDim[Byte](16)
    secureRandom.nextBytes(bytes)
    toHex(bytes)

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
