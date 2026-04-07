# Auditoría de Seguridad — Agent AI Services Dashboard

**Fecha:** 27 de marzo de 2026  
**Proyecto:** Agent AI Services Dashboard  
**Stack:** React 19 + TypeScript + Vite 6 + Azure Functions v4 + Azure SQL + Azure Blob Storage  
**Auditor:** GitHub Copilot (Claude Opus 4.6)

---

## Índice

1. [Vulnerabilidades Críticas](#1-vulnerabilidades-críticas)
2. [Vulnerabilidades Medias](#2-vulnerabilidades-medias)
3. [Vulnerabilidades Bajas](#3-vulnerabilidades-bajas)
4. [Resumen de Acciones Propuestas](#4-resumen-de-acciones-propuestas)

---

## 1. Vulnerabilidades Críticas

### 1.1 Contraseñas almacenadas en texto plano (sin hash)

| Campo | Detalle |
|-------|---------|
| **Severidad** | CRÍTICA |
| **Archivos** | `api/src/admin.ts` (líneas 41, 187, 232) |
| **OWASP** | A02:2021 — Cryptographic Failures |

**Descripción:**  
La tabla `AppUser` almacena las contraseñas en texto plano. El endpoint de login realiza una comparación directa:

```typescript
if (user.Password !== body.password) return json({ error: 'Invalid credentials' }, 401)
```

Al crear usuarios, la contraseña se inserta tal cual en la base de datos:

```typescript
{ name: 'password', type: TYPES.NVarChar, value: body.password }
```

**Impacto:**  
Si un atacante obtiene acceso a la base de datos (SQL injection, backup filtrado, acceso interno), obtiene todas las contraseñas en claro de todos los usuarios.

**Solución propuesta:**  
- Instalar `bcrypt` en el proyecto API
- Hashear contraseñas con `bcrypt.hash(password, 12)` al crear/actualizar usuarios
- Comparar con `bcrypt.compare(password, hash)` en el login
- Migrar contraseñas existentes con un script de one-time migration

---

### 1.2 Endpoints de administración sin autenticación

| Campo | Detalle |
|-------|---------|
| **Severidad** | CRÍTICA |
| **Archivos** | `api/src/admin.ts` (todos los endpoints `mgmt/*`) |
| **OWASP** | A01:2021 — Broken Access Control |

**Descripción:**  
Todos los endpoints de gestión de usuarios y grupos usan `authLevel: 'anonymous'` y **no verifican ningún token ni sesión**:

- `GET /api/mgmt/users` — Lista todos los usuarios y sus permisos
- `POST /api/mgmt/users` — Crea usuarios (incluso admin)
- `PUT /api/mgmt/users/{id}` — Modifica cualquier usuario
- `PUT /api/mgmt/users/{id}/groups` — Cambia los grupos de cualquier usuario
- `PUT /api/mgmt/users/{id}/agents` — Cambia los permisos de agentes de cualquier usuario
- `GET /api/mgmt/groups` — Lista todos los grupos
- `POST /api/mgmt/groups` — Crea grupos
- `PUT /api/mgmt/groups/{id}` — Modifica cualquier grupo
- `PUT /api/mgmt/groups/{id}/agents` — Cambia los agentes de cualquier grupo

**Impacto:**  
Cualquiera con acceso a la URL puede obtener control total de la aplicación: crear usuarios admin, modificar permisos, desactivar cuentas.

**Solución propuesta:**  
- Crear un middleware `requireAdmin(req)` que:
  1. Extraiga el header `x-ms-client-principal`
  2. Decodifique y valide el usuario
  3. Verifique que `isAdmin === true`
- Aplicar este middleware a todos los endpoints `mgmt/*`

---

### 1.3 Endpoints de API keys sin autenticación

| Campo | Detalle |
|-------|---------|
| **Severidad** | CRÍTICA |
| **Archivos** | `api/src/write-api.ts` — endpoints `mgmt/api-keys` |
| **OWASP** | A01:2021 — Broken Access Control |

**Descripción:**  
Los endpoints de gestión de API keys no tienen protección alguna:

- `POST /api/mgmt/api-keys` — Cualquiera puede crear API keys para cualquier agente
- `GET /api/mgmt/api-keys` — Cualquiera puede listar todas las keys (prefijos + metadata)
- `DELETE /api/mgmt/api-keys/{id}` — Cualquiera puede revocar keys

**Impacto:**  
Un atacante puede generar API keys válidas y luego inyectar ejecuciones falsas en cualquier agente, o revocar keys legítimas causando una denegación de servicio.

**Solución propuesta:**  
Proteger con el mismo middleware `requireAdmin(req)` que los endpoints de usuarios/grupos.

---

### 1.4 Endpoints de lectura (dashboard) sin autenticación en backend

| Campo | Detalle |
|-------|---------|
| **Severidad** | CRÍTICA |
| **Archivos** | `api/src/functions.ts` |
| **OWASP** | A01:2021 — Broken Access Control |

**Descripción:**  
Los endpoints GET de datos no verifican la identidad del usuario en el backend:

- `GET /api/dashboard/stats`
- `GET /api/agents`
- `GET /api/agents-summary`
- `GET /api/agents/{id}`
- `GET /api/executions`
- `GET /api/executions/{id}`
- `GET /api/files/sas`

El frontend envía `x-ms-client-principal` en los headers, pero **el backend lo ignora completamente** — no aparece el string `x-ms-client-principal` en ningún archivo del backend.

El filtrado por permisos se implementa **solo en el frontend** (enviando `agentIds`, `fullAgentIds`, `ownAgentIds` como query params), lo que significa que cualquiera puede saltarse las restricciones simplemente no enviando esos parámetros o manipulándolos.

**Impacto:**  
Acceso total a datos de todos los agentes, ejecuciones y archivos sin autenticarse.

**Solución propuesta:**  
- Crear un middleware `requireAuth(req)` que:
  1. Extraiga y decodifique `x-ms-client-principal`
  2. Consulte la BD para obtener el usuario y sus permisos
  3. Retorne el objeto usuario con `isAdmin` y `agentAccess`
- Aplicar filtros de visibilidad **server-side** basados en los permisos reales del usuario, ignorando los parámetros de filtro del frontend

---

### 1.5 Secretos en `local.settings.json`

| Campo | Detalle |
|-------|---------|
| **Severidad** | CRÍTICA (si se filtra) |
| **Archivos** | `api/local.settings.json` |
| **OWASP** | A02:2021 — Cryptographic Failures |

**Descripción:**  
El archivo contiene en texto plano:

| Variable | Valor |
|----------|-------|
| `SQL_PASSWORD` | `AgentAI2026!Secure#` |
| `AZURE_STORAGE_KEY` | `6Iirchcru5Hn4r1N9d5l5eTO...` (96 caracteres) |
| `SQL_USER` | `sqladmin` |

El archivo está listado en `.gitignore` (correcto), pero es necesario verificar que:
1. No se pusheó accidentalmente en algún commit anterior
2. En producción estos valores están en **Application Settings** de Azure SWA, no hardcodeados

**Impacto:**  
Si el archivo se filtró en algún momento, las credenciales están comprometidas.

**Solución propuesta:**  
- Verificar historial de git: `git log --all --diff-filter=A -- api/local.settings.json`
- En producción, migrar a **Azure Key Vault references** para mayor seguridad
- Rotar las credenciales si se detecta exposición

---

## 2. Vulnerabilidades Medias

### 2.1 SQL Injection parcial por interpolación de strings

| Campo | Detalle |
|-------|---------|
| **Severidad** | MEDIA |
| **Archivos** | `api/src/functions.ts` (múltiples ubicaciones) |
| **OWASP** | A03:2021 — Injection |

**Descripción:**  
Aunque los IDs pasan por `parseAgentIds()` que valida enteros positivos, varias consultas se construyen con interpolación de strings:

```typescript
// buildVisibilityFilter()
WHERE e.AgentId IN (${fullIds.join(',')})

// buildAgentListFilter()
WHERE Id IN (${allIds.join(',')})

// executions endpoint — input/output summary
WHERE i.ExecutionId IN (${idList})
```

**Impacto:**  
Bajo actualmente gracias a la validación previa, pero viola las mejores prácticas y es frágil ante refactorizaciones futuras. Si se modifica `parseAgentIds()` o se reutiliza el patrón sin validación, se introduce una vulnerabilidad directa de SQL injection.

**Solución propuesta:**  
Usar parámetros numerados para todas las cláusulas IN:

```typescript
const placeholders = ids.map((_, i) => `@agentId${i}`)
const params = ids.map((id, i) => ({ name: `agentId${i}`, type: TYPES.BigInt, value: id }))
const sql = `WHERE e.AgentId IN (${placeholders.join(',')})`
```

---

### 2.2 Sin límite de tamaño en uploads base64

| Campo | Detalle |
|-------|---------|
| **Severidad** | MEDIA |
| **Archivos** | `api/src/write-api.ts` — `executionStart` y `executionFinish` |
| **OWASP** | A04:2021 — Insecure Design |

**Descripción:**  
El campo `fileContent` (base64) se decodifica y sube sin verificar tamaño:

```typescript
Buffer.from(input.fileContent, 'base64')
```

No hay validación de:
- Tamaño máximo del base64 string
- Tamaño máximo del archivo decodificado
- Número máximo de archivos por request

**Impacto:**  
Un atacante con una API key válida puede enviar payloads enormes → DoS por consumo de memoria del servidor y espacio de almacenamiento.

**Solución propuesta:**  
Validar tamaño máximo antes de decodificar:

```typescript
const MAX_FILE_SIZE_B64 = 50 * 1024 * 1024 * 1.37 // ~50MB en base64
if (input.fileContent.length > MAX_FILE_SIZE_B64) {
  return json({ error: 'File too large (max 50MB)' }, 413)
}
```

---

### 2.3 Sin cabeceras de seguridad HTTP

| Campo | Detalle |
|-------|---------|
| **Severidad** | MEDIA |
| **Archivos** | `staticwebapp.config.json` |
| **OWASP** | A05:2021 — Security Misconfiguration |

**Descripción:**  
El archivo de configuración no define cabeceras de seguridad HTTP. Faltan:

| Cabecera | Valor recomendado | Propósito |
|----------|-------------------|-----------|
| `X-Content-Type-Options` | `nosniff` | Evita MIME sniffing |
| `X-Frame-Options` | `DENY` | Previene clickjacking |
| `Content-Security-Policy` | `default-src 'self'; ...` | Previene XSS, inyección de scripts |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | Fuerza HTTPS |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Controla información de referrer |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | Restringe APIs del navegador |

**Impacto:**  
La aplicación es vulnerable a clickjacking, MIME sniffing y no tiene protección HSTS.

**Solución propuesta:**  
Añadir `globalHeaders` en `staticwebapp.config.json`:

```json
{
  "globalHeaders": {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: https://*.blob.core.windows.net; connect-src 'self' https://*.blob.core.windows.net",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
  }
}
```

---

### 2.4 Login sin rate limiting ni protección contra fuerza bruta

| Campo | Detalle |
|-------|---------|
| **Severidad** | MEDIA |
| **Archivos** | `api/src/admin.ts` — endpoint `POST /api/auth/login` |
| **OWASP** | A07:2021 — Identification and Authentication Failures |

**Descripción:**  
No hay:
- Límite de intentos de login fallidos
- Bloqueo temporal de cuenta
- CAPTCHA o delay exponencial
- Registro de intentos fallidos para monitorización

**Impacto:**  
Un atacante puede probar contraseñas indefinidamente contra el endpoint de login.

**Solución propuesta:**  
Implementar una tabla `LoginAttempt` o un mecanismo en memoria que:
- Cuente intentos fallidos por email/IP
- Bloquee la cuenta tras 5 intentos fallidos durante 15 minutos
- Devuelva el mismo error genérico "Invalid credentials" para no revelar si el email existe

---

### 2.5 Autorización de acceso a archivos solo por existencia en DB

| Campo | Detalle |
|-------|---------|
| **Severidad** | MEDIA |
| **Archivos** | `api/src/functions.ts` — endpoint `fileSas` |
| **OWASP** | A01:2021 — Broken Access Control |

**Descripción:**  
El endpoint `/api/files/sas` solo verifica que el `path` del blob exista en las tablas `Input` u `Output`, no que el usuario tenga permiso sobre la ejecución a la que pertenece ese archivo.

```sql
SELECT TOP 1 StorageProvider AS providerCode
FROM (
  SELECT StorageProvider FROM Input WHERE FilePath = @path
  UNION ALL
  SELECT StorageProvider FROM Output WHERE FilePath = @path
) f
```

**Impacto:**  
Cualquier usuario (o no autenticado, dado que no hay auth) puede descargar archivos de cualquier agente/ejecución si conoce o adivina el blob path.

**Solución propuesta:**  
- Verificar la identidad del usuario (auth middleware)
- JOIN con `Execution` para obtener el `AgentId`
- Verificar que el usuario tiene acceso a ese agente

---

### 2.6 Sanitización incompleta de `downloadName` en Content-Disposition

| Campo | Detalle |
|-------|---------|
| **Severidad** | MEDIA |
| **Archivos** | `api/src/storage.ts` (línea 33) |
| **OWASP** | A03:2021 — Injection |

**Descripción:**  
El parámetro `downloadName` se inyecta directamente en la cabecera `Content-Disposition`:

```typescript
contentDisposition = downloadName
  ? `attachment; filename="${downloadName}"`
  : 'attachment'
```

Si `downloadName` contiene comillas dobles (`"`), saltos de línea (`\n`, `\r`), o caracteres especiales, podría causar header injection.

**Impacto:**  
Manipulación de cabeceras HTTP en la respuesta del blob storage.

**Solución propuesta:**  
Sanitizar `downloadName` antes de usarlo:

```typescript
const safeName = downloadName.replace(/["\\\/\n\r]/g, '_')
contentDisposition = `attachment; filename="${safeName}"`
```

---

## 3. Vulnerabilidades Bajas

### 3.1 Frontend expone credenciales demo en producción

| Campo | Detalle |
|-------|---------|
| **Severidad** | BAJA |
| **Archivos** | `src/pages/LoginPage.tsx` |
| **OWASP** | A07:2021 — Identification and Authentication Failures |

**Descripción:**  
La página de login muestra públicamente las credenciales demo:

```
admin@agentai.demo / demo123 — Full access
viewer@agentai.demo / demo123 — Restricted view
```

Si estos usuarios existen en la base de datos de producción, cualquiera puede acceder.

**Solución propuesta:**  
Condicionar la sección de demo credentials al modo desarrollo:

```typescript
{import.meta.env.DEV && (
  <div className="mt-4 ...">
    <p>Demo credentials</p>
    ...
  </div>
)}
```

---

### 3.2 Mensajes de error revelan implementación interna

| Campo | Detalle |
|-------|---------|
| **Severidad** | BAJA |
| **Archivos** | Varios endpoints en `api/src/` |
| **OWASP** | A04:2021 — Insecure Design |

**Descripción:**  
Algunos endpoints devuelven mensajes que revelan detalles internos:

- `"Storage provider 'X' is not supported for direct download"` — revela el nombre del proveedor
- `"Execution does not belong to this agent"` — confirma que la ejecución existe
- `"Email already exists"` — permite enumeración de emails
- Stack traces potenciales en errores 500

**Solución propuesta:**  
- Mensajes genéricos en producción para errores de autenticación y autorización
- Logging detallado solo server-side (ya usa `ctx.log()` / `ctx.error()`)
- Para errores 500, devolver siempre un mensaje genérico: `"Internal server error"`

---

### 3.3 Sesión almacenada en sessionStorage sin protección de integridad

| Campo | Detalle |
|-------|---------|
| **Severidad** | BAJA (contingente a las correcciones del backend) |
| **Archivos** | `src/auth/AuthProvider.tsx` |
| **OWASP** | A08:2021 — Software and Data Integrity Failures |

**Descripción:**  
El objeto `AuthUser` completo (incluyendo `isAdmin`, `agentAccess`) se guarda en `sessionStorage` sin firma ni verificación de integridad:

```typescript
sessionStorage.setItem('auth_user', JSON.stringify(userData))
```

Un usuario puede abrir DevTools y modificar:

```javascript
const user = JSON.parse(sessionStorage.getItem('auth_user'))
user.isAdmin = true
sessionStorage.setItem('auth_user', JSON.stringify(user))
```

**Impacto:**  
Escalación de privilegios en el frontend. Este impacto es **CRÍTICO** mientras el backend no valide permisos, pero se reduce a **BAJO** una vez que el backend implemente autenticación/autorización server-side.

**Solución propuesta:**  
- La corrección principal es validar permisos en el backend (ver 1.4)
- Opcionalmente, implementar JWT firmados por el backend en lugar de almacenar datos en bruto

---

## 4. Resumen de Acciones Propuestas

| # | Severidad | Acción | Archivos afectados |
|---|-----------|--------|--------------------|
| 1 | **CRÍTICA** | Implementar bcrypt para hash de contraseñas | `api/src/admin.ts`, `api/package.json` |
| 2 | **CRÍTICA** | Proteger endpoints `mgmt/*` con autenticación admin | `api/src/admin.ts`, `api/src/write-api.ts` |
| 3 | **CRÍTICA** | Verificar `x-ms-client-principal` en backend para endpoints de lectura | `api/src/functions.ts` |
| 4 | **CRÍTICA** | Validar permisos server-side en queries (no confiar en params del frontend) | `api/src/functions.ts` |
| 5 | **MEDIA** | Parametrizar todas las cláusulas IN (eliminar interpolación de strings) | `api/src/functions.ts` |
| 6 | **MEDIA** | Añadir cabeceras de seguridad HTTP | `staticwebapp.config.json` |
| 7 | **MEDIA** | Limitar tamaño de uploads base64 | `api/src/write-api.ts` |
| 8 | **MEDIA** | Rate limiting en login + bloqueo por intentos fallidos | `api/src/admin.ts` |
| 9 | **MEDIA** | Verificar permisos de usuario en endpoint `fileSas` | `api/src/functions.ts` |
| 10 | **MEDIA** | Sanitizar `downloadName` en Content-Disposition | `api/src/storage.ts` |
| 11 | **BAJA** | Ocultar credenciales demo en producción | `src/pages/LoginPage.tsx` |
| 12 | **BAJA** | Genéricos los mensajes de error en producción | Varios |
| 13 | **BAJA** | Firmar sesión con JWT (post backend auth) | `api/src/admin.ts`, `src/auth/AuthProvider.tsx` |

---

## Notas adicionales

- **`.gitignore` correcto:** `api/local.settings.json` está excluido del repositorio.
- **Write API (API keys):** Los endpoints de escritura (`/api/executions/start`, `/api/executions/{id}/steps`, `/api/executions/{id}/finish`) **sí validan API key** mediante `requireApiKey(req)` — esto es correcto.
- **Parameterización general:** La mayoría de queries usa parámetros correctamente (`@search`, `@status`, `@agentId`, `@dateFrom`, `@dateTo`, `@id`). Solo las cláusulas IN son problemáticas.
- **SAS URLs:** Expiran a 1 hora (`expiresOn.setHours(expiresOn.getHours() + 1)`) y son read-only (`BlobSASPermissions.parse('r')`) — esto es correcto.
- **Crypto polyfill:** Storage.ts aplica correctamente el polyfill de Web Crypto para Node.js 18.
