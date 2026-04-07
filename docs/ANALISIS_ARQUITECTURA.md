# Análisis Crítico: Dashboard de Agentes QualitaHub

## 1. Modelo de Datos Actual — Radiografía

### 1.1 Esquema resumido (10 tablas en `dbo`)

```
┌─────────────────────┐      ┌──────────────────┐      ┌──────────────────────┐
│      Agent           │      │   StepCatalog    │      │   StatusCatalog      │
│──────────────────────│      │──────────────────│      │──────────────────────│
│ Id (PK, bigint)      │      │ Id (PK, bigint)  │      │ Id (PK, bigint)      │
│ Code (nvarchar 50)   │      │ Code (nvarchar)  │      │ Code (nvarchar 50)   │
│ Name (nvarchar 50)   │      │ Name (nvarchar)  │      │ Name (nvarchar 50)   │
│ Description (MAX)    │      │ Type (nvarchar)  │      │ Description (MAX)    │
│ IsActive (bit)       │      │ Description (MAX)│      │ IsFinal (bit)        │
│ CreatedAt (datetime) │      │ IsGeneric (bit)  │      │ + auditoría           │
│ CreatedAtUtc (dt2)   │      │ + auditoría       │      └──────────────────────┘
│ CreatedBy, UpdatedBy │      └──────────────────┘
│ UpdatedAtUtc (dt2)   │
│ RowVersion           │
└─────────┬────────────┘
          │ 1:N
          ▼
┌─────────────────────────┐       ┌──────────────────────────────┐
│      AgentStep           │       │     Execution                 │
│─────────────────────────│       │──────────────────────────────│
│ Id (PK, bigint)          │◄──┐  │ Id (PK, bigint)               │
│ StepOrder (int)          │   │  │ StartTime (datetime)          │
│ IsEnabled (bit)          │   │  │ FinshTime (datetime) ⚠ TYPO  │
│ AgentId (FK→Agent)       │   │  │ SharepointFolderRelativePath  │
│ StepId (FK→StepCatalog)  │   │  │ AgentId (FK→Agent)            │
│ + auditoría               │   │  │ OverallStatus (FK→Status)     │
└──────────┬───────────────┘   │  │ + auditoría                    │
           │                   │  └──────────────┬────────────────┘
           │                   │                 │ 1:N
           │                   │                 ▼
           │                   │  ┌──────────────────────────────┐
           │                   │  │     ExecutionStep             │
           │                   └──│ AgentStepId (FK→AgentStep)   │
           │                      │ Id (PK, bigint)               │
           │                      │ StartTime, FinishTime         │
           │                      │ ErrorMessage (MAX)            │
           │                      │ DurationMs (bigint)           │
           │                      │ ExecutionId (FK→Execution)    │
           │                      │ StatusId (FK→StatusCatalog)   │
           │                      │ + auditoría                    │
           │                      └──────────────────────────────┘
           │
           │         ┌────────────────────────┐   ┌─────────────────────────────┐
           │         │     Input               │   │  StorageProviderCatalog     │
           │         │────────────────────────│   │─────────────────────────────│
           │         │ Id (PK, bigint)         │   │ Id (PK, bigint)             │
           │         │ FileName (MAX)          │   │ Code (nvarchar 50)          │
           │         │ MimeType (MAX)          │   │ Name (nvarchar 100)         │
           │         │ FilePath (MAX)          │   │ Description (nvarchar 255)  │
           │         │ ReceivedTime (datetime) │   │ IsActive (bit) DEFAULT 1    │
           │         │ ExecutionId (FK→Exec)   │   │ + auditoría                  │
           │         │ InputType (FK→DataType) │   └─────────────────────────────┘
           │         │ StorageProviderId (FK)  │
           │         │ + auditoría              │           ┌──────────────────┐
           │         └────────────────────────┘           │    DataType       │
           │                                              │──────────────────│
           │         ┌────────────────────────┐           │ Id (PK, bigint)  │
           │         │     Output              │           │ Code (nvarchar)  │
           │         │────────────────────────│           │ Name (nvarchar)  │
           │         │ Id (PK, bigint)         │           │ Description(MAX) │
           │         │ FileName (MAX)          │           │ + auditoría       │
           │         │ MimeType (MAX)          │           └──────────────────┘
           │         │ FilePath (MAX)          │
           │         │ CreatedAt (datetime)    │
           │         │ OutputType (FK→DataType)│
           │         │ ExecutionId (FK→Exec)   │
           └────────►│ GeneratedByAgentStepId  │
                     │ StorageProviderId (FK)  │
                     │ + auditoría              │
                     └────────────────────────┘
```

