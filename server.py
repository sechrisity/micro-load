"""Rep Ledger server: serves the static app and stores the whole log as one JSON file.

Single user per instance. Set REPLEDGER_PASSWORD to require HTTP Basic auth on every
request; leave it unset only when the app is reachable from a trusted network alone.
"""
import base64
import json
import os
import secrets
import shutil
import tempfile
import time
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles

DATA = Path(os.environ.get("DATA_DIR", "/data"))
STATE = DATA / "state.json"
BACKUPS = DATA / "backups"
KEEP_BACKUPS = int(os.environ.get("REPLEDGER_BACKUPS", "30"))
MAX_BODY = 20_000_000
USER = os.environ.get("REPLEDGER_USER", "repledger")
PASSWORD = os.environ.get("REPLEDGER_PASSWORD", "")

CSP = ("default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; "
       "connect-src 'self'; manifest-src 'self'; worker-src 'self'; object-src 'none'; "
       "base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
HEADERS = {
    "Content-Security-Policy": CSP,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "Cross-Origin-Opener-Policy": "same-origin",
}

DATA.mkdir(parents=True, exist_ok=True)
BACKUPS.mkdir(exist_ok=True)
app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)


def authorized(header: str) -> bool:
    if not PASSWORD:
        return True
    if not header.startswith("Basic "):
        return False
    try:
        user, _, pw = base64.b64decode(header[6:]).decode("utf-8").partition(":")
    except (ValueError, UnicodeDecodeError):
        return False
    return secrets.compare_digest(user.encode(), USER.encode()) & secrets.compare_digest(pw.encode(), PASSWORD.encode())


@app.middleware("http")
async def guard(request: Request, call_next):
    if request.url.path != "/api/health" and not authorized(request.headers.get("authorization", "")):
        resp = Response("Authentication required", status_code=401,
                        headers={"WWW-Authenticate": 'Basic realm="Rep Ledger", charset="UTF-8"'})
    else:
        resp = await call_next(request)
    for k, v in HEADERS.items():
        resp.headers.setdefault(k, v)
    if request.url.path.startswith("/api/"):
        resp.headers["Cache-Control"] = "no-store"
    return resp


@app.get("/api/health")
def health():
    return {"ok": True}


@app.get("/api/state")
def get_state():
    if STATE.exists():
        return JSONResponse(json.loads(STATE.read_text()))
    return JSONResponse({"updatedAt": 0, "sessions": []})


@app.put("/api/state")
async def put_state(req: Request):
    body = await req.body()
    if len(body) > MAX_BODY:
        raise HTTPException(413, "too large")
    try:
        data = json.loads(body)
    except ValueError:
        raise HTTPException(400, "invalid JSON")
    if not isinstance(data, dict) or not isinstance(data.get("sessions"), list):
        raise HTTPException(400, "missing sessions")
    # one backup per day of the previous state, keep the newest KEEP_BACKUPS
    day = BACKUPS / f"state-{time.strftime('%Y-%m-%d')}.json"
    if STATE.exists() and not day.exists():
        shutil.copy2(STATE, day)
    for old in sorted(BACKUPS.glob("state-*.json"))[:-KEEP_BACKUPS]:
        old.unlink()
    fd, tmp = tempfile.mkstemp(dir=DATA)
    with os.fdopen(fd, "w") as f:
        json.dump(data, f)
    os.replace(tmp, STATE)
    return {"ok": True}


app.mount("/", StaticFiles(directory=Path(__file__).parent / "static", html=True), name="static")
