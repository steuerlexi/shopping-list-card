"""Live-Test gegen eine laufende Home-Assistant-Instanz.

Wird nur ausgefuehrt, wenn HA_URL gesetzt ist - sonst uebersprungen. So
laesst sich der Fix gegen das echte System pruefen, ohne dass die
uebrigen Tests eine Instanz brauchen.

    HA_URL=http://192.168.1.147:8123 HA_TOKEN=<llat> \
        python3 -m pytest tests/test_live.py -v

Der Test schickt echte Toggle-Befehle ueber den input_text-Kanal und
prueft, dass jeder einzelne durchkommt. Genau daran ist der Bug aus
v2.5.6 gescheitert: der zweite identische Befehl wurde still verworfen.
"""
import os

import pytest

HA_URL = os.environ.get("HA_URL")
HA_TOKEN = os.environ.get("HA_TOKEN")
MCP_URL = os.environ.get("MCP_URL")

pytestmark = [
    pytest.mark.live,
    pytest.mark.skipif(not HA_URL, reason="HA_URL ist nicht gesetzt"),
]

SENSOR = "sensor.einkaufsliste_backend"
COMMAND = "input_text.einkaufsliste_command"


def _rpc(tool, arguments):
    """Ruft ein ha-mcp-Tool ueber dessen JSON-RPC-Schnittstelle auf."""
    import json
    import urllib.error
    import urllib.request

    if MCP_URL:
        url = MCP_URL
    else:
        url = HA_URL.rstrip("/") + "/api/tools/call"

    # Der ha-mcp-Server spricht JSON-RPC 2.0 ueber Server-Sent-Events.
    payload = json.dumps({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {"name": tool, "arguments": arguments},
    }).encode()
    headers = {"Content-Type": "application/json",
               "Accept": "application/json, text/event-stream"}
    if HA_TOKEN:
        headers["Authorization"] = "Bearer " + HA_TOKEN
    req = urllib.request.Request(url, data=payload, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            body = resp.read().decode()
    except urllib.error.HTTPError as exc:
        raise AssertionError(
            f"ha-mcp-Aufruf {tool} fehlgeschlagen: HTTP {exc.code} "
            f"{exc.reason}\n"
            "Pruefe MCP_URL bzw. HA_URL/HA_TOKEN.") from exc

    # Der MCP-Server antwortet als Server-Sent-Events: die Nutzlast steht in
    # der Zeile "data: {...}".
    for line in body.splitlines():
        if not line.startswith("data: "):
            continue
        try:
            message = json.loads(line[len("data: "):])
        except json.JSONDecodeError:
            continue
        result = message.get("result")
        if result is None:
            continue
        if result.get("structuredContent") is not None:
            return result["structuredContent"]
        for chunk in result.get("content", []):
            if chunk.get("type") == "text":
                try:
                    return json.loads(chunk["text"])
                except json.JSONDecodeError:
                    return chunk["text"]
    return {"raw": body}


def _get_state(entity_id):
    result = _rpc("ha_get_state", {"entity_id": entity_id,
                                   "fields": ["state", "attributes"]})
    return result.get("data") or result.get("structuredContent", {}).get("data")


def _set_command(value):
    _rpc("ha_call_service", {"domain": "input_text", "service": "set_value",
                              "entity_id": COMMAND, "data": {"value": value}})


def _item(uid):
    sensor = _get_state(SENSOR)
    for item in sensor["attributes"]["items"]:
        if item["uid"] == uid:
            return item
    return None


@pytest.fixture
def target_uid():
    """Ein needs_action-Artikel aus der Live-Liste."""
    sensor = _get_state(SENSOR)
    active = [i for i in sensor["attributes"]["items"]
              if i.get("status") == "needs_action"]
    if not active:
        pytest.skip("kein offener Artikel in der Live-Liste")
    return active[0]["uid"]


def test_live_toggle_works_repeatedly(target_uid):
    """5 identische Toggle-Befehle muessen alle ankommen.

    Vor dem Fix (v2.5.7) wurde jeder zweite Befehl still verworfen,
    weil der input_text-Kanal nicht geleert wurde.
    """
    import time

    seen = []
    try:
        for i in range(5):
            before = _item(target_uid)["status"]
            _set_command('{"e":"toggle","d":{"u":"%s"}}' % target_uid)
            time.sleep(2.5)
            after = _item(target_uid)["status"]
            seen.append((before, after))
            assert before != after, \
                f"Befehl {i + 1} wurde nicht verarbeitet ({before} -> {after})"
    finally:
        # Aufraeumen: Kanal leeren und den Ausgangszustand wiederherstellen.
        _set_command("")
        time.sleep(1.5)
        current = _item(target_uid)["status"]
        if seen and seen[0][0] != current:
            _set_command('{"e":"toggle","d":{"u":"%s"}}' % target_uid)
            time.sleep(2.5)


def test_live_input_is_cleared_after_a_command(target_uid):
    """Nach jedem Befehl muss der input_text-Kanal leer sein."""
    import time

    _set_command("")
    time.sleep(1.5)
    _set_command('{"e":"toggle","d":{"u":"%s"}}' % target_uid)
    time.sleep(2.5)
    try:
        state = _get_state(COMMAND)
        assert state["state"] == "", \
            f"der Command-Input wurde nicht geleert: {state['state']!r}"
    finally:
        _set_command("")
        time.sleep(1.5)
