# Integración Agente ↔ Dashboard — Guía para el equipo de Agentes

> Documento de referencia para integrar cualquier agente con el Dashboard de Agent AI Services.
> Fecha: 23/03/2026

---

## 1. Resumen

El Dashboard de Agent AI Services expone una Write API que permite a los agentes reportar sus ejecuciones. La integración se hace con **2 llamadas HTTP** por ejecución:

| Momento | Endpoint | Qué envía |
|---------|----------|-----------|
| Al iniciar el pipeline | `POST /api/executions/start` | Inputs (email, adjuntos) |
| Al finalizar el pipeline | `POST /api/executions/{id}/finish` | Estado final + pasos + outputs |

No hay llamadas intermedias. Los pasos se miden localmente y se envían en batch al finalizar.

---

## 2. Requisitos previos

### 2.1 API Key

Cada agente tiene una API Key asociada. Se envía en el header `X-API-Key`.

| Agente | Código | API Key |
|--------|--------|---------|
| Agente Cobros | AGT-0001 | `aais_AGT-0001_e39f58f257616785bde42f075db78f669c527d61cef6d740` |
| Agente Facturas | AGT-0002 | `aais_AGT-0002_9c963cd289a9dc752b20fd784f7a70a945d62dfee8bc1ffa` |
| Agente Inventario | AGT-0003 | `aais_AGT-0003_63ac2e9a815eb1961717d6c72ee62c1f398d3c395e786c69` |
| Agente Pedidos JDE | AGT-0004 | `aais_AGT-0004_c64b0a339593400dfbc868e6f740671e518d5145390a581e` |

> Las keys se pueden gestionar en `POST /api/mgmt/api-keys` (crear), `GET /api/mgmt/api-keys` (listar), `DELETE /api/mgmt/api-keys/{id}` (revocar).

### 2.2 Variables de entorno

Añadir al Container App (o `.env` del agente):

```
DASHBOARD_URL=https://salmon-field-0cfd11603.4.azurestaticapps.net
DASHBOARD_API_KEY=aais_AGT-0001_e39f58f257616785bde42f075db78f669c527d61cef6d740
```

### 2.3 Dependencia

Solo `requests` (ya incluido en las dependencias del agente de cobros).

---

## 3. Módulo de integración: `dashboard_client.py`

El archivo `dashboard_client.py` es el cliente listo para usar. Se copia al proyecto del agente y se importa directamente.

**Ubicación en el repo del dashboard**: `integration/dashboard_client.py`

### Componentes

| Componente | Tipo | Descripción |
|------------|------|-------------|
| `DashboardTracker` | Clase | Cliente principal. 2 métodos: `start()` y `finish()` |
| `tracker.step()` | Context manager | Mide tiempo de un paso. Solo acumula en memoria, 0 HTTP |
| `email_input()` | Helper | Construye un input de tipo EMAIL |
| `attachment_input()` | Helper | Construye un input de tipo ATTACHMENT |
| `file_output()` | Helper | Construye un output de tipo FILE/EXCEL |
| `json_output()` | Helper | Construye un output de tipo JSON |
| `summary_output()` | Helper | Construye un output de tipo SUMMARY |

---

## 4. Flujo de integración

```
Pipeline del agente                          Dashboard API
─────────────────                          ─────────────

1. Recibe email
   ↓
2. tracker.start(inputs=[email])  ──────→  POST /api/executions/start
   ↓                                       → Crea Execution (RUNNING)
   ↓                                       → Inserta inputs (email)
   ↓                                       ← { executionId: 42 }
   ↓
3. with tracker.step(1, "Preprocessing"):   (solo mide tiempo local)
      run_preprocessing()
      s.description = "3 adjuntos..."
   ↓
4. with tracker.step(2, "Extracción IA"):   (solo mide tiempo local)
      run_claude_phase()
   ↓
5. with tracker.step(3, "Postprocessing"):  (solo mide tiempo local)
      run_postprocessing()
   ↓
6. tracker.finish(                 ──────→  POST /api/executions/42/finish
      status="SUCCESS",                    → Actualiza Execution (SUCCESS)
      outputs=[pagos, facturas]            → Inserta 3 pasos con tiempos
   )                                       → Inserta outputs
                                           ← { success: true }
```

