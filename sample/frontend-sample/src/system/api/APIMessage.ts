export abstract class APIMessage<Response> {
  declare readonly responseType: Response

  get needsUserToken() {
    return false
  }
}
