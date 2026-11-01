package services.worlds.api
import cats.effect.IO
import io.circe.Decoder
import io.circe.generic.semiauto.deriveDecoder
import java.sql.Connection
import services.player.objects.PlayerId
import services.system.api.APIWithTokenMessage
import services.worlds.objects.{MapDraft, MapVersionId}
import services.worlds.tables.mapdraft.MapDraftTable
import services.worlds.utils.ValidateWorld
final case class CloneMapAPIMessage(playerId: PlayerId, mapVersionId: MapVersionId) extends APIWithTokenMessage[MapDraft]:
  def plan(connection: Connection): IO[MapDraft] = for
    source <- GetMapVersionAPIMessage(playerId, mapVersionId).plan(connection)
    _ <- ValidateWorld(source.world)
    draft <- MapDraftTable.create(connection, playerId, source.world)
  yield draft
object CloneMapAPIMessage:
  given Decoder[CloneMapAPIMessage] = deriveDecoder[CloneMapAPIMessage]
