"""
Dashboard Integration Client — Agente de Cobros Europastry
===========================================================

Módulo para reportar ejecuciones del pipeline al Dashboard de
Agent AI Services. Solo hace 2 llamadas HTTP por ejecución:
  1. start()  → Crea la ejecución con inputs
  2. finish() → Cierra la ejecución con pasos, outputs y estado final

Los pasos se acumulan localmente con tracker.step() y se
envían todos juntos en el finish().

Requisitos: requests (ya en dependencias del agente)

Uso:
    from dashboard_client import DashboardTracker, email_input, file_output

    tracker = DashboardTracker(
        base_url="https://salmon-field-0cfd11603.4.azurestaticapps.net",
        api_key="aais_AGT-0001_e39f58...",
    )

    tracker.start(trigger_source="EMAIL", invoked_by=sender,
                  inputs=[email_input(message_id, subject, sender)])

    with tracker.step(1, "Preprocessing") as s:
        resultado = run_preprocessing(...)
        s.description = f"{resultado.num_attachments} adjuntos"

    with tracker.step(2, "Extracción IA (Claude)") as s:
        claude_result = run_claude_phase(...)

    with tracker.step(3, "Postprocessing") as s:
        post_result = run_postprocessing(...)

    tracker.finish(status="SUCCESS", outputs=[
        file_output("pagos.xlsx", "EXCEL"),
        file_output("facturas.xlsx", "EXCEL"),
    ])

Integración con api.py — ver ejemplo al final del archivo.
"""

import logging
import time
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

import requests as http_requests

logger = logging.getLogger("dashboard")


# ─── Tipos auxiliares ───────────────────────────────────────

@dataclass
class StepResult:
    """Resultado mutable de un paso. Se usa dentro del context manager."""
    step_order: int
    step_name: str
    status: str = "SUCCESS"
    description: Optional[str] = None
    error_message: Optional[str] = None
    _start_time: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    _start_perf: float = field(default_factory=time.perf_counter)

    def fail(self, error: str):
        """Marca el paso como fallido."""
        self.status = "FAILED"
        self.error_message = error

    def warn(self, message: str):
        """Marca el paso como warning."""
        self.status = "WARNING"
        self.description = message

    def to_dict(self) -> dict:
        elapsed_ms = int((time.perf_counter() - self._start_perf) * 1000)
        return {
            "stepOrder": self.step_order,
            "stepName": self.step_name,
            "status": self.status,
            "description": self.description,
            "startTime": self._start_time.isoformat(),
            "finishTime": datetime.now(timezone.utc).isoformat(),
            "durationMs": elapsed_ms,
            "errorMessage": self.error_message,
        }


# ─── Input/Output builders ─────────────────────────────────

def email_input(message_id: str, subject: str = None, sender: str = None) -> dict:
    """Construye un input de tipo EMAIL para el dashboard."""
    lines = []
    if subject:
        lines.append(f"Subject: {subject}")
    if sender:
        lines.append(f"From: {sender}")
    lines.append(f"Message-ID: {message_id}")
    return {
        "inputType": "EMAIL",
        "contentText": "\n".join(lines),
    }


def attachment_input(filename: str, mime_type: str = None) -> dict:
    """Construye un input de tipo ATTACHMENT."""
    return {
        "inputType": "ATTACHMENT",
        "fileName": filename,
        "mimeType": mime_type,
    }


def file_output(filename: str, output_type: str = "FILE", mime_type: str = None) -> dict:
    """Construye un output de tipo FILE."""
    return {
        "outputType": output_type,
        "fileName": filename,
        "mimeType": mime_type,
    }


def json_output(filename: str, content: str = None) -> dict:
    """Construye un output de tipo JSON (con contenido inline opcional)."""
    return {
        "outputType": "JSON",
        "fileName": filename,
        "mimeType": "application/json",
        "contentText": content,
    }


def summary_output(resumen_text: str) -> dict:
    """Construye un output de tipo SUMMARY con el resumen de ejecución."""
    return {
        "outputType": "SUMMARY",
        "fileName": "resumen_ejecucion.txt",
        "mimeType": "text/plain",
        "contentText": resumen_text,
    }


# ─── Cliente principal ─────────────────────────────────────

