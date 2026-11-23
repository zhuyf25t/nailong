ThisBuild / scalaVersion := "3.3.3"
ThisBuild / organization := "edu.sodascramble"
ThisBuild / version := "1.0.0"
name := "three-on-the-night-shift"
libraryDependencies ++= Seq(
  "org.typelevel" %% "cats-effect" % "3.5.4",
  "org.http4s" %% "http4s-dsl" % "0.23.27",
  "org.http4s" %% "http4s-ember-server" % "0.23.27",
  "org.http4s" %% "http4s-circe" % "0.23.27",
  "io.circe" %% "circe-generic" % "0.14.9",
  "io.circe" %% "circe-parser" % "0.14.9",
  "com.zaxxer" % "HikariCP" % "5.1.0",
  "org.postgresql" % "postgresql" % "42.7.4",
  "org.typelevel" %% "log4cats-slf4j" % "2.7.0",
  "org.slf4j" % "slf4j-simple" % "2.0.13",
  "org.typelevel" %% "munit-cats-effect" % "2.0.0" % Test
)
scalacOptions ++= Seq("-deprecation", "-feature", "-unchecked", "-Werror", "-encoding", "UTF-8")
Compile / run / mainClass := Some("soda.Main")
Test / parallelExecution := false

lazy val prepareLaunch = taskKey[File]("Compile the application and write its runtime classpath")
prepareLaunch := {
  val classpath = (Runtime / fullClasspath).value.map(_.data.getAbsolutePath).mkString(java.io.File.pathSeparator)
  val out = target.value / "runtime-classpath.txt"
  IO.write(out, classpath, java.nio.charset.StandardCharsets.UTF_8)
  out
}
