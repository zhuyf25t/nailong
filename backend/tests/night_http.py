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
        directions = ("left", "right") if state["night"] == 5 else (
            "right" if state["memory"] == "left" else "left",)
        active = {w["slot"] for w in state["windows"]}
        for direction in directions:
            self.send("probe", (1 if direction == "right" else -1, 0))
            visible = eventually(self.read, lambda v: v["probe"] == direction and v["probeTicks"] > 0
                                 and all(w["look"] != "still" for w in v["windows"]))
            matches = {w["slot"] for w in visible["windows"] if w["look"] == direction}
            if len(directions) == 2:
                assert len(matches) == 2, matches
            active &= matches
        assert len(active) == 1
        assert all(set(w) == {"slot", "actor", "look"} for w in visible["windows"])
        return visible, active.pop()

    def walk_to(self, target, until):
        def walk():
            state = self.read()
            if until(state):
                return state
            dx, dy = target[0] - state["player"]["x"], target[1] - state["player"]["y"]
            distance = max(1, math.hypot(dx, dy))
            return self.send(move=(dx / distance, dy / distance))
        return eventually(walk, until, seconds=10)

    def walk(self, point, radius=6):
        self.walk_to(point, lambda v: math.dist(pos(v["player"]), point) <= radius)
        return self.send()  # release movement

    def mark(self, *kinds):
        return next(pos(m) for m in self.read()["story"]["marks"] if m["kind"] in kinds)

    def step(self, name, seconds=6):
        return eventually(self.read, lambda v: v["story"]["step"] == name, seconds)

    def interact(self, mark, next_step):
        self.walk(self.mark(mark))
        self.send("throw")
        return self.step(next_step)

    def wait_ticks(self, count):
        goal = self.read()["tick"] + count
        return eventually(self.read, lambda s: s["tick"] >= goal, count * .05 + 4)

    def maintenance(self):
        self.interact("hatch", "observe_windows")
        view = self.read()
        windows = sorted(pos(m) for m in view["story"]["marks"] if m["kind"] == "window")
        assert len(windows) == 3
        first = view["tick"]
        traces, squared_error = {}, [0., 0., 0.]
        samples = 0
        while view["tick"] - first < 112:
            t = view["tick"]
            elapsed = t - first
            target = (178, 142) if elapsed < 37 else (315, 190) if elapsed < 77 else (224, 220)
            here = pos(view["player"])
            traces[t] = here
            if t-40 in traces and elapsed >= 47:
                x, y = traces[t-40]
                for person in view["story"]["people"]:
                    assert person["kind"].startswith("monitor")
                    slot = person["slot"]
                    projected = (windows[slot][0] + (x-240)*.11, 76 + (y-180)*.10)
                    squared_error[slot] += math.dist(pos(person), projected)**2
                samples += 1
            vector = (target[0]-here[0], target[1]-here[1])
            length = max(1, math.hypot(*vector))
            self.send(move=(vector[0]/length, vector[1]/length))
            view = eventually(self.read, lambda s: s["tick"] > t)
        errors = sorted(squared_error)
        assert samples > 12 and errors[1] - errors[0] > samples, (samples, errors)
        delayed = squared_error.index(errors[0])
        self.walk(windows[delayed])
        self.send("throw")
        self.step("delay_door")
        self.walk(self.mark("plate", "plate_on"))
        self.wait_ticks(44)
        x, y = self.mark("gate", "gate_open")
        self.walk_to((x+20,y), lambda s: s["story"]["step"] == "old_turn")
        self.walk(self.mark("old_tape"))
        self.send("throw")
        self.step("exit_maintenance")
        self.walk_to(self.mark("exit"), lambda s: s["phase"] in ("won","clockout"))

    def signatures(self):
        self.interact("ledger", "record_one")
        for ordinal in ("one", "two"):
            self.interact("panel", "take_" + ordinal)
            self.walk(self.mark("plate", "plate_on"))
            if ordinal == "one":
                self.send("throw")
                early = eventually(self.read, lambda v: v["story"]["cue"] == "seal_early")
                assert early["story"]["step"] == "take_one"
            ready = eventually(self.read, lambda v: "seal_ready" in marks(v))
            assert ready["story"]["plateTicks"] == 40
            self.send("throw")
            self.step("play_" + ordinal)
            if ordinal == "one":
                self.walk_to((254,174), lambda s: s["story"]["step"] == "record_two")
            else:
                self.upper_aisle()
                self.walk(self.mark("stand_here"))
                self.step("help_hold")
                retry = self.step("sill_wait")
                assert math.dist(pos(retry["player"]), self.mark("stand_here")) <= 20
                eventually(lambda: self.send(move=(1,0)), lambda v:v["story"]["step"] == "exit_signature")
        self.walk_to(self.mark("exit"), lambda s: s["phase"] in ("won","clockout"))

    def upper_aisle(self):
        # Hold one keyboard direction at a time. Each turn uses a visible
        # landmark on the marked upper aisle and has several pixels of clearance.
        direction = 0
        warned = False
        shadow_positions = set()

        def advance():
            nonlocal direction, warned
            view = self.read()
            if view["story"]["step"] != "play_two":
                return view
            x, y = pos(view["player"])
            if direction == 0 and y <= 150:
                direction = 1
            if direction == 1 and x >= 349:
                direction = 2
            if direction == 2 and y >= 161:
                direction = 3
            visible = marks(view)
            warned |= "press_warn" in visible
            if "press_shadow" in visible:
                assert warned, "a press shadow appeared without a warning"
                shadow_positions.add(visible["press_shadow"])
            motion = [(0,-1),(1,0),(0,1),(1,0)][direction]
            return self.send(move=motion)

        view = eventually(advance, lambda v:v["story"]["step"] != "play_two")
        assert view["story"]["step"] == "sill_wait" and len(shadow_positions) >= 2
        self.send()

    def defend_round(self):
        view = self.step("sleep_reveal")
        (frog,) = [pos(p) for p in view["story"]["people"] if p["kind"] == "sleep_frog"]
        view = self.step("sleep_watch")
        braced = set()
        while view["story"]["step"] == "sleep_watch":
            story = view["story"]
            shutters = [pos(p) for p in story["people"] if p["kind"] == "sleep_shutter"]
            assert len(shutters) == 4
            next_point = min(shutters, key=lambda p: math.dist(frog, p))
            assert math.dist(frog, next_point) < 65
            frog = next_point
            marks = {m["kind"]: pos(m) for m in story["marks"]}
            if "brace_on" in marks:
                braced.add(marks["brace_on"])
            station = marks.get("brace")
            hazard = marks.get("hand_warn") or marks.get("hand")
            x, y = pos(view["player"])
            action, move = "none", (0,0)
            if hazard and math.dist((x,y),hazard) < 26:
                dx, dy = 240-hazard[0], 202-hazard[1]
                move = (dx/math.hypot(dx,dy), dy/math.hypot(dx,dy)) if dx or dy else (1,0)
            elif station and station not in braced:
                if math.dist((x,y),station) <= 9:
                    action = "hold"
                else:
                    dx, dy = station[0]-x, station[1]-y
                    move = (dx/math.hypot(dx,dy), dy/math.hypot(dx,dy))
            prev = view["tick"]
            view = self.send(action, move=move)
            if view["tick"] == prev:
                view = eventually(self.read, lambda s:s["tick"] > prev)
        assert view["story"]["step"] == "wake_probe" and len(braced) == view["story"]["round"]
        self.walk(frog)
        self.send("probe")
        view = self.step("wake_toss")
        (looks,) = [pos(p) for p in view["story"]["people"] if p["kind"] == "wake_look"]
        assert math.dist(looks, frog) < 28
        self.send("throw")

    def defense(self):
        for round_number in (1,2,3):
            assert self.step("sleep_reveal")["story"]["round"] == round_number
            self.defend_round()
        self.step("ward_face")
        self.step("ward_exit")
        self.walk_to(self.mark("exit"), lambda s: s["phase"] in ("won","clockout"))

    def finish(self):
        night = self.read()["night"]
        for count in range(3 if night <= 5 else 2 if night == 6 else 0):
            view = self.read()
            if view["story"]["step"] == "supply":
                self.walk_to(self.mark("supply"), lambda s: s["story"]["step"] == "delivery")
                self.send()
            if night == 4 and count >= 1:
                self.walk(self.mark("safe"))
            if night == 1:
                assert len(view["windows"]) == 1
                state, slot = view, view["windows"][0]["slot"]
            else:
                state, slot = self.witness()
            self.send("throw", self.aim_for(state, slot))
            eventually(self.read, lambda v: v["delivered"] == count + 1)
        if night == 6:
            self.maintenance()
        elif night == 7:
            self.signatures()
        elif night == 8:
            self.defense()
        if self.read()["phase"] == "clockout":
            self.walk_to((240, 260), lambda v: v["phase"] == "won")
        return eventually(self.read, lambda v: v["phase"] == "won")


def pos(entity):
    return (entity["x"], entity["y"])


def marks(view):
    return {m["kind"]: pos(m) for m in view["story"]["marks"]}


def account():
    return {"name": "shift-" + uuid4().hex[:16], "password": secrets.token_urlsafe(18)}


def ticket(night):
    return {"night": night, "requestId": str(uuid4())}


def run(all_nights=False, wait_restart=False):
    health = call("/health")
    assert health["status"] == "ok" and health["game"] == "nightshift" and health["rulesPause"] is True
    assert health.get("storyCampaign") == 3, health
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
    separate = Driver(foreign, call(start, ticket(1), foreign))
    paused = one.send("pause")
    assert paused["paused"] is True
    other_tick = separate.read()["tick"]
    one.send("throw", (1, 0))
    one.send()
    eventually(separate.read, lambda v: v["tick"] >= other_tick + 4)
    assert one.read()["tick"] == paused["tick"] and one.read()["bottle"] is None
    assert one.send("resume")["paused"] is False
    eventually(one.read, lambda v: v["tick"] > paused["tick"])
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
            print(f"PASS night {night} through normal player inputs and public room clues.", flush=True)
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
