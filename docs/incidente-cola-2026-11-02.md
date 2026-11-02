# Cola vaciada durante el servicio

## Evidencia observada

El 2 de noviembre, tras reiniciar el puente estable con el ajuste de registros,
Firebase confirmó la versión `2.3.0+logs.1`. El diagnóstico cerrado llegó por Drive
desde el equipo del bar. No se introdujeron canciones ni votos de prueba.

Los registros muestran, en UTC:

- 18:44:34: `Player.Open` aceptado para Gary Clark Jr.; se solicita devolver tokens.
- 18:44:40: llegan `Player.OnPlay` y `Player.OnAVStart` sin archivo identificado.
- 18:45:32: `Daily reset begins: old_marker=None`, durante el servicio.
- 18:45:42: la limpieza total termina y se vuelve a guardar la marca de jornada.

El puente estable reemplazaba todo `state/nowPlaying` al publicar el tema.
Esa escritura eliminaba `lastResetDate`; la publicación posterior de duración
ya conservaba los campos mediante `merge=True`. El watchdog interpretaba la
ausencia como permiso para limpiar la cola, los tokens y las estadísticas.
La web anunciaba «ha sonado» al desaparecer un voto o propuesta del perfil,
sin comprobar una reproducción. Ambos mecanismos quedan confirmados; no hay
un registro completo para reconstruir la solicitud anterior de Extremoduro.

## Corrección y límites

La web informa únicamente de que se recuperó el voto o propuesta. El ajuste
del puente mantiene los campos de jornada en ambas publicaciones de
reproducción y crear una referencia sin borrar datos cuando falte la marca.
Un cierre diario que falle no debe quedar marcado como terminado.

El parche se aplica sobre la versión estable identificada, con copia previa;
no instala la versión 2.4 candidata ni los cambios de duelos. Las pruebas deben
ejecutarse con dobles locales y nunca arrancando el puente contra producción.
Guardar el archivo corregido no actualiza el proceso del bar: se necesita un
reinicio y comprobar después la versión y los registros.

Un ACK y las notificaciones del reproductor no certifican sonido audible.

La web se publicó en `2525ed8` y se comprobó el texto servido públicamente.
El parche estable `2.3.1+logs.1` se verificó sobre la fuente exacta del bar,
además de pasar 61 pruebas Python (una suite que requiere emulador se omitió)
y 28 pruebas web. El código antiguo reproduce el reset indebido en la prueba;
el parche conserva la cola. Su activación real requiere otro reinicio.