**Total: 2 llamadas HTTP por ejecución.**

---

## 5. Mapeo de estados

| Estado del agente | Status Dashboard | Cuándo |
|-------------------|-----------------|--------|
| `queued` | — | No se reporta (pre-start) |
| `preprocessing` | RUNNING (implícito) | Ejecución ya creada como RUNNING |
| `running_claude` | RUNNING (implícito) | Sigue en RUNNING |
| `postprocessing` | RUNNING (implícito) | Sigue en RUNNING |
| `completed` | **SUCCESS** | `tracker.finish("SUCCESS")` |
| `completed` con descuadre | **WARNING** | `tracker.finish("WARNING")` |
| `failed` | **FAILED** | `tracker.finish("FAILED", error_message=...)` |

Códigos válidos: `PENDING`, `RUNNING`, `SUCCESS`, `FAILED`, `WARNING`, `SKIPPED`

---

## 6. Ejemplo completo de integración en `api.py`

```python
import os
from dashboard_client import (
    DashboardTracker, email_input, file_output, json_output, summary_output
)

DASHBOARD_URL = os.getenv("DASHBOARD_URL",
    "https://salmon-field-0cfd11603.4.azurestaticapps.net")
DASHBOARD_API_KEY = os.getenv("DASHBOARD_API_KEY")


@observe(name="Cobros Pipeline")
async def run_pipeline(execution_id: str, message_id: str,
                       subject: str = None, sender: str = None):

    # ① Crear tracker e iniciar ejecución (1 HTTP POST)
    tracker = DashboardTracker(DASHBOARD_URL, DASHBOARD_API_KEY)
    tracker.start(
        trigger_source="EMAIL",
        invoked_by=sender,
        inputs=[email_input(message_id, subject, sender)],
    )

    final_status = "SUCCESS"
    error_msg = None
    outputs = []

    try:
        # ─── FASE 1 (0 HTTP, solo mide tiempo) ───────
        with tracker.step(1, "Preprocessing") as s:
            pre_result = await run_preprocessing(execution_id, message_id)
            s.description = (
                f"{pre_result.num_attachments} adjuntos "
                f"({', '.join(pre_result.attachment_types)})"
                + (", OCR aplicado" if pre_result.has_ocr else "")
            )

        # ─── FASE 2 (0 HTTP, solo mide tiempo) ───────
        with tracker.step(2, "Extracción IA (Claude)") as s:
            claude_result = await run_claude_phase(execution_id)
            s.description = (
                f"claude-sonnet-4-20250514, "
                f"exit_code={claude_result.exit_code}"
            )

        # ─── FASE 3 (0 HTTP, solo mide tiempo) ───────
        with tracker.step(3, "Postprocessing") as s:
            post_result = await run_postprocessing(execution_id)
            outputs = [
                file_output("pagos.xlsx", "EXCEL",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
                file_output("facturas.xlsx", "EXCEL",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
                json_output("resultado.json"),
            ]
            s.description = (
                f"{post_result.total_pagos} pagos, "
                f"{post_result.total_facturas} facturas"
            )
            if not post_result.validation_ok:
                s.warn(f"Descuadre: {', '.join(post_result.validation_errors)}")
                final_status = "WARNING"

    except Exception as e:
        final_status = "FAILED"
        error_msg = str(e)
        raise

    finally:
        # ② Finalizar con resumen completo (1 HTTP POST)
        tracker.finish(
            status=final_status,
            error_message=error_msg,
            outputs=outputs,
        )
        langfuse_context.flush()
```

