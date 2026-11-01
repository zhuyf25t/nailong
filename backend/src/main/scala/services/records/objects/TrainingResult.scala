package services.records.objects

import io.circe.{Decoder, Encoder}
import io.circe.generic.semiauto.{deriveDecoder, deriveEncoder}
import services.player.objects.PlayerId
import services.system.objects.TimeCodecs.given
import services.training.objects.{RunId, TerrainConfig, TrainingConfigId}
import java.time.Instant

final case class TrainingResult(
  runId: RunId,
  playerId: PlayerId,
  configId: TrainingConfigId,
  configVersion: String,
  terrain: TerrainConfig,
  outcome: ResultOutcome,
  shotsFired: Int,
  hits: Int,
  destroyed: Int,
  elapsedMs: Long,
  accuracy: Double,
  submittedAt: Instant
)

object TrainingResult:
  given Encoder[TrainingResult] = deriveEncoder[TrainingResult]
  given Decoder[TrainingResult] = deriveDecoder[TrainingResult]
