# Plan de implementación: mapa social de La Catrina

Fecha: 17 de octubre de 2026. Rama de trabajo: `feat/mejoras`.
Estado: plan preparado para revisión; no hay implementación del mapa social todavía.
Diseño aprobado: [mapa social y avatar de DJ](../specs/2026-10-17-mapa-social-catrina-design.md).

## Resultado y alcance

Añadir un mapa social plegable a la jukebox existente: personas con ubicación elegida y opción de ocultarse, muñecos personalizables, tarjeta de DJ, invitaciones presenciales y un armario que combina logros y compras con puntos. La música conserva sus controles y disposición. Cada entrega debe seguir siendo utilizable sin activar la parte social.

Método recomendado: implementación supervisada en este mismo chat y rama, por tareas pequeñas con propiedad explícita de archivos. Luna en el menor nivel suficiente para cada tarea; Sol high para revisión o cambios sensibles de autorización cuando corresponda. Jev solo decide clasificación, siguiente paso o escalado a partir de evidencia. Tests, compilación, lint y diff se ejecutan con sus herramientas. El usuario seleccionará este método al aprobar el plan; no se crean otros chats.

## Base comprobada y precauciones de trabajo

- React 19, Vite 8 y Firebase Web SDK 12 en `web-app`; bridge Python que controla Kodi y concede puntos.
- `firebase.json` solo configura las reglas de Firestore; no existe paquete de Cloud Functions ni configuración de emuladores en el repo.
- El registro previo de esta conversación obtuvo 4/4 tests, build correcto y lint con 0 errores y 4 avisos. Es un resultado anterior: repetir el baseline al comenzar la implementación.
- Hay cambios del usuario en `web-app/package.json` y su lockfile, además del GLB y otros archivos sin seguimiento. Conservarlos. Incorporar solo los cambios propios mediante rutas explícitas; no hacer `git add .`, reset, clean ni checkout sobre esos cambios.
- Se trabaja en `feat/mejoras`, solicitada por el usuario. La regla de crear rama desde main de `PROCEDURES.md` describe el refactor anterior; no sustituye esta elección explícita.
- El GLB de 1.794.504 bytes está disponible. La entrega original contiene mapa, colisiones, navegación y licencia de Three.js. Se copian únicamente los recursos necesarios y se conserva su procedencia.
- `test_security_rules.py` usa un proyecto real por defecto; no ejecutarlo como prueba local. `bridge.py` inicializa credenciales y conexión al importar: las pruebas nuevas deben importar módulos puros o un adaptador de emulador explícito.

## Decisiones técnicas

### Interfaz y escena

Mantener componentes React planos en `web-app/src/` y hooks en `src/hooks/`. Utilidades de escena en `src/map/`; operaciones puras compartidas en `shared/` como módulos `.mjs`. Añadir Three.js y su `GLTFLoader`, sin incorporar un segundo framework de escena. Elegir la versión al instalar, verificar compatibilidad y fijarla en el lockfile; el prototipo aportado usa Three.js 0.185.1.

El panel se inserta debajo de `NowPlayingCard` en `App.jsx`. Su escena se importa de forma diferida al desplegar. La lista accesible de personas sirve también como alternativa cuando WebGL falla. Se conservan Catrina y Neón y los textos ES/EN.

El mapa usa el modelo real, con las paredes recortadas para ver el interior. Las zonas se derivan de `bar-counter`, `pool-table-blue`, `foosball`, mesas y suelos del JSON original. Un selector mueve la presencia entre zonas; la interpolación del avatar ocurre solo en el cliente. No se transmiten fotogramas ni se exige caminar.

### Servicio autoritativo

