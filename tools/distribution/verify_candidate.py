"""Extract and play a Windows release on dedicated ports before optionally publishing it locally."""
import argparse
import io
import os
from pathlib import Path, PurePosixPath
import shutil
import subprocess
import uuid
from zipfile import ZipFile

from build import PACKAGE_NAME, WORKSPACE, sha256


def extract(candidate, proof):
    expected = candidate.with_suffix(".sha256").read_text("ascii").split()[0]
    if sha256(candidate) != expected:
        raise RuntimeError("Candidate SHA-256 mismatch.")
    root = "Only Three On Shift"
    with ZipFile(candidate) as archive:
        names = archive.namelist()
        if len(names) != len(set(names)):
            raise RuntimeError("Duplicate release entries.")
        for entry in names:
            parts = PurePosixPath(entry).parts
            if (not parts or parts[0] != root or "\\" in entry or ":" in entry or ".." in parts
                    or parts[-1] in {"database.key", "PG_VERSION", "postmaster.pid", ".env", "service.json"}):
                raise RuntimeError(f"Unexpected release entry: {entry}")
        # ZipFile verifies each entry's CRC while extracting into the new directory.
        archive.extractall(proof)
        with ZipFile(io.BytesIO(archive.read(root + "/app/server/lib/night-service.jar"))) as jar:
            for cls in ("NightEngine$", "StoryView", "StoryPuzzles$", "SleepWatch$"):
                jar.getinfo("soda/night/" + cls + ".class")
    print(f"Verified SHA-256 and extracted {len(names)} entries.", flush=True)
    return proof / root


def play(client, save, evidence, mode, label, ports):
    print(label, flush=True)
    command = ["cmd.exe", "/d", "/c", "Play.cmd", mode, "-DataDir", str(save),
               "-HttpPort", str(ports[0]), "-DatabasePort", str(ports[1])]
    prefs = evidence.parent / "godot-preferences"
    prefs.mkdir(exist_ok=True)
    child_env = dict(os.environ, APPDATA=str(prefs), NIGHT_QA_HOME=str(prefs))
    run = subprocess.run(command, cwd=client, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                         stderr=subprocess.STDOUT, creationflags=subprocess.CREATE_NO_WINDOW, env=child_env)
    for name in ("client.log", "client-error.log", "game-server-errors.log", "database-stop.log"):
        if (save / name).is_file():
            shutil.copy2(save / name, evidence / (label + "-" + name))
    log_path = save / "client.log"
    log = log_path.read_text("utf-8-sig", errors="replace") if log_path.is_file() else ""
    if run.returncode or "SCRIPT ERROR:" in log or "ERROR:" in log:
        details = run.stdout.decode("utf-8", "replace")
        raise RuntimeError(f"{label} exited {run.returncode}.\n{details[-1000:]}\n{log[-2500:]}")
    if (save / "service.json").exists() or (save / "pg/postmaster.pid").exists():
        raise RuntimeError(f"{label}: local server or database did not shut down.")
    for line in log.splitlines():
        if "PASS" in line or line.startswith("Opened ") or "verified " in line:
            print(line, flush=True)


def publish(candidate, output):
    output.mkdir(parents=True, exist_ok=True)
    target = output / PACKAGE_NAME
    if target.resolve() == candidate:
        raise RuntimeError("Use a separate directory for the candidate and published file.")
    # Old releases stay playable throughout extraction and all three test runs.
    temp = target.with_suffix(".zip.new")
    sum_temp = target.with_suffix(".sha256.new")
    shutil.copyfile(candidate, temp)
    checksum = sha256(temp)
    if checksum != candidate.with_suffix(".sha256").read_text("ascii").split()[0]:
        raise RuntimeError("Local publish copy failed SHA-256 verification.")
    sum_temp.write_text(checksum + "  " + PACKAGE_NAME + "\n", "ascii")
    os.replace(temp, target)
    os.replace(sum_temp, target.with_suffix(".sha256"))
    print(f"{target}\nSHA-256 {checksum}", flush=True)


def main():
    args = argparse.ArgumentParser(description=__doc__)
    args.add_argument("candidate", type=Path)
    args.add_argument("--http-port", type=int, default=18741)
    args.add_argument("--database-port", type=int, default=55443)
    args.add_argument("--publish-to", type=Path, help="Publish locally after all checks pass.")
    opts = args.parse_args()
    candidate = opts.candidate.resolve()
    proof = WORKSPACE / "tmp" / ("night-release-proof-" + uuid.uuid4().hex[:10])
    evidence = proof / "logs"
    evidence.mkdir(parents=True)
    print(f"Acceptance logs: {evidence}", flush=True)
    client = extract(candidate, proof / "中文解包")
    save = proof / "独立验收存档"
    ports = (opts.http_port, opts.database_port)
    play(client, save, evidence, "-QuickCheck", "01-first-launch", ports)
    play(client, save, evidence, "-SmokeTest", "02-eight-nights", ports)
    play(client, save, evidence, "-QuickCheck", "03-reopen-save", ports)
    if opts.publish_to:
        publish(candidate, opts.publish_to.resolve())


if __name__ == "__main__":
    main()
