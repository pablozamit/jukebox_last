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

La prueba `functions/test/signup-vote-proposal.integration.mjs` usa un proyecto de emulador cuyo nombre comienza por `demo-jukebox-flowtest-`, con Auth y Firestore aislados. Reproduce dos fallos heredados de las reglas en producción: una cuenta registrada puede superar los límites mediante peticiones directas y un usuario autenticado puede incrementar votos sin actualizar su perfil. La corrección de las reglas se ha preparado y probado localmente; no implica que esté aplicada en producción. No ejecutar la prueba en producción.

La corrección local liga cada propuesta y voto a un evento nuevo mediante `lastEventId`. El frontend nuevo y las reglas antiguas no son compatibles, ni tampoco lo son el frontend antiguo y las reglas estrictas. Una eventual activación requiere una transición coordinada, pruebas y renovación de las sesiones antiguas; no publicar ambas piezas de forma aislada. El puente sigue procesando los eventos históricos sin consultar ese puntero. Queda pendiente un caso heredado: si cambia el nombre DJ después de votar y antes de que el puente procese el evento, este puede descartarlo al comparar con el nombre actual.

## Contratos y conservación de datos

- `users` mantiene saldo gastable y puntos históricos. Comprar prendas solo descuenta saldo; no modifica nivel, historial ni rankings. Compra e inventario se escriben en una transacción, con recibo idempotente.
- El catálogo incluye tonos de piel, rasgos faciales, peinados y ropa: al inicializarse, los perfiles existentes reciben los nuevos artículos iniciales que les falten. Las prendas de pago requieren que el catálogo de Firestore coincida con el catálogo incluido en Functions. Antes de activar una versión nueva, revisar el catálogo y actualizarlo en el proyecto autorizado con el procedimiento `seed:catalog`; no usar el proyecto real para pruebas.
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

## Transición de clientes antiguos y nuevos (28 de octubre de 2026)

La fase temporal de `firestore.compat.rules` se publicó con autorización expresa en `jukebox-catrinero` el 28 de octubre de 2026 a las 19:18 (hora peninsular). Firebase confirmó la publicación y, al recargar, el texto activo coincidió exactamente con el archivo probado (SHA-256 normalizado `c231c64460a26e7e68e963db040fc84ad486301dc52c642764fe8539389240b6`). La consola indica que la propagación puede tardar hasta un minuto. No se han probado escrituras reales tras la publicación. Los comentarios iniciales del archivo lo llaman «candidato local»: describen su origen, no su estado actual.

`firestore.compat.rules` es independiente y **no está conectado a `firebase.json`**, que apunta a `firestore.rules` con el contrato estricto y las rutas sociales. No ejecutar un despliegue genérico de reglas: reemplazaría la fase temporal y puede rechazar clientes antiguos y ampliar lecturas. Las reglas antiguas rechazan las escrituras nuevas que añaden `songs.lastEventId`; las estrictas rechazan propuestas y votos de pestañas antiguas que no lo escriben.

La variante mínima de compatibilidad mantiene el enlace entre el token del perfil y el cambio de la cola, las capacidades y el registro seguro. Acepta el protocolo antiguo cuando el puntero no cambia y exige el contrato nuevo cuando cambia. Una canción que ya recibió un voto nuevo puede recibir después un voto antiguo conservando su puntero; detectar solamente la presencia de `lastEventId` bloquearía ese caso.

Esta variante **no incorpora las rutas sociales ni el permiso recursivo de lectura de `voteEvents`**. Conserva la superficie de lectura de producción: leer eventos de una canción está permitido, pero la consulta `collectionGroup('voteEvents')` del ticker continúa denegada igual que con las reglas antiguas. La candidata final sí incluye esos permisos adicionales; deben revisarse por separado. El flag del mapa controla la interfaz, no la aplicación de las reglas de Firestore, por lo que apagarlo no anula una ampliación de permisos ya desplegada.

Secuencia de transición:

1. Validar y revisar la variante compatible y los artefactos exactos, manteniendo apagado el mapa social. No necesita Functions ni catálogo social para la convivencia de los dos formatos musicales.
2. La variante compatible ya está publicada; sigue pendiente publicar la versión de frontend que escribe el puntero. La matriz local demuestra que ambos órdenes de uso sobre una misma canción son aceptados.
3. Mantener una ventana de actualización de clientes y comprobar adopción. Un despliegue de Vercel no recarga las pestañas ya abiertas; el código actual no aporta un registro fiable de versión o caducidad de todos los clientes. No hay un plazo que por sí solo demuestre que desaparecieron los antiguos.
4. Cerrar el carril antiguo solamente después de acordar la recarga de los clientes restantes y revisar el alcance final de las reglas. El archivo estricto actual contiene además rutas sociales y lectura recursiva: no debe confundirse ese alcance con la variante mínima. Si se necesita revertir el frontend durante la ventana, conservar la compatibilidad; restaurar las reglas antiguas bloquearía a los clientes nuevos que siguieran abiertos.

