package soda.identity

import java.util.UUID


final case class PlayerId(value: UUID)
final case class Identity(player: PlayerId, name: Name)

final class Name private (val value: String)
object Name:
  def read(raw: String): Option[Name] =
    val value = raw.strip
    val len = value.codePointCount(0, value.length)
    Option.when(len >= 1 && len <= 32 && !value.codePoints.anyMatch(Character.isISOControl))(new Name(value))

final class Password private (val value: String):
  override def toString: String = "<password>"
object Password:
  def read(raw: String): Option[Password] =
    val len = raw.codePointCount(0, raw.length)
    Option.when(len >= 8 && len <= 128)(new Password(raw))

final class Token private (val value: String):
  override def toString: String = "<token>"
object Token:
  def read(raw: String): Option[Token] = Option.when(raw.matches("[A-Za-z0-9_-]{43}"))(new Token(raw))

final case class Login(name: Name, password: Password)