### 1.2 Foreign Keys (14 relaciones detectadas)

| FK | Tabla origen | Columna | Tabla destino |
|---|---|---|---|
| FK_AgentStep_Agent | AgentStep | AgentId | Agent |
| FK_AgentStep_StepCatalog | AgentStep | StepId | StepCatalog |
| FK_Execution_Agent | Execution | AgentId | Agent |
| FK_Execution_StatusCatalog | Execution | OverallStatus | StatusCatalog |
| FK_ExecutionStep_AgentStep | ExecutionStep | AgentStepId | AgentStep |
| FK_ExecutionStep_Execution | ExecutionStep | ExecutionId | Execution |
| FK_ExecutionStep_StatusCatalog | ExecutionStep | StatusId | StatusCatalog |
| FK_Input_Execution | Input | ExecutionId | Execution |
| FK_Input_DataType | Input | InputType | DataType |
| FK_Input_StorageProvider | Input | StorageProviderId | StorageProviderCatalog |
| FK_Output_Execution | Output | ExecutionId | Execution |
| FK_Output_AgentStep | Output | GeneratedByAgentStepId | AgentStep |
| FK_Output_DataType | Output | OutputType | DataType |
| FK_Output_StorageProvider | Output | StorageProviderId | StorageProviderCatalog |

### 1.3 Datos de catálogos actuales

**StatusCatalog:** PENDING, RUNNING, SUCCESS, FAILED, WARNING, SKIPPED
**DataType:** CSV, Excel, Email, Process Summary TXT
**StepCatalog:** INPUT_RECEIVED → INPUT_NORMALIZED → INPUT_PROCESSED → OUTPUT_GENERATED → OUTPUT_VALIDATED → CREATE_PROCESS_SUMMARY → OUTPUT_DELIVERED
**StorageProvider:** Solo SharePoint
**Agent:** Solo "Agente Cobros" (COBROS_001)
**Volumen actual:** 0 ejecuciones, 7 AgentSteps configurados

---

## 2. Crítica del Modelo de Datos

### 2.1 Problemas encontrados

| # | Severidad | Problema | Detalle |
|---|---|---|---|
| 1 | **ALTA** | `Execution.FinshTime` — Typo | Debería ser `FinishTime` (como sí está bien en `ExecutionStep`). Corregir ahora antes de que haya datos. |
| 2 | **ALTA** | Doble campo de fecha en `Agent` | Tiene `CreatedAt` (datetime) y `CreatedAtUtc` (datetime2). Es redundante y confuso. Eliminar `CreatedAt` y quedarse solo con `CreatedAtUtc`. |
| 3 | **ALTA** | Doble campo de fecha en `Output` | Mismo caso: tiene `CreatedAt` (datetime) y `CreatedAtUtc` (datetime2). |
| 4 | **MEDIA** | `Input` no se liga a un `ExecutionStep` | Input se liga directamente a `Execution` pero no al step que lo consumió. Si un agente tiene varios steps y quieres saber qué step procesó qué input, no puedes. |
| 5 | **MEDIA** | No hay campo `Content` / `Value` para datos en línea | Input/Output solo tienen FilePath (para archivos). Si un agente devuelve un JSON o string como resultado, no hay dónde guardarlo sin crear un archivo. Falta `ContentText (nvarchar MAX)` o `ContentJson (nvarchar MAX)`. |
| 6 | **MEDIA** | No hay tabla de `ExecutionLog` | No hay dónde guardar trazas de log textual (e.g., "Procesando fila 42", "API llamada a X"). Para un dashboard de monitorización esto es clave. |
| 7 | **MEDIA** | `MimeType` y `FileName` como `nvarchar(MAX)` | Un MimeType nunca supera 255 chars, un FileName raras veces supera 500. Usar MAX es innecesario y puede afectar rendimiento de índices. |
| 8 | **BAJA** | `Agent.Code` permite NULL | Si `Code` es un identificador de negocio (COBROS_001), debería ser NOT NULL + UNIQUE. |
| 9 | **BAJA** | No hay `UNIQUE` en `Agent.Code`, `StatusCatalog.Code`, etc. | Los campos Code de catálogos no tienen constraint UNIQUE. Riesgo de duplicidad. |
| 10 | **BAJA** | `bigint` para todas las PKs | Para 10K ejecuciones/mes (~120K/año), `int` sería suficiente para décadas. `bigint` no es un problema real, pero es sobredimensionado. |
| 11 | **BAJA** | No hay campo `TriggerSource` en Execution | No se sabe qué disparó la ejecución (manual, scheduler, API). Útil para el dashboard. |
| 12 | **BAJA** | No hay tabla de `User/Viewer` | Si la web va a tener más de un usuario de negocio, necesitas saber quién accede. Esto puede delegarse a Azure AD/Entra ID. |

