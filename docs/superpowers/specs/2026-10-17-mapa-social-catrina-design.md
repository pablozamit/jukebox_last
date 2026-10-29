# La Catrina: mapa social y avatar de DJ

Fecha: 17 de octubre de 2026. Rama: `feat/mejoras`.
Estado: diseño aprobado por el usuario el 17 de octubre de 2026; implementación pendiente. Las decisiones descritas como propuestas forman parte del diseño aceptado. El plan técnico se revisa por separado.

## Propósito y acuerdos confirmados

Facilitar que las personas del local se conozcan e interactúen en persona mientras usan la jukebox. Buscar canciones, proponer y votar debe seguir siendo igual de directo. El mapa muestra personas y actividad; no sustituye la interfaz musical ni obliga a caminar para usarla.

El usuario ha confirmado:

- Mapa que se puede desplegar y minimizar.
- Cada persona elige la zona donde aparece y puede permanecer oculta.
- Muñeco sencillo personalizable con ropa, peinados y accesorios desbloqueables.
- Al tocar un avatar: nombre, estadísticas de DJ, canción favorita, antigüedad y logros.
- La canción favorita la elige la persona.
- Invitaciones para tomar algo, jugar al billar o jugar al futbolín.
- Dos vías para conseguir prendas: desbloqueos por logros y compras con puntos.

## Experiencia propuesta

### Jukebox y mapa

Se conserva la composición musical actual. Se añade una franja plegable «La Catrina en vivo» debajo de la tarjeta de la canción actual. Minimizada ocupa una sola fila con el número de personas visibles y un botón para desplegar. Ese número se etiqueta como personas visibles en el mapa, no como aforo real ni como todos los usuarios conectados.

Al desplegar aparece el modelo del local con los avatares. El panel tiene controles explícitos para ampliar, minimizar, elegir zona y cambiar visibilidad. En móvil se puede ampliar a una vista que aproveche la pantalla; volver al tamaño pequeño conserva el contexto musical y la posición de scroll. No se añaden pestañas obligatorias al catálogo ni se reorganizan búsqueda, cola o votación.

La distribución del local procede del modelo existente. Se conservan las dos mesas rectangulares juntas y sus ocho taburetes de terraza. No se inventa una ubicación para los dardos.

### Presencia voluntaria

Propuesta inicial: se entra oculto hasta pulsar «Aparecer en el mapa» y elegir zona. Las opciones son terraza, entrada, barra, billar, futbolín y mesas, asociadas a las ubicaciones existentes en el modelo.

El muñeco se sitúa en un espacio libre de esa zona. Su posición es una declaración de la persona; no se presenta como ubicación detectada. Puede cambiar de zona directamente. Las animaciones entre posiciones son visuales y no requieren transmitir cada paso del muñeco.

Minimizar el panel no oculta a la persona. El control «Ocultarme» es independiente y siempre accesible. Ocultarse retira el avatar y su actividad de este mapa; no elimina las atribuciones musicales que ya muestra la jukebox en su cola o clasificación. Esa distinción debe quedar clara en la ayuda breve.

La presencia caduca cuando deja de renovarse. No se muestra indefinidamente a alguien que cerró la aplicación. Si se pierde conexión, la interfaz indica que la presencia puede estar desactualizada. No se promete saber quién está físicamente dentro del bar.

Propuesta de primera versión: cuenta registrada para conservar avatar, inventario e identidad social. Los invitados siguen usando la jukebox con sus condiciones actuales; desplegar el mapa no fuerza el registro.

### Actividad en el mapa

Se muestran señales breves de acciones reales: propuesta musical nueva, voto y canción propia que comienza a sonar. Solo se atribuyen a un avatar cuando su presencia está visible. Se agrupan ráfagas para evitar una escena llena de globos o animaciones permanentes. No se publican nuevas acciones individuales de personas ocultas en el mapa.

Propuesta para evitar actividad repetitiva orientada solo a ganar puntos: no otorgarlos por cambiar de zona, permanecer conectado ni enviar invitaciones.

### Tarjeta de DJ

Tocar un avatar abre una tarjeta sobre el mapa, cerrable sin perder la vista del local. Incluye:

- Nombre de DJ y muñeco con su aspecto equipado.
- Nivel de DJ.
- Canción favorita seleccionada del catálogo desde el perfil, editable y opcional.
- Antigüedad basada en un dato verificable, con etiqueta que indique qué fecha se conoce.
- Estadísticas históricas cuando exista una fuente histórica; nunca se presentan votos activos como total acumulado.
- Logros conseguidos.
- Botones «Tomar algo», «Billar» y «Futbolín».

No incluye email, saldo gastable, fechas individuales de visitas ni historial privado completo. La canción favorita de perfil es un campo distinto de la lista de canciones favoritas del catálogo.

### Invitaciones

Se envía una invitación estructurada con tipo y destinatario, sin texto libre ni chat en esta primera versión. El destinatario recibe una tarjeta: «[Nombre] te propone jugar al billar», con «Aceptar» y «Ahora no». Si acepta, ambas personas ven la confirmación y sus zonas declaradas para facilitar el encuentro.

La bandeja de invitaciones sigue accesible con el mapa minimizado. Las invitaciones caducan y no se repiten por doble toque. Se ofrece silenciar invitaciones y bloquear a un remitente. Una persona oculta no admite invitaciones nuevas; las pendientes se cierran al ocultarse. Aceptar una invitación no reserva una mesa ni crea un pedido o pago.

## Avatar, armario y tienda

Muñeco de estilo geométrico sencillo, reconocible a pequeño tamaño y coherente con el modelo del local. Categorías: pelo, parte superior, parte inferior, calzado y accesorio. Se ofrecen opciones iniciales gratuitas para que nadie empiece sin posibilidad de personalización.

Desde el perfil, «Mi muñeco» abre una previsualización y dos vistas: «Armario» para equipar lo que ya posee y «Conseguir» para ver compras y recompensas. Cada artículo muestra claramente su vía de obtención.

### Dos vías complementarias

1. Recompensas por logros: piezas especiales que se reciben una sola vez al alcanzar el logro. Los logros ya obtenidos también deben conceder la recompensa correspondiente al activar el sistema. Estas piezas no se venden en la tienda inicial.
2. Tienda de puntos: ropa y peinados que se compran con el saldo disponible. La compra descuenta puntos y añade el artículo al inventario de forma indivisible. No se vuelve a cobrar un artículo que ya se posee.

Propuesta económica: reutilizar el saldo `points` existente; mantener `totalPointsEarned` como progreso histórico. Gastar en ropa nunca reduce el nivel, borra logros ni altera las clasificaciones acumuladas. El canje existente de 50 puntos por un voto continúa disponible. La tienda explica que ropa y votos consumen el mismo saldo.

Para la primera colección se establece una escala inicial de 50, 100 y 200 puntos para artículos de tienda, ajustable en un catálogo central. Son valores del diseño aprobado, todavía no desplegados. Los artículos de logro muestran su requisito, no un precio. El catálogo visual concreto se diseña antes de implementar el armario.

## Encaje técnico y evidencia del repositorio

Inspección local del 17 de octubre; no equivale a verificación de datos de producción:

- `web-app/src/Profile.jsx` ya consume `points`, `totalPointsEarned`, `achievements`, `visitDates` e historial, y ofrece el canje de 50 puntos por un voto.
- El nivel depende de `totalPointsEarned`, de modo que existe separación entre saldo y progreso.
- El perfil define ocho logros, pero no se ha identificado un emisor de esos logros en el bridge inspeccionado. Mostrar un logro en pantalla no prueba que se conceda correctamente.
- `python-bridge/bridge.py`, en `reset_song_and_tokens`, concede 10 puntos por una propuesta que suena y 5 por un voto asociado, y actualiza saldo, acumulado y fechas de actividad. No se cambia esta economía por participar en el mapa.
- Las estadísticas del perfil usan la longitud de los arrays activos de votos y propuestas. El bridge retira canciones de estos arrays al sonar. No son contadores históricos fiables.
- El perfil lee `userData.history`, pero no se ha identificado un escritor de ese historial en el código inspeccionado. Su presencia en la interfaz tampoco acredita un historial completo; la nueva tarjeta debe apoyarse en eventos persistidos y verificados desde la activación, sin reconstruir cifras antiguas a partir de arrays activos.
- El alta de usuario inspeccionada no establece una fecha de registro. No se inventará una fecha antigua: una primera actividad documentada se etiqueta como tal y el alta nueva registra su fecha de forma verificable.
- Los documentos `users` incluyen información privada y actualmente solo los puede leer su propietario, salvo administradores. Las tarjetas sociales requieren una proyección explícita de campos permitidos; no se abre la colección privada a otros clientes.
- `web-app/public/map/la-catrina.glb` y el archivo entregado en `La-Catrina-Juego` tienen el mismo SHA-256. El asset local aún no está integrado ni bajo seguimiento.
- Existe un fallo en `TriviaGift.jsx`: escribe `lastTriviaAt` numérico y luego intenta usar `.toMillis()`. Se corregirá con una comprobación específica antes de apoyar nuevas funciones en la trivia.

