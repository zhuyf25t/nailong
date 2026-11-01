package services.training

import cats.syntax.all.*
import io.circe.Json
import io.circe.parser.decode
import io.circe.syntax.*
import java.util.UUID
import munit.CatsEffectSuite
import services.player.objects.PlayerId
import services.training.api.StartTrainingRunAPIMessage
import services.training.objects.{DroneRules, DroneSpawn, RunId, TerrainConfig, TrainingConfigId, TrainingRunStatus, WeaponConfig}
import services.training.utils.{TrainingConfigResource, ValidateTerrain}

class TrainingValidationSuite extends CatsEffectSuite:
  private val terrain = TerrainConfig(2.25, 5.4, 6, -4, 0.28)
  private val canonical = "c8137000-0000-4000-8000-000000000001"

  test("wrapped domain IDs reject abbreviated, padded and uppercase UUIDs") {
    assertEquals(decode[RunId](s"\"$canonical\""), Right(RunId(UUID.fromString(canonical))))
    List("1-1-1-1-1", canonical.toUpperCase, s" $canonical", s"$canonical ", "invalid").foreach { raw =>
      assert(Json.fromString(raw).as[RunId].isLeft)
      assert(Json.fromString(raw).as[TrainingConfigId].isLeft)
    }
  }

  test("RunId and PlayerId cannot be interchanged") {
    val errors = compileErrors("""
      import services.player.objects.PlayerId
      import services.training.objects.RunId
      import java.util.UUID
      val playerId: PlayerId = RunId(UUID.randomUUID())
    """)
    assert(errors.nonEmpty)
  }

  test("terrain decoding requires every field and finite numbers") {
    assert(terrain.asJson.mapObject(_.remove("ripple")).as[TerrainConfig].isLeft)
    assert(terrain.asJson.mapObject(_.add("hillHeight", Json.fromString("NaN"))).as[TerrainConfig].isLeft)
    assert(terrain.asJson.mapObject(_.add("hillWidth", Json.fromString("Infinity"))).as[TerrainConfig].isLeft)
    assert(terrain.asJson.mapObject(_.add("hillWidth", Json.fromString("5.4"))).as[TerrainConfig].isLeft)
    assert(decode[TerrainConfig]("""{"hillHeight":1e400,"hillWidth":5.4,"hillX":6,"hillZ":-4,"ripple":0.28}""").isLeft)
  }

  test("terrain accepts exact legal range boundaries") {
    for
      _ <- ValidateTerrain(TerrainConfig(0, 2.5, -8, -8, 0))
      _ <- ValidateTerrain(TerrainConfig(4, 9, 8, 8, 0.8))
    yield ()
  }

  test("terrain validates all five numeric fields before persistence") {
    val invalid = List(terrain.copy(hillHeight = -0.001), terrain.copy(hillHeight = 4.001),
      terrain.copy(hillWidth = 2.499), terrain.copy(hillWidth = 9.001),
      terrain.copy(hillX = -8.001), terrain.copy(hillZ = 8.001),
      terrain.copy(ripple = 0.801), terrain.copy(ripple = Double.NaN), terrain.copy(hillX = Double.PositiveInfinity))
    invalid.traverse_(value => ValidateTerrain(value).attempt.map(result => assert(result.isLeft)))
  }

  test("closed run state decoder never accepts arbitrary strings") {
    List("open", "completed", "abandoned").foreach(raw => assert(Json.fromString(raw).as[TrainingRunStatus].isRight))
    List("victory", "OPEN", "", "cancelled").foreach(raw => assert(Json.fromString(raw).as[TrainingRunStatus].isLeft))
  }

  test("start requestId uses strict canonical UUID decoding") {
    val payload = Json.obj(
      "playerId" -> PlayerId(UUID.fromString(canonical)).asJson,
      "requestId" -> Json.fromString(canonical),
      "configId" -> TrainingConfigId(UUID.fromString(canonical)).asJson,
      "configVersion" -> Json.fromString("drone-hunt-v1"),
      "terrain" -> terrain.asJson
    )
    assert(payload.as[StartTrainingRunAPIMessage].isRight)
    assert(payload.mapObject(_.add("requestId", Json.fromString("1-1-1-1-1"))).as[StartTrainingRunAPIMessage].isLeft)
    assert(payload.mapObject(_.remove("terrain")).as[StartTrainingRunAPIMessage].isLeft)
  }

  test("bundled rules match the playable terrain and typed contract") {
    TrainingConfigResource.load().map { config =>
      assertEquals(config.id.value.toString, canonical)
      assertEquals(config.version, "drone-hunt-v2")
      assertEquals(config.terrain, terrain)
      assertEquals(config.drones.maxHp, 3)
      assertEquals(config.drones.spawns.size, 4)
      assertEquals(config.drones.scanFovDegrees, 90.0)
      assertEquals(config.drones.patrolSpeed, 1.1)
      assertEquals(config.drones.chaseSpeed, 7.2)
      assertEquals(config.weapon.fireIntervalMs, 250)
    }
  }

  test("integer configuration codecs require native JSON integers") {
    TrainingConfigResource.load().map { config =>
      List(Json.fromString("3"), Json.fromDoubleOrNull(3.5), Json.fromLong(Int.MaxValue.toLong + 1), Json.Null).foreach { value =>
        assert(config.drones.asJson.mapObject(_.add("maxHp", value)).as[DroneRules].isLeft)
      }
      List(Json.fromString("250"), Json.fromDoubleOrNull(250.5), Json.fromLong(Int.MaxValue.toLong + 1), Json.Null).foreach { value =>
        assert(config.weapon.asJson.mapObject(_.add("fireIntervalMs", value)).as[WeaponConfig].isLeft)
      }
      assert(config.drones.asJson.as[DroneRules].isRight)
      assert(config.weapon.asJson.as[WeaponConfig].isRight)
    }
  }

  test("configuration lower boundaries allow zero speed, radius and timers") {
    TrainingConfigResource.load().flatMap { config =>
      TrainingConfigResource.validate(config.copy(
        drones = config.drones.copy(maxHp = 1, scanRange = 1, scanFovDegrees = 10,
          scanSpeed = 0, alertSpeed = 0, alertSeconds = 0, hitScanSeconds = 0,
          lostSightSeconds = 0, patrolSpeed = 0, chaseSpeed = 0, patrolRadius = 0,
          contactRadius = 0.1, spawnGraceSeconds = 0, spawns = List(DroneSpawn(-80, -80, -1e100))),
        weapon = WeaponConfig(100, 1, 1)
      ))
    }
  }

  test("configuration upper boundaries accept 32 drones and a finite unbounded yaw") {
    TrainingConfigResource.load().flatMap { config =>
      TrainingConfigResource.validate(config.copy(
        drones = config.drones.copy(maxHp = 20, scanRange = 100, scanFovDegrees = 360,
          scanSpeed = 100, alertSpeed = 100, alertSeconds = 60, hitScanSeconds = 60,
          lostSightSeconds = 60, patrolSpeed = 20, chaseSpeed = 20, patrolRadius = 50,
          contactRadius = 5, spawnGraceSeconds = 60, spawns = List.fill(32)(DroneSpawn(80, 80, 1e100))),
        weapon = WeaponConfig(5000, 100, 100)
      ))
    }
  }

  test("configuration rejects each bounded drone parameter outside the shared domain") {
    TrainingConfigResource.load().flatMap { config =>
      val d = config.drones
      val invalid = List(
        d.copy(maxHp = 0), d.copy(maxHp = 21),
        d.copy(spawns = Nil), d.copy(spawns = List.fill(33)(d.spawns.head)),
        d.copy(scanRange = 0.999), d.copy(scanRange = 100.001),
        d.copy(scanFovDegrees = 9.999), d.copy(scanFovDegrees = 360.001),
        d.copy(scanSpeed = -0.001), d.copy(scanSpeed = 100.001),
        d.copy(alertSpeed = -0.001), d.copy(alertSpeed = 100.001),
        d.copy(alertSeconds = -0.001), d.copy(alertSeconds = 60.001),
        d.copy(hitScanSeconds = -0.001), d.copy(hitScanSeconds = 60.001),
        d.copy(lostSightSeconds = -0.001), d.copy(lostSightSeconds = 60.001),
        d.copy(spawnGraceSeconds = -0.001), d.copy(spawnGraceSeconds = 60.001),
        d.copy(patrolSpeed = -0.001), d.copy(patrolSpeed = 20.001),
        d.copy(chaseSpeed = -0.001), d.copy(chaseSpeed = 20.001),
        d.copy(patrolRadius = -0.001), d.copy(patrolRadius = 50.001),
        d.copy(contactRadius = 0.099), d.copy(contactRadius = 5.001),
        d.copy(spawns = List(DroneSpawn(-80.001, 0, 0))),
        d.copy(spawns = List(DroneSpawn(80.001, 0, 0))),
        d.copy(spawns = List(DroneSpawn(0, -80.001, 0))),
        d.copy(spawns = List(DroneSpawn(0, 80.001, 0)))
      )
      invalid.traverse_(rules => TrainingConfigResource.validate(config.copy(drones = rules)).attempt
        .map(result => assert(result.isLeft, rules.toString)))
    }
  }

  test("configuration rejects invalid weapon limits and nonfinite constructed values") {
    TrainingConfigResource.load().flatMap { config =>
      val w = config.weapon
      val badWeapons = List(w.copy(fireIntervalMs = 99), w.copy(fireIntervalMs = 5001),
        w.copy(projectileSpeed = 0.999), w.copy(projectileSpeed = 100.001),
        w.copy(projectileRange = 0.999), w.copy(projectileRange = 100.001),
        w.copy(projectileSpeed = Double.NaN), w.copy(projectileRange = Double.PositiveInfinity))
      val invalid = badWeapons.map(value => config.copy(weapon = value)) ++ List(
        config.copy(drones = config.drones.copy(scanSpeed = Double.NaN)),
        config.copy(drones = config.drones.copy(contactRadius = Double.PositiveInfinity)),
        config.copy(drones = config.drones.copy(spawns = List(DroneSpawn(0, 0, Double.NegativeInfinity))))
      )
      invalid.traverse_(value => TrainingConfigResource.validate(value).attempt.map(result => assert(result.isLeft)))
    }
  }
