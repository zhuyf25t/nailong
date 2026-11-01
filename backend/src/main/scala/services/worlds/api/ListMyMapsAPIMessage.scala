package services.worlds.api
import cats.effect.IO
import cats.syntax.all.*
import io.circe.Decoder
import io.circe.generic.semiauto.deriveDecoder
import java.sql.Connection
import services.player.objects.PlayerId
import services.system.api.APIWithTokenMessage
import services.system.objects.HttpError
import services.worlds.objects.apiTypes.MapListResponse
import services.worlds.tables.mapdraft.MapDraftTable
import services.worlds.tables.mapversion.MapVersionTable
import services.worlds.utils.{WorldResources, WorldWireCodecs}
import WorldWireCodecs.given
final case class ListMyMapsAPIMessage(playerId: PlayerId, offset: Int, limit: Int) extends APIWithTokenMessage[MapListResponse]:
  def plan(connection: Connection): IO[MapListResponse] = for
    _ <- IO.raiseWhen(offset < 0 || offset > 100000 || limit < 1 || limit > 100)(HttpError.validation("分页 offset 必须在 0–100000，limit 必须在 1–100。"))
    maps <- MapDraftTable.listOwned(connection, playerId, offset, limit)
    total <- MapDraftTable.countOwned(connection, playerId)
    templates <- WorldResources.templates.traverse(template => MapVersionTable.findBuiltIn(connection, template.id)
      .flatMap(found => IO.fromOption(found)(new IllegalStateException("Built-in version is missing"))))
  yield MapListResponse(maps, total, templates)
object ListMyMapsAPIMessage:
  given Decoder[ListMyMapsAPIMessage] = deriveDecoder[ListMyMapsAPIMessage]