---

## 7. Qué se ve en el Dashboard

Una vez integrado, cada ejecución del agente aparece en el dashboard con:

| Dato | Fuente | Ejemplo |
|------|--------|---------|
| Estado | `finish(status=)` | SUCCESS / FAILED / WARNING |
| Duración total | StartTime → FinishTime | 1m 45s |
| Trigger | `start(trigger_source=)` | EMAIL |
| Invocado por | `start(invoked_by=)` | cliente@empresa.com |
| **Pasos** | `tracker.step()` × 3 | Preprocessing (12s), Extracción IA (85s), Postprocessing (8s) |
| Descripción de cada paso | `s.description = ...` | "3 adjuntos (excel), OCR aplicado" |
| Error (si falla) | `finish(error_message=)` | "Graph API timeout" |
| Inputs | `start(inputs=)` | Email: Subject, From, Message-ID |
| Outputs | `finish(outputs=)` | pagos.xlsx, facturas.xlsx, resultado.json |

---

## 8. Comportamiento ante fallos

El módulo es **fire-and-forget**: ningún error del dashboard interrumpe el pipeline del agente.

| Escenario | Qué pasa |
|-----------|----------|
| Dashboard caído en `start()` | `execution_id = None`, los pasos se acumulan igual |
| Dashboard caído en `finish()` | Se logea un warning, el pipeline sigue normal |
| Excepción en un `tracker.step()` | El paso se marca como FAILED automáticamente, la excepción se propaga al pipeline |
| Pipeline falla antes de `finish()` | El bloque `finally` llama a `finish("FAILED")` |

---

## 9. Contrato de la API — Referencia técnica

### `POST /api/executions/start`

**Headers**: `X-API-Key: aais_AGT-0001_...`

**Body**:
```json
{
  "triggerSource": "EMAIL",
  "invokedBy": "cliente@empresa.com",
  "inputs": [
    {
      "inputType": "EMAIL",
      "contentText": "Subject: Pago cliente X\nFrom: cliente@empresa.com\nMessage-ID: AAMkAGI2..."
    }
  ]
}
```

**Response** (201):
```json
{
  "executionId": 42,
  "executionGuid": "a1b2c3d4-...",
  "inputsInserted": 1
}
```

### `POST /api/executions/{id}/finish`

**Headers**: `X-API-Key: aais_AGT-0001_...`

**Body**:
```json
{
  "status": "SUCCESS",
  "errorMessage": null,
  "steps": [
    {
      "stepOrder": 1,
      "stepName": "Preprocessing",
      "status": "SUCCESS",
      "description": "3 adjuntos (excel)",
      "startTime": "2026-03-23T14:08:45.000Z",
      "finishTime": "2026-03-23T14:08:57.500Z",
      "durationMs": 12500,
      "errorMessage": null
    },
    {
      "stepOrder": 2,
      "stepName": "Extracción IA (Claude)",
      "status": "SUCCESS",
      "description": "claude-sonnet-4-20250514, exit_code=0",
      "startTime": "2026-03-23T14:08:57.500Z",
      "finishTime": "2026-03-23T14:10:02.300Z",
      "durationMs": 64800,
      "errorMessage": null
    },
    {
      "stepOrder": 3,
      "stepName": "Postprocessing",
      "status": "SUCCESS",
      "description": "1 pago, 55 facturas",
      "startTime": "2026-03-23T14:10:02.300Z",
      "finishTime": "2026-03-23T14:10:10.500Z",
      "durationMs": 8200,
      "errorMessage": null
    }
  ],
  "outputs": [
    {
      "outputType": "EXCEL",
      "fileName": "pagos.xlsx",
      "mimeType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    },
    {
      "outputType": "EXCEL",
      "fileName": "facturas.xlsx",
      "mimeType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    },
    {
      "outputType": "JSON",
      "fileName": "resultado.json",
      "mimeType": "application/json"
    }
  ]
}
```

