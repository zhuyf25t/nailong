"""Verify the released HTTP contract with ordinary player inputs and real PostgreSQL."""

import argparse
from concurrent.futures import ThreadPoolExecutor
import json
import math
import os
import secrets
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from uuid import uuid4


BASE = os.environ.get("SODA_API_URL", "http://127.0.0.1:8738").rstrip("/")


def call(path, body=None, token=None, expected=200):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    data = None if body is None else json.dumps(body).encode("utf-8")
    try:
        response = urlopen(Request(BASE + path, data=data, headers=headers), timeout=5)
    except HTTPError as error:
        response = error
    with response:
        result = json.load(response)
        assert response.status == expected, (path, response.status, expected, result.get("code"))
        return result


def eventually(fn, accept, seconds=8):
    end = time.monotonic() + seconds
    while True:
        value = fn()
        if accept(value):
            return value
        if time.monotonic() >= end:
            raise TimeoutError(f"Expected state did not arrive: {value}")
        time.sleep(0.045)


def frame(seq, action="none", aim=(0, -1), move=(0, 0)):
    return {"seq": seq, "mx": move[0], "my": move[1], "ax": aim[0], "ay": aim[1], "action": action}


class Driver:
    def __init__(self, token, view):
        self.token = token
        self.path = "/v1/night/run/" + view["runId"]
        self.seq = view["ack"]

    def read(self):
        return call(self.path, token=self.token)

    def send(self, action="none", aim=(0, -1), move=(0, 0)):
        self.seq += 1
        state = call(self.path + "/input", frame(self.seq, action, aim, move), self.token)
        assert state["ack"] == self.seq, (self.seq, state["ack"])
        return state

    def aim_for(self, state, slot, bank=False):
        x = [104, 240, 376][slot]
        if bank:
            x = (24 - x) if x <= 240 else (936 - x)
        dx, dy = x - state["player"]["x"], 78 - state["player"]["y"]
        length = math.hypot(dx, dy)
        return dx / length, dy / length

    def witness(self):
        state = self.read()
        direction = "right" if state["memory"] == "left" else "left"
        self.send("probe", (1 if direction == "right" else -1, 0))
        visible = eventually(self.read, lambda v: v["probe"] == direction
                             and all(w["look"] != "still" for w in v["windows"]))
        active = [w["slot"] for w in visible["windows"] if w["look"] == direction]
        assert len(active) == 1
        assert all(set(w) == {"slot", "actor", "look"} for w in visible["windows"])
        return visible, active[0]

    def walk_to(self, target, until):
        def walk():
            state = self.read()
            if until(state):
                return state
            dx, dy = target[0] - state["player"]["x"], target[1] - state["player"]["y"]
            distance = max(1, math.hypot(dx, dy))
            return self.send(move=(dx / distance, dy / distance))
        return eventually(walk, until, seconds=10)

    def finish(self):
        for count in range(3):
            state, slot = self.witness()
            self.send("throw", self.aim_for(state, slot, state["bank"]))
            eventually(self.read, lambda v: v["delivered"] == count + 1)
        return self.walk_to((240, 260), lambda v: v["phase"] == "won")


def account():
    return {"name": "shift-" + uuid4().hex[:16], "password": secrets.token_urlsafe(18)}


def ticket(night):
    return {"night": night, "requestId": str(uuid4())}


def run(all_nights=False, wait_restart=False):
    assert call("/health") == {"status": "ok", "game": "nightshift"}
    credentials = account()
    token = call("/v1/sessions", credentials)["token"]
    foreign = call("/v1/sessions", account())["token"]
    empty = {"unlocked": 1, "cleared": [], "bestClean": 0}
    assert call("/v1/night/profile", token=token) == empty
    call("/v1/night/profile", expected=401)
    start = "/v1/night/start"
    assert call(start, ticket(2), token, 409)["code"] == "night_locked"
    call(start, ticket(9), token, 400)
    first = ticket(1)
    with ThreadPoolExecutor(4) as workers:
        copies = list(workers.map(lambda _: call(start, first, token), range(4)))
    assert len({v["runId"] for v in copies}) == 1
    one = Driver(token, copies[0])
    call(one.path, token=foreign, expected=404)
    call(one.path + "/input", frame(0), foreign, 404)
    call(one.path + "/input", {**frame(0), "clean": 3}, token, 400)
    call(one.path + "/input", {**frame(0), "ax": "0"}, token, 400)
    call(one.path + "/input", frame(0, "finish"), token, 400)
    call(start, {**first, "night": 2}, token, 409)
    current = one.send("probe", (1, 0))
    with ThreadPoolExecutor(4) as workers:
        list(workers.map(lambda _: call(one.path + "/input", frame(current["ack"], "throw"), token), range(4)))
    confirmed = eventually(one.read, lambda v: v["event"] == "probe")
    time.sleep(0.24)
    assert one.read()["eventId"] == confirmed["eventId"]
    one.finish()
    assert call("/v1/night/profile", token=token) == {"unlocked": 2, "cleared": [1], "bestClean": 3}
    other = Driver(token, call(start, ticket(2), token))
    call(one.path, token=token, expected=404)
    assert call(start, first, token, 409)["code"] == "run_replaced"
    visible, real = other.witness()
    wrong = next(w["slot"] for w in visible["windows"] if w["slot"] != real)
    other.send("throw", other.aim_for(visible, wrong))
    chase = eventually(other.read, lambda v: v["phase"] == "escaping")
    first_position = chase["chase"]
    assert set(first_position) == {"x", "y"}
    eventually(other.read, lambda v: v["chase"] != first_position)
    panel = (46, 220) if chase["lever"] == "left" else (434, 220)
    other.walk_to(panel, lambda v: v["latched"])
    other.walk_to((240, 260), lambda v: v["phase"] == "escaped")
    assert call("/v1/night/profile", token=token)["cleared"] == [1]
    assert call("/v1/night/profile", token=foreign) == empty
    print("PASS auth, ownership, strict bounds, concurrent starts, duplicate edges, stale starts, "
          "night one, counterfeit, lever escape and clean persistence.", flush=True)
    if all_nights:
        for night in range(2, 9):
            shift = Driver(token, call(start, ticket(night), token))
            shift.finish()
            saved = call("/v1/night/profile", token=token)
            assert saved == {"unlocked": min(night + 1, 8), "cleared": list(range(1, night + 1)), "bestClean": 3}
            print(f"PASS night {night} through actual 20 Hz movement and deliveries.", flush=True)
    latest = call("/v1/night/profile", token=token)
    renewed = call("/v1/sessions", credentials)["token"]
    assert call("/v1/night/profile", token=renewed) == latest
    if wait_restart:
        print("Waiting for a real server stop and restart to verify the same profile.", flush=True)

        def live():
            try:
                return call("/health").get("game") == "nightshift"
            except (OSError, URLError, AssertionError):
                return False

        eventually(live, lambda running: not running, 300)
        eventually(live, bool, 300)
        assert call("/v1/night/profile", token=renewed) == latest
        assert call(start, first, renewed, 409)["code"] == "run_replaced"
        print("PASS profile, session and start receipt after full process restart.", flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--all-nights", action="store_true")
    parser.add_argument("--wait-restart", action="store_true")
    options = parser.parse_args()
    run(options.all_nights, options.wait_restart)
