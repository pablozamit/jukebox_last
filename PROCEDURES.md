# PROCEDURES.md — Procedimientos probados de jukebox_last

> Antes de empezar cualquier tarea, busca aquí si ya existe un método optimizado.

---

## Refactor de monolito React (`App.jsx`) en hooks + componentes sin cambiar comportamiento

**Resultado obtenido:** App.jsx 1.884 → 679 líneas (−80%), 8 hooks + 12 componentes + 2 módulos base. Verificado sin regresiones.

### Reglas de oro
1. Rama nueva desde `main` limpio (`git fetch` antes de crear).
2. **Backup del archivo original ANTES de tocar nada:** copiarlo a `C:\Users\paulm\AppData\Local\Temp\opencode\<fichero>.pre-refactor.bak`.
3. **Baseline verde ANTES:** `npm run lint`, `npm test`, `npm run build`. Apuntar el nº exacto de warnings pre-existentes — no cuentan como regresión si no aumentan.
4. Movimientos **verbatim**: mismo JSX, mismas clases CSS, mismas deps de hooks, mismos comentarios. Nada de "mejoras" colaterales. Código muerto se preserva tal cual.
5. Convención del proyecto: componentes planos en `src/`; hooks en `src/hooks/` (carpeta nueva).
6. App.jsx final: hooks primero (TDZ-safe), después handlers, después JSX.
7. `getServerTime` → `useCallback(() => ..., [])` en `useServerTime`, y añadirlo a las deps de los efectos que lo usan (identidad estable ⇒ no re-ejecuta). **NUNCA** añadir `currentTime` a deps.

### Verificación obligatoria (las 5, en este orden)
1. `npm run lint` → 0 errores + los MISMOS warnings que el baseline.
2. `npm test` → 4/4.
3. `npm run build` → OK.
4. **Diff textual vs backup** (PowerShell, en `web-app/`): comparar que no se pierde ninguna clase `jukebox-*` ni clave `t.*`:
   ```powershell
   $old = Get-Content -Raw "<ruta>\App.jsx.pre-refactor.bak"
   $new = (Get-ChildItem src -Recurse -File -Include *.jsx,*.js | ForEach-Object { Get-Content $_.FullName -Raw }) -join "`n"
   Compare-Object ([regex]::Matches($old,'jukebox-[a-z0-9-]+').Value | Sort-Object -Unique) ([regex]::Matches($new,'jukebox-[a-z0-9-]+').Value | Sort-Object -Unique) | Where-Object { $_.SideIndicator -eq '<=' }
   # repetir con la regex '\bt\.[A-Za-z0-9_]+' → los dos resultados deben salir VACÍOS
   ```
5. **Smoke test navegador real** (agent-browser):
   - `Start-Process cmd -ArgumentList '/c npm run preview -- --port 4173 --strictPort > preview-smoke.log 2>&1' -WindowStyle Hidden` → esperar y comprobar `200` en http://localhost:4173.
   - `$env:AGENT_BROWSER_SESSION = (agent-browser session id --scope worktree --prefix jukebox)`
   - `open` → `wait --load networkidle` → `snapshot -i`. Verificar catálogo cargado (datos reales de Firebase) y contar `h4` vía `eval`.
   - Probar buscador: `fill` en el input + `eval "document.querySelectorAll('h4').length"` (los resultados deben filtrarse).
   - **GOTCHA PowerShell:** los refs `@eN` SIEMPRE entre comillas: `agent-browser fill "@e196" "texto"`. Sin comillas, PowerShell interpreta `@e196` como splatting y se lo come (fallo silencioso / "Missing arguments").
   - Al terminar: `agent-browser close` + `(Get-NetTCPConnection -LocalPort 4173 -State Listen).OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force }` + borrar `preview-smoke.log`.

### Commit
- `git add` SOLO con la lista explícita de archivos del refactor (nunca `git add .` — hay untracked ajenos: .firebaserc, guiav2.pdf, bundle, zip, CSV).
- Mensaje conventional en español, p.ej.: `refactor(webapp): dividir App.jsx (N lineas) en X hooks + Y componentes sin cambios de comportamiento` + body con lista de piezas y verificación.

### Pitfalls encontrados (evitarlos)
- Faltó `onSnapshot` en el import de `useUserSession.js` → el lint lo caza (`no-undef`), no saltarse el paso 1.
- Sustituir iconos lucide por SVG inline "equivalente" → NO hacerlo; importar el icono real (p.ej. `ArrowUp`).
- Los warnings de `exhaustive-deps` por `getServerTime` se resuelven con el punto 7 (no tocar deps de StatsModal/TriviaGift: son pre-existentes).
