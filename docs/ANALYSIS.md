# Agent AI Services — Análisis Exhaustivo y Roadmap

> Fecha: 19 de marzo de 2026  
> Versión actual: v1.0 (MVP)

---

## 1. Resumen de la Solución Actual

El dashboard de **Agent AI Services** es una aplicación de monitorización que permite visualizar y explorar las ejecuciones de agentes de IA. Arquitectura:

| Capa | Tecnología |
|------|-----------|
| Frontend | React 19 + TypeScript 5.7 + Vite 6 + Tailwind CSS 3 |
| API | Azure Functions v4 (Node.js 20) + tedious (SQL raw) |
| Base de datos | Azure SQL (SQL Server) — Basic tier, 5 DTU |
| Storage | Azure Blob Storage (`staaservicesqhub`) |
| Hosting | Azure Static Web Apps |
| Autenticación | Simulada (demo users hardcoded) |

---

## 2. Modelo de Datos Actual

### 2.1 Diagrama de Tablas

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   StepCatalog    │     │  StatusCatalog    │     │    DataType      │
│──────────────────│     │──────────────────│     │──────────────────│
│ Id (PK)          │     │ Id (PK)          │     │ Id (PK)          │
│ Code             │     │ Code             │     │ Code             │
│ Name             │     │ Name             │     │ Name             │
│ Type             │     │ IsFinal          │     │ Description      │
│ IsGeneric        │     └────────┬─────────┘     └────────┬─────────┘
└────────┬─────────┘              │                        │
         │                        │                        │
         ▼                        │                        │
┌──────────────────┐     ┌────────┴─────────┐              │
│    AgentStep     │     │    Execution     │              │
│──────────────────│     │──────────────────│              │
│ Id (PK)          │     │ Id (PK)          │              │
│ StepOrder        │     │ ExecutionGuid    │              │
│ IsEnabled        │     │ StartTime        │              │
│ AgentId (FK)─────┼──┐  │ FinishTime       │              │
│ StepId (FK)──────┼──┘  │ TriggerSource    │              │
└────────┬─────────┘  │  │ InvokedBy        │              │
         │            │  │ AgentId (FK)─────┼──►Agent      │
         │            │  │ OverallStatus(FK)┼──►StatusCat  │
         │            │  └──┬──────┬────────┘              │
         │            │     │      │                       │
         │            │     │      │                       │
         │            │     ▼      │                       │
         │            │  ┌──────────────────┐              │
         │            │  │ ExecutionStep    │              │
         │            │  │──────────────────│              │
         │            │  │ Id (PK)          │              │
         │            │  │ StartTime        │              │
         │            │  │ FinishTime       │              │
         │            │  │ DurationMs       │              │
         │            │  │ ErrorMessage     │              │
         │            └──┤ ExecutionId (FK) │              │
         └───────────────┤ AgentStepId (FK) │              │
                         │ StatusId (FK)────┼──►StatusCat  │
                         └──────┬───────────┘              │
                                │                          │
                   ┌────────────┼────────────┐             │
                   ▼            │            ▼             │
          ┌────────────────┐    │   ┌────────────────┐     │
          │ ExecutionLog   │    │   │     Input      │     │
          │────────────────│    │   │────────────────│     │
          │ Id (PK)        │    │   │ Id (PK)        │     │
          │ LogLevel       │    │   │ FileName       │     │
          │ Message        │    │   │ MimeType       │     │
          │ Timestamp      │    │   │ FilePath       │     │
          │ ExecutionId(FK)│    │   │ ContentText    │     │
          │ StepId (FK)────┼────┘   │ ReceivedTime   │     │
          └────────────────┘        │ ExecutionId(FK)│     │
                                    │ InputType (FK)─┼─────┘
          ┌────────────────┐        │ StorageProv(FK)┼──►StorageProvCat
          │     Output     │        └────────────────┘
          │────────────────│
          │ Id (PK)        │   ┌─────────────────────┐
          │ FileName       │   │ StorageProviderCat  │
          │ MimeType       │   │─────────────────────│
          │ FilePath       │   │ Id (PK)             │
          │ ContentText    │   │ Code                │
          │ OutputType(FK)─┼──►│ Name                │
          │ ExecutionId(FK)│   │ IsActive             │
          │ GenByStepId(FK)│   └─────────────────────┘
          │ StorageProv(FK)│
          └────────────────┘   ┌─────────────────────┐
                               │  UserAgentAccess    │
