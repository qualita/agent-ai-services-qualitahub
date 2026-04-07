import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { cn, formatDate, formatDuration, statusColor, statusLabel, isRunning } from '@/lib/utils'
import { ArrowLeft, Bot, Settings, Play, Inbox } from 'lucide-react'
import type { Agent, Execution } from '@/types'

export function AgentDetailPage() {
  const { id } = useParams<{ id: string }>()

  const { data: agent, isLoading: loadingAgent } = useQuery<Agent>({
    queryKey: ['agent', id],
    queryFn: () => api.getAgent(id!),
    enabled: !!id,
  })

  const { data: executions, isLoading: loadingExecs } = useQuery<{
    items: Execution[]
    total: number
  }>({
    queryKey: ['agent-executions', id],
    queryFn: () => api.getExecutions({ agentId: id }),
    enabled: !!id,
  })

  if (loadingAgent) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-6">
          <div className="h-6 bg-slate-200 rounded w-32" />
          <div className="h-32 bg-slate-200 rounded" />
        </div>
      </div>
    )
  }

  if (!agent) {
    return (
      <div className="p-8 text-center text-slate-500">Agent not found.</div>
    )
  }

  return (
    <div className="p-8 max-w-5xl">
      {/* Back link */}
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Dashboard
      </Link>

      {/* Agent header */}
      <div className="bg-white rounded-lg border border-slate-200 p-6 mb-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-brand-50 rounded-lg flex items-center justify-center">
            <Bot className="w-6 h-6 text-brand-600" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-semibold text-slate-900">
              {agent.name}
            </h1>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Code: {agent.code}
            </p>
            {agent.description && (
              <p className="text-sm text-slate-600 mt-2">{agent.description}</p>
            )}
          </div>
          <span
            className={cn(
              'inline-flex items-center px-2.5 py-1 rounded text-xs font-medium',
              agent.isActive
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-slate-100 text-slate-500'
            )}
          >
            {agent.isActive ? 'Active' : 'Inactive'}
          </span>
        </div>

        {/* Configuration */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <div className="text-xs text-slate-500 mb-0.5">Category</div>
            <div className="text-sm font-medium text-slate-700">
              {agent.categoryName ?? '-'}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 mb-0.5">Created</div>
            <div className="text-sm font-medium text-slate-700">
              {formatDate(agent.createdAt)}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 mb-0.5">Total Executions</div>
            <div className="text-sm font-medium text-slate-700">
              {executions?.total ?? '-'}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 mb-0.5">Version</div>
            <div className="text-sm font-medium text-slate-700">
              {agent.version ?? '-'}
            </div>
          </div>
        </div>

        {agent.configJson && (
          <div className="mt-4">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-2">
              <Settings className="w-3.5 h-3.5" />
              <span>Configuration</span>
            </div>
            <pre className="text-xs text-slate-600 bg-slate-50 rounded p-3 overflow-x-auto max-h-40">
              {agent.configJson}
            </pre>
          </div>
        )}
      </div>

      {/* Recent executions */}
      <div className="bg-white rounded-lg border border-slate-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Play className="w-4 h-4 text-slate-500" />
            <h2 className="text-sm font-semibold text-slate-900">
              Recent Executions
            </h2>
          </div>
          <Link
            to={`/executions?agent=${id}&name=${encodeURIComponent(agent.name)}`}
            className="text-xs text-brand-600 hover:underline"
          >
            View all
          </Link>
        </div>

        {loadingExecs ? (
          <div className="p-4 animate-pulse space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-10 bg-slate-100 rounded" />
            ))}
          </div>
        ) : executions?.items.length === 0 ? (
          <div className="p-8 text-center">
            <Inbox className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500">Sin ejecuciones para este agente</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {executions?.items.slice(0, 10).map((exec) => (
              <Link
                key={exec.executionId}
                to={`/executions/${exec.executionId}`}
                className="flex items-center justify-between px-5 py-3 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-medium',
                      statusColor(exec.status)
                    )}
                  >
                    {isRunning(exec.status) && (
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-500" />
                      </span>
                    )}
                    {statusLabel(exec.status)}
                  </span>
                  <span className="text-sm text-slate-700">
                    {exec.emailSubject
                      ? `${exec.triggerSource ?? 'EMAIL'} · ${exec.emailSubject}`
                      : (exec.triggerSource ?? 'Manual')}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs text-slate-500">
                  {exec.durationSeconds != null && (
                    <span className="font-mono">
                      {formatDuration(exec.durationSeconds)}
                    </span>
                  )}
                  <span>{formatDate(exec.startTime)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
