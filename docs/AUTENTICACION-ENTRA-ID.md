# Migración a Microsoft Entra ID — Login SSO

## Contexto

Análisis del login de [portalsolicitudes.qualitahub.com](https://portalsolicitudes.qualitahub.com/login) para replicar el mismo patrón de autenticación SSO en nuestra app **Agent AI Services Dashboard**.

---

## Cómo funciona el login de QualitaHUB

- **Framework**: React (SPA con `#root`), igual que el nuestro.
- **Método de autenticación**: **Azure Static Web Apps built-in auth** con Microsoft Entra ID.
- **No usa MSAL.js** ni ninguna librería de auth en el frontend.
- El botón "Continuar con Microsoft" navega a `/.auth/login/aad` (endpoint nativo de SWA).
- SWA redirige a `login.microsoftonline.com` con OAuth2 Authorization Code + ID Token flow.
- Tras autenticarse, SWA gestiona la cookie de sesión automáticamente.

### URL de autorización observada

```
https://login.microsoftonline.com/common/oauth2/v2.0/authorize
  ?response_type=code+id_token
  &redirect_uri=https://identity.6.azurestaticapps.net/.auth/login/aad/callback
  &client_id=d414ee2d-73e5-4e5b-bb16-03ef55fea597
  &scope=openid+profile+email
  &response_mode=form_post
```

### Diseño visual

- Fondo degradado azul oscuro.
- Card centrada con dos zonas:
  - **Superior** (fondo oscuro): Logo + "Bienvenido" + subtítulo.
  - **Inferior** (fondo claro): Texto invitando a usar cuenta corporativa + botón "Continuar con Microsoft" con icono de Windows + lista de funcionalidades + badge "Conexión segura mediante Microsoft Entra ID".
- Header con logo y nombre de app + botón "Iniciar sesión" en esquina superior derecha.
- Footer con copyright.

---

## Comparativa: QualitaHUB vs. Nuestra app actual

| Aspecto | QualitaHUB | Nuestra app (v1) |
|---|---|---|
| **Método** | SWA built-in auth (Entra ID) | Login con email/password contra BD |
| **Frontend** | Un botón que navega a `/.auth/login/aad` | Formulario email + password |
| **Backend auth** | SWA gestiona todo automáticamente | API `/api/auth/login` con consulta SQL |
| **Sesión** | Cookie segura gestionada por SWA | `sessionStorage` (se pierde al cerrar) |
| **User info** | `/.auth/me` endpoint (automático) | Objeto `AuthUser` devuelto por API |
| **Seguridad** | Token OAuth2 + cookie HttpOnly | Password en texto plano en BD |
| **Logout** | `/.auth/logout` | Limpia `sessionStorage` |

---

## Paso a paso para implementarlo

### 1. Registrar la App en Microsoft Entra ID

1. Ir a **Azure Portal > Microsoft Entra ID > App registrations > New registration**.
2. Configurar:
   - **Nombre**: `Agent AI Services Dashboard`
   - **Supported account types**: "Accounts in this organizational directory only" (single tenant) o "Accounts in any organizational directory" (multi-tenant) según necesidad.
   - **Redirect URI (Web)**: `https://salmon-field-0cfd11603.4.azurestaticapps.net/.auth/login/aad/callback`
3. Tras crear, anotar:
   - **Application (client) ID** → será `AAD_CLIENT_ID`
   - **Directory (tenant) ID** → será parte del issuer URL
4. Ir a **Certificates & secrets > New client secret**, crear uno y anotar el valor → será `AAD_CLIENT_SECRET`.
5. Ir a **Token configuration > Add optional claim > ID token** → añadir `email`, `preferred_username`, `name`.

### 2. Configurar variables de entorno en SWA

En **Azure Portal > Static Web Apps > `swa-agent-ai-services-qualitahub` > Configuration > Application settings**, añadir:

| Setting Name | Value |
|---|---|
| `AAD_CLIENT_ID` | El Client ID del App Registration |
| `AAD_CLIENT_SECRET` | El Client Secret generado |

### 3. Actualizar `staticwebapp.config.json`

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
    {
      "route": "/login",
      "allowedRoles": ["anonymous"]
    },
    {
      "route": "/.auth/**",
      "allowedRoles": ["anonymous"]
    },
    {
      "route": "/api/*",
      "allowedRoles": ["authenticated"]
    },
    {
      "route": "/*",
      "allowedRoles": ["authenticated"]
    }
  ],
  "responseOverrides": {
    "401": {
      "redirect": "/login",
      "statusCode": 302
    }
  },
  "navigationFallback": {
    "rewrite": "/index.html",
    "exclude": ["/api/*", "/.auth/**"]
  }
}
```

### 4. Cambios en el Frontend

#### 4.1. LoginPage — Reemplazar formulario por botón SSO

Eliminar el formulario de email/password y poner un único botón:

```tsx
// El botón simplemente navega al endpoint nativo de SWA
<a href="/.auth/login/aad?post_login_redirect_uri=/">
  <button className="btn-microsoft">
    <MicrosoftIcon />
    Continuar con Microsoft
  </button>
