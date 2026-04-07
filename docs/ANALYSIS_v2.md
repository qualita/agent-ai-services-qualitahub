# Agent AI Services — Análisis Integral v2

> Fecha: 23 de marzo de 2026
> Versión: v1.5 (post-RBAC, post-rebranding)

---

## 1. Estado Actual de la Aplicación

### 1.1 Resumen Ejecutivo

El dashboard de **Agent AI Services** es una plataforma de monitorización de ejecuciones de agentes de IA, ya desplegada y operativa en Azure. Desde el análisis v1 (19 de marzo) se han implementado avances significativos en RBAC, rediseño de UX y branding corporativo.

| Capa | Tecnología | Estado |
|------|-----------|--------|
| Frontend | React 19 + TypeScript 5.7 + Vite 6 + Tailwind CSS 3 | Operativo |
| API Backend | Azure Functions v4 (Node.js 20) + tedious (SQL raw) | Operativo |
| Base de datos | Azure SQL Server — Basic tier, 5 DTU | Operativo |
| Storage | Azure Blob Storage (`staaservicesqhub`) | Operativo |
| Hosting | Azure Static Web Apps | Desplegado |
| Autenticación | Simulada (demo users) — preparada para Entra ID | Funcional |
| RBAC | Grupos + acceso directo + visibilidad FULL/OWN | Implementado |
| Branding | QualitaHub (logo completo, paleta corporativa) | Aplicado |

**URL producción**: `https://salmon-field-0cfd11603.4.azurestaticapps.net`

---

### 1.2 Funcionalidades Implementadas

#### Frontend — 7 páginas

| Página | Ruta | Descripción | Estado |
|--------|------|-------------|--------|
| Dashboard | `/` | KPIs, gráficos de barras (ejecuciones por agente), pie (distribución de estados) | Completo |
| Ejecuciones | `/executions` | Grid de agentes (cards/list), drill-down a tabla con filtros, infinite scroll, presets de fecha | Completo |
| Detalle Ejecución | `/executions/:id` | Timeline de pasos, tabs Inputs/Outputs/Steps, visor de archivos (PDF, CSV, JSON, Email) | Completo |
| Detalle Agente | `/agents/:id` | Metadata del agente, historial de ejecuciones recientes | Completo |
| Admin Usuarios | `/admin/users` | CRUD usuarios, modal con 3 tabs (General/Grupos/Acceso Directo) | Completo |
| Admin Grupos | `/admin/groups` | CRUD grupos, asignación de agentes con nivel de acceso | Completo |
| Login | `/login` | Flujo 2 pasos (email → password), branding QualitaHub | Completo |

#### API Backend — 21 endpoints

| Categoría | Endpoints | Rutas |
|-----------|-----------|-------|
| Dashboard & Stats | 2 | `/api/dashboard/stats`, `/api/agents-summary` |
| Agentes | 3 | `/api/agents`, `/api/agents/{id}`, `/api/agents-summary` |
| Ejecuciones | 2 | `/api/executions` (con paginación/filtros), `/api/executions/{id}` |
| Archivos | 1 | `/api/files/sas` (genera SAS URL para blob) |
| Autenticación | 1 | `/api/auth/login` |
| Gestión Usuarios | 5 | `/api/mgmt/users` (CRUD + groups + agents) |
| Gestión Grupos | 4 | `/api/mgmt/groups` (CRUD + agents) |
| **Nota** | | `/api/admin/*` está reservado por Azure SWA → se usa `/api/mgmt/*` |

#### Componentes Compartidos

| Componente | Función |
|------------|---------|
| `Layout.tsx` | Shell con sidebar QualitaHub (logo completo blanco, navegación, perfil) |
| `Modal.tsx` | Dialog reutilizable con soporte para múltiples tamaños |
| `FileViewers.tsx` | Renderizadores: `EmailViewer`, `CsvViewer`, `JsonViewer`, `FileCard` |
| `ExecutionFilesModal.tsx` | Modal full-screen con tabs Inputs/Outputs/Steps + `PdfViewer` |

---

## 2. Evolución Realizada (v1 → v1.5)

### 2.1 Cambios desde el Análisis v1

| Área | Antes (v1, 19 mar) | Ahora (v1.5, 23 mar) |
|------|---------------------|----------------------|
| **RBAC** | Tabla `UserAgentAccess` con email/objectId | Modelo completo: `AccessGroup`, `UserGroup`, `GroupAgent`, `UserAgent` con niveles FULL/OWN |
| **Visibilidad** | Sin filtrado por usuario | `buildVisibilityFilter()` en API: admins ven todo, usuarios ven según grupo + acceso directo |
| **Admin UI** | No existía | 2 páginas completas (Usuarios + Grupos) con modals tabbed |
| **Ejecuciones UX** | Tabla plana con filtros | Two-view: grid de agentes (cards/list) → drill-down a tabla filtrada |
| **Filtros de fecha** | Date range pickers | Preset dropdown (1d, 3d, 7d, 14d, 30d, custom) |
| **Branding** | Genérico "Agent AI Services" | QualitaHub corporativo (logo completo con letras, paleta verde/crema/dorado) |
| **ExecutionLog** | Tabla en BD | Eliminada — se usa log derivado de Steps |
| **Tabla UserAgentAccess** | Existía (legacy) | Eliminada — reemplazada por UserAgent + GroupAgent |

### 2.2 Commits Clave

| Commit | Descripción |
|--------|-------------|
| `b365bc9` | Card/list toggle + date presets |
| `1637c00` | QualitaHub rebranding v1 (colores, favicon, logo circular) |
| `0919ed7` | Logo completo QualitaHub con letras blancas |

---

## 3. Modelo de Datos — Análisis y Optimización

### 3.1 Esquema Actual (15 tablas)

```
TABLAS CORE (ejecuciones)
├── Agent                    → Definición de agentes
├── AgentStep                → Pasos configurados por agente
├── Execution                → Instancia de ejecución
├── ExecutionStep            → Paso individual ejecutado
├── Input                    → Archivos/datos de entrada
└── Output                   → Archivos/datos de salida

TABLAS CATÁLOGO
├── StatusCatalog            → PENDING, RUNNING, SUCCESS, FAILED, WARNING, SKIPPED
├── StepCatalog              → Tipos de paso (INPUT_RECEIVED, OUTPUT_GENERATED, etc.)
├── DataType                 → Tipos de datos (CSV, EXCEL, EMAIL, JSON, PDF, etc.)
└── StorageProviderCatalog   → Proveedores de storage (SHAREPOINT, AZURE_BLOB)

TABLAS RBAC
├── AppUser                  → Usuarios de la app
├── AccessGroup              → Grupos de permisos
├── UserGroup                → N:M Usuario-Grupo
├── GroupAgent               → N:M Grupo-Agente (con AccessLevel)
└── UserAgent                → N:M Usuario-Agente directo (con AccessLevel)
```

