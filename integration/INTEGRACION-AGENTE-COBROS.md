# Integración: Agente Cobros Europastry ↔ Dashboard

> Guía para integrar el Agente de Cobros con el Dashboard de Agent AI Services.
> Fecha: 08/04/2026

---

## 1. Resumen

El **Agente Cobros** (procesamiento automatizado de cobros bancarios de Europastry) ya está registrado en el Dashboard de Agent AI Services y tiene una API Key asignada.

La integración se hace con **2 llamadas HTTP** por ejecución:

| Momento | Endpoint | Qué envía |
|---------|----------|-----------|
| Al iniciar el pipeline | `POST /api/executions/start` | Datos de entrada (email, adjuntos) |
| Al finalizar el pipeline | `POST /api/executions/{id}/finish` | Estado final + pasos ejecutados + outputs |

No hay llamadas intermedias. Los pasos se miden localmente y se envían en batch al finalizar.

---

## 2. Datos del agente

| Campo | Valor |
|-------|-------|
| **Nombre** | Agente Cobros |
| **Código** | `AGT-0005` |
| **Agent Id** | `2` |
| **API Key** | `aais_AGT-0005_c1961d5c31107834558dbc8fc7a52af1d5d21878e97cedbf` |
| **Dashboard URL** | `https://brave-island-0d9d72603.1.azurestaticapps.net` |

> **IMPORTANTE**: La API Key no puede recuperarse del sistema (solo se almacena el hash SHA-256). Guardarla en un lugar seguro.

---

## 3. Variables de entorno

Configurar en el Container App, `.env`, o Key Vault del agente:

```env
DASHBOARD_URL=https://brave-island-0d9d72603.1.azurestaticapps.net
DASHBOARD_API_KEY=aais_AGT-0005_c1961d5c31107834558dbc8fc7a52af1d5d21878e97cedbf
```

---

## 4. Módulo de integración (Python)

El archivo `dashboard_client.py` ya existe en el repositorio del Dashboard:

```
integration/dashboard_client.py
```

Copiar este archivo al directorio raíz (o al `src/`) del proyecto del agente.

**Dependencia**: Solo `requests` (`pip install requests`).

### 4.1 Uso básico

```python
from dashboard_client import DashboardTracker, email_input, file_output

tracker = DashboardTracker(
    base_url="https://brave-island-0d9d72603.1.azurestaticapps.net",
    api_key="aais_AGT-0005_c1961d5c31107834558dbc8fc7a52af1d5d21878e97cedbf",
)

# 1. Iniciar ejecución
tracker.start(
    trigger_source="EMAIL",
    invoked_by="remitente@banco.com",
    inputs=[email_input(message_id, subject, sender)]
)

# 2. Ejecutar pasos (se acumulan localmente, 0 HTTP)
with tracker.step(1, "Preprocessing") as s:
    resultado = run_preprocessing(...)
    s.description = f"{resultado.num_attachments} adjuntos"

with tracker.step(2, "Extracción IA (Claude)") as s:
    claude_result = run_claude_phase(...)

with tracker.step(3, "Postprocessing") as s:
    post_result = run_postprocessing(...)

# 3. Finalizar ejecución (envía todo en batch)
tracker.finish(status="SUCCESS", outputs=[
    file_output("pagos.xlsx", "EXCEL"),
    file_output("facturas.xlsx", "EXCEL"),
])
```

---

## 5. Pasos del pipeline

| # | Nombre | Descripción |
|---|--------|-------------|
| 1 | Preprocessing | Descarga email, extrae adjuntos, valida formato |
| 2 | Extracción IA (Claude) | Procesa documentos con Claude para extraer facturas y abonos |
| 3 | Postprocessing | Genera archivos Excel (pagos.xlsx, facturas.xlsx) para importar al ERP |

---

## 6. Migración desde el dashboard anterior

Si el agente estaba apuntando al dashboard anterior (`salmon-field-0cfd11603.4.azurestaticapps.net`), actualizar las variables de entorno:

```env
# ANTES (dashboard anterior)
DASHBOARD_URL=https://salmon-field-0cfd11603.4.azurestaticapps.net
DASHBOARD_API_KEY=aais_AGT-0001_e39f58...

# DESPUÉS (dashboard QualitaHub)
DASHBOARD_URL=https://brave-island-0d9d72603.1.azurestaticapps.net
DASHBOARD_API_KEY=aais_AGT-0005_c1961d5c31107834558dbc8fc7a52af1d5d21878e97cedbf
```

> **Nota**: El código del agente cambió de `AGT-0001` a `AGT-0005`. El `dashboard_client.py` no necesita conocer el código — solo la URL y API Key.