**Response** (200):
```json
{
  "success": true,
  "executionId": 42,
  "status": "SUCCESS",
  "stepsInserted": 3,
  "inputsInserted": 0,
  "outputsInserted": 3
}
```

---

## 10. Pasos para integrar

1. **Copiar** `integration/dashboard_client.py` al proyecto del agente
2. **Añadir variables de entorno** `DASHBOARD_URL` y `DASHBOARD_API_KEY` al Container App
3. **Importar** en `api.py`: `from dashboard_client import DashboardTracker, email_input, file_output, json_output`
4. **Crear tracker** al inicio de `run_pipeline()`
5. **Llamar** `tracker.start()` con los inputs del email
6. **Envolver** cada fase en `with tracker.step(N, "nombre"):`
7. **Llamar** `tracker.finish()` en el bloque `finally`
8. **Probar** — la ejecución debería aparecer en el dashboard

No se necesitan cambios en el Dashboard ni en su API. Todo está listo.

---

## 11. Pre-autorización: verificar permisos antes de ejecutar

### 11.1 Propósito

Antes de que un agente ejecute un pipeline para un usuario, se puede (y se recomienda) verificar que ese usuario tiene permisos en el Dashboard para usar ese agente. Esto evita ejecutar pipelines para usuarios no autorizados.

### 11.2 Endpoint

```
GET /api/auth/check-access?userEmail={email}&agentCode={code}
```

**Headers**: `X-API-Key: aais_AGT-0001_...` (la misma API Key del agente)

**Parámetros de consulta**:

| Parámetro | Requerido | Tipo | Descripción |
|-----------|-----------|------|-------------|
| `userEmail` | **Sí** | string | Email del usuario que desencadena la acción |
| `agentId` | Uno de los dos | number | ID numérico del agente |
| `agentCode` | Uno de los dos | string | Código del agente (e.g. `AGT-0001`) |

> Se debe proporcionar `agentId` **o** `agentCode` (al menos uno).

### 11.3 Respuestas

**Usuario autorizado** (200):
```json
{
  "allowed": true,
  "accessLevel": "FULL",
  "reason": "GRANTED",
  "message": "User has full access to this agent",
  "user": { "id": 1, "email": "usuario@empresa.com", "name": "Juan Pérez" },
  "agent": { "id": 5, "code": "AGT-0001", "name": "Agente Cobros" }
}
```

**Usuario admin** (200):
```json
{
  "allowed": true,
  "accessLevel": "FULL",
  "reason": "ADMIN",
  "message": "User is an admin with full access to all agents",
  "user": { "id": 1, "email": "admin@empresa.com", "name": "Admin" },
  "agent": { "id": 5, "code": "AGT-0001", "name": "Agente Cobros" }
}
```

**Usuario sin permisos** (200):
```json
{
  "allowed": false,
  "accessLevel": null,
  "reason": "NO_ACCESS",
  "message": "User has no access to this agent",
  "user": { "id": 3, "email": "otro@empresa.com", "name": "Otro User" },
  "agent": { "id": 5, "code": "AGT-0001", "name": "Agente Cobros" }
}
```

**Todos los posibles `reason`**:

| reason | allowed | Significado |
|--------|---------|-------------|
| `GRANTED` | `true` | Acceso concedido (FULL u OWN) |
| `ADMIN` | `true` | El usuario es admin, acceso total a todos los agentes |
| `NO_ACCESS` | `false` | El usuario existe pero no tiene permisos para este agente |
| `USER_NOT_FOUND` | `false` | El email no está registrado en el sistema |
| `USER_INACTIVE` | `false` | El usuario existe pero su cuenta está desactivada |
| `AGENT_NOT_FOUND` | `false` | El agente no existe |
| `AGENT_INACTIVE` | `false` | El agente existe pero está desactivado |