### 3.2 Evaluación de Tablas Catálogo — ¿Son necesarias?

#### `DataType` — PRESCINDIBLE

| Campo | Valores actuales |
|-------|-----------------|
| CSV | "Comma Separated Values" |
| EXCEL | "Microsoft Excel" |
| EMAIL | "Email Message" |
| JSON | "JSON Document" |
| PDF | "PDF Document" |
| PROCESS_SUMMARY_TXT | "Process Summary" |

**Problema**: Esta tabla añade complejidad (JOINs adicionales + FK management) para algo que se puede resolver con un `NVARCHAR(20)` directo en `Input.InputType` / `Output.OutputType`.

**Recomendación**: **ELIMINAR**. Reemplazar las FKs por un campo `VARCHAR(20)` con un CHECK constraint:

```sql
ALTER TABLE Input ADD InputTypeCode NVARCHAR(20) NOT NULL DEFAULT 'UNKNOWN';
-- CHECK (InputTypeCode IN ('CSV','EXCEL','EMAIL','JSON','PDF','TXT','IMAGE','UNKNOWN'))

ALTER TABLE [Output] ADD OutputTypeCode NVARCHAR(20) NOT NULL DEFAULT 'UNKNOWN';
```

**Justificación**:
- Los tipos de datos son estables y bien conocidos (MIME types / formatos de archivo)
- No requieren metadata adicional (Name, Description son redundantes)
- El JOIN adicional en cada query de inputs/outputs es overhead innecesario
- La tabla `Input` ya tiene `MimeType` que cumple la misma función
- En la API, el frontend ya trabaja directamente con strings como "CSV", "PDF"

**Impacto**: Eliminar 1 tabla, simplificar queries de inputs/outputs, 0 pérdida funcional.

#### `StorageProviderCatalog` — PRESCINDIBLE (a mediano plazo)

| Campo | Valores actuales |
|-------|-----------------|
| SHAREPOINT | "SharePoint Online" |
| AZURE_BLOB | "Azure Blob Storage" |

**Recomendación**: **ELIMINAR** y usar string directo. Solo hay 2 valores y son constantes técnicas que no cambian. Si se añade un tercer provider (S3, GCS), basta con agregar el string.

```sql
ALTER TABLE Input ADD StorageProvider NVARCHAR(20) DEFAULT 'AZURE_BLOB';
ALTER TABLE [Output] ADD StorageProvider NVARCHAR(20) DEFAULT 'AZURE_BLOB';
```

#### `StepCatalog` — CONSERVAR (con ajustes)

**Justificación para conservar**:
- Define los tipos de pasos disponibles en el sistema
- Tiene atributos semánticos útiles (`Type`, `IsGeneric`)
- Los agentes referencian pasos del catálogo vía `AgentStep`
- Permite descubrir qué tipos de pasos existen sin hardcodear

**Ajuste recomendado**: Añadir campo `DisplayOrder` para controlar el orden visual.

#### `StatusCatalog` — CONSERVAR

**Justificación**: Los estados tienen semántica de negocio (`IsFinal` flag) que no se puede expresar con un simple string. Además, permite añadir nuevos estados (e.g., `CANCELLED`, `TIMEOUT`) sin cambios en el código.

### 3.3 Problemas Conocidos del Modelo

| # | Problema | Tabla | Severidad | Estado |
|---|----------|-------|-----------|--------|
| 1 | Typo: columna `FinshTime` debería ser `FinishTime` | Execution | Baja | Pendiente |
| 2 | Columnas `CreatedAt` redundantes con `CreatedAtUtc` | Agent, Output | Baja | Pendiente |
| 3 | `Input`/`Output` no tienen `ContentText` en BD | Input, Output | Media | La API lo mapea como NULL |
| 4 | Passwords en texto plano en `AppUser` | AppUser | Alta | Aceptable solo en demo |
| 5 | Sin índices no-clustered | Todas | Media | Pendiente |
| 6 | `datetime` en vez de `datetime2` en columnas de tiempo | Execution, ExecutionStep, Input | Baja | Pendiente |

### 3.4 Propuesta de Modelo Simplificado

Si se eliminan `DataType` y `StorageProviderCatalog`:

```
ANTES: 15 tablas → DESPUÉS: 13 tablas

Eliminadas:
  ✗ DataType (6 registros) → reemplazado por VARCHAR directo
  ✗ StorageProviderCatalog (2 registros) → reemplazado por VARCHAR directo

Conservadas sin cambios:
  ✓ StatusCatalog (6 registros)
  ✓ StepCatalog (7 registros)
  ✓ Agent, AgentStep, Execution, ExecutionStep
  ✓ Input, Output (con columnas string en lugar de FKs)
  ✓ AppUser, AccessGroup, UserGroup, GroupAgent, UserAgent
```

**Impacto en código API**:
- Eliminar JOINs a DataType en queries de inputs/outputs
- Eliminar JOINs a StorageProviderCatalog
- Simplificar `SELECT` statements (menos aliases, menos columnas)
- Las queries serán ~10-15% más rápidas por menos JOINs

---

## 4. Análisis de la API — Fortalezas y Debilidades

### 4.1 Fortalezas

| Aspecto | Detalle |
|---------|---------|
| Parametrización SQL | Todos los inputs del usuario se pasan como parámetros tedious — previene inyección SQL |
| Visibilidad RBAC | `buildVisibilityFilter()` genera filtros WHERE dinámicos según el rol del usuario |
| SAS URLs | Acceso a blobs con token temporal (1h, read-only) — validación previa de existencia en BD |
| Estructura | Separación clara entre `functions.ts` (data) y `admin.ts` (gestión) |
| Mapping consistente | `mapStatusDisplay()` normaliza los códigos de estado BD → UI |

### 4.2 Debilidades y Oportunidades