### 2.2 Campos y tablas que faltan (recomendación)

```sql
-- 1. Corregir typo
EXEC sp_rename 'Execution.FinshTime', 'FinishTime', 'COLUMN';

-- 2. Tabla de logs por ejecución (ALTA prioridad para el dashboard)
CREATE TABLE dbo.ExecutionLog (
    Id          BIGINT IDENTITY(1,1) PRIMARY KEY,
    ExecutionId BIGINT NOT NULL REFERENCES Execution(Id),
    StepId      BIGINT NULL REFERENCES ExecutionStep(Id),
    LogLevel    NVARCHAR(20) NOT NULL, -- INFO, WARN, ERROR, DEBUG
    Message     NVARCHAR(MAX) NOT NULL,
    Timestamp   DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);

-- 3. Añadir campo para datos inline en Input/Output
ALTER TABLE Input  ADD ContentText NVARCHAR(MAX) NULL;
ALTER TABLE Output ADD ContentText NVARCHAR(MAX) NULL;

-- 4. Añadir campo origen del disparo en Execution
ALTER TABLE Execution ADD TriggerSource NVARCHAR(50) NULL; -- MANUAL, SCHEDULED, API, WEBHOOK

-- 5. Índice compuesto para el patrón más común del dashboard
CREATE INDEX IX_Execution_AgentId_StartTime 
    ON Execution(AgentId, StartTime DESC);

-- 6. UNIQUEs en catálogos
ALTER TABLE Agent ADD CONSTRAINT UQ_Agent_Code UNIQUE(Code);
ALTER TABLE StatusCatalog ADD CONSTRAINT UQ_Status_Code UNIQUE(Code);
ALTER TABLE StepCatalog ADD CONSTRAINT UQ_Step_Code UNIQUE(Code);
ALTER TABLE DataType ADD CONSTRAINT UQ_DataType_Code UNIQUE(Code);
```

### 2.3 Lo que está BIEN diseñado

- **Separación Agent/AgentStep/StepCatalog**: Permite reutilizar pasos entre agentes. Buen modelado.
- **StatusCatalog con IsFinal**: Muy bueno para saber si una ejecución terminó. El front puede filtrar por estados finales vs en curso.
- **StorageProviderCatalog**: Permite extender a Azure Blob, S3, etc. sin cambios en Input/Output.
- **RowVersion en todas las tablas**: Buena práctica para control de concurrencia optimista.
- **Índices en todas las FK**: Correctamente definidos. No falta ninguno.

---

## 3. ¿Es SQL Server la opción correcta?

### Volumen: ~10.000 ejecuciones/mes

| Métrica | Estimación a 12 meses |
|---|---|
| Execution | 120.000 filas |
| ExecutionStep (7 steps/exec) | 840.000 filas |
| Input (1-3/exec) | 360.000 filas |
| Output (1-3/exec) | 360.000 filas |
| ExecutionLog (si se añade, ~20/exec) | 2.400.000 filas |
| **Total estimado** | **~4 millones de filas/año** |