class DashboardTracker:
    """
    Tracker ligero que reporta el progreso del pipeline al dashboard.

    Patrón de 2 llamadas HTTP:
      - start()  → 1 POST para crear la ejecución con estado RUNNING
      - finish() → 1 POST para cerrar con todos los pasos + outputs

    Los pasos registrados con step() se acumulan en memoria y se
    envían todos juntos en finish(). No hacen llamadas HTTP.

    Fire-and-forget: ningún error del dashboard interrumpe el pipeline.
    """

    def __init__(self, base_url: str, api_key: str, timeout: float = 10.0):
        self.base_url = base_url.rstrip("/")
        self._session = http_requests.Session()
        self._session.headers.update({
            "X-API-Key": api_key,
            "Content-Type": "application/json",
        })
        self._timeout = timeout
        self.execution_id: Optional[int] = None
        self.execution_guid: Optional[str] = None
        self._steps: list[dict] = []

    # ── Lifecycle ───────────────────────────────────────────

    def start(
        self,
        trigger_source: str = "EMAIL",
        invoked_by: Optional[str] = None,
        inputs: Optional[list[dict]] = None,
    ) -> Optional[int]:
        """
        Notifica al dashboard que inicia una nueva ejecución.
        Envía los inputs en este momento (email, adjuntos, etc.).

        Returns:
            execution_id del dashboard, o None si falla la conexión.
        """
        try:
            resp = self._session.post(
                f"{self.base_url}/api/executions/start",
                json={
                    "triggerSource": trigger_source,
                    "invokedBy": invoked_by,
                    "inputs": inputs or [],
                },
                timeout=self._timeout,
            )
            resp.raise_for_status()
            data = resp.json()
            self.execution_id = data.get("executionId")
            self.execution_guid = data.get("executionGuid")
            logger.info(
                "Dashboard: ejecución iniciada (id=%s, guid=%s)",
                self.execution_id, self.execution_guid,
            )
            return self.execution_id
        except Exception as e:
            logger.warning("Dashboard: error al iniciar ejecución: %s", e)
            return None

    @contextmanager
    def step(self, step_order: int, step_name: str):
        """
        Context manager que mide un paso y lo acumula para enviar en finish().
        NO hace ninguna llamada HTTP — solo registra el paso en memoria.

        Uso:
            with tracker.step(1, "Preprocessing") as s:
                result = do_preprocessing()
                s.description = f"Procesados {result.count} adjuntos"

        Si ocurre una excepción, el paso se marca como FAILED automáticamente.
        """
        result = StepResult(step_order=step_order, step_name=step_name)
        try:
            yield result
        except Exception as e:
            result.fail(str(e))
            raise
        finally:
            self._steps.append(result.to_dict())

    def finish(
        self,
        status: str,
        error_message: Optional[str] = None,
        outputs: Optional[list[dict]] = None,
    ) -> bool:
        """
        Finaliza la ejecución en el dashboard. Envía en un solo POST:
          - Estado final (SUCCESS / FAILED / WARNING)
          - Todos los pasos acumulados con sus tiempos y descripciones
          - Los outputs generados (archivos Excel, JSON, resumen)

        Returns:
            True si se reportó correctamente, False si falló.
        """
        if not self.execution_id:
            logger.warning("Dashboard: no se puede finalizar — sin execution_id")
            return False

        try:
            resp = self._session.post(
                f"{self.base_url}/api/executions/{self.execution_id}/finish",
                json={
                    "status": status,
                    "errorMessage": error_message,
                    "steps": self._steps,
                    "outputs": outputs or [],
                },
                timeout=self._timeout,
            )
            resp.raise_for_status()
            data = resp.json()
            logger.info(
                "Dashboard: ejecución %s finalizada (%s, %d pasos, %d outputs)",
                self.execution_id,
                status,
                data.get("stepsInserted", 0),
                data.get("outputsInserted", 0),
            )
            return True
        except Exception as e:
            logger.warning("Dashboard: error al finalizar ejecución: %s", e)
            return False

    def check_access(
        self,
        user_email: str,
        agent_id: Optional[int] = None,
        agent_code: Optional[str] = None,
    ) -> dict:
        """
        Pre-authorization check: verifies if a user has permission
        to trigger a specific agent before starting an execution.

        Call this BEFORE start() to ensure the invoking user is authorized.

        Args:
            user_email: Email of the user who triggers the agent.
            agent_id:   Numeric agent ID (provide this OR agent_code).
            agent_code: Agent code string (provide this OR agent_id).

        Returns:
            dict with keys: allowed (bool), accessLevel, reason, message,
            user (dict), agent (dict).
            On network error, returns {"allowed": False, "reason": "ERROR"}.

        Example:
            result = tracker.check_access("user@company.com", agent_code="AGT-0001")
            if not result["allowed"]:
                logger.warning("User not authorized: %s", result["message"])
                return  # skip execution
        """
        params = {"userEmail": user_email}
        if agent_id is not None:
            params["agentId"] = str(agent_id)
        if agent_code is not None:
            params["agentCode"] = agent_code

        try:
            resp = self._session.get(
                f"{self.base_url}/api/auth/check-access",
                params=params,
                timeout=self._timeout,
            )
            resp.raise_for_status()
            data = resp.json()
            logger.info(
                "Dashboard: check-access user=%s → allowed=%s reason=%s",
                user_email, data.get("allowed"), data.get("reason"),
            )
            return data
        except Exception as e:
            logger.warning("Dashboard: error checking access for %s: %s", user_email, e)
            return {
                "allowed": False,
                "reason": "ERROR",
                "message": f"Failed to check access: {e}",
            }