| # | Problema | Impacto | Prioridad |
|---|----------|---------|-----------|
| 1 | **Sin connection pooling** — cada query abre/cierra conexión TCP | Latencia innecesaria, límite de conexiones bajo carga | Alta |
| 2 | **Construcción de `IN (${idList})`** en queries de inputs/outputs | Riesgo teórico de inyección (mitigado porque los IDs vienen de query previa) | Media |
| 3 | **N+1 queries** — listado de ejecuciones dispara 4+ queries | Rendimiento degradado con volumen alto | Media |
| 4 | **Sin validación de autenticación en API** | Endpoints accesibles sin token (aceptable en demo) | Alta (para producción) |
| 5 | **Sin rate limiting** | Vulnerable a abuso/DoS | Media |
| 6 | **Sin caché** | Stats del dashboard se recalculan en cada request | Baja |
| 7 | **Respuesta del listado demasiado pesada** | Cada ejecución incluye arrays de inputs/outputs | Media |

### 4.3 Recomendaciones Técnicas

**Connection Pooling (prioridad alta)**:
```typescript
// Migrar de conexión individual a pool con tedious-connection-pool o tarn.js
import { Pool } from 'tarn';
const pool = new Pool({
  create: () => createConnection(config),
  destroy: (conn) => conn.close(),
  min: 2, max: 10
});
```

**Optimizar listado de ejecuciones**:
```sql
-- Usar COUNT(*) OVER() para evitar query separada de conteo
SELECT *, COUNT(*) OVER() AS TotalCount
FROM (
  SELECT e.Id, e.ExecutionGuid, ...
  FROM Execution e JOIN Agent a ON ...
  WHERE ...
  ORDER BY e.StartTime DESC
  OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
) sub
```

---

## 5. Catálogo de APIs — Referencia Completa

> Este catálogo documenta todas las APIs disponibles para consumo externo. La aplicación será totalmente alimentada y gestionada vía API.

### 5.1 Información General

| Propiedad | Valor |
|-----------|-------|
| Base URL (producción) | `https://salmon-field-0cfd11603.4.azurestaticapps.net/api` |
| Base URL (desarrollo) | `http://localhost:7071/api` |
| Formato | JSON (camelCase) |
| Autenticación | Header `x-ms-client-principal: base64(JSON)` |
| Content-Type | `application/json` |

### 5.2 APIs de Datos (Lectura)

---

#### `GET /api/dashboard/stats`

Retorna KPIs globales del dashboard.

**Parámetros**: Ninguno

**Respuesta** (`200 OK`):
```json
{
  "totalExecutions": 25,
  "successCount": 18,
  "failedCount": 5,
  "runningCount": 2,
  "avgDurationSeconds": 145.3,
  "executionsByAgent": [
    { "agentId": 1, "agentName": "Cobros Agent", "count": 12 },
    { "agentId": 2, "agentName": "Facturas Agent", "count": 8 }
  ]
}
```

**Notas**: Los conteos respetan la visibilidad del usuario (admins ven todo, usuarios normales solo sus agentes asignados).

---

#### `GET /api/agents`

Lista todos los agentes activos.

**Parámetros**: Ninguno (filtrado de visibilidad automático)

**Respuesta** (`200 OK`):
```json
[
  {
    "agentId": 1,
    "code": "COBROS_001",
    "name": "Cobros Agent",
    "description": "Procesamiento automático de cobros",
    "isActive": true,
    "createdAt": "2026-03-15T10:00:00Z",
    "categoryName": "Finance",
    "version": "1.0.0",
    "configJson": "{\"schedule\": \"0 8 * * *\"}"
  }
]
```

---

#### `GET /api/agents/{id}`

Detalle de un agente específico.

**Parámetros de ruta**:
| Param | Tipo | Descripción |
|-------|------|-------------|
| `id` | number | ID del agente |

**Respuesta** (`200 OK`): Mismo esquema que un elemento de `/api/agents`

---

#### `GET /api/agents-summary`

Resumen de agentes con estadísticas de ejecuciones.

**Parámetros**: Ninguno

**Respuesta** (`200 OK`):
```json
[
  {
    "agentId": 1,
    "name": "Cobros Agent",
    "description": "Procesamiento automático de cobros",
    "totalExecutions": 12,
    "successCount": 10,
    "failedCount": 1,
    "runningCount": 1,
    "lastExecution": "2026-03-23T14:30:00Z"
  }
]
```

---

#### `GET /api/executions`

Listado paginado de ejecuciones con filtros.

**Query Parameters**:
| Param | Tipo | Default | Descripción |
|-------|------|---------|-------------|
| `page` | number | 1 | Número de página |
| `pageSize` | number | 15 | Elementos por página |
| `status` | string | — | Filtrar por estado: `SUCCESS`, `FAILED`, `RUNNING`, `PENDING`, `WARNING`, `SKIPPED` |
| `search` | string | — | Búsqueda en nombre de agente, triggerSource, invokedBy |
| `agentId` | number | — | Filtrar por agente específico |
| `dateFrom` | string (ISO) | — | Fecha inicio (inclusive) |
| `dateTo` | string (ISO) | — | Fecha fin (inclusive) |
| `fullAgentIds` | string | — | IDs de agentes con acceso FULL (separados por coma) |
| `ownAgentIds` | string | — | IDs de agentes con acceso OWN (separados por coma) |
| `invokedBy` | string | — | Email del usuario para filtro OWN |

**Respuesta** (`200 OK`):
```json
{
  "items": [
    {
      "executionId": 25,
      "executionGuid": "a1b2c3d4-...",
      "agentId": 1,
      "agentName": "Cobros Agent",
      "status": "Completed",
      "triggerSource": "Scheduled",
      "invokedBy": "system@agentai.demo",
      "startTime": "2026-03-23T08:00:00Z",
      "finishTime": "2026-03-23T08:02:30Z",
      "durationSeconds": 150,
      "stepCount": 6,
      "errorMessage": null,
      "inputCount": 2,
      "outputCount": 1,
      "inputs": [
        { "inputId": 42, "inputType": "CSV", "fileName": "cobros_mar.csv", "mimeType": "text/csv", "filePath": "agent-1/exec-25/input/cobros.csv" }
      ],
      "outputs": [
        { "outputId": 27, "outputType": "PDF", "fileName": "report.pdf", "mimeType": "application/pdf", "filePath": "agent-1/exec-25/output/report.pdf" }
      ]
    }
  ],
  "total": 25
}
```

**Notas sobre visibilidad**:
- Admins: no se envían `fullAgentIds`/`ownAgentIds` → ven todo
- Usuarios normales: el frontend calcula y envía los parámetros de visibilidad según sus grupos + acceso directo
- `FULL`: ve todas las ejecuciones del agente
- `OWN`: solo ve ejecuciones donde `InvokedBy` coincide con su email

---

#### `GET /api/executions/{id}`

Detalle completo de una ejecución.

**Parámetros de ruta**:
| Param | Tipo | Descripción |
|-------|------|-------------|
| `id` | number | ID de la ejecución |

