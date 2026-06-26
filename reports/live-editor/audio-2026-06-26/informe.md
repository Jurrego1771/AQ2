# Informe de exploración QA — Live Editor (live de **audio**)

| | |
|---|---|
| **Módulo** | Live Editor (`/live-editor/:event_id`) |
| **Evento** | Radio QA — `6a15a149cedcd6929d34cc78` (tipo **audio**) |
| **Entorno** | dev · `https://dev.platform.mediastre.am` · v7.0.67 |
| **Fecha** | 2026-06-26 |
| **Buffer DVR** | retención 1h, ~3606 s disponibles · player listo (`canSelectTime: true`) |
| **Método** | Exploración en vivo (Playwright MCP), ruta de usuario real (date-picker + atajos `i`/`o`/`c`) |
| **Datos creados** | 1 media de audio de prueba — **borrada** al finalizar (ver §Limpieza) |

> **Objetivo:** replicar en el live de **audio** la exploración hecha sobre el live de
> video ("Live Dai QA") y dejar evidencia visual. **Conclusión rápida:** el editor de
> audio se comporta **igual** que el de video; los hallazgos del editor son **globales**
> (no dependen del tipo de señal). No aparecieron defectos nuevos específicos del audio.

---

## 1. Resumen ejecutivo

- **Flujos correctos (a proteger):** multi-clip con suma de duración, creación de media
  desde clips, y la lectura de la ventana DVR funcionan igual que en video.
- **Hallazgos confirmados en audio** (ya filados desde la exploración de video):
  - **#34** — "New Media" crea media de inmediato sin confirmación y **"Back" no la
    elimina** → media huérfana. **Reproduce en audio** (evidencia §4).
  - **#29** — controles de zoom sin nombre accesible. Reproduce en audio.
  - **#30** — typo `title="Move selection rigth"` en *move-forward*. Reproduce en audio.
- **Sin defectos nuevos** específicos del audio. La consola solo muestra el ruido ya
  conocido (#9: CORS de thumbs, 401 onboarding, Intercom 403) + un error del player de
  ads (URL inválida) ajeno al editor.

---

## 2. Cobertura de la exploración

| Flujo | Resultado en audio | Evidencia |
|-------|--------------------|-----------|
| Carga del editor + ventana DVR | OK (igual que video) | `img/audio-01-editor-loaded.png` |
| Toolbar (zoom / move / retención) | #29 y #30 reproducen; retención "1 hour" correcta ahora | `img/audio-01-editor-loaded.png` |
| Selección + corte de clip (i/o/c) | OK | `img/audio-02-multiclip-list.png` |
| **Multi-clip** (2 clips, suma de duración) | OK — total `00:03:40` = 1:50 + 1:49 | `img/audio-02-multiclip-list.png` |
| Crear media (New Media) | Crea media **de inmediato** (audio) | `img/audio-03-newmedia-created-immediately.png` |
| Abortar con "Back" | **Deja media huérfana** (#34) | `img/audio-04-orphan-media-in-library.png` |

**Marcas `sm`:** 88 únicas en audio vs 89 en video (la marca faltante es específica de
video; el resto del contrato de selectores es idéntico).

---

## 3. Verificado funcionando (positivos)

- **Multi-clip:** cortar 2 clips acumula la duración total correctamente.
  - Clip 1 (+10→+12 min): `cut-length 00:01:49` → total `00:01:50`.
  - Clip 2 (+20→+22 min): `cut-length 00:01:49` → total `00:03:40`.
  - El botón "New Media" se habilita al tener ≥1 clip. (Cubierto por el test
    automatizado **LEDT-TC-13**, verde.)
- **Contrato de creación** (igual que video): `POST /api/dvr/:id` con `url[]` (una URL
  por clip) → `200 { data: { mediaId, vms_job_request_id } }`. La media de audio resultó
  `type: "audio"`, `status: "OK"`, `is_published: false`.

---

## 4. Hallazgo principal con evidencia — #34 (reproduce en audio)

**Síntoma:** los botones **"New Media" / "New Media With Template"** crean y **persisten**
una media real con un solo click, **sin confirmación**. El botón **"Back"** del formulario
de metadata (marca `dvr-media-back-without-save`) **no elimina** la media → queda
**huérfana** en la librería y ya consumió cuota de transcoding.

**Reproducción (audio):**
1. Cortar ≥1 clip en `Radio QA`.
2. Click **"New Media"** → `POST /api/dvr/6a15a149cedcd6929d34cc78` →
   `200 { mediaId: 6a3ed3732f2f141c481aa307 }`. Aparece `JOB ID` + progreso
   (la media ya existe). → **`img/audio-03-newmedia-created-immediately.png`**
3. Click **"Back"** (sin guardar).
4. `GET /api/media/6a3ed3732f2f141c481aa307` → **`200`** (`type: audio`, `status: OK`,
   `is_published: false`): la media **persiste**. La librería la muestra. →
   **`img/audio-04-orphan-media-in-library.png`**

**Esperado:** confirmación antes de crear, **o** que "Back" elimine la media no guardada,
**o** aclarar que "New Media" commitea la creación. (Nielsen #3 control/undo, #5
prevención de errores.) — Issue **[Jurrego1771/AQ2#34](https://github.com/Jurrego1771/AQ2/issues/34)**, riesgo `LEDT-RISK-7`.

---

## 5. Otros hallazgos confirmados en audio (ya filados en video)

| Issue | Tipo / sev | Detalle en audio | Evidencia |
|-------|-----------|------------------|-----------|
| **#29** | a11y / low | `zoomIn`/`zoomOut` sin `title`/`aria-label` ni foco por teclado | `img/audio-01-editor-loaded.png` |
| **#30** | ux / low | `move-forward` con `title="Move selection rigth"` (typo) | `img/audio-01-editor-loaded.png` |
| #31 | ux / low | Pluralización "1 hours" **no reproduce ahora** (retención mostró "1 hour"); sigue siendo borde dependiente del buffer | `img/audio-01-editor-loaded.png` |

---

## 6. Evidencias (capturas)

1. **`img/audio-01-editor-loaded.png`** — Editor de audio cargado: timeline/DVR, toolbar
   (zoom/move), retención "1 hour".
2. **`img/audio-02-multiclip-list.png`** — Lista con 2 clips; "Main Media duration"
   `00:03:40` (suma); "New Media" habilitado.
3. **`img/audio-03-newmedia-created-immediately.png`** — Tras "New Media": `JOB ID` y
   progreso de creación visibles (la media ya fue creada).
4. **`img/audio-04-orphan-media-in-library.png`** — La media persiste en la plataforma
   tras pulsar "Back" (huérfana, #34).

---

## 7. Limpieza (higiene de datos QA)

- Media de prueba creada: `6a3ed3732f2f141c481aa307` → `DELETE /api/media/:id` → `200`;
  recheck `GET` → `404` (confirmado eliminada).
- Los clips de corte son client-side (sessionStorage), no dejan rastro en el servidor.
- Los lives `Radio QA` / `Live Dai QA` **no se modificaron**.

---

## 8. Conclusión

El Live Editor sobre señal de **audio** es funcionalmente equivalente al de video: los
flujos correctos (corte, multi-clip, creación) funcionan, y los defectos del editor
(**#34**, #29, #30) son **globales** al módulo, no dependientes del tipo de señal. No se
detectaron defectos nuevos exclusivos del audio. La cobertura automatizada existente
(LEDT-TC-11/12/13 + contrato API) aplica a ambos tipos de evento.
