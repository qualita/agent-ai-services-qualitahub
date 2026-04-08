# Integración: Agente Pedidos JDE Edwards ↔ Dashboard

> Guía completa para integrar el Agente de Pedidos JDE con el Dashboard de Agent AI Services.
> Fecha: 08/04/2026

---

## 1. Resumen

El **Agente Pedidos JDE** (creación automatizada de pedidos en JD Edwards EnterpriseOne) ya está registrado en el Dashboard de Agent AI Services y tiene una API Key asignada.

La integración se hace con **2 llamadas HTTP** por ejecución:

| Momento | Endpoint | Qué envía |
|---------|----------|-----------|
| Al iniciar el pipeline | `POST /api/executions/start` | Datos de entrada (pedido, origen, usuario) |
| Al finalizar el pipeline | `POST /api/executions/{id}/finish` | Estado final + pasos ejecutados + outputs |

No hay llamadas intermedias. Los pasos se miden localmente y se envían en batch al finalizar.

---

## 2. Datos del agente

| Campo | Valor |
|-------|-------|
| **Nombre** | Agente Pedidos JDE |
| **Código** | `AGT-0004` |
| **Agent Id** | `1` |
| **API Key** | `aais_AGT-0004_c64b0a339593400dfbc868e6f740671e518d5145390a581e` |
| **Dashboard URL** | `https://brave-island-0d9d72603.1.azurestaticapps.net` |

> **IMPORTANTE**: La API Key no puede recuperarse del sistema (solo se almacena el hash SHA-256). Guardarla en un lugar seguro.

---

## 3. Variables de entorno

Configurar en el Container App, `.env`, o Key Vault del agente:

```env
DASHBOARD_URL=https://brave-island-0d9d72603.1.azurestaticapps.net
DASHBOARD_API_KEY=aais_AGT-0004_c64b0a339593400dfbc868e6f740671e518d5145390a581e
```

---

## 4. Módulo de integración (Python)

El archivo `dashboard_client.py` es un cliente listo para usar. Se debe copiar al proyecto del agente.

**Dependencia**: Solo `requests` (`pip install requests`).

### 4.1 Obtener el archivo

El módulo se encuentra en el repositorio del Dashboard:

```
integration/dashboard_client.py
```

Copiar este archivo al directorio raíz (o al `src/`) del proyecto del agente.

### 4.2 Componentes del módulo

| Componente | Tipo | Descripción |
|------------|------|-------------|
| `DashboardTracker` | Clase | Cliente principal. Métodos: `start()`, `step()`, `finish()`, `check_access()` |
| `tracker.step()` | Context manager | Mide el tiempo de un paso. Solo acumula en memoria, 0 HTTP |
| `email_input()` | Helper | Construye un input de tipo EMAIL |
| `attachment_input()` | Helper | Construye un input de tipo ATTACHMENT |
| `file_output()` | Helper | Construye un output de tipo FILE/EXCEL |
| `json_output()` | Helper | Construye un output de tipo JSON |
| `summary_output()` | Helper | Construye un output de tipo SUMMARY |

---

## 5. Flujo de integración

```
Pipeline Agente Pedidos JDE              Dashboard API
───────────────────────────              ─────────────

1. Recibe solicitud de pedido
   ↓
2. tracker.start(inputs=[...])  ──────→  POST /api/executions/start
   ↓                                     → Crea Execution (RUNNING)
   ↓                                     → Inserta inputs
   ↓                                     ← { executionId: 42 }
   ↓
3. with tracker.step(1, "Validación"):    (solo mide tiempo local, 0 HTTP)
      validar_datos_pedido()
   ↓
4. with tracker.step(2, "Creación JDE"):  (solo mide tiempo local, 0 HTTP)
      crear_pedido_jde()
   ↓
5. with tracker.step(3, "Postprocessing"):(solo mide tiempo local, 0 HTTP)
      verificar_pedido()
   ↓
6. tracker.finish(                ──────→ POST /api/executions/42/finish
      status="SUCCESS",                   → Actualiza Execution (SUCCESS)
      outputs=[resultado]                 → Inserta 3 pasos con tiempos
   )                                      → Inserta outputs
                                          ← { success: true }
```

**Total: 2 llamadas HTTP por ejecución.**

---

## 6. Ejemplo completo de integración

