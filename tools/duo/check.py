"""Test two independent Godot clients against the running Soda Scramble server."""

import argparse
from contextlib import ExitStack
import json
import os
from pathlib import Path
import subprocess
import time
from urllib.request import urlopen
from uuid import uuid4


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--godot", default=os.environ.get("GODOT_BIN") or
                        r"D:\HW3Tools\Godot-4.7.2\Godot_v4.7.2-stable_win64_console.exe")
    parser.add_argument("--capture", action="store_true",
                        help="Open two graphical clients and save their actual framebuffers.")
    args = parser.parse_args()
    project = Path(__file__).resolve().parents[2]
    bridge = project / ".runtime" / "duo" / uuid4().hex
    bridge.mkdir(parents=True)
    base = os.environ.get("SODA_API_URL", "http://127.0.0.1:8737").rstrip("/")
    with urlopen(base + "/health", timeout=3) as response:
        if json.load(response).get("game") != "soda":
            raise RuntimeError("Soda Scramble must be running first.")
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    processes = []
    with ExitStack() as files:
        try:
            for role in ("guest", "host"):
                engine = [args.godot, "--path", str(project / "game"), "--max-fps", "60"]
                if args.capture:
                    engine += ["--rendering-method", "gl_compatibility"]
                else:
                    engine += ["--headless"]
                engine += ["--log-file", str(bridge / (role + ".engine.log")),
                           "--script", str(Path(__file__).with_name("client.gd")),
                           "--", role, str(bridge)]
                log = files.enter_context((bridge / (role + ".log")).open("wb"))
                processes.append(subprocess.Popen(engine, stdout=log, stderr=subprocess.STDOUT,
                                                  creationflags=flags))
            deadline = time.monotonic() + 100
            while any(p.poll() is None for p in processes):
                if any(p.returncode not in (None, 0) for p in processes):
                    raise RuntimeError(f"A client failed. Inspect {bridge}")
                if time.monotonic() >= deadline:
                    raise TimeoutError(f"Two-client test exceeded 100 seconds. Inspect {bridge}")
                time.sleep(0.15)
            if any(p.returncode != 0 for p in processes):
                raise RuntimeError(f"A client failed. Inspect {bridge}")
            for role in ("host", "guest"):
                result = json.loads((bridge / (role + "-pass.json")).read_text(encoding="utf-8"))
                print(f"{role}: " + json.dumps(result, ensure_ascii=False))
            print(f"PASS  two Godot processes, one room, remote movement/shield and AI substitution. {bridge}")
        finally:
            for process in processes:
                if process.poll() is None:
                    process.terminate()
            for process in processes:
                process.wait(timeout=10)


if __name__ == "__main__":
    main()
