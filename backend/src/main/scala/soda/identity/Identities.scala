package soda.identity

import java.nio.charset.StandardCharsets
import java.security.{MessageDigest, SecureRandom}
import java.sql.Connection
import java.util.{Base64, UUID}
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.PBEKeySpec
import soda.infrastructure.Sql



object Identities:
  private val rng = new SecureRandom()
  private def random(n: Int): Array[Byte] =
    val bytes = new Array[Byte](n)
    rng.nextBytes(bytes)
    bytes
  private def passwordHash(password: Password, salt: Array[Byte]): Array[Byte] =
    val spec = new PBEKeySpec(password.value.toCharArray, salt, 210000, 256)
    try SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded
    finally spec.clearPassword()
  private def digest(token: Token): Array[Byte] =
    MessageDigest.getInstance("SHA-256").digest(token.value.getBytes(StandardCharsets.US_ASCII))

  def initialize(c: Connection): Unit =
    Sql.ddl(c, """CREATE TABLE IF NOT EXISTS soda_players (
      id uuid PRIMARY KEY, name text UNIQUE NOT NULL, salt bytea NOT NULL, password_hash bytea NOT NULL)""")
    Sql.ddl(c, """CREATE TABLE IF NOT EXISTS soda_sessions (
      token_hash bytea PRIMARY KEY, player_id uuid NOT NULL REFERENCES soda_players(id),
      expires_at timestamptz NOT NULL)""")

  def authenticateOrRegister(c: Connection, login: Login): Option[PlayerId] =
    // A concurrent first login of the same name must see the password chosen by the winner.
    Sql.statement(c, "SELECT pg_advisory_xact_lock(8737,hashtext(?))") { s =>
      s.setString(1, login.name.value)
      Sql.first(s)(_ => ())
    }
    val existing = Sql.statement(c, "SELECT id,salt,password_hash FROM soda_players WHERE name=?") { s =>
      s.setString(1, login.name.value)
      Sql.first(s)(r => (PlayerId(r.getObject(1, classOf[UUID])), r.getBytes(2), r.getBytes(3)))
    }
    existing match
      case Some((id, salt, expected)) =>
        Option.when(MessageDigest.isEqual(expected, passwordHash(login.password, salt)))(id)
      case None =>
        val id = PlayerId(UUID.randomUUID())
        val salt = random(16)
        Sql.statement(c, "INSERT INTO soda_players(id,name,salt,password_hash) VALUES (?,?,?,?)") { s =>
          s.setObject(1, id.value)
          s.setString(2, login.name.value)
          s.setBytes(3, salt)
          s.setBytes(4, passwordHash(login.password, salt))
          s.executeUpdate()
        }
        Some(id)

  def issue(c: Connection, identity: Identity): Token =
    val token = Token.read(Base64.getUrlEncoder.withoutPadding.encodeToString(random(32)))
      .getOrElse(throw new IllegalStateException("Unexpected secure random token encoding"))
    Sql.statement(c, """INSERT INTO soda_sessions(token_hash,player_id,expires_at)
                        VALUES (?,?,now() + interval '7 days')""") { s =>
      s.setBytes(1, digest(token))
      s.setObject(2, identity.player.value)

      s.executeUpdate()
    }
    token

  def resolve(c: Connection, token: Token): Option[Identity] =
    Sql.statement(c, "SELECT p.id,p.name FROM soda_sessions s JOIN soda_players p ON p.id=s.player_id WHERE token_hash=? AND expires_at>now()") { s =>
      s.setBytes(1, digest(token))
      Sql.first(s)(r => Identity(PlayerId(r.getObject(1, classOf[UUID])),
        Name.read(r.getString(2)).getOrElse(throw new IllegalStateException("Invalid stored username"))))
    }
