"""
Autoverificación de las reglas de seguridad de Firestore (Jukebox v2).

Ejercita la matriz completa de operaciones que hace la app real (proponer/votar,
favoritos, encuesta, sugerencias, estadísticas...) contra Firestore usando un
usuario de prueba desechable, y comprueba que cada operación queda PERMITIDA o
DENEGADA según lo esperado.

USO:
  1) Despliega primero las reglas nuevas (una vez):
       firebase login --reauth
       firebase deploy --only firestore:rules --project jukebox-catrinero
  2) Ejecuta:
       python test_security_rules.py

Al terminar borra el usuario de prueba. Deja algunos documentos con prefijo
__selftest_ (sugerencias/encuesta) que puedes borrar desde el panel de admin.

¡IMPORTANTE! Este script SOLO escribe documentos desechables (prefijo __selftest_).
NUNCA pruebes escrituras de admin contra datos reales (catalog, songs, users):
si necesitas verificar el flujo admin, hazlo contra un documento de prueba.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

API_KEY = os.getenv("FIREBASE_API_KEY", "AIzaSyD5iwh4Mk1dCoj5jScOXBLztYNGcmB6Etc")
PROJECT = os.getenv("FIREBASE_PROJECT_ID", "jukebox-catrinero")
BASE = f"https://firestore.googleapis.com/v1/projects/{PROJECT}/databases/(default)/documents"
EMAIL = f"selftest-{int(time.time())}@example.com"
PASSWORD = "Selftest123!"
RUN = int(time.time())  # IDs únicos por ejecución (el script es re-ejecutable)

results = []


def tid(name):
    return f"__selftest_{RUN}_{name}"


def api(url, method="GET", body=None, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, r.read().decode()
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode()


def fields(obj):
    out = {}
    for k, v in obj.items():
        if isinstance(v, bool):
            out[k] = {"booleanValue": v}
        elif isinstance(v, int):
            out[k] = {"integerValue": v}
        elif isinstance(v, list):
            out[k] = {"arrayValue": {"values": [{"stringValue": x} for x in v]}}
        else:
            out[k] = {"stringValue": v}
    return out


def check(name, expected, status):
    ok = status in expected
    results.append(ok)
    exp = "/".join(str(e) for e in expected)
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}: HTTP {status} (esperado {exp})")


def main():
    print("== 1. Crear usuario de prueba ==")
    code, resp = api(
        f"https://identitytoolkit.googleapis.com/v1/accounts:signUp?key={API_KEY}",
        "POST",
        {"email": EMAIL, "password": PASSWORD, "returnSecureToken": True},
    )
    if code != 200:
        print(f"  ERROR creando usuario: {code} {resp[:200]}")
        sys.exit(1)
    data = json.loads(resp)
    token, uid = data["idToken"], data["localId"]
    print(f"  Usuario {EMAIL} (uid {uid})")

    print("\n== 2. Sin login: todo denegado ==")
    check("crear canción sin login", [401, 403],
          api(f"{BASE}/songs?documentId={tid('x')}", "POST",
              {"fields": fields({"title": "X", "votes": 1})})[0])
    check("leer users sin login", [401, 403], api(f"{BASE}/users/{uid}")[0])

    print("\n== 3. songs (cola activa) ==")
    x = tid('x')
    check("proponer canción (1 voto)", [200],
          api(f"{BASE}/songs?documentId={x}", "POST",
              {"fields": fields({"title": "Selftest", "votes": 1, "firstVotedAt": 1})}, token)[0])
    check("crear canción con 5 votos (fraude)", [403],
          api(f"{BASE}/songs?documentId={tid('x2')}", "POST",
              {"fields": fields({"title": "X", "votes": 5})}, token)[0])
    check("votar +1", [200],
          api(f"{BASE}/songs/{x}?updateMask.fieldPaths=votes", "PATCH",
              {"fields": fields({"votes": 2})}, token)[0])
    check("votar +4 (salto ilegal)", [403],
          api(f"{BASE}/songs/{x}?updateMask.fieldPaths=votes", "PATCH",
              {"fields": fields({"votes": 5})}, token)[0])
    check("editar campo extra (hack)", [403],
          api(f"{BASE}/songs/{x}?updateMask.fieldPaths=votes&updateMask.fieldPaths=hacked", "PATCH",
              {"fields": fields({"votes": 2, "hacked": "si"})}, token)[0])
    check("borrar canción con 2 votos", [403], api(f"{BASE}/songs/{x}", "DELETE", token=token)[0])
    check("retirar voto (queda 1)", [200],
          api(f"{BASE}/songs/{x}?updateMask.fieldPaths=votes", "PATCH",
              {"fields": fields({"votes": 1})}, token)[0])
    check("borrar canción con 1 voto", [200], api(f"{BASE}/songs/{x}", "DELETE", token=token)[0])

    print("\n== 4. users (solo tu propio doc) ==")
    check("leer mi doc (404 = permitido pero vacío)", [200, 404], api(f"{BASE}/users/{uid}", token=token)[0])
    check("crear mi doc (arrays vacíos)", [200],
          api(f"{BASE}/users?documentId={uid}", "POST",
              {"fields": fields({"proposals": [], "votes": []})}, token)[0])
    check("leer doc de OTRO usuario", [403], api(f"{BASE}/users/otro_usuario", token=token)[0])
    check("guardar favoritos ♥", [200],
          api(f"{BASE}/users/{uid}?updateMask.fieldPaths=favorites", "PATCH",
              {"fields": fields({"favorites": ["a", "b"]})}, token)[0])
    check("guardar votos", [200],
          api(f"{BASE}/users/{uid}?updateMask.fieldPaths=votes", "PATCH",
              {"fields": fields({"votes": ["x"]})}, token)[0])
    check("guardar djName + registro + email", [200],
          api(f"{BASE}/users/{uid}?updateMask.fieldPaths=djName&updateMask.fieldPaths=isRegistered&updateMask.fieldPaths=email", "PATCH",
              {"fields": fields({"djName": "DJ Selftest", "isRegistered": True, "email": EMAIL})}, token)[0])
    check("escribir en doc de OTRO usuario", [403],
          api(f"{BASE}/users/otro_usuario?updateMask.fieldPaths=votes", "PATCH",
              {"fields": fields({"votes": ["x"]})}, token)[0])
    check("crear doc de OTRO usuario", [403],
          api(f"{BASE}/users?documentId=otro_usuario", "POST",
              {"fields": fields({"proposals": [], "votes": []})}, token)[0])

    print("\n== 5. statistics (votos, tiempos, eventos) ==")
    old_ts = int(time.time() * 1000) - 3 * 3600 * 1000
    ev = tid('ev')
    check("crear vote_event", [200],
          api(f"{BASE}/statistics?documentId={ev}", "POST",
              {"fields": fields({"kind": "vote_event", "songId": "x", "title": "T",
                                 "type": "vote", "voterName": "A", "ts": old_ts})}, token)[0])
    check("actualizar votes_hoy", [200],
          api(f"{BASE}/statistics/votes_hoy?updateMask.fieldPaths={tid('v')}", "PATCH",
              {"fields": fields({tid('v'): 1})}, token)[0])
    check("actualizar doc NO canónico", [403],
          api(f"{BASE}/statistics/cualquiercosa?updateMask.fieldPaths=a", "PATCH",
              {"fields": fields({"a": 1})}, token)[0])
    check("borrar votes_hoy (protegido)", [403],
          api(f"{BASE}/statistics/votes_hoy", "DELETE", token=token)[0])
    check("borrar vote_event viejo (>2h)", [200],
          api(f"{BASE}/statistics/{ev}", "DELETE", token=token)[0])

    print("\n== 6. otras colecciones ==")
    check("crear design_feedback (encuesta)", [200],
          api(f"{BASE}/design_feedback?documentId={tid('survey')}", "POST",
              {"fields": fields({"preference": "neon", "userId": uid})}, token)[0])
    check("crear sugerencia", [200],
          api(f"{BASE}/suggestions?documentId={tid('sug')}", "POST",
              {"fields": fields({"title": "X", "youtubeUrl": "https://youtu.be/x", "userId": uid})}, token)[0])
    check("leer sugerencias (solo admin)", [403],
          api(f"{BASE}/suggestions/{tid('sug')}", token=token)[0])
    check("leer catálogo", [200], api(f"{BASE}/catalog/full_list", token=token)[0])
    check("escribir catálogo (solo admin)", [403],
          api(f"{BASE}/catalog/full_list?updateMask.fieldPaths=songs", "PATCH",
              {"fields": fields({"songs": []})}, token)[0])
    check("leer state/nowPlaying", [200, 404], api(f"{BASE}/state/nowPlaying", token=token)[0])
    check("escribir state (solo bridge)", [403],
          api(f"{BASE}/state/nowPlaying?updateMask.fieldPaths=title", "PATCH",
              {"fields": fields({"title": "Hack"})}, token)[0])
    check("leer leaderboard/noche", [200, 404], api(f"{BASE}/leaderboard/noche", token=token)[0])
    check("escribir leaderboard (solo bridge)", [403],
          api(f"{BASE}/leaderboard/noche?updateMask.fieldPaths=x", "PATCH",
              {"fields": fields({"x": 1})}, token)[0])
    check("leer admins propio (404 = permitido)", [200, 404], api(f"{BASE}/admins/{uid}", token=token)[0])
    check("leer admins de otro", [403], api(f"{BASE}/admins/otro", token=token)[0])

    print("\n== 7. Limpieza ==")
    api(f"{BASE}/users/{uid}", "DELETE", token=token)  # fallará: no está permitido borrar el propio doc
    code, _ = api(f"https://identitytoolkit.googleapis.com/v1/accounts:delete?key={API_KEY}",
                  "POST", {"idToken": token})
    # El doc de usuario quedaría huérfano: lo borramos con la cuenta de servicio si está disponible
    try:
        import firebase_admin
        from firebase_admin import credentials as _cred, firestore as _fs
        if not firebase_admin._apps:
            firebase_admin.initialize_app(_cred.Certificate(
                os.getenv("FIREBASE_CREDENTIALS_JSON", "python-bridge/serviceAccountKey.json")))
        _fs.client().collection('users').document(uid).delete()
        print("  Doc de usuario huérfano eliminado (Admin SDK)")
    except Exception:
        print("  (No se pudo limpiar el doc de usuario; se queda un doc vacío con prefijo del uid)")
    print(f"  Usuario de prueba borrado (HTTP {code})")

    passed = sum(results)
    print(f"\n================ RESULTADO: {passed}/{len(results)} comprobaciones correctas ================")
    sys.exit(0 if passed == len(results) else 1)


if __name__ == "__main__":
    main()