```python
import os
from dashboard_client import (
    DashboardTracker, json_output, summary_output, file_output
)

DASHBOARD_URL = os.getenv("DASHBOARD_URL",
    "https://brave-island-0d9d72603.1.azurestaticapps.net")
DASHBOARD_API_KEY = os.getenv("DASHBOARD_API_KEY")


async def run_pipeline(order_request: dict, invoked_by: str = None):
    """Pipeline principal del Agente Pedidos JDE."""

    # ① Crear tracker e iniciar ejecución (1 HTTP POST)
    tracker = DashboardTracker(DASHBOARD_URL, DASHBOARD_API_KEY)
    tracker.start(
        trigger_source="API",  # o "EMAIL", "SCHEDULED", "MANUAL"
        invoked_by=invoked_by,
        inputs=[{
            "inputType": "JSON",
            "fileName": "pedido_request.json",
            "mimeType": "application/json",
            "contentText": json.dumps(order_request),
        }],
    )

    final_status = "SUCCESS"
    error_msg = None
    outputs = []

    try:
        # ─── PASO 1: Validación de datos (0 HTTP) ────────
        with tracker.step(1, "Validación de datos") as s:
            validation = validate_order_data(order_request)
            s.description = (
                f"{len(order_request.get('items', []))} líneas de pedido, "
                f"cliente: {order_request.get('customer', 'N/A')}, "
                f"tipo: {order_request.get('orderType', 'SO')}"
            )
            if validation.warnings:
                s.warn(f"Warnings: {', '.join(validation.warnings)}")

        # ─── PASO 2: Creación en JDE (0 HTTP) ────────────
        with tracker.step(2, "Creación de Pedido en JDE") as s:
            jde_result = await create_jde_order(order_request)
            s.description = (
                f"Pedido #{jde_result.order_number} creado, "
                f"tipo: {jde_result.order_type}, "
                f"líneas: {jde_result.lines_created}"
            )

        # ─── PASO 3: Verificación y outputs (0 HTTP) ─────
        with tracker.step(3, "Verificación y resumen") as s:
            verify_result = await verify_jde_order(jde_result.order_number)
            outputs = [
                json_output("pedido_creado.json",
                    json.dumps({
                        "orderNumber": jde_result.order_number,
                        "orderType": jde_result.order_type,
                        "status": verify_result.status,
                        "linesCreated": jde_result.lines_created,
                    })
                ),
                summary_output(
                    f"Pedido #{jde_result.order_number} creado en JDE. "
                    f"{jde_result.lines_created} líneas procesadas. "
                    f"Estado: {verify_result.status}"
                ),
            ]
            s.description = (
                f"Pedido verificado, status JDE: {verify_result.status}"
            )
            if not verify_result.is_ok:
                s.warn(f"Verificación con errores: {verify_result.error}")
                final_status = "WARNING"

    except Exception as e:
        final_status = "FAILED"
        error_msg = str(e)
        raise

    finally:
        # ② Finalizar ejecución (1 HTTP POST)
        tracker.finish(
            status=final_status,
            error_message=error_msg,
            outputs=outputs,
        )
```

---

## 7. Mapeo de estados

| Estado del agente | Status Dashboard | Cuándo usar |
|-------------------|-----------------|-------------|
| Validando datos | RUNNING (implícito) | Ejecución ya creada como RUNNING al hacer `start()` |
| Creando pedido en JDE | RUNNING (implícito) | Sigue en RUNNING |
| Verificando | RUNNING (implícito) | Sigue en RUNNING |
| Pedido creado OK | **SUCCESS** | `tracker.finish("SUCCESS")` |
| Pedido creado con warnings | **WARNING** | `tracker.finish("WARNING")` |
| Error en cualquier paso | **FAILED** | `tracker.finish("FAILED", error_message=...)` |

Códigos válidos: `PENDING`, `RUNNING`, `SUCCESS`, `FAILED`, `WARNING`, `SKIPPED`

---

## 8. Contrato de la API — Referencia técnica

### 8.1 `POST /api/executions/start`

Crea una nueva ejecución con estado RUNNING.

**Headers**:
```
X-API-Key: aais_AGT-0004_c64b0a339593400dfbc868e6f740671e518d5145390a581e
Content-Type: application/json
```

**Body**:
```json
{
  "triggerSource": "API",
  "invokedBy": "usuario@empresa.com",
  "inputs": [
    {
      "inputType": "JSON",
      "fileName": "pedido_request.json",
      "mimeType": "application/json",
      "contentText": "{\"orderType\": \"SO\", \"customer\": \"12345\", \"items\": [{\"item\": \"ABC-100\", \"qty\": 10}]}"
    }
  ]
}
```

