# Azure Storage Architecture - Analisis Critico

## Propuesta evaluada

Azure Blob Storage para almacenar los ficheros de ejecucion (inputs/outputs), organizados por ejecucion con carpetas basadas en GUID, subdirectorios para inputs/outputs/email/logs, y acceso mediante SAS tokens.

---

## Evaluacion: Viable, pero hay que considerar el panorama completo

### Fortalezas

- **Encaje natural**: Blob Storage esta disenado exactamente para esto — almacenamiento de ficheros no estructurados a escala.
- **Coste**: Hot tier a ~$0.0184/GB/mes es despreciable para este caso de uso. Incluso con miles de ejecuciones, estamos hablando de <$5/mes.
- **SAS tokens**: Acceso granular y limitado en tiempo sin exponer las claves de la cuenta de almacenamiento.
- **Integracion con SWA**: Azure Functions puede generar URLs SAS bajo demanda para el frontend.

---

## Preocupaciones y recomendaciones

### 1. Se necesita realmente ahora?

La arquitectura actual almacena `ContentText` inline en SQL y `FilePath` como referencia futura. Para un dashboard de monitorizacion con volumenes de datos modestos (previews de texto de CSVs, emails, JSON), la columna `ContentText` de SQL es suficiente.

Blob Storage se hace necesario unicamente cuando:

- Los ficheros son grandes (>1MB) — SQL `NVARCHAR(MAX)` puede contener ~2GB pero es ineficiente para ello.
- Se necesita servir ficheros binarios (Excel .xlsx, PDFs) para descarga.
- El volumen justifica separar el almacenamiento de la base de datos.

### 2. Estructura de carpetas

No sobreingenierar. Una estructura plana funciona:

```
executions/{executionId}/inputs/{fileName}
executions/{executionId}/outputs/{fileName}
```

No hay necesidad de GUIDs — el `ExecutionId` (BIGINT) ya es unico. Los GUIDs anaden complejidad sin beneficio en este contexto.

### 3. Estrategia de SAS tokens

Usar **User Delegation SAS** (respaldado por Entra ID) en lugar de Account Key SAS. Sin embargo, para la v1 con autenticacion simulada, un Service SAS con expiracion corta (15 minutos) generado por la Azure Function es suficiente.

### 4. Trampa de coste a evitar

No crear un Storage Account por entorno o por agente. Un unico Storage Account con un solo contenedor y particionado basado en rutas es suficiente. El tier Basic de SQL (5 DTU) ya es el cuello de botella — no anadir coste de infraestructura proporcionalmente.

### 5. Alternativa a considerar

Si solo se necesita servir previews (que es el caso actual), mantener `ContentText` en SQL para ficheros pequenos y anadir Blob Storage unicamente para ficheros binarios que no se pueden previsualizar como texto. Este enfoque hibrido evita la complejidad de la gestion de SAS tokens para el 80% de los casos.

### 6. Cuando implementar

Implementar Blob Storage cuando exista un requisito real para:

- Descargar ficheros originales Excel/PDF.
- Manejar ficheros >100KB de forma habitual.
- Soportar subida de ficheros desde el dashboard.

---

## Recomendacion final

Para la **v1**, la arquitectura actual (metadatos en SQL, `ContentText` para previews, `FilePath` como referencia futura) es correcta.

Anadir **Azure Blob Storage en v2** junto con autenticacion real con Entra ID, acotado a los casos de uso de descarga de ficheros binarios.

### Estimacion de coste

| Recurso | Tier | Coste estimado/mes |
|---|---|---|
| Azure SQL | Basic (5 DTU) | ~$5 |
| Azure Blob Storage (LRS, Hot) | Standard | ~$1-3 |
| **Total v2** | | **~$6-8** |
