package services.worlds.api
import cats.effect.IO
import io.circe.Decoder
import io.circe.generic.semiauto.deriveDecoder
import java.sql.Connection
import services.player.objects.PlayerId
import services.system.api.APIWithTokenMessage
import services.system.objects.HttpError
import services.worlds.objects.{MapDraft, MapId}
import services.worlds.tables.mapdraft.MapDraftTable
final case class GetMapDraftAPIMessage(playerId: PlayerId, mapId: MapId) extends APIWithTokenMessage[MapDraft]:
  def plan(connection: Connection): IO[MapDraft] =
    MapDraftTable.findOwned(connection, playerId, mapId).flatMap(found => IO.fromOption(found)(HttpError.notFound("地图草稿不存在。")))
object GetMapDraftAPIMessage:
  given Decoder[GetMapDraftAPIMessage] = deriveDecoder[GetMapDraftAPIMessage]