**Respuesta** (`200 OK`):
```json
{
  "executionId": 25,
  "executionGuid": "a1b2c3d4-...",
  "agentId": 1,
  "agentName": "Cobros Agent",
  "status": "Completed",
  "triggerSource": "Scheduled",
  "invokedBy": "system@agentai.demo",
  "startTime": "2026-03-23T08:00:00Z",
  "finishTime": "2026-03-23T08:02:30Z",
  "durationSeconds": 150,
  "stepCount": 6,
  "errorMessage": null,
  "inputCount": 2,
  "outputCount": 1,
  "steps": [
    {
      "stepId": 1,
      "stepOrder": 1,
      "stepName": "Input Received",
      "status": "Completed",
      "description": "Received 2 files from SharePoint",
      "startTime": "2026-03-23T08:00:00Z",
      "finishTime": "2026-03-23T08:00:05Z",
      "durationSeconds": 5,
      "errorMessage": null
    }
  ],
  "inputs": [
    {
      "inputId": 42,
      "inputType": "CSV",
      "fileName": "cobros_mar.csv",
      "mimeType": "text/csv",
      "filePath": "agent-1/exec-25/input/cobros.csv",
      "contentText": null,
      "receivedAt": "2026-03-23T08:00:05Z"
    }
  ],
  "outputs": [
    {
      "outputId": 27,
      "outputType": "PDF",
      "fileName": "report.pdf",
      "mimeType": "application/pdf",
      "filePath": "agent-1/exec-25/output/report.pdf",
      "contentText": null,
      "generatedAt": "2026-03-23T08:02:25Z"
    }
  ]
}
```

---

#### `GET /api/files/sas`

Genera una URL SAS temporal para descargar/visualizar un archivo de Blob Storage.

**Query Parameters**:
| Param | Tipo | Descripción |
|-------|------|-------------|
| `path` | string | Ruta del blob (e.g., `agent-1/exec-25/output/report.pdf`) |

**Respuesta** (`200 OK`):
```json
{
  "url": "https://staaservicesqhub.blob.core.windows.net/agent-files/agent-1/exec-25/output/report.pdf?sv=2024-11-04&se=2026-03-23T16:00:00Z&sr=b&sp=r&sig=..."
}
```

**Seguridad**:
- SAS token válido por 1 hora, solo lectura
- Se valida que el `path` existe como `FilePath` en la tabla `Input` o `Output` antes de generar el SAS
- No permite acceso a blobs arbitrarios

---

### 5.3 APIs de Autenticación

---

#### `POST /api/auth/login`

Autenticación de usuario (modo demo).

**Body**:
```json
{
  "email": "admin@agentai.demo",
  "password": "demo123"
}
```

**Respuesta** (`200 OK`):
```json
{
  "id": 1,
  "email": "admin@agentai.demo",
  "name": "Admin User",
  "isAdmin": true,
  "groups": [
    { "id": 1, "name": "Finance Team" }
  ],
  "agentAccess": [
    { "agentId": 1, "accessLevel": "FULL" },
    { "agentId": 2, "accessLevel": "OWN" }
  ]
}
```

**Notas**:
- `agentAccess` es la unión de acceso vía grupos + acceso directo
- Si el usuario es `isAdmin: true`, tiene acceso FULL a todos los agentes
- En producción, migrar a Entra ID (el login se elimina y se usa `/.auth/me` de Azure SWA)

**Errores**:
| Código | Motivo |
|--------|--------|
| 401 | Credenciales inválidas |
| 403 | Usuario desactivado (`IsActive = 0`) |

---

### 5.4 APIs de Gestión — Usuarios

> Requieren privilegio de administrador (`isAdmin: true`)

---

#### `GET /api/mgmt/users`

Lista todos los usuarios con sus grupos y accesos directos.

**Respuesta** (`200 OK`):
```json
[
  {
    "id": 1,
    "email": "admin@agentai.demo",
    "name": "Admin User",
    "isAdmin": true,
    "isActive": true,
    "createdAt": "2026-03-15T10:00:00Z",
    "groups": [
      { "id": 1, "name": "Finance Team" }
    ],
    "directAgents": [
      { "agentId": 1, "agentName": "Cobros Agent", "accessLevel": "FULL" }
    ]
  }
]
```

---

#### `POST /api/mgmt/users`

Crea un nuevo usuario.

**Body**:
```json
{
  "email": "nuevo@empresa.com",
  "name": "Nuevo Usuario",
  "password": "SecurePass123!",
  "isAdmin": false,
  "groupIds": [1, 2]
}
```

**Respuesta** (`201 Created`):
```json
{
  "id": 3,
  "email": "nuevo@empresa.com",
  "name": "Nuevo Usuario",
  "isActive": true
}
```

---

#### `PUT /api/mgmt/users/{id}`

Actualiza datos de un usuario.

**Body** (todos opcionales):
```json
{
  "name": "Nombre Actualizado",
  "email": "nuevo-email@empresa.com",
  "password": "NuevoPass456!",
  "isActive": false,
  "isAdmin": true
}
```

**Respuesta** (`200 OK`): `{ "success": true }`

---

#### `PUT /api/mgmt/users/{id}/groups`

Reasigna los grupos de un usuario (reemplaza todos los existentes).

**Body**:
```json
{
  "groupIds": [1, 3]
}
```

**Respuesta** (`200 OK`): `{ "success": true }`

---

#### `PUT /api/mgmt/users/{id}/agents`

Asigna acceso directo a agentes (reemplaza todos los existentes).

**Body**:
```json
{
  "agents": [
    { "agentId": 1, "accessLevel": "FULL" },
    { "agentId": 3, "accessLevel": "OWN" }
  ]
}
```

**Respuesta** (`200 OK`): `{ "success": true }`

---

### 5.5 APIs de Gestión — Grupos

> Requieren privilegio de administrador (`isAdmin: true`)

---

#### `GET /api/mgmt/groups`

Lista todos los grupos con agentes asignados.

**Respuesta** (`200 OK`):
```json
[
  {
    "id": 1,
    "name": "Finance Team",
    "description": "Equipo de finanzas con acceso a agentes de cobros y facturas",
    "isActive": true,
    "createdAt": "2026-03-20T10:00:00Z",
    "userCount": 3,
    "agents": [
      { "agentId": 1, "agentName": "Cobros Agent", "accessLevel": "FULL" },
      { "agentId": 2, "agentName": "Facturas Agent", "accessLevel": "OWN" }
    ]
  }
]
```

---

#### `POST /api/mgmt/groups`

Crea un nuevo grupo.