┌──────────────────┐           │─────────────────────│
│      Agent       │           │ Id (PK)             │
│──────────────────│           │ UserObjectId        │
│ Id (PK)          │◄──────────┤ UserEmail           │
│ Code (AGT-XXXX)  │           │ AgentId (FK)        │
│ Name             │           └─────────────────────┘
│ Description      │
│ IsActive         │
└──────────────────┘
```

### 2.2 Volumen Actual de Datos

| Tabla | Registros | Descripción |
|-------|-----------|-------------|
| Agent | 3 | Cobros, Facturas, Inventario |
| AgentStep | 16 | Pasos configurados por agente |
| StepCatalog | 7 | Catálogo de tipos de paso |
| StatusCatalog | 6 | PENDING, RUNNING, SUCCESS, FAILED, WARNING, SKIPPED |
| DataType | 6 | CSV, Excel, Email, Process Summary TXT, JSON, PDF |
| StorageProviderCatalog | 2 | SHAREPOINT, AZURE_BLOB |
| Execution | 25 | Ejecuciones de prueba |
| ExecutionStep | 159 | ~6-7 pasos por ejecución |
| ExecutionLog | 312 | ~12 logs por ejecución |
| Input | 42 | ~2 inputs por ejecución |
| Output | 27 | ~1 output por ejecución |
| UserAgentAccess | 4 | 2 usuarios demo asignados |

### 2.3 Catálogos de Estado

| Id | Código | Nombre | Es Final |
|----|--------|--------|----------|
| 1 | PENDING | Pendiente | No |
| 2 | RUNNING | En ejecución | No |
| 3 | SUCCESS | Completado | Sí |
| 4 | FAILED | Error | Sí |
| 5 | WARNING | Advertencia | Sí |
| 6 | SKIPPED | Omitido | Sí |

---

## 3. Puntos de Optimización del Modelo de Datos

### 3.1 Indices Faltantes (PRIORIDAD ALTA)

Actualmente solo existen las Primary Keys (clustered index en `Id`). **Faltan índices no-clustered** en las columnas que se usan para filtrar y hacer JOINs:

```sql
-- Ejecuciones: filtro principal (fecha, agente, estado)
CREATE NONCLUSTERED INDEX IX_Execution_StartTime 
  ON Execution(StartTime DESC) INCLUDE (AgentId, OverallStatus);

CREATE NONCLUSTERED INDEX IX_Execution_AgentId 
  ON Execution(AgentId) INCLUDE (StartTime, OverallStatus);

-- Búsqueda por GUID (usado en URLs y display)
CREATE UNIQUE NONCLUSTERED INDEX UX_Execution_ExecutionGuid 
  ON Execution(ExecutionGuid);

-- Steps de una ejecución
CREATE NONCLUSTERED INDEX IX_ExecutionStep_ExecutionId 
  ON ExecutionStep(ExecutionId) INCLUDE (AgentStepId, StatusId);

-- Logs de una ejecución
CREATE NONCLUSTERED INDEX IX_ExecutionLog_ExecutionId 
  ON ExecutionLog(ExecutionId) INCLUDE (StepId, Timestamp);

-- Inputs/Outputs de una ejecución
CREATE NONCLUSTERED INDEX IX_Input_ExecutionId 
  ON Input(ExecutionId) INCLUDE (InputType, FileName);

CREATE NONCLUSTERED INDEX IX_Output_ExecutionId 
  ON [Output](ExecutionId) INCLUDE (OutputType, FileName);

-- Acceso de usuario a agentes
CREATE NONCLUSTERED INDEX IX_UserAgentAccess_UserEmail 
  ON UserAgentAccess(UserEmail) INCLUDE (AgentId);
