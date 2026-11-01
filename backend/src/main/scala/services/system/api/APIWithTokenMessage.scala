package services.system.api

/** Constructed only after the HTTP boundary has resolved the untrusted session token. */
trait APIWithTokenMessage[Response] extends APIMessage[Response]