**Response** (201):
```json
{
  "executionId": 42,
  "executionGuid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "inputsInserted": 1
}
```

**Campos del body**:

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `triggerSource` | string | No | Origen del trigger: `API`, `EMAIL`, `SCHEDULED`, `MANUAL` |
| `invokedBy` | string | No | Email o identificador del usuario que inició la ejecución |
| `inputs` | array | No | Lista de inputs (ver tabla de tipos abajo) |

**Tipos de input**:

| inputType | Descripción | Campos relevantes |
|-----------|-------------|-------------------|
| `JSON` | Datos JSON (payload del pedido) | `contentText`, `fileName`, `mimeType` |
| `EMAIL` | Email que originó la solicitud | `contentText` (Subject, From, Message-ID) |
| `ATTACHMENT` | Archivo adjunto | `fileName`, `mimeType` |

### 8.2 `POST /api/executions/{id}/finish`

Finaliza la ejecución con estado, pasos y outputs.

**Headers**:
```
X-API-Key: aais_AGT-0004_c64b0a339593400dfbc868e6f740671e518d5145390a581e
Content-Type: application/json
```

**Body**:
```json
{
  "status": "SUCCESS",
  "errorMessage": null,
  "steps": [
    {
      "stepOrder": 1,
      "stepName": "Validación de datos",
      "status": "SUCCESS",
      "description": "5 líneas de pedido, cliente: 12345, tipo: SO",
      "startTime": "2026-04-08T10:15:00.000Z",
      "finishTime": "2026-04-08T10:15:02.500Z",
      "durationMs": 2500,
      "errorMessage": null
    },
    {
      "stepOrder": 2,
      "stepName": "Creación de Pedido en JDE",
      "status": "SUCCESS",
      "description": "Pedido #4501234 creado, tipo: SO, líneas: 5",
      "startTime": "2026-04-08T10:15:02.500Z",
      "finishTime": "2026-04-08T10:15:15.800Z",
      "durationMs": 13300,
      "errorMessage": null
    },
    {
      "stepOrder": 3,
      "stepName": "Verificación y resumen",
      "status": "SUCCESS",
      "description": "Pedido verificado, status JDE: 520",
      "startTime": "2026-04-08T10:15:15.800Z",
      "finishTime": "2026-04-08T10:15:17.100Z",
      "durationMs": 1300,
      "errorMessage": null
    }
  ],
  "outputs": [
    {
      "outputType": "JSON",
      "fileName": "pedido_creado.json",
      "mimeType": "application/json",
      "contentText": "{\"orderNumber\": \"4501234\", \"orderType\": \"SO\", \"status\": \"520\", \"linesCreated\": 5}"
    },
    {
      "outputType": "SUMMARY",
      "fileName": "resumen_ejecucion.txt",
      "mimeType": "text/plain",
      "contentText": "Pedido #4501234 creado en JDE. 5 líneas procesadas. Estado: 520"
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
  "outputsInserted": 2
}
```

**Campos del step**:

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `stepOrder` | number | Sí | Orden del paso (1, 2, 3...) |
| `stepName` | string | Sí | Nombre descriptivo del paso |
| `status` | string | Sí | `SUCCESS`, `FAILED`, `WARNING`, `SKIPPED` |
| `description` | string | No | Texto descriptivo del resultado del paso |
| `startTime` | string (ISO 8601) | Sí | Timestamp de inicio (UTC) |
| `finishTime` | string (ISO 8601) | Sí | Timestamp de fin (UTC) |
| `durationMs` | number | Sí | Duración en milisegundos |
| `errorMessage` | string | No | Mensaje de error (si `status` = `FAILED`) |

**Tipos de output**:

| outputType | Descripción | Campos relevantes |
|------------|-------------|-------------------|
| `JSON` | Resultado en formato JSON | `fileName`, `mimeType`, `contentText` |
| `SUMMARY` | Resumen textual de la ejecución | `fileName`, `mimeType`, `contentText` |
| `EXCEL` | Archivo Excel generado | `fileName`, `mimeType` |
| `FILE` | Otro tipo de archivo | `fileName`, `mimeType` |

---

## 9. Pre-autorización (opcional pero recomendado)

Antes de ejecutar un pipeline para un usuario, se puede verificar si tiene permisos.

### Endpoint

