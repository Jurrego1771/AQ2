## Resumen

1. Intake del requerimiento
2. Análisis del feature
3. Estrategia de testing
4. Diseño de test cases
5. Setup de ambiente
6. Automatización
7. Ejecución de pruebas
8. Reporte de bugs
9. Re-test
10. Regression testing
11. Go/No-Go release
12. Reporte de calidad
13. Monitoreo en producción


📥 Qué recibe el QA:
Historia de usuario (User Story) o ticket (Jira / GH Issue)
Criterios de aceptación (Acceptance Criteria)
Diseño (Figma / UX specs)
Contexto técnico (API, backend, CMS, etc.)
Prioridad (P0, P1, P2)
Dependencias (CDN, terceros, APIs, etc.)
❗ NO NEGOCIABLE:

El QA NO empieza a testear sin:

Requisitos claros o aclarados
Criterios de aceptación definidos
Ambigüedades resueltas
🎯 Para qué sirve:

Evitar testing “a ciegas”. Sin esto:

el QA valida cosas incorrectas o irrelevantes

🧠 2. Análisis del requerimiento (Testability Analysis)
Qué hace el QA:
Entiende el feature funcionalmente
Identifica reglas de negocio
Detecta riesgos
Encuentra ambigüedades
Define “qué se puede romper”
NO NEGOCIABLE:
Identificar edge cases
Identificar dependencias externas
Validar que el feature es testeable
Entregable mental:
Lista de riesgos
Lista de escenarios críticos
Preguntas abiertas para PO/Dev
Para qué sirve:

Evitar bugs por mala interpretación del sistema

🧩 3. Diseño de estrategia de testing (Test Strategy)
Qué se define:
Tipo de pruebas:
funcional
regresión
integración
e2e
performance (si aplica)
Alcance del testing
Nivel de automatización
Herramientas (Playwright, Cypress, etc.)
Ambientes (dev, staging, prod-like)
NO NEGOCIABLE:
Definir qué se automatiza y qué no
Definir riesgo vs cobertura
Definir matriz de testing (features vs escenarios)
Para qué sirve:

Evita testing caótico o duplicado

🧪 4. Diseño de casos de prueba (Test Design)
Qué se crea:
Test cases estructurados:
ID
precondiciones
pasos
datos
resultado esperado
Tipos obligatorios:
Happy path
Edge cases
Negative cases
Boundary conditions
Security basic checks
Data validation
NO NEGOCIABLE:
Cada requisito debe tener al menos 1 test case
Cada bug potencial debe tener test case
Casos deben ser reproducibles
Para qué sirve:

Convertir requisitos en validación objetiva

⚙️ 5. Preparación del entorno (Test Setup)
Qué hace el QA:
Verifica ambiente estable
Datos de prueba listos
Configuración de usuario/roles
Servicios externos funcionando
Builds desplegados
NO NEGOCIABLE:
No ejecutar tests en ambientes inestables
No depender de datos “manuales improvisados”
Para qué sirve:

Evitar falsos positivos/negativos

🤖 6. Automatización (si aplica)
Qué se construye:
E2E tests (Playwright/Cypress)
API tests
Regression suite
Smoke tests
Buen QA profesional:
Diseña tests mantenibles
Usa Page Object Model o similar
Evita tests frágiles (flaky)
NO NEGOCIABLE:
Tests deben ser reproducibles
Deben correr en CI/CD
Deben fallar por razón clara
Para qué sirve:

Escalabilidad y velocidad de testing

▶️ 7. Ejecución de pruebas
Qué se hace:
Ejecutar test cases manuales o automatizados
Registrar resultados
Comparar con expected results
Se validan:
UI
API responses
Integraciones
Logs (si aplica)
Eventos (analytics, tracking)
NO NEGOCIABLE:
No “asumir” resultados
Todo debe ser verificado explícitamente
Para qué sirve:

Detectar defectos reales del sistema

🐞 8. Registro de bugs (Bug Reporting)
Un bug profesional incluye:
Título claro
Steps to reproduce
Expected vs actual
Evidencia (video, logs, screenshots)
Severidad (P0–P3)
Ambiente
Version/build
NO NEGOCIABLE:
Debe ser reproducible
Debe ser claro para dev sin contexto adicional
Debe tener impacto definido
Para qué sirve:

Permite que dev lo reproduzca y lo arregle rápido

🔁 9. Re-test (Validación de fixes)
Qué hace QA:
Verifica que el bug fue corregido
Ejecuta mismo escenario exacto
Confirma que no se rompió otra cosa
NO NEGOCIABLE:
Nunca cerrar bug sin re-test
Confirmar fix en el mismo ambiente objetivo
Para qué sirve:

Evitar “falsos fixes”

🔄 10. Regression testing
Qué se hace:
Ejecutar tests en áreas afectadas
Validar que cambios no rompieron otras funcionalidades
NO NEGOCIABLE:
Todo release debe tener regresión mínima
Áreas críticas siempre incluidas
Para qué sirve:

Evitar que arreglar algo rompa otra cosa

🚀 11. Validación pre-release (Go/No-Go)
QA evalúa:
Bugs abiertos
Severidad de issues
Cobertura de tests
Riesgo de release
Resultado:
✅ Go (se puede liberar)
❌ No-Go (se bloquea release)
NO NEGOCIABLE:
QA debe tener autoridad técnica de bloqueo en bugs críticos
Para qué sirve:

Protección del usuario final

📊 12. Reporte de calidad
Qué se entrega:
Resumen de testing
Bugs encontrados
Riesgos residuales
Cobertura de tests
Estado del release
NO NEGOCIABLE:
Debe ser entendible para negocio y devs
Debe ser trazable
Para qué sirve:

Visibilidad de calidad del producto

🔁 13. Post-release monitoring
Qué hace QA:
Monitoreo de producción
Logs / dashboards
errores en tiempo real
feedback de usuarios
NO NEGOCIABLE:
QA no termina en “deploy”
Debe haber observabilidad
Para qué sirve:

Detectar fallos reales en producción
