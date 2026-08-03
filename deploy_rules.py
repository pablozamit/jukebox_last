"""
Despliega las reglas de seguridad de Firestore (firestore.rules) usando la
cuenta de servicio del bridge (Admin SDK). No requiere `firebase login`.

USO:
    python deploy_rules.py                  # crea ruleset + publica
    python deploy_rules.py --rollback-to X  # vuelve al ruleset X

Antes de publicar guarda el ruleset actual para poder hacer rollback.
"""
import json
import os
import sys
import urllib.error
import urllib.request

from google.auth.transport.requests import Request
from google.oauth2 import service_account

PROJECT = os.getenv("FIREBASE_PROJECT_ID", "jukebox-catrinero")
KEY_PATH = os.getenv("FIREBASE_CREDENTIALS_JSON", "python-bridge/serviceAccountKey.json")
RULES_PATH = os.getenv("RULES_PATH", "firestore.rules")
SCOPES = ["https://www.googleapis.com/auth/firebase", "https://www.googleapis.com/auth/cloud-platform"]


def get_token():
    creds = service_account.Credentials.from_service_account_file(KEY_PATH, scopes=SCOPES)
    creds.refresh(Request())
    return creds.token


def api(method, url, body=None, tok=None):
    headers = {"Authorization": f"Bearer {tok}"}
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or "{}")


RELEASE = f"projects/{PROJECT}/releases/cloud.firestore"


def update_release(tok, ruleset_full_name):
    """Igual que el CLI: PATCH con body {release: {...}} y nombres sin host."""
    return api(
        "PATCH", f"https://firebaserules.googleapis.com/v1/{RELEASE}",
        {"release": {"name": RELEASE, "rulesetName": ruleset_full_name}}, tok=tok)


def main():
    tok = get_token()
    base = f"https://firebaserules.googleapis.com/v1/projects/{PROJECT}"

    # 1. Release actual (referencia para rollback)
    code, rel = api("GET", f"{base}/releases/cloud.firestore", tok=tok)
    old_ruleset = (rel.get("rulesetName") or "").split("/")[-1] if code == 200 else "?"
    print(f"Release actual: ruleset {old_ruleset} (HTTP {code})")

    if "--rollback-to" in sys.argv:
        name = sys.argv[sys.argv.index("--rollback-to") + 1]
        code, rel2 = update_release(tok, f"projects/{PROJECT}/rulesets/{name}")
        print(f"Rollback a {name}: HTTP {code}")
        sys.exit(0 if code == 200 else 1)

    # 2. Crear el ruleset nuevo (el propio API valida la sintaxis)
    with open(RULES_PATH, "r", encoding="utf-8") as f:
        content = f.read()
    code, rs = api(
        "POST", f"{base}/rulesets",
        {"source": {"files": [{"name": "firestore.rules", "content": content}]}},
        tok=tok)
    if code != 200:
        print(f"ERROR creando ruleset: HTTP {code}")
        print(json.dumps(rs, indent=2)[:2000])
        sys.exit(1)
    new_full = rs.get("name", "")
    print(f"Ruleset creado y compilado OK: {new_full}")

    # 3. Publicarlo: PATCH, y si falla, CREATE (igual que updateOrCreateRelease del CLI)
    code, rel2 = update_release(tok, new_full)
    if code != 200:
        print(f"PATCH falló (HTTP {code}), intentando CREATE...")
        code, rel2 = api(
            "POST", f"{base}/releases",
            {"name": RELEASE, "rulesetName": new_full}, tok=tok)
    if code != 200:
        print(f"ERROR publicando release: HTTP {code}")
        print(json.dumps(rel2, indent=2)[:2000])
        sys.exit(1)
    print(f"Reglas desplegadas OK. Rollback si hiciera falta:")
    print(f"    python deploy_rules.py --rollback-to {old_ruleset}")


if __name__ == "__main__":
    main()