### Veredicto: SQL Server es CORRECTO para este caso

| Alternativa | ¿Merece la pena? | Motivo |
|---|---|---|
| **SQL Server (actual)** | **SÍ** | 4M filas/año es trivial. El modelo relacional encaja perfectamente (relaciones claras, joins predecibles, queries OLTP). Azure SQL Basic/S0 lo maneja sin despeinarse. |
| PostgreSQL (Azure) | Equivalente | Mismo coste, misma capacidad. No hay razón para migrar. |
| CosmosDB (NoSQL) | **NO** | Sobrecoste. El modelo es relacional puro. CosmosDB brilla con datos semi-estructurados o millones de escrituras/segundo. Aquí no aplica. |
| MongoDB | **NO** | Mismo argumento. Además, pierdes integridad referencial que ya tienes bien modelada. |
| SQLite (embebido) | **NO** | No funciona como backend de una web multiusuario en Azure. |

**Recomendación**: Mantener SQL Server. Tier **Azure SQL Database S0 (10 DTUs)** o **Basic (5 DTUs)** es suficiente para 10K ejecuciones/mes. Coste: ~$5-15/mes.

---

## 4. Arquitectura propuesta: Azure Static Web Apps + API + SQL

### 4.1 Stack recomendado

```
┌──────────────────────────────────────────────────────┐
│                  Azure Static Web App                 │
│                                                      │
│  ┌──────────────────┐    ┌─────────────────────────┐ │
│  │   FRONT END       │    │      BACK END (API)      │ │
│  │   React + TS      │    │  Azure Functions (Node)  │ │
│  │   Vite build      │    │  ó .NET Isolated         │ │
│  │                   │◄──►│                          │ │
│  │  Static hosting   │    │  /api/* (managed func.)  │ │
│  └──────────────────┘    └──────────┬──────────────┘ │
│                                      │                │
└──────────────────────────────────────┼───────────────┘
                                       │
                              ┌────────▼────────┐
                              │  Azure SQL DB    │
                              │  (S0 / Basic)    │
                              └─────────────────┘
```

**¿Por qué Azure Static Web Apps (SWA)?**
- Hosting estático gratuito (plan Free hasta 2 apps).
- Backend integrado via Azure Functions (sin necesidad de App Service aparte).
- Auth con Azure AD/Entra ID integrado nativamente.
- Custom domain + SSL gratis.
- CI/CD automático desde GitHub.

### 4.2 Estimación de costes mensuales

| Recurso | Tier | Coste/mes |
|---|---|---|
| Azure Static Web App | Free (o Standard $9) | $0–9 |
| Azure Functions (integradas en SWA) | Incluido en SWA | $0 |
| Azure SQL Database | Basic (5 DTU, 2GB) | ~$5 |
| Azure SQL Database *(si necesitas más)* | S0 (10 DTU, 250GB) | ~$15 |
| **Total estimado** | | **$5–24/mes** |

> Si el plan Free de SWA se queda corto (>2 custom domains, >0.5GB ancho de banda empresarial, staging environments), sube a Standard ($9/mes).

---

## 5. Plan Front End

### 5.1 Tecnología: React + TypeScript + Vite

Justificación: Ecosistema más grande, buena integración con SWA, componentes de dashboard abundantes.

### 5.2 Pantallas del dashboard

| Pantalla | Descripción | Queries principales |
|---|---|---|
| **Home / Dashboard General** | KPIs globales: total ejecuciones hoy, esta semana, % éxito, % error. Gráfico de tendencia. Selector de agente. | `Execution` + `StatusCatalog` agrupado por fecha y agente |
| **Lista de Ejecuciones** | Tabla paginada con filtros: agente, estado, rango de fechas. Columnas: ID, Agente, Inicio, Fin, Duración, Estado (badge color). | `Execution` JOIN `Agent` JOIN `StatusCatalog` |
| **Detalle de Ejecución** | Timeline visual de los steps (stepper). Cada paso muestra: nombre, estado, duración, error si hay. Inputs y outputs asociados con links de descarga. | `ExecutionStep` + `AgentStep` + `StepCatalog` + `Input` + `Output` |
| **Detalle de Agente** | Configuración: steps habilitados, descripción. Historial de ejecuciones. Tasa de éxito. | `Agent` + `AgentStep` + `Execution` |
| **Administración** *(futuro)* | CRUD de agentes, steps, catálogos. Solo para admin. | Todos los catálogos |

