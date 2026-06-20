# Agentes QA - Flujo Profesional

## Overview del Flujo

```
[Intake] → [Analista] → [Estratega] → [Diseñador] → [Ejecutor] → [Reportero] → [Monitor]
              ↓              ↓             ↓             ↓            ↓
           [Risks]       [Strategy]   [Test Cases]  [Executions]  [Bugs]
```

---

## 1. Intake Agent

### Objetivo
Recibir y validar que el requerimiento tiene lo mínimo para iniciar QA.

### Input
- **User Story / Issue** → Análisis funcional
- **Pull Request / Rama** → Análisis de cambio de código
- Figma / specs (opcional)
- Contexto técnico

### Proceso (según tipo de input)

**Si es User Story / Issue:**
1. Verificar campos obligatorios
2. Detectar faltantes
3. Clasificar por prioridad (P0/P1/P2)
4. Identificar dependencias externas

**Si es Pull Request / Rama:**
1. Obtener diff y archivos cambiados
2. Identificar módulos/archivos afectados
3. Detectar breaking changes
4. Evaluar scope del cambio
5. Clasificar por riesgo de cambio (high/medium/low)

### Output
```yaml
intake_validado:
  tipo_input: "user_story|issue|pr|branch"
  id: "US-XXX | PR-XXX | branch-name"
  estado: "listo_para_analisis" | "bloqueado_faltantes"
  prioridad: "P0|P1|P2|high|medium|low"
  faltantes: ["..."]
  dependencias: ["..."]

  # Campos específicos para PR/Rama
  archivos_cambiados: ["src/..."]
  modulos_afectados: ["media", "billing"]
  breaking_changes: ["..."]
  scope_cambio: "high|medium|low"
```

---

## 2. Analista de Requerimientos

### Objetivo
Entender el feature y generar riesgos y escenarios de prueba.

### Input
- `intake_validado` del Agent 1
- Knowledge Core (riesgos existentes del módulo)

### Proceso
1. Analizar reglas de negocio
2. Identificar edge cases
3. Detectar ambigüedades
4. Generar lista de riesgos
5. Definir escenarios críticos

### Output
```yaml
analisis:
  riesgos:
    - id: "MED-RISK-XXX"
      severidad: "critical|high|medium|low"
      probabilidad: "high|medium|low"
      titulo: "..."
      detonador: ["..."]
      mitigacion: "..."
  escenarios_criticos:
    - escenario: "..."
      riesgo_asociado: "MED-RISK-XXX"
  preguntas_pendientes: ["..."]
```

---

## 3. Estratega de Testing

### Objetivo
Definir qué se automatiza, qué se testa manual, y con qué enfoque.

### Input
- `analisis` del Agent 2
- Inventory de tests existentes

### Proceso
1. Evaluar riesgo vs esfuerzo de automatización
2. Definir tipos de prueba (smoke, regression, e2e)
3. Seleccionar qué casos son automatizables
4. Definir matriz de cobertura

### Output
```yaml
estrategia:
  automatizables:
    - escenario: "..."
      test_id: "MED-TC-XXX"
      tipo: "smoke|regression|e2e"
  manuales:
    - escenario: "..."
      prioridad: "high|medium|low"
  cobertura_meta: "80%"
  ambiente: "dev|qa|staging"
```

---

## 4. Diseñador de Tests

### Objetivo
Generar casos de prueba estructurados listos para ejecución.

### Input
- `estrategia` del Agent 3
- Plantilla `base/test.yaml`

### Proceso
1. Crear test case con ID único
2. Definir precondiciones, pasos, datos, expected
3. Incluir happy path + edge cases + negative cases
4. Taggear con IDs de riesgo y AC

### Output
```yaml
test_cases:
  - id: "MED-TC-XXX"
    titulo: "..."
    tipo: "smoke|regression|e2e"
    prioridad: "critical|high|medium|low"
    estado: "active"
    refs:
      ac_ref: "AC-XXX"
      risk_ref: "MED-RISK-XXX"
      story_ref: "US-XXX"
    pasos:
      - "..."
    test_data:
      - escenario: "..."
        datos: "..."
        esperado: "..."
```

