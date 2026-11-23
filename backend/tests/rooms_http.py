"""Two real HTTP players, idempotent room/inputs, lease takeover and durable results."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
import json
import secrets
import time
import urllib.error
import urllib.request
import uuid

BASE = "http://127.0.0.1:8737"


def call(path, body=None, token=None, expected=200):
    headers = {}
    if token:
        headers["Authorization"] = "Bearer " + token
    if body is not None:
        headers["Content-Type"] = "application/json"
    data = None if body is None else json.dumps(body).encode("utf-8")
    request = urllib.request.Request(BASE + path, data=data, headers=headers)
    try:
        response = urllib.request.urlopen(request, timeout=6)
    except urllib.error.HTTPError as exc:
        response = exc
    with response:
        value = json.load(response)
        allowed = expected if isinstance(expected, tuple) else (expected,)
        assert response.status in allowed, (path, response.status, expected, value.get("code"))
        return value


def account():
    creds = {"name": "联机测试-" + uuid.uuid4().hex[:12], "password": secrets.token_urlsafe(18)}
    result = call("/v1/sessions", creds)
    assert result["name"] == creds["name"] and len(result["token"]) == 43
    return creds, result["token"]


def action(weapon=0, **extra):
    return dict({"moveX": 0, "moveY": 0, "aimX": 1, "aimY": 0, "fire": False, "weapon": weapon,
                 "reload": False, "shield": False, "dash": False}, **extra)


def main():
    assert call("/health") == {"game": "soda", "status": "ok"}
    owner, a = account()
    _, b = account()
    _, c = account()
    call("/v1/sessions", {**owner, "password": "incorrect-test-pass"}, expected=401)
    call("/v1/history", expected=401)
    creation = {"mode": "ctf", "skin": "dragon", "requestId": str(uuid.uuid4())}
    with ThreadPoolExecutor(max_workers=4) as pool:
        receipts = list(pool.map(lambda _: call("/v1/rooms", creation, a), range(4)))
    assert len({r["matchId"] for r in receipts}) == 1
    base = "/v1/rooms/" + receipts[0]["code"]
    match_id = receipts[0]["matchId"]
    assert receipts[0]["you"] == 0
    call("/v1/rooms", {**creation, "mode": "ffa"}, a, 409)
    call(base, token=b, expected=403)
    assert call(base + "/join", {"skin": "egg", "requestId": str(uuid.uuid4())}, b)["you"] == 1
    guest = call(base + "/join", {"skin": "frog", "requestId": str(uuid.uuid4())}, c)
    assert guest["you"] == 2 and sum(s["human"] for s in guest["seats"]) == 3
    challengers = [account()[1], account()[1]]
    def last_seat(token):
        return call(base + "/join", {"skin": "egg", "requestId": str(uuid.uuid4())}, token, (200, 409))
    with ThreadPoolExecutor(max_workers=2) as pool:
        contested = list(pool.map(last_seat, challengers))
    winners = [i for i, result in enumerate(contested) if result.get("you") == 3]
    assert len(winners) == 1 and contested[1 - winners[0]].get("code") == "room_full"
    assert call(base + "/leave", {}, challengers[winners[0]])["left"]
    try_forgery = {"input": action(hp=999), "seq": 0}
    call(base + "/input", try_forgery, a, 400)
    call(base + "/input", {"input": action(moveX=1.01), "seq": 0}, a, 400)
    call(base + "/input", {"input": action(moveX="1"), "seq": 0}, a, 400)
    call(base + "/input", {"input": action(), "seq": -1}, a, 400)
    call(base + "/input", {"input": action(weapon=9), "seq": 0}, a, 400)
    print("PASS accounts, concurrency/idempotency, room roster and strict authoritative inputs", flush=True)

    sample = {"seq": 3, "input": action(weapon=2, moveX=1, dash=True, shield=True, fire=True)}
    assert call(base + "/input", sample, a)["ack"] == 3
    assert call(base + "/input", sample, a)["ack"] == 3
    assert call(base + "/input", {"seq": 2, "input": action()}, a)["ack"] == 3
    time.sleep(.14)
    observed = call(base, token=b)["state"]
    assert observed["fighters"][0]["shieldCd"] > 0
    assert len([e for e in observed["events"] if e["kind"] == "shield" and e["seat"] == 0]) == 1
    assert len([e for e in observed["events"] if e["kind"] == "dash" and e["seat"] == 0]) == 1
    assert call(base + "/leave", {}, b)["left"]
    assert call(base + "/leave", {}, b)["left"]
    call(base + "/input", {"seq": 12, "input": action()}, b, 403)
    assert not call(base, token=a)["seats"][1]["human"]
    assert call(base + "/join", {"skin": "egg", "requestId": str(uuid.uuid4())}, b)["you"] == 1
    print("PASS two clients observe the same skill event, late inputs, leave/rejoin and AI replacement", flush=True)

    deadline = time.monotonic() + 140
    while time.monotonic() < deadline:
        first = call(base, token=a)
        second = call(base, token=b)
        if first["state"]["tick"] > 165:
            assert not first["seats"][2]["human"]
        if first["state"]["result"] is not None:
            break
        time.sleep(.55)
    else:
        raise AssertionError("No result at the match deadline")
    assert second["state"]["result"] == first["state"]["result"]
    terminal = call(base + "/input", {"seq": 8, "input": action()}, a)
    assert terminal["ack"] == 8 and terminal["state"]["tick"] == first["state"]["tick"]
    call(base, token=c, expected=403)
    for token in [a, b, c]:
        rows = [r for r in call("/v1/history", token=token)["matches"] if r["matchId"] == match_id]
        assert len(rows) == 1
        row = rows[0]
        assert row["score"] >= 0 and row["outcome"] in {"win", "loss", "draw"}
        assert datetime.fromisoformat(row["endedAt"].replace("Z", "+00:00")).tzinfo
    resumed = call("/v1/sessions", owner)
    assert resumed["token"] != a
    assert call("/v1/history", token=resumed["token"])["matches"][0]["matchId"] == match_id
    print("PASS live timeout/score end, frozen result, lease expiry, unique PostgreSQL history and re-login", flush=True)


if __name__ == "__main__":
    main()
