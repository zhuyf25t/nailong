package services.worlds

import munit.CatsEffectSuite
import io.circe.parser.decode
import java.nio.file.{Files, Path}
import services.system.objects.{ErrorCode, HttpError}
import services.training.objects.TerrainConfig
import services.worlds.objects.*
import services.worlds.utils.ValidateWorld

class WorldValidationSuite extends CatsEffectSuite:
  private val base = WorldDefinition(
    schemaVersion = 1,
    title = "可到达的花谷",
    terrain = TerrainConfig(0, 2.5, 0, 0, 0),
    bounds = WorldBounds(12),
    spawn = WorldSpawn(0, -8, 0),
    objects = Nil,
    drones = List(WorldDrone("drone-one", -7, 0, 0, Nil)),
    beacon = WorldMarker("beacon", 0, 7, 1),
    extraction = WorldMarker("extraction", 0, -8, 1)
  )
  private def codes(world: WorldDefinition): Set[String] = ValidateWorld.issues(world).map(_.code).toSet
  private def box(id: String, x: Double, z: Double, width: Double = 1, depth: Double = 1,
      height: Double = 1, kind: WorldObjectKind = WorldObjectKind.Crate): WorldObject =
    WorldObject(id, kind, x, z, width, depth, height)
  private val enclosed = base.copy(
    beacon = base.beacon.copy(z = 6),
    objects = List(
      box("west-wall", -3, 6, 0.5, 6, 3, WorldObjectKind.Wall),
      box("east-wall", 3, 6, 0.5, 6, 3, WorldObjectKind.Wall),
      box("north-wall", 0, 9, 5.5, 0.5, 3, WorldObjectKind.Wall),
      box("south-wall", 0, 3, 5.5, 0.5, 3, WorldObjectKind.Wall)
    )
  )

  test("an open map is valid and spawn may lie in extraction") {
    assertEquals(ValidateWorld.issues(base), Nil)
    ValidateWorld(base)
  }

  test("both shared playable templates pass the independent server geometry check") {
    List("garden-courtyard", "forest-crossroads").foreach { name =>
      val json = Files.readString(Path.of(s"../shared/worlds/$name.json"))
      val world = decode[WorldDefinition](json).fold(error => fail(error.getMessage), identity)
      assertEquals(ValidateWorld.issues(world), Nil, name)
    }
  }

  test("schema, bounded title and stable globally unique entity IDs are validated") {
    assert(codes(base.copy(schemaVersion = 2)).contains("schema_invalid"))
    List(" ", "长" * 81).foreach(title => assert(codes(base.copy(title = title)).contains("invalid_title")))
    assertEquals(ValidateWorld.issues(base.copy(title = "长" * 80)), Nil)
    List("1-drone", "Uppercase", "has space", "a" * 65).foreach { id =>
      assert(codes(base.copy(drones = List(base.drones.head.copy(id = id)))).contains("invalid_id"))
    }
    assertEquals(ValidateWorld.issues(base.copy(drones = List(base.drones.head.copy(id = "a" * 64)))), Nil)
    assert(codes(base.copy(beacon = base.beacon.copy(id = base.drones.head.id))).contains("duplicate_id"))
    assert(codes(base.copy(extraction = base.extraction.copy(id = base.beacon.id))).contains("duplicate_id"))
  }

  test("all numeric domains reject nonfinite constructed values before navigation") {
    val invalid = List(
      base.copy(bounds = WorldBounds(Double.NaN)),
      base.copy(spawn = base.spawn.copy(x = Double.PositiveInfinity)),
      base.copy(spawn = base.spawn.copy(yaw = Double.NaN)),
      base.copy(spawn = base.spawn.copy(yaw = 1000001)),
      base.copy(terrain = base.terrain.copy(ripple = Double.NegativeInfinity)),
      base.copy(objects = List(box("bad", 4, 0, Double.NaN))),
      base.copy(objects = List(box("bad", Double.NaN, 0))),
      base.copy(drones = List(base.drones.head.copy(yaw = Double.PositiveInfinity))),
      base.copy(drones = List(base.drones.head.copy(yaw = -1000001))),
      base.copy(drones = List(base.drones.head.copy(patrol = List(WorldPoint(0, Double.NaN))))),
      base.copy(beacon = base.beacon.copy(radius = Double.NaN)),
      base.copy(extraction = base.extraction.copy(z = Double.PositiveInfinity))
    )
    invalid.foreach(world => assert(ValidateWorld.issues(world).nonEmpty))
  }

  test("title budget counts the original text including surrounding whitespace") {
    val title = " " + "长" * 80
    assertEquals(title.length, 81)
    assertEquals(title.trim.length, 80)
    assert(codes(base.copy(title = title)).contains("invalid_title"))
    assertEquals(ValidateWorld.issues(base.copy(title = " " + "长" * 79)), Nil)
  }

  test("static IDs cannot collide with player, projectile or tool replay entities") {
    List("player", "projectile-1", "projectile-custom", "tool-1", "tool-custom").foreach { id =>
      val invalid = List(
        base.copy(objects = List(box(id, 4, 0))),
        base.copy(drones = List(base.drones.head.copy(id = id))),
        base.copy(beacon = base.beacon.copy(id = id)),
        base.copy(extraction = base.extraction.copy(id = id))
      )
      invalid.foreach(world => assert(codes(world).contains("reserved_id"), id))
    }
    assertEquals(ValidateWorld.issues(base.copy(objects = List(box("player-statue", 4, 0)))), Nil)
  }

  test("half-size and terrain accept exact endpoints and reject the adjacent out-of-range values") {
    assertEquals(ValidateWorld.issues(base.copy(bounds = WorldBounds(48), terrain = TerrainConfig(4, 9, 8, -8, 0.8))), Nil)
    List(11.999, 48.001).foreach(size => assert(codes(base.copy(bounds = WorldBounds(size))).contains("bounds_invalid")))
    val t = base.terrain
    List(t.copy(hillHeight = -0.001), t.copy(hillHeight = 4.001), t.copy(hillWidth = 2.499), t.copy(hillWidth = 9.001),
      t.copy(hillX = -8.001), t.copy(hillZ = 8.001), t.copy(ripple = -0.001), t.copy(ripple = 0.801))
      .foreach(terrain => assert(codes(base.copy(terrain = terrain)).contains("invalid_terrain")))
  }

  test("object budget admits 48 entities and rejects the 49th") {
    val objects = (0 until 48).map(i => box(s"box-$i", 20 + i % 8 * 2, -20 + i / 8 * 2, 0.5, 0.5, 0.5)).toList
    val full = base.copy(bounds = WorldBounds(48), objects = objects)
    assertEquals(ValidateWorld.issues(full), Nil)
    assert(codes(full.copy(objects = objects :+ box("box-extra", 20, 20))).contains("object_budget"))
  }

  test("drone and patrol budgets include their endpoints") {
    val drones = (0 until 8).map(i => WorldDrone(s"drone-$i", -8, -4 + i, 1000000, List.fill(12)(WorldPoint(-8, 0)))).toList
    assertEquals(ValidateWorld.issues(base.copy(drones = drones)), Nil)
    assert(codes(base.copy(drones = Nil)).contains("drone_budget"))
    assert(codes(base.copy(drones = drones :+ drones.head.copy(id = "extra-drone"))).contains("drone_budget"))
    assert(codes(base.copy(drones = List(drones.head.copy(patrol = List.fill(13)(WorldPoint(-8, 0)))))).contains("patrol_budget"))
  }

  test("object dimensions use the exact .5–16 footprint and .5–8 height bounds") {
    val wide = base.copy(bounds = WorldBounds(48))
    assertEquals(ValidateWorld.issues(wide.copy(objects = List(box("small", 20, 20, 0.5, 0.5, 0.5)))), Nil)
    assertEquals(ValidateWorld.issues(wide.copy(objects = List(box("large", 20, 20, 16, 16, 8)))), Nil)
    val good = box("box", 20, 20)
    List(good.copy(width = 0.499), good.copy(width = 16.001), good.copy(depth = 0.499), good.copy(depth = 16.001),
      good.copy(height = 0.499), good.copy(height = 8.001)).foreach { entity =>
      assert(codes(wide.copy(objects = List(entity))).contains("invalid_size"))
    }
  }

  test("marker radius endpoints are valid and radius overflow is rejected") {
    assertEquals(ValidateWorld.issues(base.copy(beacon = base.beacon.copy(radius = 0.6))), Nil)
    assertEquals(ValidateWorld.issues(base.copy(beacon = base.beacon.copy(radius = 4))), Nil)
    List(0.599, 4.001).foreach(radius => assert(codes(base.copy(beacon = base.beacon.copy(radius = radius))).contains("invalid_size")))
  }

  test("the full footprint, player radius, drone radius and marker circle must fit inside bounds") {
    assertEquals(ValidateWorld.issues(base.copy(objects = List(box("edge", 11.5, 0)))), Nil)
    assert(codes(base.copy(objects = List(box("edge", 11.501, 0)))).contains("out_of_bounds"))
    assertEquals(ValidateWorld.issues(base.copy(spawn = base.spawn.copy(x = 11.45))), Nil)
    assert(codes(base.copy(spawn = base.spawn.copy(x = 11.451))).contains("out_of_bounds"))
    assertEquals(ValidateWorld.issues(base.copy(drones = List(base.drones.head.copy(x = 11.35)))), Nil)
    assert(codes(base.copy(drones = List(base.drones.head.copy(x = 11.351)))).contains("out_of_bounds"))
    assertEquals(ValidateWorld.issues(base.copy(beacon = base.beacon.copy(z = 11))), Nil)
    assert(codes(base.copy(beacon = base.beacon.copy(z = 11.001))).contains("out_of_bounds"))
  }

  test("entity overlap is rejected but touching edges are allowed") {
    val first = box("first", 3, 0, 2, 2)
    assertEquals(ValidateWorld.issues(base.copy(objects = List(first, box("second", 5, 0, 2, 2)))), Nil)
    val issues = ValidateWorld.issues(base.copy(objects = List(first, box("second", 4.99, 0, 2, 2))))
    assert(issues.exists(issue => issue.code == "entity_overlap" && issue.objectId.contains("second")))
  }

  test("spawn, drone, patrol and entire marker circles cannot embed in any entity, including gates") {
    assert(codes(base.copy(objects = List(box("gate", 0, -8, kind = WorldObjectKind.Gate)))).contains("blocked_spawn"))
    assert(codes(base.copy(objects = List(box("crate", -7, 0)))).contains("blocked_drone"))
    assert(codes(base.copy(objects = List(box("crate", 4, 0)), drones = List(base.drones.head.copy(patrol = List(WorldPoint(4, 0)))))).contains("blocked_patrol"))
    assert(codes(base.copy(objects = List(box("crate", 1.4, 7)))).contains("blocked_marker"))
    // A circle near an AABB corner must use circular clearance, not a square footprint.
    assert(!codes(base.copy(objects = List(box("corner", 0.99, -7.01)), extraction = WorldMarker("extraction", -5, -8, 1))).contains("blocked_spawn"))
  }

  test("beacon cannot overlap spawn or extraction while extraction can overlap spawn") {
    assert(codes(base.copy(beacon = base.beacon.copy(z = -8))).contains("entity_overlap"))
    assert(codes(base.copy(extraction = base.extraction.copy(z = 7))).contains("entity_overlap"))
  }

  test("a closed wall courtyard makes the beacon unreachable") {
    assertEquals(codes(enclosed), Set("unreachable_beacon", "unreachable_extraction"))
  }

  test("a gate that only opens after beacon activation cannot be the sole route to that beacon") {
    val gate = enclosed.objects.last.copy(kind = WorldObjectKind.Gate)
    assertEquals(codes(enclosed.copy(objects = enclosed.objects.init :+ gate)), Set("unreachable_beacon"))
  }

  test("beacon activation can open the sole gate to the extraction region") {
    val world = enclosed.copy(
      beacon = WorldMarker("beacon", -6, 6, 1),
      extraction = WorldMarker("extraction", 0, 6, 1),
      objects = enclosed.objects.init :+ enclosed.objects.last.copy(kind = WorldObjectKind.Gate)
    )
    assertEquals(ValidateWorld.issues(world), Nil)
    assertEquals(codes(world.copy(objects = enclosed.objects)), Set("unreachable_extraction"))
  }

  test("an enclosed extraction fails independently of the beacon") {
    val world = enclosed.copy(beacon = WorldMarker("beacon", -6, 6, 1), extraction = WorldMarker("extraction", 0, 6, 1))
    assertEquals(codes(world), Set("unreachable_extraction"))
  }

  test("a full-width thin wall cannot be crossed between lattice rows") {
    val world = base.copy(drones = List(base.drones.head.copy(z = -3)), objects = List(
      box("west-barrier", -6, 0.5, 12, 0.5, 3, WorldObjectKind.Wall),
      box("east-barrier", 6, 0.5, 12, 0.5, 3, WorldObjectKind.Wall)
    ))
    assertEquals(codes(world), Set("unreachable_beacon", "unreachable_extraction"))
  }

  test("fractional spawn and marker centers connect to nearby reachable lattice anchors") {
    val world = base.copy(bounds = WorldBounds(12.4), spawn = WorldSpawn(0.49, -8.49, 0),
      beacon = WorldMarker("beacon", 0.49, 7.49, 0.6), extraction = WorldMarker("extraction", 0.49, -8.49, 0.6))
    assertEquals(ValidateWorld.issues(world), Nil)
  }

  test("public IO entry rejects an invalid map with a typed validation error") {
    ValidateWorld(enclosed).attempt.map {
      case Left(error: HttpError) =>
        assertEquals(error.code, ErrorCode.ValidationError)
        assert(error.message.contains("信标"))
      case other => fail(s"Expected a validation error, got $other")
    }
  }
