package services.system.objects

final case class HttpError(code: ErrorCode, message: String) extends RuntimeException(message)

object HttpError:
  def validation(message: String): HttpError = HttpError(ErrorCode.ValidationError, message)
  def unauthorized(message: String = "请先登录。"): HttpError = HttpError(ErrorCode.Unauthorized, message)
  def forbidden(message: String = "没有访问权限。"): HttpError = HttpError(ErrorCode.Forbidden, message)
  def notFound(message: String = "内容不存在。"): HttpError = HttpError(ErrorCode.NotFound, message)
  def conflict(message: String): HttpError = HttpError(ErrorCode.Conflict, message)
