import { useState, useRef, useCallback, useEffect } from 'react'
import { useQuery, useInfiniteQuery } from '@tanstack/react-query'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { api } from '@/api/client'
import { cn, formatDate, formatDuration, statusColor, statusLabel, isRunning } from '@/lib/utils'
import {
  Search,
  Filter,
  Calendar,
  ListOrdered,
  FileInput,
  FileOutput,
  Loader2,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Play,
  Clock,
  Bot,
  LayoutGrid,
  List,
  Inbox,
  SearchX,
  RefreshCw,
} from 'lucide-react'
import type { Execution, AgentSummary } from '@/types'
import { ExecutionFilesModal } from '@/components/ExecutionFilesModal'

const PAGE_SIZE = 20

type DatePreset = '1d' | '3d' | '7d' | '14d' | '30d' | 'custom'

const DATE_PRESETS: { value: DatePreset; label: string }[] = [
  { value: '1d', label: 'Last 24 hours' },
  { value: '3d', label: 'Last 3 days' },
  { value: '7d', label: 'Last 7 days' },
  { value: '14d', label: 'Last 14 days' },
  { value: '30d', label: 'Last month' },
  { value: 'custom', label: 'Custom range' },
]

function getDateFromPreset(preset: DatePreset): string {
  const d = new Date()
  const days = preset === '1d' ? 1 : preset === '3d' ? 3 : preset === '7d' ? 7 : preset === '14d' ? 14 : 30
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}

function getToday(): string {
  return new Date().toISOString().slice(0, 10)
}

export function ExecutionsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const agentParam = searchParams.get('agent')
  const nameParam = searchParams.get('name')

  const [selectedAgent, setSelectedAgent] = useState<{ id: number; name: string } | null>(
    agentParam ? { id: Number(agentParam), name: nameParam ?? `Agent ${agentParam}` } : null
  )

  const handleBack = () => {
    setSelectedAgent(null)
    setSearchParams({})
  }

  return (
    <div className="p-8">
      {selectedAgent ? (
        <AgentExecutionsView
          agentId={selectedAgent.id}
          agentName={selectedAgent.name}
          onBack={handleBack}
        />
      ) : (
        <AgentListView onSelect={(id, name) => setSelectedAgent({ id, name })} />
      )}
    </div>
  )
}

/* ─── Agent Summary Grid ─── */

type ViewMode = 'cards' | 'list'

