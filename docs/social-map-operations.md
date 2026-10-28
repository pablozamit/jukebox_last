# Mapa social de La Catrina

La música conserva sus controles. El panel «La Catrina en vivo» se abre de forma opcional. Minimizarlo no oculta a quien haya elegido aparecer; «Ocultarme» sí retira su presencia. La zona es declarada por la persona, sin geolocalización.

Al abrirlo, el mapa ocupa casi toda la pantalla. Arrastrar gira la vista; con ratón se usa la rueda para acercar y el botón derecho para desplazar. En pantalla táctil, dos dedos desplazan y permiten acercar o alejar. Estos movimientos solo cambian la cámara y no modifican la zona declarada.

## Prueba local en Windows

Requisitos: Node.js 22, Java 21, Firebase CLI y las dependencias de `web-app` y `functions` instaladas con `npm ci`. No ejecutar `test_security_rules.py`: es una prueba anterior que apunta a producción.

En una terminal, desde la raíz del repositorio:

```powershell
npm --prefix functions run prepare:shared
firebase emulators:start --project demo-catrina-social --config firebase.local.json --only "auth,firestore,functions"
```

En otra terminal, desde la misma raíz:

```powershell
$env:GCLOUD_PROJECT='demo-catrina-social'
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8080'
$env:FIREBASE_AUTH_EMULATOR_HOST='127.0.0.1:9099'
$env:FIREBASE_FUNCTIONS_EMULATOR_HOST='127.0.0.1:5001'
node functions/scripts/seed-local.mjs
$env:VITE_USE_EMULATORS='true'
$env:VITE_FIREBASE_PROJECT_ID='demo-catrina-social'
$env:VITE_SOCIAL_MAP_ENABLED='true'
$env:VITE_SOCIAL_FUNCTIONS_REGION='europe-west1'
npm --prefix web-app run dev -- --host 127.0.0.1 --port 4173 --strictPort
```

Abrir `http://127.0.0.1:4173`. Las cuentas sintéticas `dj-alba@example.test` y `dj-bruno@example.test` usan `DemoLocal2026!`, exclusivamente en los emuladores. Cada pestaña local conserva una sesión independiente. No reutilizar esa contraseña en cuentas reales. El seed reinicia el saldo y las propuestas de estas dos cuentas; ejecutarlo antes de la prueba, no durante una compra. Su reproducción musical es un marcador de prueba: no hay Kodi conectado ni renovación automática del marcador.

El frontend rechaza combinar el modo emulador con otro proyecto o un origen remoto. Si falta un emulador, falla la conexión: no cambia automáticamente a producción.

## Comprobaciones

```powershell
npm --prefix web-app test
npm --prefix web-app run lint
npm --prefix web-app run build
npm --prefix functions test
python -m unittest discover -s python-bridge/tests
git diff --check
```

Con los tres emuladores ya arrancados y las cuatro variables de emulador anteriores:

```powershell
node functions/test/emulators.mjs
npm --prefix web-app run test:social
```

La matriz usa fixtures propios y los limpia al terminar. La reconciliación global con reloj adelantado requiere `--isolated` y solo debe ejecutarse en un emulador dedicado. Alternativamente `npm --prefix functions run test:emulators` inicia sus propios emuladores: no usarlo si los puertos ya están ocupados.

## Contratos y conservación de datos

- `users` mantiene saldo gastable y puntos históricos. Comprar prendas solo descuenta saldo; no modifica nivel, historial ni rankings. Compra e inventario se escriben en una transacción, con recibo idempotente.
- `socialUsers`, inventario, bloqueos y estadísticas son privados para su titular. El mapa recibe una proyección limitada en `rooms/catrina/presence`. Las fichas públicas solo se devuelven para presencia vigente. Las invitaciones solo son legibles por emisor/receptor.
- Los clientes no escriben directamente los documentos sociales. La callable valida identidad, catálogo, saldo, versiones y caducidad. Los administradores existentes conservan su acceso global.
- La presencia se renueva cada 60 segundos mientras la página está visible. Caduca sin renovación y requiere reactivación explícita. El contador agrupa vencimientos; el cliente descarta presencias caducadas incluso antes del mantenimiento periódico.
- El mapa minimizado desmonta la escena y su listener de avatares. Mantiene el resumen y las suscripciones personales. El GLB y Three.js se cargan al abrir el mapa.
- La escena solicita un fotograma al cambiar su contenido, tamaño o visibilidad, en vez de dibujar continuamente cuando está quieta. El modelo GLB se ha optimizado conservando la estructura del local; el archivo pasa de 1.794.504 a 322.684 bytes. El ahorro efectivo de transferencia depende de la compresión y caché del servidor.
- Las estadísticas nuevas reflejan eventos certificados desde su activación; no se reconstruyen totales históricos a partir de arrays de votos activos. Los logros anteriores reconocidos conservan su recompensa sin volver a conceder puntos.
- Ocultarse afecta al mapa social. El ticker musical público anterior conserva sus eventos de votos/propuestas.

