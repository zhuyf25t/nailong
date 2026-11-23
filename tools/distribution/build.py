"""Build a self-contained Windows x64 release using local Godot, JDK and PostgreSQL."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import uuid
import xml.etree.ElementTree as ET
from zipfile import ZIP_DEFLATED, ZipFile

TOOLS = Path(__file__).resolve().parent
REPO = TOOLS.parents[1]
WORKSPACE = REPO.parent
JRE_MODULES = (
    "java.base,java.instrument,java.logging,java.management,java.naming,"
    "java.net.http,java.security.jgss,java.security.sasl,java.sql,java.xml,"
    "jdk.charsets,jdk.crypto.ec,jdk.unsupported"
)
PACKAGE_NAME = "Only-Three-on-Shift-Windows-x64.zip"
RUNTIME_NOTICES = {
    "licenses/Java-NOTICE.txt", "licenses/Java-upstream-release.txt",
    "licenses/server_license.txt", "licenses/commandlinetools_3rd_party_licenses.txt",
}


def sha256(path):
    with path.open("rb") as fd:
        return hashlib.file_digest(fd, "sha256").hexdigest()


def run(command, cwd=None, expect_clean=False):
    result = subprocess.run([str(arg) for arg in command], cwd=cwd, stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT, creationflags=subprocess.CREATE_NO_WINDOW)
    output = result.stdout.decode("utf-8", "replace")
    if result.returncode or (expect_clean and any(
            phrase in output for phrase in ["SCRIPT ERROR", "Parse Error", "Failed to load", "Can't open file"])):
        raise RuntimeError(output[-6000:] or f"{command[0]} exited {result.returncode}")
    return output


def copy_file(source, target):
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, target)


def make_project(engine, target, app):
    game = REPO / "game"
    project = target / "export-project"
    project.mkdir()
    for name in ["main.tscn", "project.godot"]:
        copy_file(game / name, project / name)
    for name in ["night", "assets/night"]:
        shutil.copytree(game / name, project / name)
    for name in ["night/story_ui.gd", "night/story_world.gd", "assets/night/horror/woodcut_screen.png",
                 "assets/night/horror/frog_ring.png", "assets/night/horror/ending_dawn.png",
                 "assets/night/audio/sleep_gallery.wav", "assets/night/audio/dawn.wav"]:
        if not (project / name).is_file():
            raise RuntimeError(f"Missing eight-night campaign resource: {name}")
    copy_file(game / "tests/night_playthrough.gd", project / "tests/night_playthrough.gd")
    copy_file(game / "tests/night_chapters.gd", project / "tests/night_chapters.gd")
    copy_file(TOOLS / "distribution_check.gd", project / "tests/distribution_check.gd")
    assets = sorted("res://" + p.relative_to(project).as_posix() for p in project.rglob("*")
                    if p.is_file() and p.suffix.lower() not in {".uid", ".import", ".godot"})
    (project / "night-package-files.json").write_text(json.dumps(assets, ensure_ascii=False), "utf-8")
    copy_file(TOOLS / "export_presets.cfg", project / "export_presets.cfg")
    common = [engine, "--headless", "--path", project]
    run([*common, "--log-file", target / "import.log", "--import"], expect_clean=True)
    pack = app / "nightshift.pck"
    run([*common, "--log-file", target / "export.log", "--export-pack", "Night Shift Windows", pack],
        expect_clean=True)
    if pack.stat().st_size < 150000:
        raise RuntimeError("Exported game is missing art.")
    copy_file(engine, app / "engine/NightShift.exe")
    run([*common, "--script", TOOLS / "notices.gd", "--",
         app / "licenses/Godot-Engine-and-libraries.txt"], expect_clean=True)


def read_pom(pom, root, seen=None):
    if not pom.exists():
        return []
    ns = {"p": "http://maven.apache.org/POM/4.0.0"}
    model = ET.parse(pom).getroot()
    licenses = [(entry.findtext("p:name", "", ns), entry.findtext("p:url", "", ns))
                for entry in model.findall("p:licenses/p:license", ns)]
    parent = model.find("p:parent", ns)
    if licenses or parent is None or root is None:
        return licenses
    seen = set() if seen is None else seen
    if pom in seen:
        return []
    seen.add(pom)
    group = parent.findtext("p:groupId", "", ns).replace(".", "/")
    artifact = parent.findtext("p:artifactId", "", ns)
    version = parent.findtext("p:version", "", ns)
    return read_pom(root / group / artifact / version / f"{artifact}-{version}.pom", root, seen)


def make_server(app, use_classes):
    backend = REPO / "backend"
    if not use_classes:
        run(["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File",
             backend / "build.ps1", "-Tasks", "prepareLaunch"])
    entries = [Path(x) for x in (backend / "target/runtime-classpath.txt").read_text("utf-8").strip().split(os.pathsep)]
    classes = [p for p in entries if p.is_dir()]
    if len(classes) != 1 or not (classes[0] / "soda/night").is_dir():
        raise RuntimeError("The compiled night-shift backend was not found on the runtime classpath.")
    server = app / "server/lib"
    server.mkdir(parents=True)
    with ZipFile(server / "night-service.jar", "w", ZIP_DEFLATED) as archive:
        for path in sorted(classes[0].rglob("*.class")):
            archive.write(path, path.relative_to(classes[0]).as_posix())
        resources = backend / "src/main/resources"
        for source in sorted(path for path in resources.rglob("*") if path.is_file()):
            name = source.relative_to(resources)
            compiled = classes[0] / name
            if not compiled.is_file() or sha256(compiled) != sha256(source):
                raise RuntimeError(f"Run prepareLaunch to refresh the backend resource {name}.")
            archive.write(compiled, name.as_posix())
    libs = []
    for jar in [p for p in entries if p.is_file()]:
        if jar.suffix.lower() != ".jar" or (server / jar.name).exists():
            raise RuntimeError(f"Unexpected or duplicate Java dependency: {jar.name}")
        copy_file(jar, server / jar.name)
        maven = next((p for p in jar.parents if p.name == "maven2"), None)
        coordinate = jar.relative_to(maven).as_posix() if maven else jar.name
        source = "https://repo.maven.apache.org/maven2/" + coordinate
        pom = jar.with_suffix(".pom")
        if pom.is_file():
            copy_file(pom, app / "licenses/maven" / pom.name)
        libs.append({"artifact":jar.name, "repository":source, "license":read_pom(pom, maven)})
    (app / "licenses/JVM-dependencies.json").write_text(json.dumps(libs, ensure_ascii=False, indent=2), "utf-8")


def make_java(jdk, app):
    run([jdk / "bin/jlink.exe", "--module-path", jdk / "jmods", "--add-modules", JRE_MODULES,
         "--no-header-files", "--no-man-pages", "--strip-debug", "--compress=zip-6",
         "--output", app / "java"])
    copy_file(jdk / "NOTICE", app / "licenses/Java-NOTICE.txt")
    copy_file(jdk / "release", app / "licenses/Java-upstream-release.txt")
    # Adoptium ships the matching app-local Microsoft runtime beside java.exe.
    # PostgreSQL can use those DLLs via the launcher's child-process PATH.
    for name in ["msvcp140.dll", "vcruntime140.dll", "vcruntime140_1.dll"]:
        if not (app / "java/bin" / name).exists():
            copy_file(jdk / "bin" / name, app / "java/bin" / name)
    version = subprocess.run([str(app / "java/bin/java.exe"), "--version"],
                             capture_output=True, creationflags=subprocess.CREATE_NO_WINDOW)
    if version.returncode:
        raise RuntimeError("The bundled JRE failed its version check.")


def make_postgres(pg, app):
    installed_bin = pg / "bin"
    target = app / "postgres"
    tools = ["postgres.exe", "pg_ctl.exe", "initdb.exe"]
    for name in tools:
        copy_file(installed_bin / name, target / "bin" / name)
    for lib in installed_bin.glob("*.dll"):
        if lib.name.lower().startswith(("wx", "test")):
            continue
        copy_file(lib, target / "bin" / lib.name)
    # initdb uses the system catalogs, timezone database, and language modules.
    # No installed data directory or machine-specific configuration is copied.
    shutil.copytree(pg / "share", target / "share")
    for lib in (pg / "lib").glob("*.dll"):
        copy_file(lib, target / "lib" / lib.name)
    for name in ["server_license.txt", "commandlinetools_3rd_party_licenses.txt"]:
        copy_file(pg / name, app / "licenses" / name)


def reuse_runtime(previous_zip, app):
    checksum_file = previous_zip.with_suffix(".sha256")
    if not checksum_file.is_file():
        raise RuntimeError(f"Missing runtime source checksum: {checksum_file}")
    expected = checksum_file.read_text("ascii").split()
    if not expected or sha256(previous_zip) != expected[0].lower():
        raise RuntimeError("The existing runtime package does not match its SHA-256.")
    prefix = "Only Three On Shift/app/"
    with ZipFile(previous_zip) as archive:
        for member in archive.infolist():
            relative = member.filename.removeprefix(prefix)
            if relative == member.filename or member.is_dir():
                continue
            if not (relative in RUNTIME_NOTICES or relative.startswith(
                    ("java/", "postgres/bin/", "postgres/lib/", "postgres/share/"))):
                continue
            parts = PurePosixPath(relative).parts
            if "\\" in relative or any(part in (".", "..") or ":" in part for part in parts):
                raise RuntimeError(f"Unexpected runtime path: {relative}")
            dest = app.joinpath(*parts)
            dest.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(member) as source, dest.open("xb") as target:
                shutil.copyfileobj(source, target)
    required = RUNTIME_NOTICES | {
        "java/bin/java.exe", "java/lib/modules", "postgres/bin/postgres.exe",
        "postgres/bin/initdb.exe", "postgres/bin/pg_ctl.exe", "postgres/share/postgres.bki",
    }
    for name in sorted(required):
        if not (app / name).is_file():
            raise RuntimeError(f"Runtime source is missing {name}.")


def assemble(args, scratch):
    release = scratch / "Only Three On Shift"
    app = release / "app"
    (app / "licenses").mkdir(parents=True)
    print("Packing game resources...", flush=True)
    make_project(args.godot, scratch, app)
    print("Preparing the Scala service and local database...", flush=True)
    make_server(app, args.use_compiled)
    if args.runtime_from:
        reuse_runtime(args.runtime_from, app)
    else:
        make_java(args.jdk, app)
        make_postgres(args.postgres, app)
    copy_file(TOOLS / "Play.cmd", release / "Play.cmd")
    # Windows PowerShell 5 detects UTF-8 BOM for translated launch messages.
    (app / "launch.ps1").write_text((TOOLS / "launch.ps1").read_text("utf-8-sig"), "utf-8-sig")
    copy_file(TOOLS / "player-zh.txt", release / "使用说明.txt")
    level_doc = REPO / "docs/夜班只有三只-三分钟分镜.pdf"
    if level_doc.is_file():
        copy_file(level_doc, release / "三分钟分镜.pdf")
    return release


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--godot", type=Path, default=Path(os.environ.get(
        "GODOT_BIN", "D:/HW3Tools/Godot-4.7.2/Godot_v4.7.2-stable_win64.exe")))
    parser.add_argument("--postgres", type=Path, default=Path("D:/PostgreSQL"))
    default_jdk = WORKSPACE / "nailong/.tools/jdk-21"
    parser.add_argument("--jdk", type=Path, default=default_jdk if default_jdk.is_dir() else Path(os.getenv("JAVA_HOME", ".")))
    parser.add_argument("--output", type=Path, default=WORKSPACE / "output/night-shift")
    parser.add_argument("--use-compiled", action="store_true", help="Use the existing prepareLaunch classpath.")
    parser.add_argument("--runtime-from", type=Path, metavar="ZIP",
                        help="Reuse only Java/PostgreSQL and their licenses from a checksum-verified release.")
    parser.add_argument("--keep-staging", action="store_true", help="Keep this run's new staging directory for verification.")
    args = parser.parse_args()
    if os.name != "nt":
        parser.error("Build this package on Windows x64.")
    args.output.mkdir(parents=True, exist_ok=True)
    build_area = WORKSPACE / "tmp"
    build_area.mkdir(exist_ok=True)
    scratch = (build_area / ("night-release-" + uuid.uuid4().hex[:12])).resolve()
    if scratch.parent != build_area.resolve() or not scratch.name.startswith("night-release-"):
        raise RuntimeError("Invalid temporary build path.")
    scratch.mkdir()
    try:
        release = assemble(args, scratch)
        archive = scratch / PACKAGE_NAME
        print("Compressing offline package...", flush=True)
        with ZipFile(archive, "w", ZIP_DEFLATED, compresslevel=6) as zipped:
            for path in sorted(release.rglob("*")):
                if path.is_file():
                    zipped.write(path, path.relative_to(scratch).as_posix())
        destination = args.output.resolve() / PACKAGE_NAME
        checksum = sha256(archive)
        staged_zip = destination.with_suffix(".zip.new")
        shutil.copyfile(archive, staged_zip)
        os.replace(staged_zip, destination)
        destination.with_suffix(".sha256").write_text(checksum + "  " + destination.name + "\n", "ascii")
        print(f"{destination}\n{destination.stat().st_size:,} bytes\nSHA-256 {checksum}")
    finally:
        if args.keep_staging:
            print(f"Staging directory: {scratch}")
        elif scratch.parent == build_area.resolve() and scratch.name.startswith("night-release-"):
            shutil.rmtree(scratch)


if __name__ == "__main__":
    main()
