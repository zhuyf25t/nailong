package services.records.routes

import services.records.api.{GetMyBestAPIMessage, GetTrainingResultAPIMessage, ListMyResultsAPIMessage, SaveTrainingResultAPIMessage}
import services.records.objects.TrainingResult
import services.records.objects.apiTypes.{PersonalBestResponse, ResultListResponse, ResultLookupResponse}
import services.system.api.RegisteredAPIMessage
import services.system.api.RegisteredAPIMessage.apiWithToken

object RecordsRoutes:
  val apiMessages: List[RegisteredAPIMessage] = List(
    apiWithToken[SaveTrainingResultAPIMessage, TrainingResult],
    apiWithToken[GetTrainingResultAPIMessage, ResultLookupResponse],
    apiWithToken[ListMyResultsAPIMessage, ResultListResponse],
    apiWithToken[GetMyBestAPIMessage, PersonalBestResponse]
  )