```

**Impacto**: Con 25 ejecuciones el rendimiento es bueno, pero cuando haya miles de registros, las queries harán full table scans sin índices. El índice en `StartTime DESC` es especialmente crítico porque el listado de ejecuciones se ordena siempre por fecha.

### 3.2 Tipos de Datos — Ajustes Recomendados

| Tabla | Columna | Actual | Recomendado | Motivo |
|-------|---------|--------|-------------|--------|
| Execution | StartTime | `datetime` | `datetime2(3)` | Mayor precisión y rango, estándar moderno |
| Execution | FinishTime | `datetime` | `datetime2(3)` | Consistencia con audit columns |
| ExecutionStep | StartTime | `datetime` | `datetime2(3)` | Idem |
| ExecutionStep | FinishTime | `datetime` | `datetime2(3)` | Idem |
| ExecutionStep | DurationMs | `bigint` | `int` | Un `int` soporta ~24 días en ms, más que suficiente |
| Input | ReceivedTime | `datetime` | `datetime2(3)` | Consistencia |
| Agent | Code | `nvarchar(50)` | `nvarchar(20)` | Formato AGT-XXXX; 20 es más que suficiente |

> **Nota**: `datetime2` es el estándar recomendado por Microsoft. `datetime` tiene resolución de 3.33ms y rango menor.

### 3.3 Tablas de Catálogo — Sin Tabla de Roles

El modelo actual no tiene una tabla de roles. La autenticación está hardcoded en el frontend. Para producción se necesita:

```sql
CREATE TABLE [Role] (
    Id          BIGINT IDENTITY(1,1) PRIMARY KEY,
    Code        NVARCHAR(50) NOT NULL UNIQUE,  -- 'ADMIN', 'VIEWER', 'OPERATOR'
    Name        NVARCHAR(100) NOT NULL,
    Description NVARCHAR(500),
    CreatedAtUtc DATETIME2 NOT NULL DEFAULT GETUTCDATE()
);

CREATE TABLE [User] (
    Id            BIGINT IDENTITY(1,1) PRIMARY KEY,
    ObjectId      NVARCHAR(100) NOT NULL UNIQUE,  -- Entra ID Object ID
    Email         NVARCHAR(200) NOT NULL,
    DisplayName   NVARCHAR(200),
    RoleId        BIGINT NOT NULL REFERENCES [Role](Id),
    IsActive      BIT NOT NULL DEFAULT 1,
    LastLoginUtc  DATETIME2,
    CreatedAtUtc  DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    CreatedBy     NVARCHAR(100),
    UpdatedAtUtc  DATETIME2,
    UpdatedBy     NVARCHAR(100)
);
```

### 3.4 Tabla UserAgentAccess — Evolución

La tabla `UserAgentAccess` actual es un buen punto de partida pero necesita:

1. **FK a tabla User** en lugar de almacenar `UserEmail` y `UserObjectId` directamente
2. **Columna de permisos** para distinguir niveles de acceso por agente
3. **Unique constraint** en `(UserId, AgentId)` para evitar duplicados

```sql
-- Evolución propuesta
CREATE TABLE UserAgentAccess (
    Id          BIGINT IDENTITY(1,1) PRIMARY KEY,
    UserId      BIGINT NOT NULL REFERENCES [User](Id),
    AgentId     BIGINT NOT NULL REFERENCES Agent(Id),
    AccessLevel NVARCHAR(20) NOT NULL DEFAULT 'VIEW',  -- 'VIEW', 'MANAGE'
    GrantedBy   NVARCHAR(100),
    CreatedAtUtc DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    CONSTRAINT UQ_UserAgentAccess UNIQUE (UserId, AgentId)
);
```

### 3.5 Agent — Campos Adicionales Recomendados

La tabla `Agent` tiene campos `NULL` para futuro uso pero faltan algunos útiles:

```sql
ALTER TABLE Agent ADD
    CategoryId    BIGINT NULL,          -- FK a futura tabla AgentCategory
    Version       NVARCHAR(20) NULL,    -- Semver: "1.0.0"
    ConfigJson    NVARCHAR(MAX) NULL,   -- Configuración JSON del agente
    OwnerEmail    NVARCHAR(200) NULL,   -- Responsable del agente
    MaxConcurrent INT NULL DEFAULT 1;   -- Máx ejecuciones simultáneas
