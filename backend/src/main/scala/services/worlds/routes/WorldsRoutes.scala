package services.worlds.routes
import services.system.api.RegisteredAPIMessage
import services.system.api.RegisteredAPIMessage.{api, apiWithToken, noRequest}
import services.worlds.api.*
import services.worlds.objects.*
import services.worlds.objects.apiTypes.*
object WorldsRoutes:
  val apiMessages: List[RegisteredAPIMessage] = List(
    noRequest[ListMissionsAPIMessage, MissionListResponse](ListMissionsAPIMessage()),
    api[GetMissionAPIMessage, MissionDefinition],
    apiWithToken[ListMyMapsAPIMessage, MapListResponse],
    apiWithToken[GetMapDraftAPIMessage, MapDraft],
    apiWithToken[GetMapVersionAPIMessage, MapVersion],
    // A valid 48-object / 96-waypoint world can exceed the ordinary 16 KiB request limit.
    apiWithToken[SaveMapDraftAPIMessage, MapDraft].copy(maxRequestBytes = 64 * 1024),
    apiWithToken[CloneMapAPIMessage, MapDraft],
    apiWithToken[CreateMapVersionAPIMessage, MapVersion]
  )