**Body**:
```json
{
  "name": "Operations",
  "description": "Equipo de operaciones",
  "agents": [
    { "agentId": 3, "accessLevel": "FULL" }
  ]
}
```

**Respuesta** (`201 Created`): `{ "id": 2, "name": "Operations" }`

---

#### `PUT /api/mgmt/groups/{id}`

Actualiza datos de un grupo.

**Body** (todos opcionales):
```json
{
  "name": "Finance Team (Updated)",
  "description": "Nueva descripción",
  "isActive": false
}
```

**Respuesta** (`200 OK`): `{ "success": true }`

---

#### `PUT /api/mgmt/groups/{id}/agents`

Reasigna agentes al grupo (reemplaza todos los existentes).

**Body**:
```json
{
  "agents": [
    { "agentId": 1, "accessLevel": "FULL" },
    { "agentId": 2, "accessLevel": "OWN" },
    { "agentId": 3, "accessLevel": "FULL" }
  ]
}
```

**Respuesta** (`200 OK`): `{ "success": true }`

---

### 5.6 APIs Pendientes de Implementar

La aplicación será **totalmente gestionada vía API**, por lo que se necesitan los siguientes endpoints adicionales:

#### Gestión de Agentes (CRUD)

| Método | Ruta | Descripción | Prioridad |
|--------|------|-------------|-----------|
| `POST` | `/api/mgmt/agents` | Crear nuevo agente | Alta |
| `PUT` | `/api/mgmt/agents/{id}` | Actualizar agente (nombre, descripción, config, activo) | Alta |
| `GET` | `/api/mgmt/agents/{id}/steps` | Listar pasos configurados del agente | Media |
| `PUT` | `/api/mgmt/agents/{id}/steps` | Reconfigurar pasos del agente | Media |

#### Registro de Ejecuciones (Write API — para los agentes que reportan)

| Método | Ruta | Descripción | Prioridad |
|--------|------|-------------|-----------|
| `POST` | `/api/executions` | Registrar nueva ejecución | **Crítica** |
| `PUT` | `/api/executions/{id}/status` | Actualizar estado de ejecución | **Crítica** |
| `POST` | `/api/executions/{id}/steps` | Registrar paso ejecutado | **Crítica** |
| `PUT` | `/api/executions/{id}/steps/{stepId}` | Actualizar estado de paso | **Crítica** |
| `POST` | `/api/executions/{id}/inputs` | Registrar input de ejecución | Alta |
| `POST` | `/api/executions/{id}/outputs` | Registrar output de ejecución | Alta |

#### Catálogos (Admin)

| Método | Ruta | Descripción | Prioridad |
|--------|------|-------------|-----------|
| `GET` | `/api/mgmt/statuses` | Listar catálogo de estados | Baja |
| `GET` | `/api/mgmt/step-catalog` | Listar catálogo de pasos | Media |
| `POST` | `/api/mgmt/step-catalog` | Crear tipo de paso | Media |

#### Utilidades

| Método | Ruta | Descripción | Prioridad |
|--------|------|-------------|-----------|
| `POST` | `/api/files/upload` | Subir archivo a Blob Storage | Alta |
| `GET` | `/api/health` | Health check del API + BD | Media |

---

## 6. Prioridades y Roadmap

### 6.1 Prioridad CRÍTICA — Write API para Agentes

**El mayor gap actual** es que no existen APIs de escritura. Los agentes de IA no tienen forma de reportar sus ejecuciones programáticamente. Actualmente los datos son de prueba insertados manualmente en la BD.

**Flujo esperado de un agente**:
```
1. POST /api/executions
   → Crea ejecución con estado PENDING, retorna executionId

2. PUT /api/executions/{id}/status  { status: "RUNNING" }
   → Marca la ejecución como en curso

3. POST /api/executions/{id}/inputs
   → Registra cada archivo de entrada (metadata + upload a Blob)

4. Para cada paso:
   POST /api/executions/{id}/steps   { stepCode: "INPUT_RECEIVED", status: "RUNNING" }
   PUT  /api/executions/{id}/steps/{stepId}  { status: "SUCCESS", durationMs: 1500 }

5. POST /api/executions/{id}/outputs
   → Registra cada archivo de salida

6. PUT /api/executions/{id}/status  { status: "SUCCESS" }
   → Marca la ejecución como completada
```

**Autenticación de agentes**: Los agentes necesitan una API Key o service principal (no usuario/password). Opciones:
- API Key por agente (almacenada en tabla `Agent.ApiKeyHash`)
- Azure Managed Identity (si los agentes corren en Azure)
- Service Principal de Entra ID con client credentials grant

### 6.2 Prioridad ALTA

| Tarea | Justificación |
|-------|---------------|
| **Connection pooling en API** | Cada query abre/cierra conexión TCP; ineficiente bajo carga |
| **CRUD de Agentes** | No se pueden crear agentes desde la interfaz/API |
| **Upload de archivos** | Los agentes necesitan subir inputs/outputs a Blob Storage |
| **Autenticación de agentes (API Keys)** | Los agentes necesitan autenticarse para reportar ejecuciones |
| **Índices en BD** | Sin índices no-clustered; performance degradará con volumen |

### 6.3 Prioridad MEDIA

| Tarea | Justificación |
|-------|---------------|
| **Microsoft Entra ID** | Reemplazar autenticación demo por OAuth 2.0 real |
| **Simplificación del modelo** | Eliminar `DataType` y `StorageProviderCatalog` |
| **Optimizar query de ejecuciones** | Usar `COUNT(*) OVER()`, reducir payload |
| **Health check endpoint** | Monitorización del servicio |
| **Debounce en búsqueda** | Evitar queries excesivas en cada keypress |
| **Code splitting** | Bundle de 795KB → dividir con React.lazy() |

### 6.4 Prioridad BAJA

| Tarea | Justificación |
|-------|---------------|
| **Corregir typo `FinshTime`** → `FinishTime` | Impacto cosmético en BD |
| **Migrar `datetime` → `datetime2`** | Mejor precisión, no es urgente |
| **Eliminar columnas `CreatedAt` redundantes** | Limpieza de modelo |
| **Caché de stats del dashboard** | Solo relevante con alto volumen |
| **Rate limiting** | Solo relevante en producción abierta |

---

## 7. Arquitectura de APIs para Gestión Completa

### 7.1 Matriz de APIs — Vista Completa