```

### 3.6 Execution — Campo ErrorMessage Faltante

En la API se devuelve `errorMessage: null` hardcoded. La tabla `Execution` no tiene esta columna. Se debería añadir:

```sql
ALTER TABLE Execution ADD ErrorMessage NVARCHAR(MAX) NULL;
```

Esto simplifica enormemente mostrar el error general de una ejecución fallida sin tener que recorrer los logs.

### 3.7 Auditoría — Inconsistencias

- La tabla `ExecutionLog` **no tiene** columnas de auditoría (`CreatedBy`, `UpdatedAtUtc`, `RowVersion`)
- La tabla `UserAgentAccess` **no tiene** `UpdatedAtUtc`, `UpdatedBy`, `RowVersion`
- Columnas `CreatedBy`/`UpdatedBy` almacenan texto libre; deberían sincronizarse con los usuarios reales del sistema

---

## 4. Optimizaciones de la API

### 4.1 Problema N+1 en Listado de Ejecuciones

El endpoint `GET /api/executions` ejecuta **4 queries por request**:

1. `COUNT(*)` para el total
2. `SELECT` principal con paginación
3. `SELECT` de inputs para todos los IDs
4. `SELECT` de outputs para todos los IDs
5. `SELECT` de logs para todos los IDs

**Optimización propuesta**: Usar CTEs o consolidar en menos queries.

```sql
-- Una sola query con counts embebidos (elimina queries 3, 4, 5 del count)
WITH ExecPage AS (
    SELECT e.Id, ...
    FROM Execution e
    JOIN Agent a ON ...
    WHERE ...
    ORDER BY e.StartTime DESC
    OFFSET @offset ROWS FETCH NEXT @pageSize ROWS ONLY
)
SELECT ep.*, 
    (SELECT COUNT(*) OVER() FROM Execution e WHERE ...) AS TotalCount
FROM ExecPage ep
```

### 4.2 SQL Injection Parcial en IN Clause

Las queries de inputs/outputs/logs construyen la lista de IDs así:

```typescript
const idList = execIds.join(',')  // "1,2,3,4,5"
`WHERE i.ExecutionId IN (${idList})`
```

Aunque los `execIds` provienen del resultado de una query anterior (no del usuario), esto es un **patrón a evitar**. Es preferible usar parámetros individuales o una TABLE-VALUED PARAMETER.

### 4.3 Connection Pooling

El modelo actual crea una nueva conexión TCP por cada query y la cierra al terminar. Con carga alta esto es ineficiente. Opciones:

- Implementar un pool de conexiones con `tedious-connection-pool` o `tarn.js`
- Migrar a un ORM ligero como `kysely` (type-safe SQL builder) que maneja pools internamente
- O al menos reutilizar la conexión dentro de un mismo request

### 4.4 Respuesta del Listado — Demasiado Pesada

Cada ejecución en la lista incluye arrays completos de `inputs[]`, `outputs[]` y `logs[]`. Con 20 ejecuciones de 10+ logs cada una, la respuesta puede ser muy grande.

**Recomendación**: En el listado devolver solo los counts. Cargar inputs/outputs/logs bajo demanda cuando el usuario abre el modal.

---

## 5. Optimizaciones del Frontend

### 5.1 Bundle Size

El bundle actual es de **762 KB** (217 KB gzip). El principal contribuidor es `recharts`. Opciones:

- Usar `react-chartjs-2` (más ligero) o importación lazy de recharts
- Code splitting con `React.lazy()` para las páginas
- Separar vendor chunks en la configuración de Vite

### 5.2 Debounce en Búsqueda

El campo de búsqueda dispara una query en cada keypress. Falta un `debounce` de 300-500ms para reducir llamadas a la API.

### 5.3 Almacenamiento de Autenticación

La sesión se guarda en `sessionStorage` como JSON plano. En producción con Entra ID:

- Usar `@azure/msal-react` para tokens OAuth 2.0
- Los tokens deben manejarse por MSAL (no manualmente en storage)
- El header `x-ms-client-principal` lo genera Azure SWA automáticamente con Entra ID configurado

---

## 6. Seguridad — Estado Actual y Gaps

| Aspecto | Estado | Riesgo | Acción |
|---------|--------|--------|--------|
| Autenticación | Simulada (demo123) | ALTO | Integrar Microsoft Entra ID |
| Autorización API | Sin validación | ALTO | Middleware que valide `x-ms-client-principal` |
| Roles | No implementados | MEDIO | Tabla Role + User + validación por endpoint |
| Acceso por agente | Tabla existe, no se usa | MEDIO | Filtrar ejecuciones según UserAgentAccess |
| SQL Injection | Parametrizado (bien) | BAJO | Corregir `IN (${idList})` |
| SAS URLs | 1h expiry, read-only | BAJO | Correcto para producción |
| CORS | Manejado por SWA | BAJO | Correcto |
| HTTPS | Forzado por SWA | BAJO | Correcto |

---

## 7. Roadmap de Siguientes Pasos

### Fase 2A: Autenticación Real con Microsoft Entra ID

**Objetivo**: Reemplazar la autenticación simulada por OAuth 2.0 real.

**Pasos**:

1. **Registrar la app en Entra ID** (Azure Portal > App Registrations)
   - Tipo: SPA (Single Page Application)
   - Redirect URI: `https://salmon-field-0cfd11603.4.azurestaticapps.net/.auth/login/aad/callback`