### 5.3 Bibliotecas recomendadas

| Necesidad | Librería | Motivo |
|---|---|---|
| UI Components | **shadcn/ui** + Tailwind | Ligero, customizable, sin vendor lock-in |
| Tablas | **TanStack Table** | Paginación server-side, sorting, filtros |
| Gráficos | **Recharts** | Simple, bien documentado, suficiente para KPIs |
| State/Fetching | **TanStack Query** | Cache, refetch automático, loading states |
| Router | **React Router v7** | Estándar |
| Auth | **@azure/msal-react** | Integración nativa con Entra ID |

---

## 6. Plan Back End (API)

### 6.1 Azure Functions (Node.js / TypeScript) integradas en SWA

Los endpoints van en `/api/*` y se despliegan automáticamente con la SWA.

### 6.2 Endpoints necesarios

| Método | Endpoint | Descripción |
|---|---|---|
| GET | `/api/agents` | Lista de agentes |
| GET | `/api/agents/{id}` | Detalle de agente con sus steps |
| GET | `/api/executions` | Lista paginada con filtros (?agentId, ?status, ?from, ?to, ?page, ?size) |
| GET | `/api/executions/{id}` | Detalle con steps, inputs, outputs |
| GET | `/api/executions/{id}/logs` | Logs de la ejecución (si se añade tabla ExecutionLog) |
| GET | `/api/dashboard/stats` | KPIs: total ejecuciones, por estado, tendencia por día |
| GET | `/api/catalogs/statuses` | Catálogo de estados |
| GET | `/api/catalogs/datatypes` | Catálogo de tipos de datos |

### 6.3 Acceso a datos

| Opción | Recomendación |
|---|---|
| **ORM completo (Prisma / TypeORM)** | Excesivo para consultas de lectura + Functions |
| **Query builder (Knex.js)** | Buen equilibrio: tipado + control SQL |
| **Driver directo (mssql/tedious)** | Más rendimiento, menos abstracción. Recomendado para Functions que son stateless |

**Mi recomendación**: usar el paquete **`mssql`** (tedious) directamente con queries parametrizadas. Es el más ligero para cold starts de Azure Functions.

### 6.4 Autenticación

Azure Static Web Apps tiene autenticación integrada con Entra ID (Azure AD). Se configura en `staticwebapp.config.json`:

```json
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
    { "route": "/api/*", "allowedRoles": ["authenticated"] }
  ]
}
```

---

## 7. Resumen de decisiones clave

| Decisión | Veredicto |
|---|---|
| **SQL Server como BD** | ✅ Mantener. Volumen trivial para SQL relacional. |
| **Azure Static Web App** | ✅ Mejor opción calidad/precio para front + API. |
| **React + TS para front** | ✅ Ecosistema maduro, buena integración. |
| **Azure Functions para API** | ✅ Integrado en SWA, sin coste extra. |
| **CosmosDB / NoSQL** | ❌ Sin justificación. Los datos son relacionales puros. |
| **App Service separado** | ❌ Sobrecoste sin valor. SWA con Functions cubre todo. |
| **Coste mensual total** | **$5–24/mes** dependiendo del tier SQL |

---

## 8. Próximos pasos recomendados

1. **Corregir el modelo de datos** (typo FinshTime, eliminar campos duplicados CreatedAt, añadir UNIQUEs)
2. **Añadir tabla ExecutionLog** para trazas
3. **Crear la SWA** con GitHub Actions CI/CD
4. **Scaffold del front** con Vite + React + TS + Tailwind + shadcn
5. **Implementar API Functions** empezando por GET /api/executions y /api/dashboard/stats
6. **Configurar Entra ID** para auth
7. **Testing con datos simulados** antes de conectar agentes reales