Añadir `functions/` con Cloud Functions for Firebase y Admin SDK. Usar funciones callable para inicializar el perfil social, editar canción favorita, presencia, invitaciones, bloqueo, compra y equipamiento. La identidad procede del token verificado, nunca de un UID de remitente enviado por el cliente. [Referencia oficial de callables](https://firebase.google.com/docs/functions/callable).

La app consulta Firestore para recibir los cambios en tiempo real. Las escrituras sociales del cliente se rechazan; las funciones validan identidad, tipos, estado previo, límites e inventario. Inicializar identidad persistente, publicar presencia, invitar, comprar y equipar exige una cuenta registrada comprobada mediante Firebase Auth; no basta `isRegistered` enviado por el navegador. Un usuario anónimo puede consultar el mapa y las tarjetas de personas visibles. Como Admin SDK no está restringido por las reglas del cliente, hay pruebas separadas de los handlers y de las reglas. [Referencia oficial de consultas y reglas](https://firebase.google.com/docs/firestore/security/rules-query).

Antes de desplegar, verificar región de Firestore, región de Functions, permisos y estado de facturación del proyecto. No asumir que el proyecto admite el nuevo servicio ni prometer coste cero. El desarrollo y las pruebas se realizan con proyecto `demo-catrina-social` y emuladores locales. [Referencia oficial de Emulator Suite](https://firebase.google.com/docs/emulator-suite/connect_and_prototype).

### Datos y lecturas

| Ruta propuesta | Contenido | Lectura por cliente | Escritura |
|---|---|---|---|
| `users/{uid}` | Perfil y saldo actuales | Propietario, según reglas existentes | Reglas existentes y servicios autorizados |
| `socialUsers/{uid}` | Preferencias sociales, favorito, visibilidad, sesión y equipamiento | Propietario | Funciones |
| `socialUsers/{uid}/inventory/{itemId}` | Artículos poseídos y origen de obtención | Propietario | Funciones |
| `socialUsers/{uid}/blocks/{otherUid}` | Bloqueos | Propietario | Funciones |
| `socialUsers/{uid}/operations/{requestId}` | Resultado de compra/invitación para reintentos | Propietario | Funciones |
| `socialStats/{uid}` | Contadores, fechas acreditadas y logro concedido | Propietario | Servicio y bridge |
| `rooms/catrina/presence/{uid}` | Nombre, zona, avatar, actividad breve acreditada y vencimiento; ningún email ni saldo | Usuarios autenticados, incluidos anónimos | Funciones |
| `rooms/catrina` | Recuento agregado por vencimientos, sin identidades | Usuarios autenticados | Funciones |
| `socialInvitations/{id}` | Invitación, participantes, versiones de presencia, estado y vencimiento | Emisor y destinatario con consulta filtrada | Funciones |
| `socialCatalog/{itemId}` | Categoría, precio o requisito y referencia visual | Usuarios autenticados | Seed administrativo versionado |
| `socialEvents/{eventId}` | Eventos musicales acreditados; sin acceso público general | Ningún cliente | Bridge y servicio |
| `socialEventReceipts/{eventId}` | Recibo mínimo de aplicación única de cada evento | Ningún cliente | Servicio |

La tarjeta pública se obtiene con `getDjCard`: valida que el objetivo siga visible y vigente y devuelve solo nombre, avatar, favorito, nivel, antigüedad y métricas permitidas. No permite listar `users` ni obtener un perfil oculto. Al ocultarse alguien se elimina su presencia y se cierra cualquier tarjeta abierta para esa persona. No se promete borrar información ya vista por un receptor.

Los campos nuevos de negocio no se colocan bajo `state` o `statistics`, cuyas reglas actuales dan lectura pública. Las reglas nuevas deben probarse también mediante acceso directo al SDK, no solo pasando por la interfaz.

### Presencia, minimizado y concurrencia

Una cuenta tiene una presencia por sala. `showPresence` genera una nueva versión de sesión y sitúa el avatar; `heartbeatPresence` renueva solo esa versión; `hidePresence` invalida la versión y elimina el registro público. Un heartbeat antiguo no puede volver a publicar a quien se ocultó. En varias pestañas la última activación explícita controla la presencia; las anteriores dejan de renovar al detectar versión distinta.

Renovación inicial: cada 60 segundos cuando la página está activa. Vencimiento: siguiente frontera de minuto más 120 segundos, calculado por el servidor, con duración efectiva de 120 a 180 segundos. En segundo plano se suspenden las renovaciones; al volver se muestra el estado real y se permite reactivar si caducó.

Mantener un histograma de vencimientos en `rooms/catrina`, actualizado en la misma transacción que aparecer, renovar u ocultarse. Cada clave es una frontera temporal y su valor es un recuento, sin nombres ni UID. Cada escritura poda las claves vencidas; ocultar una presencia ya vencida no resta de un intervalo ya eliminado. El cliente descarta los intervalos vencidos con un temporizador: la franja minimizada obtiene el número vigente sin suscribirse a todos los avatares. Probar que dos renovaciones y una ocultación concurrentes no dejan recuentos negativos o duplicados.

Al minimizar: detener renderizado y suscripción a personas, cerrar tarjeta de terceros, conservar solo resumen, presencia propia e invitaciones. Renovar presencia no depende de que el mapa esté desplegado. Al cerrar sesión: invalidar presencia, detener listeners y descartar estado de la cuenta anterior. La caducidad es la garantía ante cierres bruscos; no depender de `beforeunload`.

Un mantenimiento cada 5 minutos elimina registros y claves ya vencidos, incluso sin clientes activos; la interfaz y los handlers aplican el vencimiento aunque esa limpieza todavía no haya ocurrido. El mantenimiento reconcilia el resumen con las presencias vigentes mediante transacción que lee primero la sala: cada mutación de presencia también escribe la sala, para que una renovación concurrente fuerce el reintento de la reconciliación. No sobrescribir el resumen a partir de una lectura obsoleta. Probar avance prolongado de reloj, renovación, ocultación tras caducar, reconexión, doble pestaña y reparación de un resumen inconsistente.

### Invitaciones

Tipos cerrados: `drink`, `pool`, `foosball`. Estados: `pending`, `accepted`, `declined`, `cancelled`, `expired`. Solo el destinatario puede aceptar o rechazar; el emisor puede cancelar. Operaciones idempotentes por `requestId` y transiciones terminales inmutables.

Antes de enviar o aceptar, el servidor comprueba presencia vigente y versión de ambos participantes, bloqueo en ambos sentidos y preferencias de recepción. El vencimiento inicial es de 5 minutos. Límites iniciales: una pendiente por pareja, 30 segundos entre envíos del mismo emisor y 5 pendientes salientes como máximo. Estos límites protegen el flujo de invitaciones y no afectan a votar o proponer canciones.

Ocultarse o bloquear invalida las invitaciones pendientes afectadas y actualiza su estado. La invalidación de versión impide aceptarlas aun si una limpieza se retrasa. Al vencer o abandonar el mapa social se cierra la invitación, no se atribuye un rechazo al destinatario. Las invitaciones no crean reservas ni pedidos.

### Puntos, inventario y logros

La compra lee en una transacción el catálogo autoritativo, el saldo de `users/{uid}`, el artículo de inventario y el resultado de la operación. Verifica precio no negativo, artículo activo de tienda, saldo suficiente y ausencia de propiedad. Descuenta únicamente `points`, crea la propiedad y registra el resultado. Reintentar devuelve el resultado original. Compra concurrente y canje de 50 puntos por voto no pueden sobregirar el saldo. `totalPointsEarned`, nivel y rankings no cambian por gastar. El abono 10/5 del bridge es un tercer escritor del saldo: probar su intercalado con compras y canjes sin reemplazar el documento con una copia antigua.

Equipar verifica propiedad y categoría. Las piezas iniciales gratuitas se conceden una sola vez al inicializar la cuenta social. Los artículos de logro no admiten compra. En la primera inicialización, el servidor lee `users.achievements`, conserva los identificadores conocidos y concede sus piezas una vez, con un recibo `legacy-achievements-v1` y origen `legacy-server-profile`. Es una migración de titularidad almacenada, no una reconstrucción de acciones históricas. Los valores desconocidos o mal formados se conservan en el perfil original y se anotan para revisión, sin conceder artículos arbitrarios. Nunca se importan indicadores locales ni se infieren logros de las tarjetas de UI; tampoco se altera saldo o acumulado. Una cuenta sin logros guardados empieza a acumular los nuevos desde la activación, sin inventar logros antiguos.

Colección inicial, con el catálogo compartido como fuente de verdad:

| Vía | Artículos |
|---|---|
| Gratis | Dos camisetas lisas, vaquero, zapatillas neutras, pelo corto, media melena y opción sin pelo |
| 50 puntos | Camiseta ámbar y peinado rizado |
| 100 puntos | Chaqueta vaquera y botas |
| 200 puntos | Chaqueta de DJ y gorra |
| `first_vote` | Pulsera musical |
| `protagonist` | Camiseta del escenario |
| `hitmaker` | Chaqueta de éxitos |
| `influencer` | Gafas de estrella |
| `streak` | Peinado con mechón de color |
| `loyal` | Camiseta La Catrina |
| `early_bird` | Gorra amanecer |
| `night_owl` | Accesorio luna |

Los nombres y diseños se previsualizan antes de implementar el equipamiento. Las recompensas reflejan los ocho logros ya definidos en `translations.js`; no crean premios por beber, invitar o permanecer conectado.

### Estadísticas y eventos fiables

Guardar contadores históricos nuevos con `trackingStartedAt`; la UI dice «Desde [fecha]». En tarjetas: propuestas que sonaron, participación musical y nivel. No recuperar cifras antiguas a partir de arrays activos ni inventar una fecha de alta. Para cuentas existentes usar la fecha de creación de Firebase Auth como «Cuenta desde»; una fecha documentada distinta se etiqueta «Primera actividad registrada».

Contrato mínimo de `socialStats`: `schemaVersion`, `trackingStartedAt`, `uniqueVotes`, `uniqueProposals`, `proposalsPlayed`, `participationNights`, `lastParticipationSession`, `votingStreak`, `achievementGrants` y `updatedAt`. Los grants guardan fecha, evento/origen y versión de cálculo. `getDjCard` devuelve los contadores etiquetados, logros, nivel derivado del acumulado y fecha acreditada; no entrega la lista completa de fechas de actividad.

Contrato de `socialEvents`: `schemaVersion`, `kind`, `uid`, `songId`, `sessionId`, `occurredAt`, `certifiedAt`, `sourceId`, `playbackId` cuando proceda y el dato de pico de votos necesario para logros. El bridge acredita voto/propuesta tras validar el evento musical existente; la reproducción se acredita tras ACK de Kodi. IDs: SHA-256 del array JSON canónico `[kind, uid, songId, sessionId]` para participación y `[kind, playbackId, uid]` para reproducción. Cada consumidor crea el recibo y actualiza estadísticas/logros en la misma transacción. Eventos detallados aplicados se conservan 30 días; los recibos mínimos de deduplicación se conservan mientras exista la cuenta. No se borran eventos sin aplicar por una limpieza de antigüedad. Los resúmenes de jornada conservan el pico de votos hasta cerrar y conceder los logros de esa jornada.

La participación se cuenta una vez por persona/canción/jornada/tipo, no por cada reintento ni por retirar y volver a votar. Los eventos de reproducción necesitan un identificador persistido y los proponentes antes de limpiar arrays. El bridge publica esos eventos únicamente tras la confirmación de Kodi. Los procesadores son idempotentes; no vuelven a conceder los puntos 10/5 que ya concede el bridge. Los `voteEvents` actuales son públicos y se depuran: no constituyen un historial durable. Esta entrega no amplía su exposición ni promete anonimato sobre el ticker musical existente; el mapa consume una proyección social nueva.

Los logros se calculan sobre eventos acreditados: primer voto; primera propuesta que suena; propuesta que alcanza 10 votos; dos jornadas consecutivas de voto; cuatro jornadas con actividad; voto entre 19:00 y 20:00; voto entre 00:00 y cierre de jornada; canción propia con máximo de votos de la jornada al cerrarla. Para el máximo de la noche se registra el pico de votos de cada canción y se conceden todos los empates, sin confundirlo con el ranking de puntos del DJ.

Definir jornadas sociales con zona `Europe/Madrid` y corte a las 02:00, comprobando cambio de día y horario de verano. «Cliente fiel» se describe como cuatro jornadas con participación, porque la aplicación no acredita visitas físicas. La actividad pública del mapa se deriva de eventos acreditados y de presencia visible; nunca concede recompensas por sí misma.

## Orden de ejecución y entregables

Cada tarea termina con diff revisado, pruebas relevantes y una decisión acotada de Jev sobre el trabajo restante. No se repite toda la batería si no hay cambios o evidencia nueva. Se informa de cualquier fallo antes de pasar de etapa.

### 1. Baseline, entorno local y defecto de trivia

**Archivos:** `web-app/src/firebase.js`, `web-app/src/appLogic.js`, `web-app/src/TriviaGift.jsx`, `web-app/tests/appLogic.test.js`, nuevo `firebase.local.json`, configuración local de pruebas y `web-app/.env.example`.

- Ejecutar lint, tests y build existentes y guardar resultados concisos.
- Añadir selección explícita de emuladores Auth/Firestore/Functions antes de cualquier login. En modo local rechazar projectId real y rutas de producción. No modificar la configuración de despliegue existente por efecto del modo test.
- Corregir la lectura de `lastTriviaAt` mediante una función pura que acepte millis y Timestamp heredado y trate ausencia/datos inválidos sin excepción. Mantener escritura numérica y semántica de cooldown existente.
- Verificar valor numérico tras una ronda, Timestamp heredado, null y valor inválido. La validación local no depende de credenciales reales.

**Salida:** jukebox funcional en emuladores y fallo de trivia cubierto. Luna medium; revisión de conexión local antes de ejecutar flujos de escritura.

### 2. Contratos, catálogo y servicios locales

**Archivos nuevos:** `shared/socialCatalog.mjs`, `shared/socialContracts.mjs`, `shared/socialRules.mjs`, `functions/package.json`, `functions/src/index.js`, `functions/src/socialService.js`, `functions/scripts/prepare-shared.mjs`, `functions/tests/`, `web-app/src/socialApi.js`; actualización de `firebase.json` para Functions e índices cuando se integre el paquete.

- Usar módulos puros para validar categorías, tipos de invitación, precios, estados y selección de zona. Adaptar tests con el runner Node existente.
- Copiar de forma determinista los módulos de `shared/` a `functions/src/generated/` antes de test/emulador/deploy, y validar sus hashes. El paquete desplegable no debe depender de archivos fuera de `functions/`. Las copias generadas no se editan a mano; Vite consume los módulos originales.
- Configurar en `firebase.json` un codebase `social`, source `functions`, runtime compatible fijado en `functions/package.json` y predeploy de preparación. La región se obtiene en el preflight del proyecto y se fija explícitamente tanto en funciones como en `socialApi.js`; no confiar en la región por defecto. Dejar comandos de despliegue con `--project jukebox-catrinero` explícito y mantener `firebase.local.json`/`demo-catrina-social` exclusivos de las pruebas. No ejecutar el despliegue durante estas tareas.
- Configurar Functions con entorno de pruebas separado, semilla de catálogo y usuarios ficticios solo para `demo-catrina-social`. La semilla debe abortar si no detecta emuladores.
- Implementar inicialización de cuenta social, favorito y equipamiento con handlers pequeños. Validar el ID de canción contra catálogo; si se retira del catálogo, conservar el título seleccionado como referencia histórica sin permitir proponer una canción inexistente.
- Escribir contrato de errores para permisos, saldo, propiedad, presencia caducada, límite de invitaciones y datos inválidos; traducirlos en el cliente.

**Salida:** servicios verificables sin UI ni producción. Luna high.

### 3. Reglas, consultas e índices

**Archivos:** `firestore.rules`, `security-rules.txt`, nuevo `firestore.indexes.json`, configuración de emuladores, nuevos tests de reglas y excepciones explícitas en `.gitignore` para las configuraciones JSON añadidas.

- Probar propiedad de datos privados, lectura de presencia, consultas filtradas de invitaciones y denegación de escrituras directas a inventario, saldo social y stats.
- Mantener las reglas existentes de jukebox y la excepción administrativa. Añadir pruebas de no regresión para votar, proponer, favoritos, registro y canje.
- Las consultas de invitaciones se separan por `senderId` y `recipientId` y se limitan; incluir índices que exijan las consultas reales. No confiar en reglas como filtros posteriores.
- Mantener idénticas las dos copias de reglas. Revisar los handlers Admin por separado, dado que el emulador de reglas no limita sus operaciones.

**Salida:** matriz permitida/denegada verde y revisión de seguridad. Escalado a Sol high justificado por cambios de autorización.

### 4. Presencia y tarjetas de DJ

**Archivos nuevos:** `functions/src/presence.js`, `functions/src/djCard.js`, `web-app/src/hooks/useSocialPresence.js`, `web-app/src/hooks/useRoomSummary.js`, `web-app/src/DjCard.jsx` y sus pruebas.

- Implementar versión de presencia, leases, histograma y borrado por ocultación; probar transacciones concurrentes y reloj controlado.
- Añadir mantenimiento programado y prueba de reconciliación sin clientes activos, con poda y conflicto de renovación durante la reparación.
- Tarjeta con proyección de campos explícita y consulta autoritativa al abrir. Cerrar y limpiar al ocultarse la persona o caducar su presencia.
- Probar cambios de usuario y pérdida de red; no dejar avatares de otra sesión, perfil privado ni saldo en el estado público.

**Salida:** dos sesiones locales ven presencia y tarjeta correctas. Luna high con revisión Sol en autorización.

### 5. Integración visual del mapa

**Archivos:** `web-app/src/App.jsx`, nuevos `SocialMapPanel.jsx`, `SocialMapScene.jsx`, `SocialPeopleList.jsx`, `src/map/createRoomScene.js`, `src/map/createAvatar.js`, `src/map/zones.js`, `src/map/navigation.js`, estilos y traducciones; recursos en `public/map/` con licencia/procedencia.

- Copiar navegación y datos necesarios desde `La-Catrina-Juego/fuente` y adaptar a módulos sin controles globales. El GLB existente se conserva y se incorpora explícitamente a Git.
- Selección de zona con anclajes en suelo transitable, avatares separados y lista alternativa cuando hay muchos en una zona. No cambiar la geometría de la terraza.
- Mostrar panel minimizado, desplegado y ampliado. El mapa no roba scroll o teclado del buscador; enfocar y restaurar foco al abrir/cerrar tarjetas.
- Pausar animación al minimizar, al ocultar pestaña o con reducción de movimiento; liberar renderer, geometrías, listeners y materiales al desmontar. Verificar montaje doble de React StrictMode.
- Probar 360, 390 y 768 píxeles de ancho y escritorio; avatar seleccionable con dedo, panel sin overflow, fallback sin WebGL.

**Salida:** mapa visual integrado con datos de emulador. Luna high; revisión visual antes de añadir más animaciones.

### 6. Invitaciones presenciales

**Archivos nuevos:** `functions/src/invitations.js`, `web-app/src/hooks/useSocialInvitations.js`, `SocialInvitationInbox.jsx`, `SocialInvitationActions.jsx`; ajustes en tarjeta y franja minimizada.

- Implementar envío, respuesta, cancelación, vencimiento, silencio y bloqueo con los límites definidos.
- Probar doble envío, doble aceptación, respuesta ajena, aceptación tras ocultación o bloqueo, expiración y dos pestañas que responden distinto.
- Probar que solo emisor y destinatario leen la invitación y que ninguna operación genera puntos, pedidos o reservas.

**Salida:** dos personas completan una invitación con el mapa abierto o minimizado. Luna high y revisión de permisos.

### 7. Compra de ropa y armario

**Archivos nuevos:** `functions/src/wardrobe.js`, `AvatarWardrobe.jsx`, `AvatarPreview.jsx`, `useWardrobe.js` en hooks; cambios acotados en `Profile.jsx` y catálogo compartido.

- Crear y previsualizar las piezas geométricas de la colección inicial.
- Implementar compra atómica, inventario, equipamiento y obtención por logro. Mantener el saldo actual como única moneda.
- Probar migración única de logros guardados: usuario con logros conocidos, array vacío, identificadores desconocidos, documento mal formado y dos inicializaciones concurrentes. Conservar las concesiones anteriores y no duplicar artículos ni saldo.
- Pruebas de compra duplicada, dos compras que compiten por el saldo, compra frente a canje por voto, abono concurrente del bridge, precio falsificado, prenda no poseída y categoría incompatible.
- Verificar que conservar nivel y rankings es una propiedad real de las escrituras, no solo un cambio visual.

**Salida:** armario persistente y tienda funcional con validación autoritativa. Luna high; Sol high revisa economía/permisos.

### 8. Eventos, estadísticas y recompensas

**Archivos:** `python-bridge/bridge.py`; nuevos `python-bridge/social_events.py`, `python-bridge/tests/test_social_events.py`, `functions/src/socialProgress.js`, `functions/tests/socialProgress.test.js`; ajustes en perfil, tarjeta y traducciones.

- Extraer lógica pura y adaptadores sin inicializar Firebase al importarlos en tests.
- Registrar participación y reproducción con claves estables y deduplicación. Capturar la atribución antes de borrar arrays y guardar la intención con identificador estable antes de solicitar reproducción. Confirmar el evento solo con el ACK real de Kodi; no convertir un timeout en éxito. No impedir que Kodi reproduzca porque falle un servicio social: guardar un outbox local mínimo con reintentos y sin secretos, conservarlo en el procedimiento del bridge. Si falla el almacenamiento local, registrar la pérdida de evidencia y no fabricar estadísticas completas.
- Procesar cada evento una vez; conceder logros, piezas y contadores sin volver a incrementar puntos existentes.
- Simular fallos en los límites existentes entre limpieza y abono del bridge. Si aparece pérdida o doble abono, corregir el procesamiento afectado con un recibo de liquidación por reproducción/usuario antes de declarar estable la economía compartida; no reabonar operaciones cuyo resultado sea incierto.
- Pruebas de replay, reinicio, eventos fuera de orden, madrugada, cambio de hora, empate del máximo de la noche y obtención retroactiva de prendas por logros acreditados.
- El procesador publica la última actividad breve dentro de la presencia visible existente, con ID de evento y vencimiento de 10 segundos. La transacción comprueba visibilidad, lease y versión; nunca crea una presencia desde un evento. No reproduce actividad anterior a la activación de esa presencia. Las animaciones solo se muestran para personas visibles; se agregan ráfagas sin abrir un listener independiente por avatar.

**Salida:** actividad real alimenta la tarjeta y los desbloqueos. Luna high; revisar alcance del bridge para conservar su reproducción y economía.

### 9. Validación integrada y entrega

**Archivos nuevos:** pruebas integradas de dos sesiones, fixtures y `docs/social-map-operations.md`; actualización de instrucciones del bar solo donde haya requisitos nuevos.

- Recorrer los diez criterios de aceptación del diseño aprobado.
- Verificar toda la jukebox con función social desactivada, minimizada, abierta, sin WebGL y con fallo de backend.
- Medir carga inicial, memoria y listeners: Three.js/GLB no entran en la carga musical inicial; el mapa minimizado no tiene bucle 3D ni listener de todos los avatares. Registrar escrituras por renovación y lecturas con varias personas; no afirmar ahorro sin medir.
- Revisar diff final y buscar archivos ajenos o secretos antes de commits explícitos. Ningún test usa producción de forma implícita.
- Entregar capturas y evidencia de dos sesiones locales, matriz de pruebas, límites y pasos de despliegue/reversión.

**Salida:** implementación local verificada y revisión final lista. La conexión y prueba real del bar se reportan como etapa separada.

## Comandos de verificación

Existentes, desde `web-app/`: `npm run lint`, `npm test`, `npm run build`.

La implementación añadirá scripts explícitos con estos contratos:

- `npm --prefix functions test`: lógica pura y handlers con reloj/repositorio controlados.
- `npm --prefix functions run test:emulators`: arranca Auth, Firestore y Functions con `firebase.local.json`, `--project demo-catrina-social`, y ejecuta matriz de reglas y servicios. Aborta si falta un emulador.
- `npm --prefix web-app run test:social`: integración de dos sesiones contra ese entorno, sin fallback a producción.
- `python -m unittest discover -s python-bridge/tests`: módulos puros y adaptadores falsos; no importa el arranque de `bridge.py`.
- `git diff --check` y revisión del diff real por tarea. El commit documental anterior no sustituye estas verificaciones de código.

## Activación y reversión

Usar flag `VITE_SOCIAL_MAP_ENABLED` desactivado por defecto hasta completar la validación. En producción, comprobar configuración, región, costes previstos y permisos antes de desplegar Functions, reglas e índices. Verificar primero el backend, luego activar frontend y el bridge compatible. La aprobación del plan no se presenta como un despliegue ya autorizado o realizado.

Reversión de la experiencia: desactivar flag para mantener la jukebox musical; invalidar presencias y nuevas invitaciones del lado servidor. Conservar inventarios, recibos y saldo para conciliación. No restaurar indiscriminadamente reglas antiguas que eliminarían acceso a compras ya realizadas. Documentar versiones compatibles de frontend/bridge y cómo comprobarlas.

## Revisión y ejecución

Revisar este plan y confirmar su ejecución supervisada en este mismo chat. El diseño ya está aprobado; esta revisión solo concreta backend, fases, pruebas y método de trabajo. La skill `writing-plans` no estaba instalada: el plan se ha preparado directamente a partir del diseño y del repositorio real, con revisión independiente.