```
GET /api/auth/check-access?userEmail={email}&agentCode=AGT-0004
```

**Headers**: `X-API-Key: aais_AGT-0004_c64b0a339593400dfbc868e6f740671e518d5145390a581e`

### Respuesta

```json
{
  "allowed": true,
  "accessLevel": "FULL",
  "reason": "GRANTED",
  "message": "User has full access to this agent",
  "user": { "id": 1, "email": "usuario@empresa.com", "name": "Juan Pérez" },
  "agent": { "id": 1, "code": "AGT-0004", "name": "Agente Pedidos JDE" }
}
```

| reason | allowed | Significado |
|--------|---------|-------------|
| `GRANTED` | `true` | Acceso concedido |
| `ADMIN` | `true` | El usuario es admin, acceso total |
| `NO_ACCESS` | `false` | Sin permisos para este agente |
| `USER_NOT_FOUND` | `false` | Email no registrado |
| `USER_INACTIVE` | `false` | Cuenta desactivada |
| `AGENT_NOT_FOUND` | `false` | El agente no existe |
| `AGENT_INACTIVE` | `false` | El agente está desactivado |

### Uso en Python

```python
tracker = DashboardTracker(DASHBOARD_URL, DASHBOARD_API_KEY)

access = tracker.check_access(
    user_email=invoked_by,
    agent_code="AGT-0004",
)

if not access["allowed"]:
    logger.warning("Ejecución bloqueada: [%s] %s", access["reason"], access["message"])
    return  # No ejecutar

# Continuar con tracker.start() ...
```

---

## 10. Comportamiento ante fallos

El módulo `dashboard_client.py` es **fire-and-forget**: ningún error del dashboard interrumpe el pipeline del agente.

| Escenario | Qué pasa |
|-----------|----------|
| Dashboard caído en `start()` | `execution_id = None`, los pasos se acumulan igual en memoria |
| Dashboard caído en `finish()` | Se logea un warning, el pipeline del agente sigue normal |
| Excepción en un `tracker.step()` | El paso se marca como FAILED automáticamente, la excepción se propaga |
| Pipeline falla antes de `finish()` | El bloque `finally` llama a `finish("FAILED")` |
| Error en `check_access()` | Devuelve `{"allowed": False, "reason": "ERROR"}` |

---

## 11. Qué se verá en el Dashboard

Una vez integrado, cada ejecución del agente aparecerá en el dashboard con:

| Dato | Fuente | Ejemplo |
|------|--------|---------|
| Agente | Automático (API Key) | Agente Pedidos JDE |
| Estado | `finish(status=)` | SUCCESS / FAILED / WARNING |
| Duración total | StartTime → FinishTime | 17s |
| Trigger | `start(trigger_source=)` | API |
| Invocado por | `start(invoked_by=)` | usuario@empresa.com |
| **Pasos** | `tracker.step()` × 3 | Validación (2.5s), Creación JDE (13.3s), Verificación (1.3s) |
| Descripción de cada paso | `s.description = ...` | "Pedido #4501234 creado, tipo: SO, líneas: 5" |
| Error (si falla) | `finish(error_message=)` | "JDE Business Service timeout" |
| Inputs | `start(inputs=)` | pedido_request.json |
| Outputs | `finish(outputs=)` | pedido_creado.json, resumen_ejecucion.txt |

---

## 12. Pasos para completar la integración

### Checklist

- [ ] **1.** Copiar `dashboard_client.py` al proyecto del agente
- [ ] **2.** Instalar dependencia: `pip install requests`
- [ ] **3.** Configurar variables de entorno (`DASHBOARD_URL`, `DASHBOARD_API_KEY`)
- [ ] **4.** Importar en el pipeline: `from dashboard_client import DashboardTracker, json_output, summary_output`
- [ ] **5.** Crear `DashboardTracker` al inicio del pipeline
- [ ] **6.** Llamar `tracker.start()` con los inputs (datos del pedido)
- [ ] **7.** Envolver cada fase en `with tracker.step(N, "nombre"):` — ajustar nombres y descripciones a los pasos reales del agente
- [ ] **8.** Llamar `tracker.finish()` en el bloque `finally` con status, outputs y posible error_message
- [ ] **9.** (Opcional) Implementar `check_access()` para pre-autorización
- [ ] **10.** Probar con una ejecución de prueba y verificar que aparece en el dashboard

### Notas

