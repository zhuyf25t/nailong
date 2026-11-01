package services.training.routes

import services.system.api.RegisteredAPIMessage
import services.system.api.RegisteredAPIMessage.{apiWithToken, noRequest}
import services.training.api.{AbandonTrainingRunAPIMessage, GetTrainingConfigAPIMessage, GetTrainingRunAPIMessage, StartTrainingRunAPIMessage}
import services.training.objects.{TrainingConfig, TrainingRun}
import services.training.objects.apiTypes.AbandonRunResponse

object TrainingRoutes:
  val apiMessages: List[RegisteredAPIMessage] = List(
    noRequest[GetTrainingConfigAPIMessage, TrainingConfig](GetTrainingConfigAPIMessage()),
    apiWithToken[StartTrainingRunAPIMessage, TrainingRun],
    apiWithToken[GetTrainingRunAPIMessage, TrainingRun],
    apiWithToken[AbandonTrainingRunAPIMessage, AbandonRunResponse]
  )
