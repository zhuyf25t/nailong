"""Play the relay over its public HTTP API with fresh accounts and real PostgreSQL."""

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
            if isinstance(value, dict) and "story" in value:
                value = summary(value)
            raise TimeoutError(f"Expected state did not arrive: {value}")
        time.sleep(0.045)


def frame(seq, action="none", aim=(0, -1), move=(0, 0)):
    return {"seq": seq, "mx": move[0], "my": move[1], "ax": aim[0], "ay": aim[1], "action": action}


class Driver:
    def __init__(self, token, view):
        self.token = token
        self.path = "/v1/night/run/" + view["runId"]
        self.seq = view["ack"]
        self.observed = {}
        self.next_input = None

    def read(self):
        return self.observe(call(self.path, token=self.token))

    def observe(self, state):
        if state["night"] == 1:
            self.observed[state["tick"]] = pos(state["player"])
        return state

    def send(self, action="none", aim=(0, -1), move=(0, 0)):
        self.seq += 1
        self.next_input = frame(self.seq, action, aim, move)
        state = call(self.path + "/input", self.next_input, self.token)
        assert state["ack"] == self.seq, (self.seq, state["ack"])
        return self.observe(state)

    def duplicate(self, packet):
        response = call(self.path + "/input", packet, self.token)
        assert response["ack"] == self.seq
        return self.observe(response)

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

    def maintenance(self, first_night):
        self.interact("hatch", "observe_windows")
        view = self.read()
        windows = sorted(pos(m) for m in view["story"]["marks"] if m["kind"] == "window")
        assert len(windows) == 3
        first = view["tick"]
        assert "第一夜存档" in view["story"]["objective"]
        traces, squared_error = {}, [0., 0., 0.]
        monitor_frames = []
        samples = 0
        while view["tick"] - first < 112:
            t = view["tick"]
            elapsed = t - first
            target = (178, 142) if elapsed < 37 else (315, 190) if elapsed < 77 else (224, 220)
            here = pos(view["player"])
            traces[t] = here
            monitor_frames.append((t, {p["slot"]: pos(p) for p in view["story"]["people"]}))
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
        verify_recording(monitor_frames, windows, delayed, first_night)
        self.walk(windows[delayed])
        self.send("throw")
        self.step("delay_door")
        job = RelayTrip(self)
        assert job.leg == "maintenance"
        job.drive(use_loop=True)
        assert {"loop", "catch"} <= set(job.kinds()) and job.kinds().count("catch") >= 2
        eventually(self.read, lambda s: not s["story"].get("relay"))
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
                job = RelayTrip(self)
                assert job.leg == "signature"
                job.drive()
                assert {"switch", "catch", "release"} <= set(job.kinds())
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
        def advance():
            nonlocal direction
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
            motion = [(0,-1),(1,0),(0,1),(1,0)][direction]
            return self.send(move=motion)

        view = eventually(advance, lambda v:v["story"]["step"] != "play_two")
        assert view["story"]["step"] == "sill_wait", summary(view)
        self.send()

    def defend_round(self, leave_route_unfinished=False):
        view = self.step("sleep_reveal")
        (frog,) = [pos(p) for p in view["story"]["people"] if p["kind"] == "sleep_frog"]
        view = self.step("sleep_watch")
        braced = set()
        lured = False
        job = None
        tracking_tick = None
        completed_with = None
        seen_running = False
        frog_at_start = frog
        furthest = 0.0
        round_deadline = time.monotonic() + 55
        while view["story"]["step"] == "sleep_watch":
            if time.monotonic() > round_deadline:
                raise TimeoutError(f"Sleep ward did not finish its round: {summary(view)}")
            story = view["story"]
            shutters = [pos(p) for p in story["people"] if p["kind"] == "sleep_shutter"]
            assert len(shutters) == 4
            next_point = min(shutters, key=lambda p: math.dist(frog, p))
            assert math.dist(frog, next_point) < 65
            if tracking_tick is not None:
                assert view["tick"] - tracking_tick <= 10, "lost sight of the four shutters during the watch"
            tracking_tick = view["tick"]
            frog = next_point
            furthest = max(furthest, math.dist(frog_at_start, frog))
            relay = story.get("relay")
            if relay and relay["stage"] == "running":
                assert story["sleepTicks"] > 0, "the unfinished belt remained playable after the bell"
            marks = {m["kind"]: pos(m) for m in story["marks"]}
            if "brace_on" in marks:
                braced.add(marks["brace_on"])
            if "lured_pane" in marks:
                lured = True
                assert math.dist(marks["lured_pane"], frog) > 25
            station = marks.get("brace")
            hazard = marks.get("hand_warn") or marks.get("hand")
            x, y = pos(view["player"])
            aim, action, move = (0,-1), "none", (0,0)
            if relay:
                if job is None:
                    assert len(braced) == 1, "the dispatch was not offered immediately after the first rod"
                    job = RelayTrip(self)
                job.record(view)
                seen_running |= relay["stage"] == "running"
                if completed_with is None and relay["stage"] == "complete":
                    completed_with = story["sleepTicks"]
            # A newly warned hand gives enough time to make a nearby intercept
            # and leave the tile before the strike. Keep tracking the shutters.
            grace = max((tile["ticks"] for tile in story["tiles"] if tile["state"] == "warn"), default=0)
            near_catch = relay and relay["leg"] == "frog_lure" and any(
                b["state"] in ("inbound", "lower", "loop") and -2 <= b["eta"] <= 8
                and math.dist((x,y), (b["catchX"],b["catchY"])) <= 15 for b in relay["bottles"])
            if hazard and math.dist((x,y),hazard) < 26 and not (grace > 15 and near_catch):
                dx, dy = 240-hazard[0], 202-hazard[1]
                move = (dx/math.hypot(dx,dy), dy/math.hypot(dx,dy)) if dx or dy else (1,0)
            elif relay and relay["stage"] == "running" and not leave_route_unfinished:
                if relay["leg"] == "frog_switch":
                    if relay["cap"] is None and view["tick"] - job.last_cap > 10:
                        action, aim = "probe", direction((x,y), pos(relay["switch"]))
                        job.last_cap = view["tick"]
                else:
                    assert relay["leg"] == "frog_lure"
                    bottle = relay["bottles"][0]
                    if bottle["catchable"]:
                        action = "catch"
                    elif bottle["state"] == "held":
                        catch_id = max(e["id"] for e in job.events.values() if e["kind"] == "catch")
                        steps = sum(e["kind"] == "step" and e["id"] > catch_id for e in job.events.values())
                        if steps < 3:
                            # Put this round's own footsteps in all three bottle marks.
                            move = motion((x,y), pos(relay["inlet"]))
                        else:
                            action, aim = "release", direction((x,y), pos(relay["inlet"]))
                    elif bottle["state"] in ("inbound", "lower", "loop"):
                        move = motion((x,y), (bottle["catchX"],bottle["catchY"]))
            elif station and station not in braced:
                if math.dist((x,y),station) <= 9:
                    action = "hold"
                else:
                    dx, dy = station[0]-x, station[1]-y
                    move = (dx/math.hypot(dx,dy), dy/math.hypot(dx,dy))
            if relay and relay["stage"] == "running" and not leave_route_unfinished:
                hunter = relay["hunter"]
                target = (hunter["targetX"], hunter["targetY"])
                if hunter["state"] == "warn" and hunter["ticks"] <= 6 and math.dist((x,y), target) < 15:
                    move = direction(target, (x,y)) if (x,y) != target else (0,1)
            prev = view["tick"]
            view = self.send(action, aim, move)
            if view["tick"] == prev:
                view = eventually(self.read, lambda s:s["tick"] > prev)
        end = view["story"]
        assert len(braced) == end["round"] and furthest > 80, summary(view)
        if leave_route_unfinished:
            assert seen_running and completed_with is None
            assert end["step"] == "sleep_reveal" and end["round"] == 2 and end["cue"] == "ward_relay_late", summary(view)
            print("  N8 round 2: all rods secured; unfinished sorting at the bell restarted this round.", flush=True)
            return
        assert end["step"] == "wake_probe", summary(view)
        if job:
            assert seen_running and completed_with is not None and completed_with > 0
            kinds = job.kinds()
            if job.leg == "frog_switch":
                assert "switch" in kinds, kinds
            else:
                assert {"loop", "replay_step"} <= set(kinds) and kinds.count("catch") >= 2 and lured, kinds
            print(f"  N8 round {end['round']}: {job.leg} finished with {completed_with} sleep ticks remaining.", flush=True)
        self.walk(frog)
        self.send("probe")
        view = self.step("wake_toss")
        (looks,) = [pos(p) for p in view["story"]["people"] if p["kind"] == "wake_look"]
        assert math.dist(looks, frog) < 28
        self.send("throw")

    def defense(self):
        for round_number in (1,2,3):
            assert self.step("sleep_reveal")["story"]["round"] == round_number
            if round_number == 2:
                self.defend_round(leave_route_unfinished=True)
            self.defend_round()
        self.step("ward_face")
        self.step("ward_exit")
        self.walk_to(self.mark("exit"), lambda s: s["phase"] in ("won","clockout"))

    def finish(self, first_night=None, loop_order=None):
        night = self.read()["night"]
        for count in range(3 if night <= 5 else 2 if night == 6 else 0):
            trip = RelayTrip(self)
            assert trip.leg == "dispatch"
            if night == 6 and count == 0:
                original = first_night.echoes
                bottle = self.read()["story"]["relay"]["bottles"][0]
                assert [b["kind"] for b in bottle["sounds"]] == [kind for kind, _ in original]
                for i, beat in enumerate(bottle["sounds"][1:], 1):
                    assert abs(beat["gap"] - (original[i][1] - original[i-1][1])) <= 2
            trip.drive(use_loop=loop_order == count, check_return=night == 1 and count == 2)
            kinds = trip.kinds()
            assert "catch" in kinds and "release" in kinds, kinds
            if night == 4:
                if loop_order == count:
                    assert {"switch", "loop"} <= set(kinds) and kinds.count("catch") >= 2, kinds
                else:
                    assert "loop" not in kinds, kinds
            if night == 5:
                assert trip.two_bottles and trip.echo_diverted and "switch" in kinds, kinds
            signed = eventually(self.read, lambda v: v["delivered"] == count + 1)
            print(f"  N{night} receipt {signed['delivered']} ({trip.leg})", flush=True)
        if night == 6:
            self.maintenance(first_night)
        elif night == 7:
            self.signatures()
        elif night == 8:
            self.defense()
        if self.read()["story"]["step"] == "clockout_walk":
            exit_at = self.mark("exit")
            self.walk_to(exit_at, lambda v: v["phase"] == "won" or v["story"]["step"] == "fourth_bottle")
            if night == 1:
                echoes = {}
                def playback():
                    v = self.read()
                    story = v["story"]
                    if story["step"] == "fourth_bottle" and story["cue"].startswith("fourth_") and story["cue"] != "fourth_roll":
                        echoes.setdefault(story["cueId"], (story["cue"][7:], v["tick"]))
                    return v
                eventually(playback, lambda s: s["phase"] == "won", seconds=20)
                assert echoes and list(echoes.values())[-1][0] == "bell", echoes
                self.echoes = list(echoes.values())
        return eventually(self.read, lambda v: v["phase"] == "won")