- **No se requieren cambios en el Dashboard**. El agente ya está registrado y la API Key está activa.
- Los **nombres de los pasos** (`stepName`) y las **descripciones** son libres. Deben adaptarse a las fases reales del pipeline del agente.
- El número de pasos también es flexible. Se pueden tener 2, 3, 5 o los que sean necesarios.
- La API Key identifica automáticamente al agente; no hay que enviar el `agentId` en ningún payload.

---

## 13. Integración sin Python (HTTP directo)

Si el agente no usa Python, la integración se hace llamando directamente a los endpoints HTTP.

### Ejemplo con cURL

```bash
# 1. Iniciar ejecución
curl -X POST \
  "https://brave-island-0d9d72603.1.azurestaticapps.net/api/executions/start" \
  -H "X-API-Key: aais_AGT-0004_c64b0a339593400dfbc868e6f740671e518d5145390a581e" \
  -H "Content-Type: application/json" \
  -d '{
    "triggerSource": "API",
    "invokedBy": "usuario@empresa.com",
    "inputs": [{
      "inputType": "JSON",
      "fileName": "pedido_request.json",
      "mimeType": "application/json",
      "contentText": "{\"orderType\":\"SO\",\"customer\":\"12345\"}"
    }]
  }'
# → { "executionId": 42, "executionGuid": "...", "inputsInserted": 1 }

# 2. Finalizar ejecución (usar el executionId devuelto)
curl -X POST \
  "https://brave-island-0d9d72603.1.azurestaticapps.net/api/executions/42/finish" \
  -H "X-API-Key: aais_AGT-0004_c64b0a339593400dfbc868e6f740671e518d5145390a581e" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "SUCCESS",
    "steps": [
      {
        "stepOrder": 1,
        "stepName": "Validación de datos",
        "status": "SUCCESS",
        "description": "5 líneas validadas",
        "startTime": "2026-04-08T10:15:00.000Z",
        "finishTime": "2026-04-08T10:15:02.500Z",
        "durationMs": 2500
      },
      {
        "stepOrder": 2,
        "stepName": "Creación de Pedido en JDE",
        "status": "SUCCESS",
        "description": "Pedido #4501234 creado",
        "startTime": "2026-04-08T10:15:02.500Z",
        "finishTime": "2026-04-08T10:15:15.800Z",
        "durationMs": 13300
      }
    ],
    "outputs": [
      {
        "outputType": "JSON",
        "fileName": "pedido_creado.json",
        "mimeType": "application/json",
        "contentText": "{\"orderNumber\":\"4501234\",\"status\":\"520\"}"
      }
    ]
  }'
# → { "success": true, "executionId": 42, "stepsInserted": 2, "outputsInserted": 1 }
```

### Ejemplo con Node.js / TypeScript

```typescript
const DASHBOARD_URL = process.env.DASHBOARD_URL;
const API_KEY = process.env.DASHBOARD_API_KEY;

// 1. Iniciar ejecución
const startResp = await fetch(`${DASHBOARD_URL}/api/executions/start`, {
  method: 'POST',
  headers: {
    'X-API-Key': API_KEY,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    triggerSource: 'API',
    invokedBy: 'usuario@empresa.com',
    inputs: [{
      inputType: 'JSON',
      fileName: 'pedido_request.json',
      mimeType: 'application/json',
      contentText: JSON.stringify(orderRequest),
    }],
  }),
});
const { executionId } = await startResp.json();

// 2. Ejecutar pasos y medir tiempos localmente...

// 3. Finalizar ejecución
await fetch(`${DASHBOARD_URL}/api/executions/${executionId}/finish`, {
  method: 'POST',
  headers: {
    'X-API-Key': API_KEY,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    status: 'SUCCESS',
    steps: [
      { stepOrder: 1, stepName: 'Validación', status: 'SUCCESS', ... },
      { stepOrder: 2, stepName: 'Creación JDE', status: 'SUCCESS', ... },
    ],
    outputs: [
      { outputType: 'JSON', fileName: 'pedido.json', mimeType: 'application/json' },
    ],
  }),
});
```

---

## 14. Contacto y soporte

Para cualquier duda sobre la integración con el Dashboard:
- **Repositorio**: `qualita/agent-ai-services-qualitahub`
- **Dashboard URL**: https://brave-island-0d9d72603.1.azurestaticapps.net
- **Documentación general**: `integration/INTEGRACION-DASHBOARD.md` (en el repo del Dashboard)
