package services.worlds.api
import cats.effect.IO
import io.circe.Decoder
import io.circe.generic.semiauto.deriveDecoder
import java.sql.Connection
import services.player.objects.PlayerId
import services.system.api.APIWithTokenMessage
import services.system.objects.HttpError
import services.worlds.objects.{MapId, MapVersion}
import services.worlds.tables.mapdraft.MapDraftTable
import services.worlds.tables.mapversion.MapVersionTable
import services.worlds.utils.{ValidateWorld, WorldWireCodecs}
import WorldWireCodecs.given
final case class CreateMapVersionAPIMessage(playerId: PlayerId, mapId: MapId, expectedRevision: Int) extends APIWithTokenMessage[MapVersion]:
  def plan(connection: Connection): IO[MapVersion] = for
    _ <- IO.raiseWhen(expectedRevision < 0)(HttpError.validation("草稿 revision 不能为负数。"))
    found <- MapDraftTable.findOwned(connection, playerId, mapId, lock = true)
    draft <- IO.fromOption(found)(HttpError.notFound("地图草稿不存在。"))
    previous <- MapVersionTable.findByRevision(connection, mapId, expectedRevision)
    version <- previous match
      case Some(existing) => IO.pure(existing)
      case None =>
        for
          _ <- IO.raiseWhen(draft.revision != expectedRevision)(HttpError.conflict("草稿版本已变化，请刷新后再冻结。"))
          _ <- ValidateWorld(draft.world)
          result <- MapVersionTable.create(connection, draft)
        yield result
  yield version
object CreateMapVersionAPIMessage:
  given Decoder[CreateMapVersionAPIMessage] = deriveDecoder[CreateMapVersionAPIMessage]
