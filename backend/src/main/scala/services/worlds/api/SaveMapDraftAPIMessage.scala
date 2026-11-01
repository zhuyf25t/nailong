package services.worlds.api
import cats.effect.IO
import io.circe.Decoder
import io.circe.generic.semiauto.deriveDecoder
import java.sql.Connection
import services.player.objects.PlayerId
import services.system.api.APIWithTokenMessage
import services.system.objects.HttpError
import services.worlds.objects.{MapDraft, MapId, WorldDefinition}
import services.worlds.tables.mapdraft.MapDraftTable
import services.worlds.utils.{ValidateWorld, WorldWireCodecs}
import WorldWireCodecs.given
final case class SaveMapDraftAPIMessage(playerId: PlayerId, mapId: MapId, expectedRevision: Int, title: String, world: WorldDefinition) extends APIWithTokenMessage[MapDraft]:
  def plan(connection: Connection): IO[MapDraft] = for
    _ <- IO.raiseWhen(expectedRevision < 0 || expectedRevision == Int.MaxValue)(HttpError.validation("草稿 revision 超出范围。"))
    _ <- IO.raiseWhen(title != world.title)(HttpError.validation("地图标题必须与 world.title 一致。"))
    _ <- ValidateWorld(world)
    owned <- MapDraftTable.findOwned(connection, playerId, mapId, lock = true)
    _ <- IO.fromOption(owned)(HttpError.notFound("地图草稿不存在。"))
    updated <- MapDraftTable.update(connection, playerId, mapId, expectedRevision, world)
  yield updated
object SaveMapDraftAPIMessage:
  given Decoder[SaveMapDraftAPIMessage] = deriveDecoder[SaveMapDraftAPIMessage]