---

## 5. Ejecutor de Pruebas

### Objetivo
Correr tests y capturar resultados + evidencia.

### Input
- `test_cases` del Agent 4
- Specs con tags (`@MED-TC-XXX @MED-RISK-XXX`)
- Ambiente configurado

### Proceso
1. Ejecutar specs automatizados (Playwright)
2. Ejecutar tests manuales según estrategia
3. Capturar evidencia (screenshots, videos, logs)
4. Comparar actual vs expected
5. Registrar resultados

### Output
```yaml
ejecucion:
  test_id: "MED-TC-XXX"
  resultado: "passed|failed|blocked|skipped"
  evidencia:
    - tipo: "screenshot|video|log"
      ruta: "test-results/..."
  fecha: "YYYY-MM-DD HH:mm"
  ambiente: "qa"
  duracion_ms: 1234
```

---

## 6. Reportero de Bugs

### Objetivo
Documentar defectos encontrados con toda la información para reprodución.

### Input
- `ejecucion` del Agent 5 (solo items failed)

### Proceso
1. Verificar que es reproducible
2. Recopilar evidencia
3. Clasificar severidad (P0-P3)
4. Crear bug report estructurado
5. Vincular a GitHub Issue

### Output
```yaml
bug:
  id: "MED-BUG-XXX"
  titulo: "..."
  severidad: "P0|P1|P2|P3"
  steps_to_reproduce:
    - "..."
  expected: "..."
  actual: "..."
  evidencia:
    - screenshot: "..."
      video: "..."
      log: "..."
  ambiente: "qa"
  version: "..."
  test_asociado: "MED-TC-XXX"
  github_issue: "repo#N"
```

---

## 7. Validador de Release

### Objetivo
Determinar si el release es seguro para pasar a producción.

### Input
- Resumen de `ejecucion` (pasados/fallidos)
- Resumen de `bugs` abiertos
- Cobertura de tests
- Umbrales definidos

### Proceso
1. Contar tests passed vs failed
2. Evaluar severidad de bugs abiertos
3. Verificar cobertura mínima
4. Comparar con gate de release

### Output
```yaml
release_decision:
  go_no_go: "GO|NO-GO"
  resumen:
    total: N
    passed: N
    failed: N
    blocked: N
  bugs_abiertos:
    - id: "MED-BUG-XXX"
      severidad: "P0|P1"
  cobertura: "85%"
  riesgos_residuales: ["..."]
  autoridad_bloqueo: "QA tiene autoridad P0/P1"
```

---

## 8. Monitor de Producción

### Objetivo
Validar que lo desplegado funciona correctamente en prod.

### Input
- Deployment completado
- Dashboards/Logs configurados
- Alertas activas

### Proceso
1. Verificar métricas de salud (error rate, latency)
2. Revisar logs de errores
3. Confirmar flujos críticos activos
4. Reportar anomalías

### Output
```yaml
monitoreo:
  estado: "HEALTHY|DEGRADED|DOWN"
  metricas:
    error_rate: "0.1%"
    latency_p99: "120ms"
  errores_detectados: ["..."]
  alertas_disparadas: ["..."]
  fecha_check: "YYYY-MM-DD HH:mm"
```

---

## Reglas de Encadenamiento

| Regla | Descripción |
|-------|-------------|
| `continue_on_warning` | Si un agente falla pero no es bloqueante, continuar al siguiente |
| `halt_on_critical` | Si Agent 1 (intake) falla, halting total |
| `require_output` | Cada agente guarda output en `knowledge-core/inbox/[agente]/` |
| `retry_on_flaky` | Si Agent 5 falla por infraestructura, retry 2x antes de halt |

## Handlers de Error

| Escenario | Acción |
|-----------|--------|
| Intake incompleto | → Devuelve `estado: "bloqueado_faltantes"` con lista |
| Sin tests automatizables | → Agent 3 marca `automatizables: []`, continua con manuales |
| Ejecución flaky | → Retry + marcar como `flaky` en output |
| Release NO-GO | → Notificar + bloquear CI/CD |
| Producción degradada | → Alertar + crear bug P0 automáticamente |
