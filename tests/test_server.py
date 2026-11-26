import base64
import importlib
import json

import pytest
from fastapi.testclient import TestClient


def make_client(tmp_path, monkeypatch, password=""):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setenv("REPLEDGER_PASSWORD", password)
    import server
    importlib.reload(server)
    return TestClient(server.app), server


def basic(user, pw):
    return {"Authorization": "Basic " + base64.b64encode(f"{user}:{pw}".encode()).decode()}


def test_empty_state_and_round_trip(tmp_path, monkeypatch):
    client, _ = make_client(tmp_path, monkeypatch)
    r = client.get("/api/state")
    assert r.status_code == 200
    assert r.json() == {"updatedAt": 0, "sessions": []}
    assert r.headers["cache-control"] == "no-store"
    body = {"updatedAt": 5, "sessions": [{"id": "a", "items": []}]}
    assert client.put("/api/state", content=json.dumps(body)).json() == {"ok": True}
    assert client.get("/api/state").json() == body


def test_rejects_bad_payloads(tmp_path, monkeypatch):
    client, _ = make_client(tmp_path, monkeypatch)
    assert client.put("/api/state", content="not json").status_code == 400
    assert client.put("/api/state", content="[]").status_code == 400
    assert client.put("/api/state", content='{"sessions": 1}').status_code == 400


def test_rejects_oversized_body(tmp_path, monkeypatch):
    client, server = make_client(tmp_path, monkeypatch)
    monkeypatch.setattr(server, "MAX_BODY", 10)
    assert client.put("/api/state", content='{"sessions": [], "x": "long enough"}').status_code == 413


def test_daily_backup_of_previous_state(tmp_path, monkeypatch):
    client, _ = make_client(tmp_path, monkeypatch)
    client.put("/api/state", content='{"sessions": [], "v": 1}')
    client.put("/api/state", content='{"sessions": [], "v": 2}')
    backups = list((tmp_path / "backups").glob("state-*.json"))
    assert len(backups) == 1
    assert json.loads(backups[0].read_text())["v"] == 1


def test_security_headers(tmp_path, monkeypatch):
    client, _ = make_client(tmp_path, monkeypatch)
    r = client.get("/")
    assert r.status_code == 200
    assert "script-src 'self'" in r.headers["content-security-policy"]
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["x-frame-options"] == "DENY"


@pytest.mark.parametrize("path", ["/", "/api/state"])
def test_password_required_when_set(tmp_path, monkeypatch, path):
    client, _ = make_client(tmp_path, monkeypatch, password="s3cret")
    r = client.get(path)
    assert r.status_code == 401
    assert "Basic" in r.headers["www-authenticate"]
    assert client.get(path, headers=basic("repledger", "wrong")).status_code == 401
    assert client.get(path, headers=basic("repledger", "s3cret")).status_code == 200


def test_health_is_open(tmp_path, monkeypatch):
    client, _ = make_client(tmp_path, monkeypatch, password="s3cret")
    assert client.get("/api/health").json() == {"ok": True}
