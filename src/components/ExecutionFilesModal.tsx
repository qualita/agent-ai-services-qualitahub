import { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { cn, formatDate, formatDuration, statusColor, statusLabel, isRunning } from '@/lib/utils'
import { FileInput, FileOutput, ListOrdered, FileText, Download, Loader2, CheckCircle2, XCircle, Clock, ChevronLeft, ChevronRight, Inbox, ClipboardList, User, Banknote, FileStack, Receipt, Hash, AlertTriangle } from 'lucide-react'
import type { Execution, ExecutionDetail } from '@/types'
import { Modal } from '@/components/Modal'
import { api } from '@/api/client'
import {
  fileTypeIcon,
  InlinePreview,
  BlobPreview,
  canPreview,
  downloadFile,
  emailSubject,
} from '@/components/FileViewers'

type Tab = 'resumen' | 'steps' | 'inputs' | 'outputs'

interface EmailReplySummary {
  cliente: string
  importe_total: number
  importe_total_display: string
  total_pagos: number
  total_facturas: number
  referencia_pago: string
  warnings: Array<Record<string, unknown>>
}

function StepIcon({ status }: { status: string }) {
  switch (status?.toUpperCase()) {
    case 'SUCCESS':
      return <CheckCircle2 className="w-4 h-4 text-emerald-500" />
    case 'FAILED':
      return <XCircle className="w-4 h-4 text-red-500" />
    case 'RUNNING':
      return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
    default:
      return <Clock className="w-4 h-4 text-slate-400" />
  }
}

interface FileItem {
  id: number
  type: string
  fileName: string | null
  mimeType: string | null
  filePath: string | null
  contentText: string | null
}

/* ── Preview renderer ────────────────────────────────────────── */

function PreviewContent({ type, mimeType, content, filePath }: { type: string; mimeType: string | null; content: string | null; filePath: string | null }) {
  // Has inline content — use inline viewer
  if (content) {
    return <InlinePreview type={type} content={content} maxHeight="max-h-[500px]" />
  }
  // Has blob path — use blob preview (PDF, image, or text fetch)
  if (filePath && canPreview(type, mimeType, null, filePath)) {
    return <BlobPreview type={type} mimeType={mimeType} filePath={filePath} maxHeight="max-h-[500px]" />
  }
  // No preview possible
  return (
    <div className="flex flex-col items-center justify-center h-full text-slate-400">
      <FileText className="w-12 h-12 mb-3" />
      <p className="text-sm font-medium">Vista previa no disponible</p>
      <p className="text-xs mt-1">Descargue el archivo para ver su contenido</p>
    </div>
  )
}

/* ── Main component ──────────────────────────────────────── */

export function ExecutionFilesModal({
  exec,
  defaultTab,
  onClose,
  onNavigate,
  hasPrev,
  hasNext,
}: {
  exec: Execution
  defaultTab: Tab
  onClose: () => void
  onNavigate?: (direction: 'prev' | 'next') => void
  hasPrev?: boolean
  hasNext?: boolean
}) {
  const [tab, setTab] = useState<Tab>(defaultTab)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  // Fetch execution detail to get contentText for previews
  const { data: detail, isLoading: loadingDetail } = useQuery<ExecutionDetail>({
    queryKey: ['execution-detail', exec.executionId],
    queryFn: () => api.getExecution(String(exec.executionId)),
  })

  const summary = useMemo<EmailReplySummary | null>(() => {
    if (!detail) return null
    const summaryOutput = detail.outputs.find((o) => o.outputType === 'EMAIL_REPLY_SUMMARY')
    if (!summaryOutput?.contentText) return null
    try {
      return JSON.parse(summaryOutput.contentText) as EmailReplySummary
    } catch {
      return null
    }
  }, [detail])

  const files: FileItem[] = useMemo(() => {
    // Use detail data (with contentText) when available, fall back to exec summaries
    if (tab === 'inputs') {
      const inputs = detail?.inputs ?? exec.inputs
      return inputs.map((i) => ({
        id: i.inputId,
        type: i.inputType,
        fileName: i.fileName,
        mimeType: i.mimeType,
        filePath: i.filePath,
        contentText: 'contentText' in i ? (i.contentText as string | null) : null,
      }))
    }
    if (tab === 'outputs') {
      const outputs = (detail?.outputs ?? exec.outputs).filter((o) => o.outputType !== 'EMAIL_REPLY_SUMMARY')
      return outputs.map((o) => ({
        id: o.outputId,
        type: o.outputType,
        fileName: o.fileName,
        mimeType: o.mimeType,
        filePath: o.filePath,
        contentText: 'contentText' in o ? (o.contentText as string | null) : null,
      }))
    }
    return []
  }, [tab, exec, detail])

  // Auto-select first file when tab changes
  useEffect(() => {
    setSelectedId(files.length > 0 ? files[0].id : null)
  }, [files])

  const selectedFile = files.find((f) => f.id === selectedId) ?? null

  const displayOutputCount = summary ? exec.outputCount - 1 : exec.outputCount

  const tabs: { key: Tab; label: string; count: number | null; icon: typeof FileInput }[] = [
    { key: 'resumen', label: 'Resumen', count: null, icon: ClipboardList },
    { key: 'inputs', label: 'Inputs', count: exec.inputCount, icon: FileInput },
    { key: 'outputs', label: 'Outputs', count: displayOutputCount, icon: FileOutput },
    { key: 'steps', label: 'Steps', count: detail?.steps.length ?? exec.stepCount, icon: ListOrdered },
  ]

  return (
    <Modal
      open
      onClose={onClose}
      title={`${exec.agentName} — #${exec.executionGuid.substring(0, 8)}`}
      subtitle={
        <div className="flex items-center gap-3 text-[11px] text-slate-500">
          <span className={cn('inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium', statusColor(exec.status))}>
            {isRunning(exec.status) && (
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-500" />
              </span>
            )}
            {statusLabel(exec.status)}
          </span>
          {exec.startTime && <span>{formatDate(exec.startTime)}</span>}
          {exec.durationSeconds != null && (
            <span className="text-slate-400">{formatDuration(exec.durationSeconds)}</span>
          )}
        </div>
      }
      size="xl"
      noPadding
      headerExtra={
        onNavigate ? (
          <div className="flex items-center gap-1">
            <button
              onClick={() => onNavigate('prev')}
              disabled={!hasPrev}
              className={cn(
                'p-1.5 rounded-lg transition-colors',
                hasPrev
                  ? 'hover:bg-slate-100 text-slate-500 hover:text-slate-700'
                  : 'text-slate-200 cursor-not-allowed'
              )}
              title="Ejecución anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => onNavigate('next')}
              disabled={!hasNext}
              className={cn(
                'p-1.5 rounded-lg transition-colors',
                hasNext
                  ? 'hover:bg-slate-100 text-slate-500 hover:text-slate-700'
                  : 'text-slate-200 cursor-not-allowed'
              )}
              title="Ejecución siguiente"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        ) : undefined
      }
    >
      {/* Tabs */}
      <div className="shrink-0 flex items-center justify-between border-b border-slate-200 px-6">
        <div className="flex">
        {tabs.map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors -mb-px',
                tab === t.key
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
              {t.count != null && (
                <span
                  className={cn(
                    'ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold',
                    tab === t.key
                      ? 'bg-brand-100 text-brand-700'
                      : 'bg-slate-100 text-slate-500'
                  )}
                >
                  {t.count}
                </span>
              )}
            </button>
          )
        })}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === 'resumen' ? (
          /* ── Resumen tab ─────────────────────────────── */
          <div className="h-full overflow-y-auto p-6">
            {loadingDetail ? (
              <div className="flex items-center justify-center py-12 text-slate-400">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                <span className="text-sm">Cargando resumen...</span>
              </div>
            ) : !summary ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Inbox className="w-8 h-8 text-slate-300 mb-2" />
                <p className="text-sm text-slate-500">Sin resumen disponible</p>
                <p className="text-xs text-slate-400 mt-1">Esta ejecución no generó un resumen de cobro</p>
              </div>
            ) : (
              <div>
                <h3 className="text-sm font-semibold text-slate-900 mb-4">Resumen del Cobro</h3>
                <div className="divide-y divide-slate-100 mb-6">
                  {[
                    { icon: User, label: 'Cliente', value: summary.cliente },
                    { icon: Banknote, label: 'Importe Total', value: `${summary.importe_total_display} EUR`, bold: true },
                    { icon: FileStack, label: 'Pagos procesados', value: String(summary.total_pagos) },
                    { icon: Receipt, label: 'Facturas', value: String(summary.total_facturas) },
                    { icon: Hash, label: 'Ref. de pago', value: summary.referencia_pago, warn: summary.referencia_pago === 'N/A' },
                  ].map((row) => {
                    const Icon = row.icon
                    return (
                      <div key={row.label} className="flex items-start gap-2.5 py-2.5">
                        <Icon className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                        <span className="text-[11px] text-slate-500 w-28 shrink-0 pt-[1px]">{row.label}</span>
                        <span className={cn('text-sm text-slate-800', row.bold && 'font-semibold')}>
                          {row.value}
                          {row.warn && <AlertTriangle className="w-3.5 h-3.5 text-amber-500 inline ml-1 -mt-0.5" />}
                        </span>
                      </div>
                    )
                  })}
                </div>

                {/* Warnings */}
                {summary.warnings.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-amber-700 mb-2 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Alertas ({summary.warnings.length})
                    </h4>
                    <div className="space-y-2">
                      {summary.warnings.map((w, i) => (
                        <div
                          key={i}
                          className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded px-3 py-2"
                        >
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                          <p className="text-xs text-amber-800 leading-snug">
                            {w.type === 'descuadre'
                              ? `Descuadre en pago ${w.pago_id}: documento ${Number(w.importe_documento).toLocaleString('es-ES', { minimumFractionDigits: 2 })} vs facturas ${Number(w.suma_facturas).toLocaleString('es-ES', { minimumFractionDigits: 2 })}, diferencia: ${Number(w.diferencia).toLocaleString('es-ES', { minimumFractionDigits: 2 })}`
                              : String(w.message ?? JSON.stringify(w))}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {summary.warnings.length === 0 && (
                  <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded px-3 py-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <p className="text-xs text-emerald-700">Sin alertas — el cobro cuadra correctamente</p>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : tab === 'steps' ? (
          /* ── Steps timeline ─────────────────────────── */
          <div className="h-full overflow-y-auto p-6">
            {loadingDetail ? (
              <div className="flex items-center justify-center py-12 text-slate-400">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                <span className="text-sm">Loading steps...</span>
              </div>
            ) : !detail?.steps.length ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Inbox className="w-8 h-8 text-slate-300 mb-2" />
                <p className="text-sm text-slate-500">Sin pasos registrados</p>
              </div>
            ) : (
              <div className="relative">
                {detail.steps.map((step, idx) => (
                  <div key={step.stepId} className="flex gap-4 pb-4 last:pb-0">
                    <div className="flex flex-col items-center">
                      <StepIcon status={step.status} />
                      {idx < detail.steps.length - 1 && (
                        <div className="w-px flex-1 bg-slate-200 mt-1" />
                      )}
                    </div>
                    <div className="flex-1 pb-2">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-slate-800">
                          Step {step.stepOrder}: {step.stepName}
                        </span>
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium',
                            statusColor(step.status)
                          )}
                        >
                          {isRunning(step.status) && (
                            <span className="relative flex h-1.5 w-1.5">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-500" />
                            </span>
                          )}
                          {statusLabel(step.status)}
                        </span>
                      </div>
                      {step.description && (
                        <p className="text-xs text-slate-500 mb-1">{step.description}</p>
                      )}
                      <div className="flex gap-4 text-[11px] text-slate-400">
                        <span>Start: {formatDate(step.startTime)}</span>
                        {step.durationSeconds != null && (
                          <span>Duration: {formatDuration(step.durationSeconds)}</span>
                        )}
                      </div>
                      {step.errorMessage && (
                        <p className="mt-1 text-xs text-red-600 font-mono">{step.errorMessage}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : files.length === 0 ? (
          /* ── Empty state ───────────────────────────── */
          <div className="flex flex-col items-center justify-center h-full">
            <Inbox className="w-10 h-10 text-slate-300 mb-3" />
            <p className="text-sm font-medium text-slate-500">
              Sin {tab === 'inputs' ? 'entradas' : 'salidas'}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              No se registraron {tab === 'inputs' ? 'entradas' : 'salidas'} en esta ejecución
            </p>
          </div>
        ) : (
          /* ── Split layout: file list + preview ─────── */
          <div className="flex h-full">
            {/* File list (left sidebar) */}
            <div className="w-52 shrink-0 border-r border-slate-200 overflow-y-auto bg-slate-50/50">
              <div className="py-1">
                {files.map((file) => (
                  <div
                    key={file.id}
                    className={cn(
                      'flex items-center gap-2 px-4 py-3 text-xs border-l-2 transition-colors group',
                      selectedId === file.id
                        ? 'bg-brand-50 text-brand-700 border-l-brand-600'
                        : 'border-l-transparent text-slate-600 hover:bg-slate-100'
                    )}
                  >
                    <button
                      onClick={() => setSelectedId(file.id)}
                      className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
                    >
                      {fileTypeIcon(file.type, file.mimeType, 4)}
                      <span className="truncate font-medium">
                        {file.fileName ?? (file.type.toLowerCase() === 'email' ? emailSubject(file.contentText) : null) ?? `${file.type.toLowerCase()}_file`}
                      </span>
                    </button>
                    {(file.filePath || file.contentText) && (
                      <button
                        onClick={async (e) => {
                          e.stopPropagation()
                          await downloadFile(file.filePath, file.contentText, file.fileName, file.type, file.mimeType)
                        }}
                        className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-all shrink-0"
                        title="Download"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Preview (right area) */}
            <div className="flex-1 min-w-0 overflow-y-auto">
              {selectedFile ? (
                <div className="p-6">
                  {/* Preview content */}
                  {loadingDetail ? (
                    <div className="flex items-center justify-center py-12 text-slate-400">
                      <Loader2 className="w-5 h-5 animate-spin mr-2" />
                      <span className="text-sm">Loading preview...</span>
                    </div>
                  ) : (
                    <PreviewContent type={selectedFile.type} mimeType={selectedFile.mimeType} content={selectedFile.contentText} filePath={selectedFile.filePath} />
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-sm text-slate-400">
                  Select a file to preview
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
