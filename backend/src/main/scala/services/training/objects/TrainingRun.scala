package services.training.objects

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}
import java.time.Instant
import java.util.UUID
import scala.util.Try
import services.player.objects.PlayerId
import services.system.objects.TimeCodecs.given

final case class TrainingRun(
  id: RunId,
  playerId: PlayerId,
  requestId: UUID,
  config: TrainingConfig,
  terrain: TerrainConfig,
  status: TrainingRunStatus,
  startedAt: Instant,
  completedAt: Option[Instant],
  setup: Option[RunSetup] = None
)

object TrainingRun:
  private given Decoder[UUID] = Decoder.decodeString.emap { value =>
    Try(UUID.fromString(value)).toEither.left.map(_ => "requestId 必须是 UUID")
      .flatMap(uuid => Either.cond(uuid.toString == value, uuid, "requestId 必须是规范小写 UUID"))
  }
  given Encoder[TrainingRun] = deriveEncoder[TrainingRun]
  given Decoder[TrainingRun] = deriveDecoder[TrainingRun]