</a>
```

#### 4.2. AuthProvider — Usar `/.auth/me` en lugar de POST login

```tsx
// Obtener usuario autenticado
const res = await fetch('/.auth/me');
const data = await res.json();
const principal = data.clientPrincipal;

if (principal) {
  // principal.userDetails = email del usuario
  // principal.claims = [{typ: "name", val: "Raul Salinas"}, ...]
  const email = principal.userDetails;
  const name = principal.claims?.find(c => c.typ === 'name')?.val ?? email;

  // Buscar permisos en nuestra BD
  const perms = await fetch(`/api/auth/me?email=${encodeURIComponent(email)}`);
  const user = await perms.json();  // {id, isAdmin, groups, agentAccess}
}
```

#### 4.3. Logout

```tsx
const handleLogout = () => {
  window.location.href = '/.auth/logout?post_logout_redirect_uri=/login';
};
```

### 5. Nuevo endpoint API: `GET /api/auth/me`

Reemplaza el actual `POST /api/auth/login`. Recibe el email del usuario autenticado por Entra ID y devuelve sus permisos desde la BD:

```typescript
app.http('authMe', {
  methods: ['GET'],
  route: 'auth/me',
  authLevel: 'anonymous', // SWA ya validó la autenticación
  handler: async (req) => {
    const email = req.query.get('email');
    // Buscar en AppUser WHERE Email = @email AND IsActive = 1
    // Retornar: { id, email, name, isAdmin, groups, agentAccess }
  }
});
```

> **Nota**: En el contexto de SWA con `allowedRoles: ["authenticated"]`, el endpoint solo es accesible por usuarios que ya pasaron por Entra ID. Adicionalmente, SWA inyecta el header `x-ms-client-principal` con la info del usuario, que se puede validar server-side.

### 6. Datos del usuario via `x-ms-client-principal` (alternativa más segura)

En lugar de pasar el email por query param, SWA automáticamente inyecta un header en cada request a la API:

```typescript
const header = req.headers.get('x-ms-client-principal');
const principal = JSON.parse(Buffer.from(header, 'base64').toString('utf8'));
// principal.userDetails = email
// principal.userRoles = ["authenticated", "anonymous"]
```

Esta es la forma **recomendada** porque no depende de un parámetro que podría ser manipulado.

---

## Qué se elimina vs. qué se mantiene

### Se elimina

- Formulario de email/password en `LoginPage.tsx`
- Passwords en tabla `AppUser` (columna `PasswordHash` ya no necesaria)
- Endpoint `POST /api/auth/login` (reemplazado por `GET /api/auth/me`)
- Gestión manual de `sessionStorage`
- Usuarios demo hardcodeados (`admin@agentai.demo`, `viewer@agentai.demo`)

### Se mantiene

- Tabla `AppUser` (para almacenar nombre, isAdmin, isActive — sin password)
- Tablas `AccessGroup`, `UserGroup`, `GroupAgent`, `UserAgent` (para permisos por agente)
- `AuthProvider` (adaptado para consultar `/.auth/me` + `/api/auth/me`)
- Route guards: `ProtectedRoute`, `AdminRoute`
- Lógica de `agentAccess` con niveles `FULL` / `OWN`

---

## Flujo completo tras la migración

```
Usuario abre la app
   ↓
SWA detecta que no está autenticado (no tiene cookie)
   ↓
Redirect a /login (por responseOverrides 401)
   ↓
LoginPage muestra botón "Continuar con Microsoft"
   ↓
Click → navega a /.auth/login/aad
   ↓
SWA redirige a login.microsoftonline.com
   ↓
Usuario se autentica con su cuenta corporativa
   ↓
Microsoft redirige de vuelta a SWA con tokens
   ↓
SWA establece cookie de sesión segura
   ↓
Redirect a / (la app)
   ↓
AuthProvider llama a /.auth/me → obtiene email/nombre
   ↓
AuthProvider llama a /api/auth/me → obtiene permisos (isAdmin, groups, agentAccess)
   ↓
App renderiza con permisos del usuario
```

---

## Estimación de cambios por archivo

| Archivo | Acción |
|---|---|
| `staticwebapp.config.json` | Modificar: añadir auth provider + rutas con roles |
| `src/pages/LoginPage.tsx` | Reescribir: botón SSO en lugar de formulario |
| `src/auth/AuthProvider.tsx` | Modificar: usar `/.auth/me` + `/api/auth/me` |
| `api/src/admin.ts` | Modificar: reemplazar `POST /auth/login` por `GET /auth/me` con `x-ms-client-principal` |
| `src/types.ts` | Sin cambios (AuthUser ya tiene la estructura correcta) |
| `src/App.tsx` | Sin cambios (guards ya funcionan) |
| Azure Portal | Crear App Registration + configurar SWA settings |