def pos(entity):
    return (entity["x"], entity["y"])


def marks(view):
    return {m["kind"]: pos(m) for m in view["story"]["marks"]}

def summary(state):
    story = state["story"]
    relay = story.get("relay") or {}
    return {
        "night": state["night"], "tick": state["tick"], "delivered": state["delivered"],
        "phase": state["phase"], "step": story["step"], "player": pos(state["player"]),
        "objective": relay.get("objective", story["objective"]), "cue": story["cue"],
        "bottles": [(b["kind"], b["state"], b["eta"]) for b in relay.get("bottles", [])],
        "events": [e["kind"] for e in relay.get("events", [])][-8:],
    }


def direction(origin, target):
    dx, dy = target[0] - origin[0], target[1] - origin[1]
    length = math.hypot(dx, dy)
    return (dx / length, dy / length) if length else (0, -1)

def verify_recording(frames, screens, delayed, first_night):
    """Identify the archive by matching its motion to positions seen by the N1 client."""
    trace = first_night.observed
    period = 4 * (max(trace) // 4 + 1)
    matches = {}
    for tick, monitors in frames:
        sample_tick = (tick % period) // 4 * 4
        point = trace.get(sample_tick)
        if point is None:
            continue
        for slot, (x, y) in monitors.items():
            if slot != delayed:
                on_screen = screens[slot][0] + (point[0]-240)*.11, 76 + (point[1]-180)*.1
                matches.setdefault(slot, []).append(math.dist((x, y), on_screen))
    winners = [slot for slot, errors in matches.items() if len(errors) >= 12
               and sum(e < .2 for e in errors) / len(errors) >= .90]
    assert len(winners) == 1, {s: (len(e), round(sum(e)/len(e), 2)) for s, e in matches.items()}


def motion(origin, target, radius=2):
    return direction(origin, target) if math.dist(origin, target) > radius else (0, 0)

def crosses(origin, target, obstacle, clearance):
    dx, dy = target[0] - origin[0], target[1] - origin[1]
    along = ((obstacle[0]-origin[0])*dx + (obstacle[1]-origin[1])*dy) / max(1, dx*dx+dy*dy)
    return 0 < along < 1 and math.dist(obstacle, (origin[0]+along*dx, origin[1]+along*dy)) <= clearance


class RelayTrip:
    """One player's decisions, based on the visible belt, cap reactions and event history."""

    def __init__(self, driver):
        self.driver = driver
        first = driver.read()
        self.initial_count = first["delivered"]
        self.leg = first["story"]["relay"]["leg"]
        self.events = {}
        self.tried_slots = set()
        self.true_slot = None
        self.two_bottles = False
        self.echo_diverted = False
        self.last_cap = -100
        self.before = None
        self.closed_at = {}

    def record(self, state):
        relay = state["story"].get("relay")
        if not relay or relay["leg"] != self.leg:
            return relay
        bottles = relay["bottles"]
        assert len(bottles) <= 2 and len({b["id"] for b in bottles}) == len(bottles)
        self.two_bottles |= {b["kind"] for b in bottles} == {"echo", "cargo"}
        self.echo_diverted |= any(b["kind"] == "echo" and b["state"] == "loop" for b in bottles)
        for b in bottles:
            assert len(b["sounds"]) <= 3 and all(s["gap"] >= 0 for s in b["sounds"])
        for pane in relay["windows"]:
            if not pane["open"]:
                self.closed_at[pane["slot"]] = relay["tick"]
        for event in relay["events"]:
            key = event["id"]
            assert self.events.get(key, event) == event, (key, event)
            self.events[key] = event
            if event["kind"] == "cap_caught":
                self.true_slot = event["slot"]
            if event["kind"] in ("cap_caught", "cap_through"):
                self.tried_slots.add(event["slot"])
        return relay

    def kinds(self):
        return [e["kind"] for e in self.events.values()]

    def perform(self, view, action="none", target=None, walk=None, duplicate=False):
        origin = pos(view["player"])
        aim = direction(origin, target) if target is not None else (0, -1)
        move = motion(origin, walk) if walk is not None else (0, 0)
        after = self.driver.send(action, aim, move)
        if duplicate:
            packet = self.driver.next_input.copy()
            self.driver.duplicate(packet)
            self.driver.duplicate(packet)
        if action == "probe":
            self.last_cap = view["tick"]
        return after

    def identify(self, state, relay, walk=None):
        panes = relay["windows"]
        if len(panes) == 1:
            self.true_slot = panes[0]["slot"]
        if self.true_slot is not None or not panes:
            return False
        options = [p for p in panes if p["slot"] not in self.tried_slots]
        if len(options) == 1:
            self.true_slot = options[0]["slot"]
            return False
        if relay["cap"] or state["tick"] - self.last_cap < 12 or not options:
            return False
        if relay["caps"] <= 0:
            self.perform(state, walk=pos(relay["rack"]))
        else:
            # A pane lined up behind the switch cannot be probed from this
            # position. Try a pane with a clear sightline before spending a cap.
            here = pos(state["player"])
            toggle = pos(relay["switch"])
            def sort_key(pane):
                target = pos(pane)
                blocked = crosses(here, target, toggle, 12)
                return blocked, math.dist(here, target)
            target = min(options, key=sort_key)
            self.perform(state, "probe", pos(target), walk)
        return True

    def drive(self, use_loop=False, miss_first=False, duplicate_edges=False, check_return=False, seconds=42):
        end = time.monotonic() + seconds
        duplicate_done = set()
        last_tick = -1
        release_packet = None
        while time.monotonic() < end:
            view = self.driver.read()
            if view["tick"] == last_tick:
                time.sleep(.014)
                continue
            last_tick = view["tick"]
            relay = view["story"].get("relay")
            if view["delivered"] > self.initial_count or not relay or relay["leg"] != self.leg:
                break
            self.record(view)
            if relay["stage"] in ("signed", "complete"):
                break
            bottles = relay["bottles"]
            cargo = next((b for b in bottles if b["kind"] == "cargo"), None)
            if cargo is None:
                cargo = next(iter(bottles), None)
            if not cargo:
                continue
            state = cargo["state"]
            intercept = cargo["catchX"], cargo["catchY"]
            tiles = view["story"]["tiles"]
            if self.leg == "dispatch" and view["night"] == 3 and tiles:
                # Stand on the safe side of the neck if its marker touches a cracked tile.
                def clearance(at):
                    return min(max(abs(at[0]-t["x"]), abs(at[1]-t["y"])) for t in tiles)
                if clearance(intercept) < 15:
                    x, y = intercept
                    intercept = max(((x+6,y), (x-6,y), (x,y+6), (x,y-6)), key=clearance)
            kinds = self.kinds()
            has_looped = "loop" in kinds
            switched = "switch" in kinds
            needs_switch = (self.leg in ("signature", "frog_switch") or
                            (self.leg == "dispatch" and view["night"] == 5) or
                            (use_loop and has_looped and self.leg == "dispatch"))
            if miss_first and "early" not in duplicate_done:
                assert not cargo["catchable"], summary(view)
                self.perform(view, "catch", duplicate=True, walk=intercept)
                duplicate_done.add("early")
                self.before = self.driver.next_input.copy()
                continue
            if miss_first and "lower" not in kinds:
                assert state != "held" and "catch" not in kinds
                if cargo["catchable"]:
                    # Re-sending the original press at exactly the right instant must
                    # not turn an early press into a catch.
                    self.driver.duplicate(self.before)
                    duplicate_done.add("stale-at-window")
                self.perform(view, walk=intercept)
                continue
            if state in ("inbound", "lower", "loop") and cargo["catchable"]:
                self.perform(view, "catch", duplicate=duplicate_edges)
                duplicate_done.add("catch")
            elif needs_switch and not switched and relay["cap"] is None and view["tick"] - self.last_cap >= 9:
                self.perform(view, "probe", pos(relay["switch"]), intercept if state != "held" else None)
            elif state in ("inbound", "lower", "loop"):
                if not self.identify(view, relay, intercept):
                    self.perform(view, walk=intercept)
            elif state == "held":
                hunter = relay["hunter"]
                here = pos(view["player"])
                if hunter["state"] == "warn" and math.dist(here, (hunter["targetX"], hunter["targetY"])) < 19:
                    side = 22 if here[0] < 240 else -22
                    self.perform(view, walk=(here[0]+side, here[1]))
                    continue
                if duplicate_edges and "changed-catch" not in duplicate_done:
                    packet = {**self.driver.next_input, "action": "release"}
                    self.driver.duplicate(packet)
                    self.driver.wait_ticks(3)
                    assert self.driver.read()["story"]["relay"]["bottles"][0]["state"] == "held"
                    duplicate_done.add("changed-catch")
                if check_return and release_packet and "stale-release" not in duplicate_done:
                    self.driver.duplicate(release_packet)
                    self.driver.wait_ticks(3)
                    assert self.driver.read()["story"]["relay"]["bottles"][0]["state"] == "held"
                    duplicate_done.add("stale-release")
                if (use_loop or self.leg in ("maintenance", "frog_lure")) and not has_looped:
                    self.perform(view, "release", pos(relay["inlet"]), duplicate=duplicate_edges)
                    duplicate_done.add("release")
                elif self.identify(view, relay):
                    pass
                elif self.true_slot is not None:
                    pane = next(p for p in relay["windows"] if p["slot"] == self.true_slot)
                    here, goal = pos(view["player"]), pos(pane)
                    moving = self.leg == "dispatch" and view["night"] >= 2
                    opening = relay["tick"] - self.closed_at.get(self.true_slot, -1000)
                    ticks_left = pane.get("openTicks")
                    if ticks_left is None:
                        enough_time = not moving or opening <= 15
                    else:
                        enough_time = ticks_left == -1 or ticks_left >= math.ceil(math.dist(here, goal)/16) + 2
                    if crosses(here, goal, pos(relay["inlet"]), 10):
                        side = -24 if goal[0] <= here[0] else 24
                        self.perform(view, walk=(here[0]+side, here[1]))
                    elif not pane["open"] or not enough_time:
                        self.perform(view)
                    else:
                        self.perform(view, "release", pos(pane), duplicate=duplicate_edges)
                        if check_return and release_packet is None:
                            release_packet = self.driver.next_input.copy()
                        duplicate_done.add("release")
                else:
                    self.perform(view)
            else:
                self.perform(view)
        else:
            raise TimeoutError(f"Relay {self.leg}: {summary(view)}; events={self.kinds()[-24:]}")
        if miss_first:
            assert {"early", "stale-at-window", "catch", "release"} <= duplicate_done, duplicate_done
            assert "lower" in self.kinds() and "break" not in self.kinds(), self.kinds()
        if duplicate_edges:
            assert self.kinds().count("catch") == 1 and self.kinds().count("release") == 1, self.kinds()
        if check_return:
            assert "stale-release" in duplicate_done and self.kinds().count("catch") == 2
        return view

def account():
    return {"name": "shift-" + uuid4().hex[:16], "password": secrets.token_urlsafe(18)}


def ticket(night):
    return {"night": night, "requestId": str(uuid4())}


def run(all_nights=False, wait_restart=False):
    health = call("/health")
    assert health["status"] == "ok" and health["game"] == "nightshift" and health["rulesPause"] is True
    assert health.get("storyCampaign", 0) >= 4, health
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
    call(one.path + "/input", frame(-1, "catch"), token, 400)
    call(one.path + "/input", frame(2**53, "release"), token, 400)
    call(one.path + "/input", frame(0, "catch", move=(1.1, 0)), token, 400)
    call(one.path + "/input", frame(0, "finish"), token, 400)
    call(start, {**first, "night": 2}, token, 409)
    separate = Driver(foreign, call(start, ticket(1), foreign))
    paused = one.send("pause")
    assert paused["paused"] is True
    other_tick = separate.read()["tick"]
    one.send("catch", (1, 0))
    one.send()
    eventually(separate.read, lambda v: v["tick"] >= other_tick + 4)
    still = one.read()
    assert still["tick"] == paused["tick"] and still["story"]["relay"] == paused["story"]["relay"]
    assert one.send("resume")["paused"] is False
    eventually(one.read, lambda v: v["tick"] > paused["tick"])
    with ThreadPoolExecutor(2) as workers:
        recovery = workers.submit(RelayTrip(separate).drive, miss_first=True, duplicate_edges=True)
        one.finish()
        recovery.result()
    saved = call("/v1/night/profile", token=token)
    assert saved["unlocked"] == 2 and saved["cleared"] == [1]
    assert saved["bestClean"] == 3, saved
    assert call("/v1/night/profile", token=foreign) == empty
    print("PASS ownership, bounds, idempotent start, pause, stale press through the catch window, "
          "lower-belt rescue, duplicate catch/release and the first-night recorded sounds.", flush=True)
    if all_nights:
        for night in range(2, 9):
            if night == 6:
                previous = token
                token = call("/v1/sessions", credentials)["token"]
                assert token != previous and call("/v1/night/profile", token=token) == saved
            shift = Driver(token, call(start, ticket(night), token))
            call(one.path, token=token, expected=404)
            assert call(start, first, token, 409)["code"] == "run_replaced"
            shift.finish(first_night=one, loop_order=1 if night == 4 else None)
            saved = call("/v1/night/profile", token=token)
            assert saved["unlocked"] == min(night + 1, 8) and saved["cleared"] == list(range(1, night+1))
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
    parser.add_argument("--all-nights", action="store_true", help="play the full campaign, including both N4 routes")
    parser.add_argument("--wait-restart", action="store_true", help="also verify persistence after an external server restart")
    options = parser.parse_args()
    run(options.all_nights, options.wait_restart)
