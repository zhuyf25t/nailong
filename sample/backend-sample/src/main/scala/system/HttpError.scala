package system

sealed abstract class HttpError(message: String) extends RuntimeException(message)

object HttpError:
  final case class BadRequest(message: String) extends HttpError(message)
  final case class Unauthorized(message: String) extends HttpError(message)
  final case class Forbidden(message: String) extends HttpError(message)
  final case class NotFound(message: String) extends HttpError(message)
  final case class Conflict(message: String) extends HttpError(message)