La compatibilidad no puede distinguir de forma fiable un cliente antiguo de uno malicioso que elige ese formato. Una operación válida del carril antiguo puede omitir su evento o escribir varios eventos; la matriz lo reproduce expresamente. Por tanto, durante la ventana no existe garantía universal de un evento por token y pueden faltar o duplicarse estadísticas. Los topes, las escrituras aisladas de cola/perfil y el reinicio de arrays durante el registro siguen bloqueados. El registro antiguo con arrays idénticos funciona; si manda arrays obsoletos después de una carrera, falla íntegramente y conserva los tokens. También puede rechazarse un evento antiguo con nombre obsoleto o normalizado de forma distinta al perfil; no se promete compatibilidad absoluta ante esas carreras.

### Matriz local de compatibilidad

Con el emulador de Firestore ya disponible en `127.0.0.1:8080`, ejecutar desde la raíz:

```powershell
$env:FIRESTORE_EMULATOR_HOST='127.0.0.1:8080'
node --test functions/test/rollout-compat.integration.mjs
```

Si no está arrancado, usar en otra terminal el procedimiento de emuladores anterior, o iniciar solamente Firestore con `firebase emulators:start --project demo-catrina-social --config firebase.local.json --only firestore`. No arrancar otro proceso sobre puertos ocupados.

La suite rechaza hosts que no sean loopback. Carga las reglas antiguas del commit de producción `d333643d05700ef040f66df624d4e33b12a120e4`, la variante compatible y la candidata estricta en proyectos sintéticos separados `demo-rollout-*`; no reemplaza las reglas del proyecto de las otras suites. Usa contextos autenticados sintéticos y el SDK real de Firestore para reproducir las transacciones, sin credenciales de producción. Limpia sus proyectos al terminar. No ejecuta los bundles completos del navegador ni sustituye las pruebas existentes de Auth real en emuladores.

Resultado local: **11/11 pruebas pasan**. Cubren la incompatibilidad directa entre protocolos, ambas secuencias mixtas, retirada de tokens, registro normal y con arrays obsoletos, capacidades, escrituras aisladas, el límite conocido de eventos del carril antiguo y la conservación de la superficie de lectura. La revisión adicional de seguridad no encontró un bypass nuevo fuera del carril antiguo descrito.

La comparación de índices de solo lectura encontró un índice compuesto remoto de `songs`, `COLLECTION`, con `votes DESCENDING`, `firstVotedAt ASCENDING` y `__name__ ASCENDING`. La entrada añadida a `firestore.indexes.json` coincide: CLI completa el último campo automáticamente. Los siete índices locales incluyen todos los remotos; no había otros índices compuestos ni excepciones de campo/TTL que el archivo omitiera en esa consulta puntual. Revalidarlo antes de cualquier operación autorizada, sin `--force`.

Sin el ordenador del bar no se certifican la versión real del puente instalada, su outbox, el estado actual de Kodi, los ACK de reproducción, las pestañas abiertas allí ni el cierre diario real. La transición de políticas y frontend no constituye esa validación ni resuelve la limitación no atómica del reset de las 02:00.

## Estado de puesta en marcha, 28 de octubre de 2026, 20:30 Europe/Madrid

Las reglas compatibilidad+social de `firestore.rollout-approved.rules` están publicadas y se han vuelto a leer por API: SHA-256 `295e003fc58a0f638e34293684be0da708b9698ea3263efe8f8ef3a30cc65d31`. La base anterior coincide con la compatibilidad documentada. No están publicadas las reglas estrictas ni el permiso collectionGroup del ticker. El ticker informa de actividad no disponible cuando su consulta se deniega; mantiene el aviso musical alternativo.

Se han enviado los seis índices sociales nuevos conservando el índice musical existente, sin force. Su disponibilidad se comprueba por separado. Se han habilitado las APIs requeridas por Functions v2 y está en curso su despliegue Node22 en us-central1, junto a Firestore nam5. El catálogo estaba vacío antes de su carga. Las variables de Vercel Production+Preview se han guardado como mapa=true y región=us-central1; guardarlas no demuestra que la web se haya recompilado ni publicado.

`firebase.rollout.json` es una configuración explícita para el despliegue autorizado compatible. `firebase.json` sigue apuntando al candidato estricto: no usar un deploy genérico de reglas. El Scheduler tiene un posible fijo aprobado de0,10USD/job/31d; Functions y reintentos se cobran por uso, sin techo prometido. El procesador de eventos conserva retry:true, con reintentos hasta éxito o vencimiento del periodo del proveedor (CLI indica hasta7d), y recibos transaccionales para no duplicar el efecto.

Verificación local repetida contra las reglas exactas compat+social: mapa móvil390 y escritorio1280, login, avatares, minimización/ampliación, giro/desplazamiento/zoom con ratón, búsqueda y ticker denegado sin error no controlado. No se afirma prueba táctil física ni prueba Kodi. 22unitarias frontend y22puente,5backend, compilación correcta; persisten4avisos de lint anteriores. El arreglo de nombre DJ del puente es candidato, no instalado en el bar.

La documentación histórica anterior no reemplaza este estado ni demuestra publicación del frontend. El bridge real, su outbox, Kodi y el reset02:00 siguen pendientes de acceso al ordenador del bar.