El modelo `web-app/public/map/la-catrina.glb` y los datos geométricos proceden de la carpeta suministrada `La-Catrina-Juego`. Se conserva la distribución del local, incluida la terraza. El mapa no reserva mesas ni juegos; las invitaciones proponen un encuentro real.

La escena muestra hasta ocho muñecos por zona en posiciones libres de obstáculos; todas las personas siguen accesibles en la lista, también cuando se supera ese límite o falla WebGL.

## Puente musical y recuperación

Instalar `python-bridge/requirements.txt` en el entorno del puente. `tzdata` permite interpretar Europe/Madrid también en Windows. No arrancar el puente real para ejecutar pruebas unitarias: su arranque usa credenciales y Kodi.

El puente guarda evidencia local en `~/.jukebox-social/social-events-outbox.json`, configurable mediante `SOCIAL_EVENTS_OUTBOX_PATH`. Conservar este archivo al actualizar o reiniciar el puente. No contiene credenciales. Incluye atribuciones y recibos necesarios para reintentar sin inventar reproducciones. Un timeout de Kodi queda incierto; solo un ACK válido certifica una reproducción. Un fallo de almacenamiento se registra como pérdida de evidencia, nunca como éxito.

Limitación heredada para el piloto: el borrado musical diario de las 02:00 no es atómico respecto a nuevos votos. Aunque se drenan los eventos pendientes antes del cierre, un voto que llegue entre ese drenaje y el borrado podría faltar en el cálculo del ganador nocturno. El rediseño de ese reset queda pendiente; no afecta a la selección voluntaria de presencia ni convierte un timeout de Kodi en reproducción confirmada.

## Activación y reversión

Esta entrega se valida localmente; no implica despliegue en el bar. Antes de activar: verificar región de Firestore y Functions, facturación, índices y cuentas administradoras, desplegar la versión compatible del backend, cargar el catálogo autorizado y comprobar el puente con Kodi real. `SOCIAL_FUNCTION_REGION` y `VITE_SOCIAL_FUNCTIONS_REGION` deben coincidir. `europe-west1` es el valor de prueba, no una región de producción verificada.

En una compilación normal, el mapa permanece desactivado salvo que se configuren explícitamente `VITE_SOCIAL_MAP_ENABLED=true` y la región. Para retirarlo, recompilar con el flag desactivado. Mantener recibos, inventarios y saldos para conciliación; no borrar datos ni restaurar reglas antiguas indiscriminadamente.

El mantenimiento programado se prueba por sus funciones de reconciliación en emuladores. Su ejecución por Cloud Scheduler y la reproducción real en Kodi requieren comprobación tras un despliegue autorizado. El consumo real bajo afluencia de clientes no se ha medido.

## Evidencia de la entrega local (17 de octubre de 2026)

- Frontend: 14 pruebas, compilación y lint sin errores; cuatro avisos de hooks preexistentes y aviso de tamaño del chunk diferido de Three.js.
- Backend: cinco pruebas unitarias, 12 comprobaciones de emulador y una prueba de callables con dos clientes reales del SDK de Auth.
- Puente: 17 pruebas unitarias y compilación Python, sin arrancar Kodi.
- Navegador: dos cuentas independientes, invitación aceptada, compra y equipamiento persistidos, favorita, ocultación, minimización, cierre con Escape y lista alternativa al bloquear el modelo 3D. Ancho de 390 px sin desbordamiento horizontal.
- Las unitarias del backend también pasan con Node 22. El proceso de Functions del emulador local utilizó Node 24; falta validar el runtime desplegado y Cloud Scheduler.

No se ha desplegado en producción. La captura de la prueba está en `test-results/social-map-desktop.jpg` (artefacto local ignorado por Git).