2. **Configurar SWA Authentication**
   ```json
   // staticwebapp.config.json
   {
     "auth": {
       "identityProviders": {
         "azureActiveDirectory": {
           "registration": {
             "openIdIssuer": "https://login.microsoftonline.com/<TENANT_ID>/v2.0",
             "clientIdSettingName": "AAD_CLIENT_ID",
             "clientSecretSettingName": "AAD_CLIENT_SECRET"
           }
         }
       }
     },
     "routes": [
       { "route": "/api/*", "allowedRoles": ["authenticated"] },
       { "route": "/login", "allowedRoles": ["anonymous"] }
     ]
   }
   ```

3. **Definir App Roles** en el manifiesto de la app:
   ```json
   "appRoles": [
     { "value": "Admin", "displayName": "Administrator" },
     { "value": "Viewer", "displayName": "Viewer" },
     { "value": "Operator", "displayName": "Operator" }
   ]
   ```

4. **Actualizar el frontend**:
   - Eliminar `src/auth/AuthProvider.tsx` simulado
   - Leer `/.auth/me` para obtener datos del usuario autenticado
   - Los roles vienen en `clientPrincipal.userRoles`

5. **Actualizar la API**:
   - Azure SWA inyecta automáticamente el header `x-ms-client-principal`
   - Decodificar el header para obtener email y roles
   - Validar roles antes de procesar cada request

### Fase 2B: Gestión de Usuarios y Roles

**Objetivo**: Panel de administración para gestionar usuarios, roles y permisos.

**Modelo de datos propuesto**:

```
┌─────────────┐      ┌───────────────┐      ┌────────────┐
│    Role     │      │     User      │      │   Agent    │
│─────────────│      │───────────────│      │────────────│
│ Id (PK)     │◄─────┤ RoleId (FK)   │      │ Id (PK)    │
│ Code        │      │ Id (PK)       │      │ Name       │
│ Name        │      │ ObjectId (UQ) │      └──────┬─────┘
│ Description │      │ Email         │             │
└─────────────┘      │ DisplayName   │             │
                     │ IsActive      │             │
    Roles:           │ LastLoginUtc  │             │
    ─ ADMIN          └───────┬───────┘             │
    ─ VIEWER                 │                     │
    ─ OPERATOR               ▼                     ▼
                     ┌──────────────────────────────┐
                     │      UserAgentAccess         │
                     │──────────────────────────────│
                     │ Id (PK)                      │
                     │ UserId (FK) ─► User          │
                     │ AgentId (FK) ─► Agent        │
                     │ AccessLevel (VIEW / MANAGE)  │
                     │ UQ(UserId, AgentId)           │
                     └──────────────────────────────┘
```

