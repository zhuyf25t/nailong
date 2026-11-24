import json
import os
import sys
import time
import urllib.error
import urllib.request
import uuid

BASE = os.environ.get("SODA_API_URL", "http://127.0.0.1:8739").rstrip("/")


def request(path, body=None, token=None, method=None):
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(BASE + path, data=data, method=method or ("POST" if data is not None else "GET"))
    req.add_header("Content-Type", "application/json")
    req.add_header("Accept", "application/json")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    try:
        with urllib.request.urlopen(req, timeout=8) as response:
            raw = response.read().decode("utf-8")
            return response.status, json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        raw = error.read().decode("utf-8")
        return error.code, json.loads(raw) if raw else None


def fail(message):
    print("PARKOUR HTTP FAIL: " + message)
    sys.exit(1)


def main():
    status, health = request("/health")
    if status != 200 or health.get("game") != "discontinuous":
        fail("health check failed: %s %s" % (status, health))

    name = "跑酷验收·" + uuid.uuid4().hex[:10]
    password = uuid.uuid4().hex + uuid.uuid4().hex
    status, login = request("/v1/sessions", {"name": name, "password": password})
    if status != 200 or not login.get("token"):
        fail("login failed: %s %s" % (status, login))
    token = login["token"]

    status, started = request("/v1/parkour/start", {"requestId": str(uuid.uuid4())}, token)
    if status != 200:
        fail("start failed: %s %s" % (status, started))
    run_id = started.get("runId")
    view = started.get("view") or {}
    rooms = started.get("rooms") or []
    if not run_id or view.get("level") != 1 or len(rooms) != 14:
        fail("start payload incomplete")
    start_x = float(view["player"]["x"])

    seq = int(view.get("ack", -1)) + 1
    for _ in range(45):
        status, view = request("/v1/parkour/run/%s/input" % run_id,
                               {"seq": seq, "mx": 1.0, "my": 0.0, "action": "none"}, token)
        if status != 200:
            fail("movement input failed: %s %s" % (status, view))
        seq += 1
        time.sleep(0.05)

    if float(view["player"]["x"]) <= start_x + 8.0:
        fail("player did not move: %.1f -> %.1f" % (start_x, float(view["player"]["x"])))

    status, view = request("/v1/parkour/run/%s/input" % run_id,
                           {"seq": seq, "mx": 0.0, "my": 0.0, "action": "read"}, token)
    seq += 1
    if status != 200:
        fail("read input failed: %s %s" % (status, view))
    time.sleep(0.15)
    status, view = request("/v1/parkour/run/%s" % run_id, token=token)
    if status != 200 or view.get("reading") is None:
        fail("reading did not start")
    status, view = request("/v1/parkour/run/%s/input" % run_id,
                           {"seq": seq, "mx": 0.0, "my": 0.0, "action": "read"}, token)
    if status != 200:
        fail("read input failed: %s %s" % (status, view))
    time.sleep(0.15)
    status, view = request("/v1/parkour/run/%s" % run_id, token=token)
    if status != 200 or view.get("reading") is not None:
        fail("reading did not finish")

    print("PARKOUR HTTP PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
