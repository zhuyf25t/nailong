package services.worlds.api
import cats.effect.IO
import io.circe.Decoder
import io.circe.generic.semiauto.deriveDecoder
import java.sql.Connection
import services.player.objects.PlayerId
import services.system.api.APIWithTokenMessage
import services.system.objects.HttpError
import services.worlds.objects.{MapVersion, MapVersionId}
import services.worlds.tables.mapversion.MapVersionTable
final case class GetMapVersionAPIMessage(playerId: PlayerId, mapVersionId: MapVersionId) extends APIWithTokenMessage[MapVersion]:
  def plan(connection: Connection): IO[MapVersion] =
    MapVersionTable.findAccessible(connection, playerId, mapVersionId).flatMap(found => IO.fromOption(found)(HttpError.notFound("地图版本不存在。")))
object GetMapVersionAPIMessage:
  given Decoder[GetMapVersionAPIMessage] = deriveDecoder[GetMapVersionAPIMessage]