```
              ┌─────────────────────────────────────────────────────┐
              │              API LAYER (/api)                       │
              │                                                     │
              │  ┌───────────────┐  ┌───────────────┐              │
              │  │  DATA (Read)  │  │  WRITE (Agent │              │
              │  │               │  │   Reporting)  │              │
              │  │ GET /stats    │  │               │              │
              │  │ GET /agents   │  │ POST /exec    │              │
              │  │ GET /exec     │  │ PUT  /exec    │              │
              │  │ GET /exec/:id │  │ POST /steps   │              │
              │  │ GET /files    │  │ POST /inputs  │              │
              │  │               │  │ POST /outputs │              │
              │  └───────────────┘  └───────────────┘              │
              │                                                     │
              │  ┌───────────────┐  ┌───────────────┐              │
              │  │  AUTH         │  │  MGMT (Admin) │              │
              │  │               │  │               │              │
              │  │ POST /login   │  │ CRUD /users   │              │
              │  │ GET  /me      │  │ CRUD /groups  │              │
              │  │               │  │ CRUD /agents  │              │
              │  │               │  │ GET  /catalog │              │
              │  └───────────────┘  └───────────────┘              │
              └─────────────────────────────────────────────────────┘
                        │                    │
                        ▼                    ▼
              ┌──────────────────┐  ┌──────────────────┐
              │   Azure SQL      │  │  Blob Storage    │
              │   (13 tablas)    │  │  (agent-files)   │
              └──────────────────┘  └──────────────────┘
```

### 7.2 Autenticación por Tipo de Consumidor

| Consumidor | Método Auth | Acceso |
|-----------|-------------|--------|
| **Dashboard (usuarios)** | Session cookie / Entra ID token | APIs de lectura (data) + mgmt si admin |
| **Agentes de IA** | API Key (`x-api-key` header) | APIs de escritura (POST/PUT ejecuciones) |
| **Servicios externos** | Service Principal (OAuth2 client credentials) | Según scope configurado |

### 7.3 Esquema de API Key para Agentes

```sql
ALTER TABLE Agent ADD
    ApiKeyHash    NVARCHAR(128) NULL,    -- SHA-256 hash de la API key
    ApiKeyPrefix  NVARCHAR(8)   NULL;    -- Primeros 8 chars para identificación

-- Ejemplo: API key "agk_cobros001_x8f2k9..."
-- ApiKeyPrefix: "agk_cobr"
-- ApiKeyHash: SHA256("agk_cobros001_x8f2k9...")
```

**Middleware de validación**:
```typescript
function validateAgentApiKey(req: HttpRequest): number | null {
  const key = req.headers.get('x-api-key');
  if (!key) return null;
  const hash = sha256(key);
  // SELECT Id FROM Agent WHERE ApiKeyHash = @hash AND IsActive = 1
  return agentId;
}
```

---

## 8. Infraestructura y Recursos Azure

### 8.1 Recursos Actuales

| Recurso | Nombre | Región | Tier |
|---------|--------|--------|------|
| Resource Group | `rg-agent-ai-services-qualitahub` | Sweden Central | — |
| SQL Server | `sqlserver-agent-ai-services-qualitahub` | Sweden Central | — |
| SQL Database | `db-agent-ai-services-qualitahub` | Sweden Central | Basic (5 DTU) |
| Static Web App | `swa-agent-ai-services-qualitahub` | Auto | Free |
| Storage Account | `staaservicesqhub` | Sweden Central | Standard LRS |

### 8.2 Consideraciones de Escalabilidad

| Límite actual | Impacto | Solución |
|---------------|---------|----------|
| **5 DTU** (Basic tier) | ~5 queries concurrentes; se saturará con múltiples agentes reportando | Escalar a S0 (10 DTU) o S1 (20 DTU) |
| **SWA Free tier** | 100 GB bandwidth/mes, 2 custom domains | Escalar a Standard si se necesita más |
| **Sin connection pooling** | Cada request = nueva conexión TCP (~200ms overhead) | Implementar pool (prioridad alta) |

### 8.3 Costos Estimados Mensuales

| Recurso | Tier Actual | Costo/mes | Con escalado |
|---------|-------------|-----------|--------------|
| SQL Database | Basic (5 DTU) | ~$5 | S0 (10 DTU): ~$15 |
| Static Web App | Free | $0 | Standard: ~$9 |
| Storage | Standard LRS | ~$0.50 (< 1GB) | ~$2 (10GB) |
| **Total** | | **~$5.50** | **~$26** |

---

## 9. Stack Tecnológico — Dependencias

### 9.1 Frontend

| Paquete | Versión | Uso |
|---------|---------|-----|
| react | 19.0 | UI framework |
| react-dom | 19.0 | DOM rendering |
| react-router-dom | 7.1 | Routing SPA |
| @tanstack/react-query | 5.62 | Server state (cache, invalidation, infinite queries) |
| @tanstack/react-table | 8.20 | Importado pero uso mínimo |
| recharts | 2.15 | Charts (bar, pie, tooltip) |
| lucide-react | 0.468 | Iconos SVG (enterprise style) |
| clsx | 2.1 | Classname utility |
| tailwind-merge | 2.6 | Merge Tailwind classes |
| tailwindcss | 3.4 | CSS utility framework |
| typescript | 5.7 | Type safety |
| vite | 6.0 | Build tool + dev server |

### 9.2 API

| Paquete | Versión | Uso |
|---------|---------|-----|
| @azure/functions | 4.5 | Azure Functions HTTP triggers |
| @azure/storage-blob | 12.31 | SAS URL generation, blob access |
| tedious | 19.0 | SQL Server driver (raw queries) |
| typescript | 5.7 | Type safety |

---

## 10. Resumen de Archivos del Proyecto