function AgentListView({ onSelect }: { onSelect: (id: number, name: string) => void }) {
  const [viewMode, setViewMode] = useState<ViewMode>('cards')
  const [agentSearch, setAgentSearch] = useState('')
  const { data: agents = [], isLoading } = useQuery({
    queryKey: ['agents-summary'],
    queryFn: api.getAgentsSummary,
  })

  const filteredAgents = agentSearch.trim()
    ? agents.filter((a) => {
        const q = agentSearch.toLowerCase()
        return a.name.toLowerCase().includes(q) || (a.description ?? '').toLowerCase().includes(q)
      })
    : agents

  return (
    <>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Executions</h1>
          <p className="text-sm text-slate-500 mt-1">
            Select an agent to view its execution history
          </p>
        </div>
        <div className="flex items-center border border-slate-200/60 rounded-xl overflow-hidden shadow-sm">
          <button
            onClick={() => setViewMode('cards')}
            className={cn(
              'p-2 transition-colors',
              viewMode === 'cards'
                ? 'bg-brand-600 text-white'
                : 'bg-white text-slate-500 hover:bg-slate-50'
            )}
            title="Card view"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={cn(
              'p-2 transition-colors',
              viewMode === 'list'
                ? 'bg-brand-600 text-white'
                : 'bg-white text-slate-500 hover:bg-slate-50'
            )}
            title="List view"
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Search bar */}
      {!isLoading && agents.length > 0 && (
        <div className="mb-4 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search agents..."
            value={agentSearch}
            onChange={(e) => setAgentSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 bg-white shadow-sm"
          />
        </div>
      )}

      {isLoading ? (
        viewMode === 'cards' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-white rounded-lg border border-slate-200 p-5 animate-pulse">
                <div className="h-5 bg-slate-100 rounded w-2/3 mb-3" />
                <div className="h-4 bg-slate-100 rounded w-full mb-4" />
                <div className="h-8 bg-slate-100 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="px-4 py-3 animate-pulse border-b border-slate-100">
                <div className="h-4 bg-slate-100 rounded w-full" />
              </div>
            ))}
          </div>
        )
      ) : agents.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200/60 p-12 text-center shadow-sm">
          <Inbox className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-500">No hay agentes disponibles</p>
          <p className="text-xs text-slate-400 mt-1">Los agentes aparecerán aquí cuando se configuren</p>
        </div>
      ) : filteredAgents.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200/60 p-12 text-center shadow-sm">
          <SearchX className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-medium text-slate-500">Sin resultados</p>
          <p className="text-xs text-slate-400 mt-1">Ningún agente coincide con tu búsqueda</p>
        </div>
      ) : viewMode === 'cards' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAgents.map((agent) => (
            <AgentCard key={agent.agentId} agent={agent} onClick={() => onSelect(agent.agentId, agent.name)} />
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200/60 overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200/60">
                <th className="text-left px-4 py-3 font-medium text-slate-600 text-xs uppercase tracking-wide">Agent</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 text-xs uppercase tracking-wide">Description</th>
                <th className="text-center px-4 py-3 font-medium text-slate-600 text-xs uppercase tracking-wide">Total</th>
                <th className="text-center px-4 py-3 font-medium text-slate-600 text-xs uppercase tracking-wide">Completadas</th>
                <th className="text-center px-4 py-3 font-medium text-slate-600 text-xs uppercase tracking-wide">Error</th>
                <th className="text-center px-4 py-3 font-medium text-slate-600 text-xs uppercase tracking-wide">En ejecución</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 text-xs uppercase tracking-wide">Última ejecución</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredAgents.map((agent) => (
                <tr
                  key={agent.agentId}
                  onClick={() => onSelect(agent.agentId, agent.name)}
                  className="hover:bg-slate-50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
                        <Bot className="w-3.5 h-3.5 text-brand-600" />
                      </div>
                      <span className="font-medium text-slate-800">{agent.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-500 max-w-[280px] truncate">
                    {agent.description || '-'}
                  </td>
                  <td className="px-4 py-3 text-center text-slate-700 font-medium">{agent.totalExecutions}</td>
                  <td className="px-4 py-3 text-center">
                    {agent.successCount > 0 ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" />{agent.successCount}
                      </span>
                    ) : <span className="text-slate-300">0</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {agent.failedCount > 0 ? (
                      <span className="inline-flex items-center gap-1 text-red-500 font-medium">
                        <XCircle className="w-3.5 h-3.5" />{agent.failedCount}
                      </span>
                    ) : <span className="text-slate-300">0</span>}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {agent.runningCount > 0 ? (
                      <span className="inline-flex items-center gap-1 text-blue-500 font-medium">
                        <Play className="w-3.5 h-3.5" />{agent.runningCount}
                      </span>
                    ) : <span className="text-slate-300">0</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                    {agent.lastExecution ? (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        {formatDate(agent.lastExecution)}
                      </span>
                    ) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

function AgentCard({ agent, onClick }: { agent: AgentSummary; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="bg-white rounded-xl border border-slate-200/60 p-5 text-left hover:border-brand-300 hover:shadow-lg transition-all group shadow-sm"
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center group-hover:bg-brand-100 transition-colors">
            <Bot className="w-4 h-4 text-brand-600" />
          </div>
          <h3 className="font-semibold text-slate-800 group-hover:text-brand-700 transition-colors">
            {agent.name}
          </h3>
        </div>
        <span className="text-xs text-slate-400 whitespace-nowrap mt-1">
          {agent.totalExecutions} exec.
        </span>
      </div>

      {agent.description && (
        <p className="text-xs text-slate-500 mb-4 line-clamp-2">{agent.description}</p>
      )}

      <div className="flex items-center gap-3 text-xs">
        {agent.successCount > 0 && (
          <div className="flex items-center gap-1 text-emerald-600">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span className="font-medium">{agent.successCount}</span>
          </div>
        )}
        {agent.failedCount > 0 && (
          <div className="flex items-center gap-1 text-red-500">
            <XCircle className="w-3.5 h-3.5" />
            <span className="font-medium">{agent.failedCount}</span>
          </div>
        )}
        {agent.runningCount > 0 && (
          <div className="flex items-center gap-1 text-blue-500">
            <Play className="w-3.5 h-3.5" />
            <span className="font-medium">{agent.runningCount}</span>
          </div>
        )}
        {agent.totalExecutions === 0 && (
          <span className="text-slate-400">No executions yet</span>
        )}
        <div className="flex-1" />
        {agent.lastExecution && (
          <div className="flex items-center gap-1 text-slate-400" title="Last execution">
            <Clock className="w-3 h-3" />
            <span>{formatDate(agent.lastExecution)}</span>
          </div>
        )}
      </div>
    </button>
  )
}

/* ─── Agent Executions Table ─── */

function AgentExecutionsView({
  agentId,
  agentName,
  onBack,
}: {
  agentId: number
  agentName: string
  onBack: () => void
}) {
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [search, setSearch] = useState('')
  const [datePreset, setDatePreset] = useState<DatePreset>('7d')
  const [customFrom, setCustomFrom] = useState(getDateFromPreset('7d'))
  const [customTo, setCustomTo] = useState(getToday)
  const [modal, setModal] = useState<{ tab: 'resumen' | 'steps' | 'inputs' | 'outputs'; exec: Execution } | null>(null)
  const navigate = useNavigate()

  const dateFrom = datePreset === 'custom' ? customFrom : getDateFromPreset(datePreset)
  const dateTo = datePreset === 'custom' ? customTo : getToday()

  const sentinelRef = useRef<HTMLDivElement>(null)

  const {
    data,
    isLoading,
    isFetching,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<{ items: Execution[]; total: number }>({
    queryKey: ['executions', agentId, statusFilter, search, dateFrom, dateTo],
    queryFn: ({ pageParam }) =>
      api.getExecutions({
        page: String(pageParam),
        pageSize: String(PAGE_SIZE),
        agentId: String(agentId),
        status: statusFilter || undefined,
        search: search || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((n, p) => n + p.items.length, 0)
      return loaded < lastPage.total ? allPages.length + 1 : undefined
    },
  })

  const allItems = data?.pages.flatMap((p) => p.items) ?? []
  const total = data?.pages[0]?.total ?? 0

  const handleObserver = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [entry] = entries
      if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
        fetchNextPage()
      }
    },
    [fetchNextPage, hasNextPage, isFetchingNextPage]
  )

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(handleObserver, { rootMargin: '200px' })
    observer.observe(el)
    return () => observer.disconnect()
  }, [handleObserver])

  return (
    <>
      {/* Header with back */}
      <div className="mb-6">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand-600 transition-colors mb-2"
        >
          <ArrowLeft className="w-4 h-4" />
          All agents
        </button>
        <h1 className="text-2xl font-semibold text-slate-900">{agentName}</h1>
        <p className="text-sm text-slate-500 mt-1">
          Execution history
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6 items-start">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by trigger or invoked by..."
            className="w-full pl-9 pr-3 py-2 border border-slate-200/60 rounded-xl text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 shadow-sm"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="pl-9 pr-8 py-2 border border-slate-200/60 rounded-xl text-sm bg-white focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 appearance-none shadow-sm"
          >
            <option value="">Todos los estados</option>
            <option value="SUCCESS">Completado</option>
            <option value="FAILED">Error</option>
            <option value="RUNNING">En ejecución</option>
            <option value="PENDING">Pendiente</option>
          </select>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
          <select
            value={datePreset}
            onChange={(e) => setDatePreset(e.target.value as DatePreset)}
            className="px-2 py-2 border border-slate-200/60 rounded-xl text-sm bg-white focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 appearance-none pr-8 shadow-sm"
          >
            {DATE_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
          {datePreset === 'custom' && (
            <>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="px-2 py-2 border border-slate-200/60 rounded-xl text-sm bg-white focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 shadow-sm"
              />
              <span className="text-sm text-slate-400">—</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="px-2 py-2 border border-slate-200/60 rounded-xl text-sm bg-white focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 shadow-sm"
              />
            </>
          )}
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 px-3 py-2 border border-slate-200/60 rounded-xl text-sm text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors disabled:opacity-50 shrink-0 shadow-sm"
          title="Actualizar"
        >
          <RefreshCw className={cn('w-4 h-4', isFetching && 'animate-spin')} />
          Actualizar
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200/60 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200/60">
                <th className="text-left px-4 py-3 font-medium text-slate-600 text-xs uppercase tracking-wide">Execution</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 text-xs uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 text-xs uppercase tracking-wide">Trigger</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 text-xs uppercase tracking-wide">Invoked By</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 text-xs uppercase tracking-wide">Start</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 text-xs uppercase tracking-wide">End</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600 text-xs uppercase tracking-wide">Duration</th>
                <th className="text-center px-4 py-3 font-medium text-slate-600 text-xs uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i}>
                    {[...Array(8)].map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-slate-100 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : allItems.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center">
                    <Inbox className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                    <p className="text-sm font-medium text-slate-500">Sin ejecuciones</p>
                    <p className="text-xs text-slate-400 mt-1">No se encontraron ejecuciones con los filtros aplicados</p>
                  </td>
                </tr>
              ) : (
                allItems.map((exec) => {
                  const visibleOutputs = exec.outputCount - (exec.outputs.some(o => o.outputType === 'EMAIL_REPLY_SUMMARY') ? 1 : 0)
                  return (
                  <tr key={exec.executionId} className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => navigate(`/executions/${exec.executionId}`)}>
                    <td className="px-4 py-3">
                      <Link
                        to={`/executions/${exec.executionId}`}
                        className="font-medium text-brand-600 hover:text-brand-700 hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {exec.agentName}
                      </Link>
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5" title={exec.executionGuid}>
                        {exec.executionGuid.substring(0, 8)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium',
                          statusColor(exec.status)
                        )}
                      >
                        {isRunning(exec.status) && (
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
                          </span>
                        )}
                        {statusLabel(exec.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <div className="flex flex-col">
                        <span className="text-xs font-medium text-slate-500 uppercase">{exec.triggerSource ?? '-'}</span>
                        {exec.emailSubject && (
                          <span className="text-sm text-slate-700 truncate max-w-[260px]" title={exec.emailSubject}>
                            {exec.emailSubject}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 truncate max-w-[220px]" title={exec.invokedBy ?? undefined}>
                      {exec.invokedBy ?? '-'}
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                      {formatDate(exec.startTime)}
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                      {formatDate(exec.finishTime)}
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                      {exec.durationSeconds != null
                        ? formatDuration(exec.durationSeconds)
                        : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-4">
                        <button
                          onClick={(e) => { e.stopPropagation(); setModal({ tab: 'inputs', exec }); }}
                          className={cn(
                            'relative flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 transition-all',
                            exec.inputCount > 0
                              ? 'text-blue-400 hover:bg-blue-50 hover:text-blue-600 hover:shadow-sm'
                              : 'text-slate-300 cursor-default'
                          )}
                          disabled={exec.inputCount === 0}
                          title={`${exec.inputCount} input(s)`}
                        >
                          <FileInput className="w-4 h-4" />
                          <span className="text-[10px] font-medium leading-none">Inputs</span>
                          {exec.inputCount > 0 && (
                            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-blue-500 text-white text-[9px] font-bold px-1">
                              {exec.inputCount}
                            </span>
                          )}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setModal({ tab: 'outputs', exec }); }}
                          className={cn(
                            'relative flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 transition-all',
                            visibleOutputs > 0
                              ? 'text-emerald-400 hover:bg-emerald-50 hover:text-emerald-600 hover:shadow-sm'
                              : 'text-slate-300 cursor-default'
                          )}
                          disabled={visibleOutputs === 0}
                          title={`${visibleOutputs} output(s)`}
                        >
                          <FileOutput className="w-4 h-4" />
                          <span className="text-[10px] font-medium leading-none">Outputs</span>
                          {visibleOutputs > 0 && (
                            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-emerald-500 text-white text-[9px] font-bold px-1">
                              {visibleOutputs}
                            </span>
                          )}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setModal({ tab: 'steps', exec }); }}
                          className={cn(
                            'relative flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 transition-all',
                            exec.stepCount > 0
                              ? 'text-violet-400 hover:bg-violet-50 hover:text-violet-600 hover:shadow-sm'
                              : 'text-slate-300 cursor-default'
                          )}
                          disabled={exec.stepCount === 0}
                          title={`${exec.stepCount} step(s)`}
                        >
                          <ListOrdered className="w-4 h-4" />
                          <span className="text-[10px] font-medium leading-none">Steps</span>
                          {exec.stepCount > 0 && (
                            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-violet-500 text-white text-[9px] font-bold px-1">
                              {exec.stepCount}
                            </span>
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-3 border-t border-slate-200 bg-slate-50 text-xs text-slate-500 flex items-center justify-between">
          <span>
            Showing {allItems.length} of {total} executions
          </span>
          {isFetchingNextPage && (
            <span className="flex items-center gap-1.5 text-brand-600">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Loading more…
            </span>
          )}
        </div>
        <div ref={sentinelRef} className="h-1" />
      </div>

      {modal && (
        <ExecutionFilesModal
          exec={modal.exec}
          defaultTab={modal.tab}
          onClose={() => setModal(null)}
          hasPrev={allItems.indexOf(modal.exec) > 0}
          hasNext={allItems.indexOf(modal.exec) < allItems.length - 1}
          onNavigate={(dir) => {
            const idx = allItems.indexOf(modal.exec)
            const next = dir === 'prev' ? allItems[idx - 1] : allItems[idx + 1]
            if (next) setModal({ ...modal, exec: next })
          }}
        />
      )}
    </>
  )
}