**Permisos por rol**:

| Permiso | ADMIN | OPERATOR | VIEWER |
|---------|-------|----------|--------|
| Ver dashboard global | Si | Si (solo sus agentes) | Si (solo sus agentes) |
| Ver ejecuciones | Todas | Solo sus agentes | Solo sus agentes |
| Ver detalle de ejecución | Todas | Solo sus agentes | Solo sus agentes |
| Descargar archivos | Si | Si | No |
| Gestionar usuarios | Si | No | No |
| Asignar agentes a usuarios | Si | No | No |
| Ver panel de administración | Si | No | No |

**Nuevos endpoints API**:

```
GET    /api/admin/users              → Lista de usuarios (solo ADMIN)
POST   /api/admin/users              → Crear usuario
PUT    /api/admin/users/{id}         → Actualizar usuario (rol, activo)
DELETE /api/admin/users/{id}         → Desactivar usuario

GET    /api/admin/users/{id}/agents  → Agentes asignados al usuario
POST   /api/admin/users/{id}/agents  → Asignar agente a usuario
DELETE /api/admin/users/{id}/agents/{agentId} → Desasignar agente

GET    /api/admin/roles              → Lista de roles
```

**Nuevas páginas frontend**:

| Ruta | Componente | Descripción |
|------|-----------|-------------|
| `/admin/users` | UsersPage | Tabla de usuarios con filtros, crear/editar |
| `/admin/users/:id` | UserDetailPage | Detalle + agentes asignados |
| `/agents` | AgentsPage | Lista de agentes a los que tiene acceso |

### Fase 2C: Filtrado por Acceso a Agentes

**Objetivo**: Que cada usuario solo vea los agentes y ejecuciones a los que tiene acceso.

**Cambios en la API**:

1. En cada endpoint, extraer el email del usuario autenticado
2. Si el rol es `ADMIN`, no filtrar
3. Si el rol es `VIEWER` u `OPERATOR`, añadir filtro:

```sql
-- Ejecutar antes de cada query
DECLARE @AllowedAgents TABLE (AgentId BIGINT);
INSERT INTO @AllowedAgents 
  SELECT AgentId FROM UserAgentAccess WHERE UserEmail = @currentUserEmail;

-- En la query de ejecuciones
WHERE e.AgentId IN (SELECT AgentId FROM @AllowedAgents)

-- En la query del dashboard
WHERE a.Id IN (SELECT AgentId FROM @AllowedAgents)
```

**Cambios en el frontend**:

- Si el usuario no es ADMIN, ocultar la sección de administración en el sidebar
- La lista de agentes se filtra automáticamente por la API
- Mostrar un badge "Sin acceso" si intenta navegar a un agente no autorizado

### Fase 3: Visualización de Agentes

**Objetivo**: Página dedicada para explorar los agentes disponibles.

**Diseño de la página `/agents`**:

```
┌─────────────────────────────────────────────────┐
│  Agents                                         │
│  Agents you have access to                      │
├─────────────────────────────────────────────────┤
│                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────┐│
│  │ 🤖 AGT-0001 │  │ 🤖 AGT-0002 │  │ 🤖 AGT- ││
│  │ Agente      │  │ Agente      │  │ Agente  ││
│  │ Cobros      │  │ Facturas    │  │ Invent. ││
│  │             │  │             │  │         ││
│  │ ■ Active    │  │ ■ Active    │  │ ■ Active││
│  │ 10 execs    │  │ 8 execs     │  │ 7 execs ││
│  │ 90% success │  │ 75% success │  │ 100%    ││
│  │             │  │             │  │         ││
│  │ Last exec:  │  │ Last exec:  │  │ Last:   ││
│  │ 2h ago      │  │ 1d ago      │  │ 3d ago  ││
│  └─────────────┘  └─────────────┘  └─────────┘│
│                                                 │
└─────────────────────────────────────────────────┘
```