```
dashboard-qualitahub/
├── public/
│   ├── favicon_qualitahub.png           → Favicon QualitaHub
│   └── img/
│       ├── qualitahub_circle.svg        → Logo circular (legacy)
│       ├── qualitahub_logo_white.svg    → Logo completo letras blancas (sidebar)
│       └── qualitahub_logo_dark.svg     → Logo completo verde oscuro (login)
├── src/
│   ├── api/client.ts                    → 18 funciones fetch + helpers de visibilidad
│   ├── auth/AuthProvider.tsx            → Context auth + hooks + route guards
│   ├── components/
│   │   ├── Layout.tsx                   → Shell: sidebar + main content
│   │   ├── Modal.tsx                    → Dialog reutilizable
│   │   ├── FileViewers.tsx             → Email/CSV/JSON viewers + FileCard
│   │   └── ExecutionFilesModal.tsx     → Modal I/O con PdfViewer
│   ├── lib/utils.ts                     → cn(), formatDuration(), formatDate(), statusColor()
│   ├── pages/
│   │   ├── DashboardPage.tsx            → KPIs + charts
│   │   ├── ExecutionsPage.tsx           → Agent cards → executions table
│   │   ├── ExecutionDetailPage.tsx      → Steps timeline + files
│   │   ├── AgentDetailPage.tsx          → Agent metadata + history
│   │   ├── AdminUsersPage.tsx           → User CRUD + groups/agents tabs
│   │   ├── AdminGroupsPage.tsx          → Group CRUD + agent assignment
│   │   └── LoginPage.tsx                → Two-step login
│   ├── types.ts                         → 12 TypeScript interfaces
│   ├── App.tsx                          → Route definitions + guards
│   └── main.tsx                         → Entry point (QueryClientProvider)
├── api/
│   ├── src/
│   │   ├── db.ts                        → tedious connection helper
│   │   ├── functions.ts                 → Data API endpoints (8 functions)
│   │   └── admin.ts                     → Auth + Admin endpoints (11 functions)
│   ├── host.json                        → Azure Functions config
│   ├── local.settings.json              → Dev environment variables
│   └── package.json                     → API dependencies
├── staticwebapp.config.json             → SWA routing + auth rules
├── tailwind.config.js                   → QualitaHub color palette
├── vite.config.ts                       → Build config + proxy
├── ANALYSIS.md                          → Análisis v1 (19 mar)
├── ANALISIS_ARQUITECTURA.md             → Crítica del esquema
├── ANALISIS_STORAGE.md                  → Evaluación Azure Storage
└── ANALYSIS_v2.md                       → Este documento
```

---

## 11. Conclusiones

### Lo que está bien
- Arquitectura limpia y bien separada (frontend / API / BD)
- RBAC funcional con grupos + acceso directo + niveles FULL/OWN
- Branding corporativo profesional
- Queries parametrizadas (seguridad SQL injection)
- Blob Storage con SAS URLs temporales
- UX pulida con card/list toggle, presets de fecha, infinite scroll

### Lo que falta (por prioridad)
1. **Write API** — los agentes no pueden reportar ejecuciones programáticamente
2. **Connection pooling** — ineficiencia en cada request
3. **CRUD de agentes** — no se pueden gestionar agentes desde la plataforma
4. **Autenticación de producción** — implementar Entra ID o al menos bcrypt para passwords
5. **Simplificación del modelo** — eliminar tablas catálogo innecesarias (DataType, StorageProviderCatalog)
6. **Índices en BD** — rendimiento degradará con volumen
7. **Code splitting** — bundle de 795KB es grande para una SPA
8. **Health check** — monitorización básica del servicio

### Decisión clave pendiente
**¿Cuándo migrar a Entra ID?** Si la app se va a abrir a usuarios reales pronto, la autenticación es el primer paso. Si solo la usarán los agentes vía API, la prioridad es el Write API + API Keys.

---

## 12. ANÁLISIS: Arquitectura Simplificada de Steps (Start/Finish con JSON Log)

### 12.1 Modelo actual (3 tablas de steps)

```
StepCatalog (7 filas)        → Catálogo global de tipos de paso
  ├─ Id, Code, Name, Type, Description, IsGeneric
  │
AgentStep (16 filas)          → Qué pasos usa cada agente y en qué orden
  ├─ Id, StepOrder, IsEnabled, AgentId→Agent, StepId→StepCatalog
  │
ExecutionStep (159 filas)     → Resultado de cada paso por ejecución
  ├─ Id, StartTime, FinishTime, ErrorMessage, DurationMs
  ├─ ExecutionId→Execution, AgentStepId→AgentStep, StatusId→StatusCatalog
```

**Cadena de JOINs actual** (en la query de detalle de ejecución):
```sql
FROM ExecutionStep es
JOIN AgentStep ast ON es.AgentStepId = ast.Id
JOIN StepCatalog sc2 ON ast.StepId = sc2.Id
JOIN StatusCatalog scs ON es.StatusId = scs.Id
WHERE es.ExecutionId = @id
ORDER BY ast.StepOrder
```

**Dependencias adicionales**:
- `Output.GeneratedByAgentStepId` → FK a `AgentStep` (indica qué paso generó cada output)
- `ExecutionLog.StepId` → FK a `ExecutionStep` (logs asociados a pasos específicos)

### 12.2 Modelo propuesto: Start/Finish con JSON Log

**Concepto**: El agente hace 2 llamadas API:
1. **POST /api/executions/start** → Crea la ejecución con status RUNNING
2. **POST /api/executions/{id}/finish** → Marca la ejecución como finalizada y envía el log de pasos en JSON

#### Ejemplo del payload de finish:
```json
{
  "status": "SUCCESS",
  "errorMessage": null,
  "steps": [
    {
      "stepOrder": 1,
      "stepName": "Descargar emails",
      "status": "SUCCESS",
      "startTime": "2025-01-15T10:00:00Z",
      "finishTime": "2025-01-15T10:00:45Z",
      "durationMs": 45000,
      "errorMessage": null
    },
    {
      "stepOrder": 2,
      "stepName": "Procesar CSV",
      "status": "SUCCESS",
      "startTime": "2025-01-15T10:00:45Z",
      "finishTime": "2025-01-15T10:01:30Z",
      "durationMs": 45000,
      "errorMessage": null
    },
    {
      "stepOrder": 3,
      "stepName": "Generar reporte",
      "status": "FAILED",
      "startTime": "2025-01-15T10:01:30Z",
      "finishTime": "2025-01-15T10:01:35Z",
      "durationMs": 5000,
      "errorMessage": "Template not found: monthly_report.xlsx"
    }
  ]
}
```

### 12.3 Opciones de implementación

#### Opción A: JSON puro en columna de Execution (más simple)

```
Execution
  ├─ ... (columnas existentes)
  └─ StepsJson NVARCHAR(MAX)    ← nuevo: JSON completo de pasos
```

**Ventajas**:
- Elimina **3 tablas**: StepCatalog, AgentStep, ExecutionStep
- Elimina **7 FKs** y sus índices
- Los agentes definen sus propios pasos dinámicamente — no hay catálogo que mantener
- Una sola query sin JOINs para obtener el detalle completo
- El frontend parsea el JSON directamente

**Desventajas**:
- No se puede hacer `WHERE` eficiente sobre pasos individuales (ej. "todos los pasos fallidos")
- El JSON no tiene esquema enforced — el agente puede enviar datos inconsistentes
- Pasa de esquema relacional a semi-estructurado (puede complicar analytics futuro)
- `Output.GeneratedByAgentStepId` pierde la FK — habría que usar un `stepName` o `stepOrder` como referencia

