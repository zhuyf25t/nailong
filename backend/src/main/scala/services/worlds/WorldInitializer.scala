package services.worlds
import cats.effect.IO
import cats.syntax.all.*
import java.sql.Connection
import services.training.tables.trainingconfig.TrainingConfigTable
import services.worlds.objects.MissionObjective
import services.worlds.tables.mapdraft.{MapDraftTable, MapDraftTableInitializer}
import services.worlds.tables.mapversion.{MapVersionTable, MapVersionTableInitializer}
import services.worlds.tables.mission.{MissionTable, MissionTableInitializer}
import services.worlds.utils.{ValidateWorld, WorldResources}

object WorldInitializer:
  def initialize(connection: Connection): IO[Unit] =
    for
      _ <- MapDraftTableInitializer.initialize(connection)
      _ <- MapVersionTableInitializer.initialize(connection)
      _ <- MissionTableInitializer.initialize(connection)
      templates <- IO(WorldResources.templates)
      missions <- IO(WorldResources.missions)
      _ <- IO.raiseWhen(templates.size < 2 || templates.map(_.id).distinct.size != templates.size || templates.map(_.mapId).distinct.size != templates.size)(new IllegalStateException("Built-in templates need distinct map and version IDs"))
      _ <- templates.traverse_ { template => for
        _ <- IO.raiseWhen(!template.builtIn || template.version != 1 || template.title != template.world.title)(new IllegalStateException("Invalid built-in map metadata"))
        _ <- ValidateWorld(template.world)
        _ <- MapDraftTable.insertBuiltIn(connection, template)
        _ <- MapVersionTable.insertBuiltIn(connection, template)
      yield () }
      current <- TrainingConfigTable.current(connection)
      _ <- IO.raiseWhen(missions.map(_.id).distinct.size != missions.size)(new IllegalStateException("Duplicate bundled mission IDs"))
      _ <- missions.traverse_ { mission => for
        template <- IO.fromOption(templates.find(_.id == mission.mapVersionId))(new IllegalStateException("Mission refers to an unknown template"))
        _ <- IO.raiseWhen(mission.configVersion != current.version || mission.allowedTools.isEmpty || mission.allowedTools.distinct.size != mission.allowedTools.size)(new IllegalStateException("Invalid mission rule version or tools"))
        _ <- mission.objective match
          case MissionObjective.ClearDrones => IO.unit
          case MissionObjective.ActivateExtract(beacon, extraction) => IO.raiseWhen(beacon != template.world.beacon.id || extraction != template.world.extraction.id)(new IllegalStateException("Mission markers disagree with the map"))
        _ <- MissionTable.insertPublished(connection, mission)
      yield () }
    yield ()
