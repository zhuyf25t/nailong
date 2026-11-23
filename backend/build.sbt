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

lazy val prepareServer = taskKey[File]("Freeze the compiled application for a running local server")
prepareServer := {
  val jar = (Compile / packageBin).value
  val dependencies = (Runtime / dependencyClasspath).value.map(_.data.getAbsolutePath)
  val bytes = java.nio.file.Files.readAllBytes(jar.toPath)
  val hash = java.security.MessageDigest.getInstance("SHA-256").digest(bytes).map(b => f"${b & 0xff}%02x").mkString
  val directory = baseDirectory.value / ".night-runtime" / "versions"
  IO.createDirectory(directory)
  val frozen = directory / (hash + ".jar")
  if (!frozen.exists()) {
    val staged = java.nio.file.Files.createTempFile(directory.toPath, "night-", ".tmp")
    try {
      java.nio.file.Files.write(staged, bytes)
      try java.nio.file.Files.move(staged, frozen.toPath, java.nio.file.StandardCopyOption.ATOMIC_MOVE)
      catch { case _: java.nio.file.FileAlreadyExistsException => () }
    } finally java.nio.file.Files.deleteIfExists(staged)
  }
  val out = target.value / "runtime-server-classpath.txt"
  IO.write(out, (frozen.getAbsolutePath +: dependencies).mkString(java.io.File.pathSeparator), java.nio.charset.StandardCharsets.UTF_8)
  out
}
