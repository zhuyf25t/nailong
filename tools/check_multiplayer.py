"""Drive ordinary local room APIs through two captures with four independent accounts."""

from collections import deque
import json
from math import hypot
from pathlib import Path
import secrets
import time
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from uuid import uuid4


BASE = "http://127.0.0.1:8737"
MAP = json.loads((Path(__file__).resolve().parents[1] / "game/data/arena.json").read_text("utf-8"))
TILE = MAP["tileSize"]


def call(path, payload=None, token=None, expected=(200, 201)):
    headers = {"Accept": "application/json"}
    body = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        body = json.dumps(payload).encode("utf-8")
    if token:
        headers["Authorization"] = "Bearer " + token
    try:
        response = urlopen(Request(BASE + path, data=body, headers=headers), timeout=6)
    except HTTPError as error:
        response = error
    with response:
        data = json.load(response)
        if response.status not in expected:
            raise RuntimeError(f"{path}: HTTP {response.status}, code={data.get('code')}")
        return data


def require(condition, explanation):
    if not condition:
        raise RuntimeError(explanation)


def idle():
    return dict(moveX=0, moveY=0, aimX=1, aimY=0, fire=False, weapon=0,
                reload=False, dash=False, shield=False)


def tile_path(start, goal):
    rows = MAP["rows"]
    pending = deque([start])
    parent = {start: None}
    while pending:
        cell = pending.popleft()
        if cell == goal:
            result = []
            while cell is not None:
                result.append(((cell[0] + 0.5) * TILE, (cell[1] + 0.5) * TILE))
                cell = parent[cell]
            return list(reversed(result))
        for dx, dy in [(1, 0), (0, 1), (-1, 0), (0, -1)]:
            p = cell[0] + dx, cell[1] + dy
            if p not in parent and rows[p[1]][p[0]] != "#":
                parent[p] = cell
                pending.append(p)
    raise RuntimeError("No walkable route between flag bases")


def main():
    require(call("/health")["game"] == "soda", "Expected Soda Scramble")
    password = secrets.token_urlsafe(16)
    prefix = "qa" + uuid4().hex[:10]
    accounts = [dict(name=f"{prefix}-{i}", password=password) for i in range(5)]
    tokens = [call("/v1/sessions", account)["token"] for account in accounts]
    call("/v1/history", expected=(401,))
    call("/v1/sessions", {**accounts[0], "password": "incorrect-qa-password"}, expected=(401,))
    create = dict(requestId=str(uuid4()), mode="ctf", skin="dragon")
    view = call("/v1/rooms", create, tokens[0])
    match_id, code = view["matchId"], view["code"]
    path = "/v1/rooms/" + code
    require(call("/v1/rooms", create, tokens[0])["matchId"] == match_id, "Create replay opened another room")
    ordered_seats = [view["you"]]
    for i in range(1, 4):
        join = dict(requestId=str(uuid4()), skin=("egg", "frog", "dragon")[i - 1])
        joined = call(path + "/join", join, tokens[i])
        require(call(path + "/join", join, tokens[i])["you"] == joined["you"], "Join replay took a second seat")
        ordered_seats.append(joined["you"])
    require(sorted(ordered_seats) == list(range(4)), "Four distinct human seats")
    call(path + "/join", dict(requestId=str(uuid4()), skin="egg"), tokens[4], expected=(409,))
    require(all(p["human"] for p in call(path, token=tokens[0])["seats"]), "Bot takeover roster")
    call(path + "/input", dict(seq=0, input={**idle(), "moveX": 99}), tokens[0], expected=(400,))
    print("PASS  login, four independent seats, retry-safe join, full room and typed input validation", flush=True)

    seq = [0] * 4

    def submit(i, action):
        packet = dict(seq=seq[i], input=action)
        seq[i] += 1
        current = call(path + "/input", packet, tokens[i])
        require(current["ack"] == packet["seq"], "Wrong input acknowledgement")
        return current

    # Hold the same input sequence twice. The server should preserve the same acknowledgement.
    view = submit(0, {**idle(), "shield": True})
    replay = call(path + "/input", dict(seq=0, input={**idle(), "shield": True}), tokens[0])
    require(replay["ack"] == 0, "Repeated shield input advanced the sequence")
    slot = ordered_seats[0]
    team = "mint" if slot % 2 == 0 else "berry"
    home = 0 if team == "mint" else 1
    waypoints = []
    last_goal = None
    observed_carrier = False
    deadline = time.monotonic() + 90
    next_heartbeat = 0.0
    while view["state"]["result"] is None and time.monotonic() < deadline:
        now = time.monotonic()
        runner = view["state"]["fighters"][slot]
        carrying = runner["carrying"] is not None
        observed_carrier |= carrying
        base = MAP["bases"][home if carrying else 1 - home]
        goal = base["x"], base["y"]
        x, y = runner["x"], runner["y"]
        if goal != last_goal or not waypoints:
            waypoints = tile_path((int(x // TILE), int(y // TILE)), goal)
            last_goal = goal
        while len(waypoints) > 1 and hypot(waypoints[0][0] - x, waypoints[0][1] - y) < 3.8:
            waypoints.pop(0)
        dx, dy = waypoints[0][0] - x, waypoints[0][1] - y
        distance = hypot(dx, dy)
        movement = idle()
        if distance > 0.2:
            movement.update(moveX=dx / distance, moveY=dy / distance)
        view = submit(0, movement)
        if now >= next_heartbeat and view["state"]["result"] is None:
            for i in range(1, 4):
                call(path, token=tokens[i])
                submit(i, idle())
            next_heartbeat = now + 0.5
        time.sleep(0.055)

    state = view["state"]
    require(observed_carrier and state["scores"][team] == 2, f"Two real flag deliveries: {state['scores']}")
    require(state["result"] == {"kind": "team", "seat": None, "team": team}, "Incorrect CTF winner")
    for i in range(4):
        other = call(path, token=tokens[i])
        require(other["state"]["scores"] == state["scores"] and other["state"]["result"] == state["result"], "Clients disagreed on outcome")
        expected = "win" if ordered_seats[i] % 2 == slot % 2 else "loss"
        until = time.monotonic() + 5
        while True:
            records = [m for m in call("/v1/history", token=tokens[i])["matches"] if m["matchId"] == match_id]
            if records or time.monotonic() >= until:
                break
            time.sleep(0.1)
        require(len(records) == 1 and records[0]["outcome"] == expected, "One persisted per-player result")
    renewed = call("/v1/sessions", accounts[0])["token"]
    require(any(m["matchId"] == match_id for m in call("/v1/history", token=renewed)["matches"]), "History after login")
    print(f"PASS  two captures, shared final tick {state['tick']}, four matching results, persisted history after login")


if __name__ == "__main__":
    main()