Cada tarjeta de agente mostraría:
- Código y nombre
- Estado (activo/inactivo)
- Ejecuciones totales y tasa de éxito
- Última ejecución
- Botón para ver todas las ejecuciones del agente

---

## 8. Mejoras Adicionales Recomendadas

### 8.1 Escalabilidad de Base de Datos

| Aspecto | Actual | Recomendación |
|---------|--------|---------------|
| Tier | Basic (5 DTU) | Subir a S0 (10 DTU) cuando haya >1000 ejecuciones |
| Particionado | No hay | Particionar `ExecutionLog` por fecha cuando >100K registros |
| Archivado | No hay | Mover ejecuciones >90 días a tabla `ExecutionArchive` |
| Retención de logs | Ilimitada | Política de retención de 180 días para `ExecutionLog` |

### 8.2 Monitorización y Alertas

- **Application Insights**: Integrar para rastrear errores de API, latencia y uso
- **Alertas**: Configurar alertas en Azure Monitor para:
  - Tasa de error de ejecuciones >10%
  - Ejecuciones pendientes >30 minutos (posible hang)
  - Errores 500 en la API

### 8.3 Exportación de Datos

- Botón "Export to CSV" en la página de ejecuciones
- Exportación de logs filtrados
- Report automático semanal por email (Azure Logic App)

### 8.4 Notificaciones en Tiempo Real

Para ver ejecuciones en curso actualizándose:

- **Opción A**: Polling cada 30s con React Query `refetchInterval`
- **Opción B**: Azure SignalR Service para push real-time (más complejo pero mejor UX)

### 8.5 Multi-idioma

El modelo actual mezcla español e inglés (StatusCatalog names en español, UI en inglés). Definir una estrategia:

- **Opción A**: UI 100% en inglés, catálogos en inglés
- **Opción B**: i18n con `react-i18next`, catálogos con columna `NameEn`/`NameEs`

---

## 9. Resumen de Prioridades

| # | Acción | Esfuerzo | Impacto | Prioridad |
|---|--------|----------|---------|-----------|
| 1 | Crear índices en DB | Bajo | Alto | P0 |
| 2 | Integrar Microsoft Entra ID | Medio | Alto | P0 |
| 3 | Tabla User + Role | Bajo | Alto | P0 |
| 4 | Filtrado por UserAgentAccess | Medio | Alto | P1 |
| 5 | Panel admin usuarios | Medio | Alto | P1 |
| 6 | Página de agentes | Bajo | Medio | P1 |
| 7 | Añadir ErrorMessage a Execution | Bajo | Medio | P1 |
| 8 | Optimizar respuesta del listado | Bajo | Medio | P2 |
| 9 | Debounce en búsqueda | Bajo | Bajo | P2 |
| 10 | Migrar datetime → datetime2 | Bajo | Bajo | P2 |
| 11 | Connection pooling | Medio | Medio | P2 |
| 12 | Code splitting frontend | Bajo | Bajo | P2 |
| 13 | Application Insights | Medio | Alto | P2 |
| 14 | Exportación CSV | Bajo | Medio | P3 |
| 15 | Notificaciones real-time | Alto | Medio | P3 |
| 16 | Archivado de datos antiguos | Medio | Medio | P3 |

---

## 10. Conclusión

La solución actual cubre bien el MVP de monitorización. El modelo de datos es sólido y extensible. Los principales gaps están en:

1. **Autenticación y autorización** — Es la mejora más crítica para producción
2. **Rendimiento** — Los índices faltantes serán un problema al escalar
3. **Control de acceso por agente** — La tabla existe pero no se usa; activarla es clave para entornos multi-equipo

El roadmap propuesto permite avanzar de forma incremental: primero seguridad (Fase 2A/2B), luego control de acceso (Fase 2C) y finalmente funcionalidades avanzadas (Fase 3+).
