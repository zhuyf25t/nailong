package services.worlds.utils
import io.circe.Decoder
import io.circe.parser.decode
import scala.io.Source
import scala.util.Using
import services.worlds.objects.*

private[worlds] object WorldResources:
  lazy val templates: List[MapVersion] = read[List[MapVersion]]("worlds/templates.json")
  lazy val missions: List[MissionDefinition] = List("clear-drones", "forest-beacon").map(name => read[MissionDefinition](s"missions/$name.json"))
  private def read[A: Decoder](name: String): A =
    val stream = Option(getClass.getClassLoader.getResourceAsStream(name)).getOrElse(throw new IllegalStateException(s"Missing bundled resource $name"))
    val text = Using.resource(Source.fromInputStream(stream, "UTF-8"))(_.mkString)
    decode[A](text).fold(error => throw new IllegalStateException(s"Invalid bundled resource $name", error), identity)
