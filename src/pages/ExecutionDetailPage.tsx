import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { cn, formatDate, formatDuration, statusColor, statusLabel, isRunning } from '@/lib/utils'
import {
  ArrowLeft,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  FileInput,
  FileOutput,
  ListOrdered,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  User,
  Banknote,
  FileStack,
  Receipt,
  Hash,
  Package,
  Building2,
  FileText,
  Layers,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import type { ExecutionDetail, InputRecord, OutputRecord } from '@/types'
import { FileCard } from '@/components/FileViewers'

interface EmailReplySummary {
  cliente: string
  importe_total: number
  importe_total_display: string
  total_pagos: number
  total_facturas: number
  referencia_pago: string
  warnings: Array<Record<string, unknown>>
}

interface OrderSummary {
  numero_pedido: number
  tipo_pedido: string
  compania: string
  cliente: string
  cliente_an8: number
  po_cliente: string
  cif_cliente: string
  total_lineas: number
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

export function ExecutionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['steps', 'inputs', 'outputs'])
  )

  const { data: detail, isLoading } = useQuery<ExecutionDetail>({
    queryKey: ['execution', id],
    queryFn: () => api.getExecution(id!),
    enabled: !!id,
  })

  const toggle = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(section)) next.delete(section)
      else next.add(section)
      return next
    })
  }

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

  const orderSummary = useMemo<OrderSummary | null>(() => {
    if (!detail) return null
    const orderOutput = detail.outputs.find((o) => o.outputType === 'ORDER_SUMMARY')
    if (!orderOutput?.contentText) return null
    try {
      return JSON.parse(orderOutput.contentText) as OrderSummary
    } catch {
      return null
    }
  }, [detail])

  // Filter out summary outputs from regular outputs (already shown in summary card)
  const displayOutputs = useMemo(() => {
    if (!detail) return []
    return detail.outputs.filter((o) => o.outputType !== 'EMAIL_REPLY_SUMMARY' && o.outputType !== 'ORDER_SUMMARY')
  }, [detail])


  if (isLoading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-6">
          <div className="h-6 bg-slate-200 rounded w-32" />
          <div className="h-24 bg-slate-200 rounded" />
          <div className="h-64 bg-slate-200 rounded" />
        </div>
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="p-8 text-center text-slate-500">
        Execution not found.
      </div>
    )
  }

  return (
    <div className="p-8 max-w-7xl">
      {/* Back link */}
      <Link
        to={`/executions?agent=${detail.agentId}&name=${encodeURIComponent(detail.agentName)}`}
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Executions
      </Link>

      {/* Top section: Encabezado+Resumen (left) | Steps (right) */}
      <div className="flex gap-6 items-start mb-6">
        {/* Left: Combined header + resumen card */}
        <div className="flex-1 min-w-0">
          <div className="bg-white rounded-xl border border-slate-200/60 p-6 shadow-sm">
            {/* Encabezado */}
            <div className="flex items-start justify-between mb-4">
              <div>
                <h1 className="text-xl font-semibold text-slate-900">
                  {detail.agentName}
                </h1>
                <p className="text-xs text-slate-400 font-mono mt-1">
                  {detail.executionGuid}
                </p>
              </div>
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium',
                  statusColor(detail.status)
                )}
              >
                {isRunning(detail.status) && (
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
                  </span>
                )}
                {statusLabel(detail.status)}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <div className="text-xs text-slate-500 mb-0.5">Start</div>
                <div className="text-sm font-medium text-slate-700">
                  {formatDate(detail.startTime)}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-0.5">Finish</div>
                <div className="text-sm font-medium text-slate-700">
                  {detail.finishTime ? formatDate(detail.finishTime) : '-'}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-0.5">Duration</div>
                <div className="text-sm font-medium text-slate-700">
                  {detail.durationSeconds != null
                    ? formatDuration(detail.durationSeconds)
                    : '-'}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-0.5">Trigger</div>
                <div className="text-sm font-medium text-slate-700">
                  {detail.triggerSource ?? '-'}
                </div>
              </div>
            </div>

            {detail.errorMessage && (
              <div className="mt-4 bg-red-50 border border-red-200/60 rounded-xl p-3">
                <p className="text-xs font-medium text-red-700 mb-1">Error</p>
                <p className="text-sm text-red-600 font-mono whitespace-pre-wrap">
                  {detail.errorMessage}
                </p>
              </div>
            )}

            {/* Divider + Resumen del Cobro */}
            {summary && (
              <>
                <div className="border-t border-slate-100 my-8" />
                <h2 className="text-sm font-semibold text-slate-900 mb-3">Resumen del Cobro</h2>
                <div className="divide-y divide-slate-100">
                  {[
                    { icon: User, label: 'Cliente', value: summary.cliente },
                    { icon: Banknote, label: 'Importe Total', value: `${summary.importe_total_display} EUR`, bold: true },
                    { icon: FileStack, label: 'Pagos procesados', value: String(summary.total_pagos) },
                    { icon: Receipt, label: 'Facturas', value: String(summary.total_facturas) },
                    { icon: Hash, label: 'Ref. de pago', value: summary.referencia_pago, warn: summary.referencia_pago === 'N/A' },
                  ].map((row) => {
                    const Icon = row.icon
                    return (
                      <div key={row.label} className="flex items-start gap-2.5 py-2">
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

                {summary.warnings.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {summary.warnings.map((w, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded px-3 py-2"
                      >
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                        <p className="text-[11px] text-amber-800 leading-snug">
                          {w.type === 'descuadre'
                            ? `Descuadre en pago ${w.pago_id}: documento ${Number(w.importe_documento).toLocaleString('es-ES', { minimumFractionDigits: 2 })} vs facturas ${Number(w.suma_facturas).toLocaleString('es-ES', { minimumFractionDigits: 2 })}, diferencia: ${Number(w.diferencia).toLocaleString('es-ES', { minimumFractionDigits: 2 })}`
                            : String(w.message ?? JSON.stringify(w))}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Divider + Resumen del Pedido */}
            {orderSummary && (
              <>
                <div className="border-t border-slate-100 my-8" />
                <h2 className="text-sm font-semibold text-slate-900 mb-3">Resumen del Pedido</h2>
                <div className="divide-y divide-slate-100">
                  {[
                    { icon: Package, label: 'Nº Pedido', value: `#${orderSummary.numero_pedido}`, bold: true },
                    { icon: FileText, label: 'Tipo', value: orderSummary.tipo_pedido },
                    { icon: Building2, label: 'Compañía', value: orderSummary.compania },
                    { icon: User, label: 'Cliente', value: `${orderSummary.cliente} (AN8: ${orderSummary.cliente_an8})` },
                    { icon: Hash, label: 'CIF', value: orderSummary.cif_cliente },
                    { icon: Receipt, label: 'PO Cliente', value: orderSummary.po_cliente },
                    { icon: Layers, label: 'Líneas', value: String(orderSummary.total_lineas) },
                  ].map((row) => {
                    const Icon = row.icon
                    return (
                      <div key={row.label} className="flex items-start gap-2.5 py-2">
                        <Icon className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                        <span className="text-[11px] text-slate-500 w-28 shrink-0 pt-[1px]">{row.label}</span>
                        <span className={cn('text-sm text-slate-800', row.bold && 'font-semibold')}>
                          {row.value}
                        </span>
                      </div>
                    )
                  })}
                </div>

                {orderSummary.warnings.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {orderSummary.warnings.map((w, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded px-3 py-2"
                      >
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
                        <p className="text-[11px] text-amber-800 leading-snug">
                          {String(w.message ?? JSON.stringify(w))}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
        <div className="w-72 shrink-0 sticky top-8">
          <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm">
            <div className="flex items-center gap-2 p-4 border-b border-slate-100">
              <ListOrdered className="w-4 h-4 text-slate-500" />
              <span className="text-sm font-semibold text-slate-900">Steps</span>
              <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                {detail.steps.length}
              </span>
            </div>
            <div className="p-4">
              <div className="relative">
                {detail.steps.map((step, idx) => (
                  <div key={step.stepId} className="flex gap-3 pb-4 last:pb-0">
                    <div className="flex flex-col items-center">
                      <StepIcon status={step.status} />
                      {idx < detail.steps.length - 1 && (
                        <div className="w-px flex-1 bg-slate-200 mt-1" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0 pb-1">
                      <div className="flex items-start gap-1.5 mb-0.5">
                        <span className="text-xs font-medium text-slate-800 leading-tight">
                          {step.stepName}
                        </span>
                      </div>
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded font-medium mb-1',
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
                      {step.description && (
                        <p className="text-[11px] text-slate-500 leading-snug mb-0.5 line-clamp-2">
                          {step.description}
                        </p>
                      )}
                      <div className="text-[10px] text-slate-400">
                        {step.durationSeconds != null && formatDuration(step.durationSeconds)}
                      </div>
                      {step.errorMessage && (
                        <p className="mt-0.5 text-[11px] text-red-600 font-mono line-clamp-2">
                          {step.errorMessage}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom: Outputs + Inputs stacked */}
      <div className="space-y-6">
        {/* Outputs — first, prominent */}
        <CollapsibleSection
          title="Outputs"
          icon={<FileOutput className="w-4 h-4" />}
          count={displayOutputs.length}
          expanded={expandedSections.has('outputs')}
          onToggle={() => toggle('outputs')}
        >
          {displayOutputs.length === 0 ? (
            <p className="text-sm text-slate-400">No outputs recorded.</p>
          ) : (
            <div className="space-y-3">
              {displayOutputs.map((out: OutputRecord) => (
                <FileCard
                  key={out.outputId}
                  type={out.outputType}
                  fileName={out.fileName}
                  mimeType={out.mimeType}
                  contentText={out.contentText}
                  filePath={out.filePath}
                  timestamp={out.generatedAt}
                  direction="output"
                />
              ))}
            </div>
          )}
        </CollapsibleSection>

        {/* Inputs */}
        <CollapsibleSection
          title="Inputs"
          icon={<FileInput className="w-4 h-4" />}
          count={detail.inputs.length}
          expanded={expandedSections.has('inputs')}
          onToggle={() => toggle('inputs')}
        >
          {detail.inputs.length === 0 ? (
            <p className="text-sm text-slate-400">No inputs recorded.</p>
          ) : (
            <div className="space-y-3">
              {detail.inputs.map((inp: InputRecord) => (
                <FileCard
                  key={inp.inputId}
                  type={inp.inputType}
                  fileName={inp.fileName}
                  mimeType={inp.mimeType}
                  contentText={inp.contentText}
                  filePath={inp.filePath}
                  timestamp={inp.receivedAt}
                  direction="input"
                />
              ))}
            </div>
          )}
        </CollapsibleSection>
      </div>
    </div>
  )
}

function CollapsibleSection({
  title,
  icon,
  count,
  expanded,
  onToggle,
  children,
  headerExtra,
}: {
  title: string
  icon: React.ReactNode
  count: number
  expanded: boolean
  onToggle: () => void
  children: React.ReactNode
  headerExtra?: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200/60 shadow-sm">
      <div className="flex items-center justify-between p-4">
        <button
          onClick={onToggle}
          className="flex items-center gap-2 text-left hover:opacity-80 transition-opacity"
        >
          <span className="text-slate-500">{icon}</span>
          <span className="text-sm font-semibold text-slate-900">{title}</span>
          <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
            {count}
          </span>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </button>
        {expanded && headerExtra && (
          <div className="flex items-center gap-2">{headerExtra}</div>
        )}
      </div>
      {expanded && <div className="px-4 pb-4">{children}</div>}
    </div>
  )
}
