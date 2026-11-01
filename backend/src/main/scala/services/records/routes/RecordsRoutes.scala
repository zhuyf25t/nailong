package services.records.routes

import services.records.api.*
import services.records.objects.TrainingResult
import services.records.objects.apiTypes.*
import services.system.api.RegisteredAPIMessage
import services.system.api.RegisteredAPIMessage.apiWithToken

object RecordsRoutes:
  val apiMessages: List[RegisteredAPIMessage] = List(
    apiWithToken[SaveTrainingResultAPIMessage, TrainingResult],
    apiWithToken[GetTrainingResultAPIMessage, ResultLookupResponse],
    apiWithToken[ListMyResultsAPIMessage, ResultListResponse],
    apiWithToken[GetMyBestAPIMessage, PersonalBestResponse],
    apiWithToken[SaveRunEventsAPIMessage, RecordingSaveResponse].copy(maxRequestBytes = 2 * 1024 * 1024),
    apiWithToken[GetRunEventsAPIMessage, RunEventsLookupResponse],
    apiWithToken[SaveRunReplayAPIMessage, RecordingSaveResponse].copy(maxRequestBytes = 8 * 1024 * 1024),
    apiWithToken[GetRunReplayAPIMessage, RunReplayLookupResponse]
  )