# ═══════════════════════════════════════════════════════════
# EJEMPLO DE INTEGRACIÓN EN api.py DEL AGENTE
# ═══════════════════════════════════════════════════════════
#
# Cambios en api.py:
#   1. Importar DashboardTracker y los builders
#   2. Crear tracker al inicio del pipeline
#   3. Envolver cada fase en tracker.step() (solo mide, 0 HTTP)
#   4. Llamar tracker.finish() en el bloque finally
#
# Total llamadas HTTP al dashboard: 2 (start + finish)
# Los 3 tracker.step() solo miden tiempo, no hacen HTTP.
#
# ───────────────────────────────────────────────────────────
#
# import os
# from dashboard_client import (
#     DashboardTracker, email_input, attachment_input,
#     file_output, json_output, summary_output
# )
#
# DASHBOARD_URL = os.getenv(
#     "DASHBOARD_URL",
#     "https://salmon-field-0cfd11603.4.azurestaticapps.net"
# )
# DASHBOARD_API_KEY = os.getenv("DASHBOARD_API_KEY")
#
#
# @observe(name="Cobros Pipeline")
# async def run_pipeline(execution_id: str, message_id: str,
#                        subject: str = None, sender: str = None):
#
#     # ① Crear tracker e iniciar ejecución (1er HTTP POST)
#     tracker = DashboardTracker(DASHBOARD_URL, DASHBOARD_API_KEY)
#     tracker.start(
#         trigger_source="EMAIL",
#         invoked_by=sender,
#         inputs=[email_input(message_id, subject, sender)],
#     )
#
#     final_status = "SUCCESS"
#     error_msg = None
#     outputs = []
#
#     try:
#         # ─── FASE 1 (solo mide tiempo, 0 HTTP) ───────
#         with tracker.step(1, "Preprocessing") as s:
#             pre_result = await run_preprocessing(
#                 execution_id, message_id
#             )
#             s.description = (
#                 f"{pre_result.num_attachments} adjuntos "
#                 f"({', '.join(pre_result.attachment_types)})"
#                 + (", OCR aplicado" if pre_result.has_ocr else "")
#             )
#
#         # ─── FASE 2 (solo mide tiempo, 0 HTTP) ───────
#         with tracker.step(2, "Extracción IA (Claude)") as s:
#             claude_result = await run_claude_phase(execution_id)
#             s.description = (
#                 f"claude-sonnet-4-20250514, "
#                 f"exit_code={claude_result.exit_code}"
#             )
#
#         # ─── FASE 3 (solo mide tiempo, 0 HTTP) ───────
#         with tracker.step(3, "Postprocessing") as s:
#             post_result = await run_postprocessing(execution_id)
#             outputs = [
#                 file_output("pagos.xlsx", "EXCEL",
#                     "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
#                 file_output("facturas.xlsx", "EXCEL",
#                     "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
#                 json_output("resultado.json"),
#             ]
#             s.description = (
#                 f"{post_result.total_pagos} pagos, "
#                 f"{post_result.total_facturas} facturas"
#             )
#             if not post_result.validation_ok:
#                 s.warn(f"Descuadre: {', '.join(post_result.validation_errors)}")
#                 final_status = "WARNING"
#
#     except Exception as e:
#         final_status = "FAILED"
#         error_msg = str(e)
#         raise
#
#     finally:
#         # ② Finalizar ejecución con todo el resumen (2do HTTP POST)
#         tracker.finish(
#             status=final_status,
#             error_message=error_msg,
#             outputs=outputs,
#         )
#         langfuse_context.flush()