### Responsabilidades

- Vista musical: conserva el catálogo, la cola y sus acciones actuales.
- Panel social: controla desplegado, minimizado, selección de persona y bandeja de invitaciones.
- Escena: carga el GLB y representa avatares y zonas; no escribe puntos ni decide recompensas.
- Presencia: identidad visible, zona declarada, cambios y caducidad. Solo transmite cambios de estado y renovaciones acotadas.
- Perfil público: únicamente los campos previstos para la tarjeta de DJ y solo cuando corresponda mostrarlos.
- Invitaciones: estados, destinatarios y autorización de cada transición.
- Armario: catálogo de artículos, propiedad y equipamiento.
- Economía y logros: validación autoritativa de requisitos y compras, operaciones idempotentes y separación entre saldo y progreso.

El mapa se carga bajo demanda. Minimizarlo pausa el renderizado 3D, manteniendo solo las conexiones necesarias para presencia propia e invitaciones. Al volver a desplegar, la vista actualiza el estado antes de presentarlo como actual. Las suscripciones del mapa se limitan al ámbito de la sala y nunca recorren perfiles privados completos.

La implementación concreta de autorización, caducidad e inventario debe definirse en el plan técnico y probarse con emuladores y dos sesiones. El navegador no puede inventarse puntos, logros, prendas o aceptaciones ajenas. Los cambios de reglas de acceso requieren revisión específica, siguiendo la ruta de escalado indicada por el usuario.

## Criterios de aceptación

1. Buscar, proponer, votar y consultar la cola siguen siendo accesibles con el mapa cerrado, abierto o sin soporte 3D.
2. Dos sesiones ven los cambios de zona, aspecto y presencia de forma coherente; ocultarse retira al participante y la conexión abandonada caduca.
3. El conteo del mapa coincide con presencias visibles, sin anunciar aforo físico.
4. La tarjeta muestra la canción elegida, logros verificables y estadísticas correctamente etiquetadas; no expone información privada.
5. Una invitación tiene un único resultado, solo la responde su destinatario, caduca y respeta bloqueo y ocultación.
6. Un desbloqueo por logro se concede una sola vez; comprar descuenta el precio exacto una vez, entrega el artículo y rechaza saldo insuficiente o artículo ya poseído.
7. Equipar ropa no permite usar artículos no poseídos. Cambiar de dispositivo conserva el inventario de la cuenta.
8. Gastar puntos no baja el nivel ni altera los puntos históricos o clasificaciones.
9. El mapa funciona con controles táctiles, tiene alternativa de lista de personas y respeta reducción de movimiento. La carga 3D y un fallo de red no inutilizan la música.
10. Se ejecutan lint, tests, build, revisión del diff y pruebas de reglas y flujos sociales con dos sesiones. El despliegue real y su comprobación se reportan separados del funcionamiento local.

## Aprobación y siguiente etapa

El usuario aprobó este documento después de revisar el concepto social, las dos vías de personalización y los detalles propuestos: ubicación del panel, visibilidad inicial oculta, identidad social registrada, flujo de invitaciones y reutilización del saldo existente. La siguiente etapa es revisar el plan técnico y seleccionar su método de ejecución.