#### Opción B: Híbrida — tabla ExecutionStep simplificada + eliminar catálogos

```
ExecutionStep (simplificada)
  ├─ Id, ExecutionId→Execution
  ├─ StepOrder, StepName, Description     ← datos inline, sin FK a catálogo
  ├─ Status NVARCHAR(20)                  ← inline, sin FK a StatusCatalog
  ├─ StartTime, FinishTime, DurationMs, ErrorMessage
```

Elimina: StepCatalog, AgentStep (2 tablas)
Mantiene: ExecutionStep simplificada (sin JOINs para consultar)

**Ventajas**:
- Mantiene la capacidad de hacer queries SQL sobre pasos individuales
- Cada paso es un registro indexable y filtrable
- Compatible con analytics y reporting sobre pasos
- `Output.GeneratedByAgentStepId` puede mantener su FK (apunta a ExecutionStep.Id)

**Desventajas**:
- Todavía requiere INSERT de N filas por ejecución (vs 1 UPDATE con JSON)
- Ligeramente más compleja que la Opción A

#### Opción C: JSON en Execution + tabla materializada (best of both worlds)

```
Execution
  └─ StepsJson NVARCHAR(MAX)              ← Se recibe del agente

ExecutionStep (materializada automáticamente)
  ├─ Se crea al recibir el finish → parse del JSON
  ├─ Permite queries analíticos sobre pasos
```

**Ventajas**:
- Recepción simple (1 campo JSON)
- Queries analíticos posibles sobre tabla materializada
- Dato original preservado intacto

**Desventajas**:
- Complejidad de mantener dos representaciones sincronizadas
- Sobre-ingeniería para el volumen actual

### 12.4 Recomendación

**Opción B (Híbrida)** es la más equilibrada para el caso de uso actual:

| Criterio | A (JSON puro) | B (Híbrida) | C (Dual) |
|---|---|---|---|
| Simplicidad de recepción | Alta | Media | Alta |
| Queries sobre pasos | No | Sí | Sí |
| Tablas eliminadas | 3 | 2 | 2 |
| Analytics futuro | Limitado | Completo | Completo |
| Complejidad API finish | Baja | Media | Alta |
| `Output.GeneratedByStep` | Se pierde FK | Se mantiene FK | Se mantiene FK |

**Razón**: Mantener ExecutionStep (simplificada sin catálogos) preserva la capacidad de hacer queries sobre pasos individuales, que es útil para dashboards de performance por paso, detección de cuellos de botella, y alertas. El overhead de hacer N INSERTs vs 1 UPDATE es mínimo dado el volumen actual (159 filas totales).

### 12.5 Impacto en el flujo API

**Nuevo flujo (con Opción B)**:

```
POST /api/executions/start
  Body: { agentCode: "COBROS", triggerSource: "SCHEDULED", invokedBy: "cron" }
  Response: { executionId: 42, executionGuid: "abc-123-..." }
  → INSERT Execution (Status=RUNNING, StartTime=NOW)

POST /api/executions/{id}/finish
  Body: { status: "SUCCESS", errorMessage: null, steps: [...], inputs: [...], outputs: [...] }
  → UPDATE Execution (Status, FinishTime=NOW, ErrorMessage)
  → INSERT ExecutionStep × N (StepOrder, StepName, Status, times...)
  → INSERT Input × N (si se proporcionan)
  → INSERT Output × N (si se proporcionan)
```

### 12.6 Cambios en BD necesarios (cuando se implemente)

```sql
-- 1. Simplificar ExecutionStep: eliminar FK a AgentStep, agregar columnas inline
ALTER TABLE ExecutionStep ADD StepName NVARCHAR(150);
ALTER TABLE ExecutionStep ADD StepDescription NVARCHAR(MAX);
ALTER TABLE ExecutionStep ADD Status NVARCHAR(20);
-- Migrar datos existentes desde JOINs
UPDATE es SET
  es.StepName = sc.Name,
  es.StepDescription = sc.Description,
  es.Status = scs.Code
FROM ExecutionStep es
JOIN AgentStep ast ON es.AgentStepId = ast.Id
JOIN StepCatalog sc ON ast.StepId = sc.Id
JOIN StatusCatalog scs ON es.StatusId = scs.Id;
-- Eliminar FKs y columnas antiguas
ALTER TABLE ExecutionStep DROP CONSTRAINT FK_ExecutionStep_AgentStep;
ALTER TABLE ExecutionStep DROP CONSTRAINT FK_ExecutionStep_StatusCatalog;
ALTER TABLE ExecutionStep DROP COLUMN AgentStepId;
ALTER TABLE ExecutionStep DROP COLUMN StatusId;

-- 2. Output.GeneratedByAgentStepId → referenciar ExecutionStep directamente
-- (requiere mapeo de AgentStepId → ExecutionStep.Id para datos existentes)

-- 3. Eliminar tablas catálogo
ALTER TABLE AgentStep DROP CONSTRAINT FK_AgentStep_StepCatalog;
ALTER TABLE AgentStep DROP CONSTRAINT FK_AgentStep_Agent;
DROP TABLE AgentStep;
DROP TABLE StepCatalog;
```

### 12.7 Cambios en API (functions.ts) necesarios

La query actual de detalle de ejecución:
```sql
FROM ExecutionStep es
JOIN AgentStep ast ON es.AgentStepId = ast.Id
JOIN StepCatalog sc2 ON ast.StepId = sc2.Id
JOIN StatusCatalog scs ON es.StatusId = scs.Id
```

Se simplificaría a:
```sql
FROM ExecutionStep es
WHERE es.ExecutionId = @id
ORDER BY es.StepOrder
```

Y el subquery de `stepCount` en la lista de ejecuciones se mantendría igual ya que solo hace `COUNT(*) FROM ExecutionStep`.

### 12.8 Resumen del estado post-cambio

| | Antes | Después (Opción B) |
|---|---|---|
| Tablas de steps | 3 (StepCatalog, AgentStep, ExecutionStep) | 1 (ExecutionStep simplificada) |
| JOINs para steps | 4 (ExecutionStep→AgentStep→StepCatalog + StatusCatalog) | 0 |
| Definición de pasos | Central en BD (catálogo) | Definida por cada agente al reportar |
| Mantenimiento | Requiere sync DB ↔ agente | Agente es la fuente de verdad |
| Total tablas BD | 14 | 12 |

> **NOTA**: Este análisis es solo exploratorio. No se ha realizado ninguna implementación. Los cambios se ejecutarán cuando se decida avanzar con el Write API.