**Niveles de acceso (`accessLevel`)**:

| Nivel | Significado |
|-------|-------------|
| `FULL` | El usuario puede ver todas las ejecuciones del agente |
| `OWN` | El usuario solo puede ver sus propias ejecuciones |

### 11.4 Uso con `dashboard_client.py`

El método `check_access()` ya está incluido en el módulo. Se invoca **antes de** `start()`:

```python
import os
from dashboard_client import DashboardTracker, email_input, file_output

DASHBOARD_URL = os.getenv("DASHBOARD_URL")
DASHBOARD_API_KEY = os.getenv("DASHBOARD_API_KEY")


async def run_pipeline(message_id: str, sender: str, subject: str):
    tracker = DashboardTracker(DASHBOARD_URL, DASHBOARD_API_KEY)

    # ⓪ Verificar permisos ANTES de ejecutar
    access = tracker.check_access(
        user_email=sender,
        agent_code="AGT-0001",
    )

    if not access["allowed"]:
        reason = access.get("reason", "UNKNOWN")
        message = access.get("message", "")
        logger.warning(
            "Ejecución bloqueada para %s: [%s] %s",
            sender, reason, message,
        )
        # Opcionalmente: enviar notificación al usuario, etc.
        return  # No ejecutar el pipeline

    # ① Iniciar ejecución (el usuario SÍ tiene permisos)
    tracker.start(
        trigger_source="EMAIL",
        invoked_by=sender,
        inputs=[email_input(message_id, subject, sender)],
    )

    # ... resto del pipeline (pasos, finish, etc.)
```

### 11.5 Uso directo con HTTP (sin el módulo Python)

Si el agente está escrito en otro lenguaje, la llamada HTTP es directa:

```bash
curl -H "X-API-Key: aais_AGT-0001_e39f58..." \
  "https://salmon-field-0cfd11603.4.azurestaticapps.net/api/auth/check-access?userEmail=sender@empresa.com&agentCode=AGT-0001"
```

```javascript
// Node.js / TypeScript
const resp = await fetch(
  `${DASHBOARD_URL}/api/auth/check-access?userEmail=${encodeURIComponent(email)}&agentCode=AGT-0001`,
  { headers: { 'X-API-Key': API_KEY } }
);
const { allowed, reason, accessLevel } = await resp.json();
if (!allowed) {
  console.log(`User ${email} not authorized: ${reason}`);
  return;
}
```

### 11.6 Flujo completo con pre-autorización

```
Evento (email llega)                 Dashboard API
────────────────────                 ─────────────

1. Extraer sender email
   ↓
2. tracker.check_access(sender) ──→  GET /api/auth/check-access
   ↓                                 ← { allowed: true/false }
   ↓
   Si allowed=false → PARAR
   ↓
3. tracker.start(inputs=[...])  ──→  POST /api/executions/start
   ↓                                 ← { executionId: 42 }
   ↓
4. Ejecutar pasos (0 HTTP)
   ↓
5. tracker.finish(status, outputs) → POST /api/executions/42/finish
                                     ← { success: true }
```

**Total: 3 llamadas HTTP por ejecución** (1 check + 1 start + 1 finish).

### 11.7 Recomendaciones

- **Siempre verificar antes de ejecutar**: Evita consumir recursos (CPU, tokens de IA) en ejecuciones que no tienen permisos.
- **Fire-and-forget**: Si la llamada a `check_access` falla por timeout o error de red, el método devuelve `{"allowed": False, "reason": "ERROR"}`. Puedes decidir si en ese caso el pipeline debe continuar o detenerse.
- **Cache opcional**: Si el agente procesa muchos emails seguidos del mismo remitente, puedes cachear el resultado de `check_access` por unos minutos para no repetir la consulta.
- **No expone contraseñas**: El endpoint solo devuelve si el usuario tiene acceso o no, junto con el nivel. No expone datos sensibles.
