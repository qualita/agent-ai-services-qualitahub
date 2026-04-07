import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import {
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  Bot,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  Calendar,
} from 'lucide-react'
import { cn, formatDuration } from '@/lib/utils'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from 'recharts'
import type { DashboardStats } from '@/types'
import { Link } from 'react-router-dom'

const STATUS_COLORS: Record<string, string> = {
  Completado: '#10b981',
  Error: '#ef4444',
  'En ejecución': '#3b82f6',
  Pendiente: '#f59e0b',
}

function getMonthRange(offset: number): { dateFrom: string; dateTo: string; label: string } {
  const now = new Date()
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1)
  const year = d.getFullYear()
  const month = d.getMonth()
  const dateFrom = `${year}-${String(month + 1).padStart(2, '0')}-01`
  const lastDay = new Date(year, month + 1, 0).getDate()
  const dateTo = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  const label = d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
  return { dateFrom, dateTo, label: label.charAt(0).toUpperCase() + label.slice(1) }
}

export function DashboardPage() {
  const [monthOffset, setMonthOffset] = useState(0)
  const [trendMode, setTrendMode] = useState<'total' | 'status'>('total')

  const { dateFrom, dateTo, label: monthLabel } = useMemo(() => getMonthRange(monthOffset), [monthOffset])
  const isCurrentMonth = monthOffset === 0

  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ['dashboard-stats', dateFrom, dateTo],
    queryFn: () => api.getStats(dateFrom, dateTo),
  })

  if (isLoading || !stats) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-slate-200 rounded w-48" />
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-28 bg-slate-200 rounded" />
            ))}
          </div>
        </div>
      </div>
    )
  }

  const kpis = [
    {
      label: 'Total ejecuciones',
      value: stats.totalExecutions,
      icon: Activity,
      color: 'text-brand-600',
      bg: 'bg-brand-50',
    },
    {
      label: 'Completadas',
      value: stats.successCount,
      icon: CheckCircle2,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
    {
      label: 'Error',
      value: stats.failedCount,
      icon: XCircle,
      color: 'text-red-600',
      bg: 'bg-red-50',
    },
    {
      label: 'Duración media',
      value: formatDuration(stats.avgDurationSeconds),
      icon: Clock,
      color: 'text-amber-600',
      bg: 'bg-amber-50',
    },
  ]

  const statusData = [
    { name: 'Completado', value: stats.successCount },
    { name: 'Error', value: stats.failedCount },
    { name: 'En ejecución', value: stats.runningCount },
  ].filter((d) => d.value > 0)

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">
            Resumen de la actividad de ejecución de agentes
          </p>
        </div>
        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2">
          <Calendar className="w-4 h-4 text-slate-400" />
          <button
            onClick={() => setMonthOffset((o) => o - 1)}
            className="p-0.5 rounded hover:bg-slate-100 transition-colors text-slate-500 hover:text-slate-700"
            title="Mes anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium text-slate-700 min-w-[140px] text-center">
            {monthLabel}
          </span>
          <button
            onClick={() => setMonthOffset((o) => o + 1)}
            disabled={isCurrentMonth}
            className={cn(
              'p-0.5 rounded transition-colors',
              isCurrentMonth
                ? 'text-slate-300 cursor-not-allowed'
                : 'hover:bg-slate-100 text-slate-500 hover:text-slate-700'
            )}
            title="Mes siguiente"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          {!isCurrentMonth && (
            <button
              onClick={() => setMonthOffset(0)}
              className="ml-1 text-xs text-brand-600 hover:text-brand-700 font-medium"
            >
              Hoy
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {kpis.map((kpi) => (
          <div
            key={kpi.label}
            className="bg-white rounded-lg border border-slate-200 p-5"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {kpi.label}
              </span>
              <div className={cn('w-8 h-8 rounded flex items-center justify-center', kpi.bg)}>
                <kpi.icon className={cn('w-4 h-4', kpi.color)} />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900">{kpi.value}</div>
          </div>
        ))}
      </div>

      {/* Executions by Agent */}
      <div className="bg-white rounded-lg border border-slate-200 p-5 mb-6">
        <h2 className="text-sm font-semibold text-slate-900 mb-4">
          Ejecuciones por Agente
        </h2>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.executionsByAgent}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="agentName"
                tick={{ fontSize: 11 }}
                tickLine={false}
              />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} />
              <Tooltip
                contentStyle={{
                  fontSize: 12,
                  border: '1px solid #e2e8f0',
                  borderRadius: 6,
                }}
              />
              <Bar dataKey="count" fill="#4f46e5" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Execution Trend */}
        {stats.executionTrend && stats.executionTrend.length > 0 ? (
          <div className="bg-white rounded-lg border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-900">
                Tendencia ({monthLabel})
              </h2>
              <div className="flex bg-slate-100 rounded-md p-0.5">
                <button
                  onClick={() => setTrendMode('total')}
                  className={cn(
                    'px-2 py-0.5 text-xs rounded transition-colors',
                    trendMode === 'total'
                      ? 'bg-white text-slate-900 shadow-sm font-medium'
                      : 'text-slate-500 hover:text-slate-700'
                  )}
                >
                  Total
                </button>
                <button
                  onClick={() => setTrendMode('status')}
                  className={cn(
                    'px-2 py-0.5 text-xs rounded transition-colors',
                    trendMode === 'status'
                      ? 'bg-white text-slate-900 shadow-sm font-medium'
                      : 'text-slate-500 hover:text-slate-700'
                  )}
                >
                  Por estado
                </button>
              </div>
            </div>
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={stats.executionTrend}>
                  <defs>
                    <linearGradient id="gradTotal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradSuccess" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gradFailed" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    tickFormatter={(d: string) => {
                      const [, m, day] = d.split('-')
                      return `${day}/${m}`
                    }}
                  />
                  <YAxis tick={{ fontSize: 10 }} tickLine={false} allowDecimals={false} width={30} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 6 }}
                    labelFormatter={(d: string) => {
                      const [y, m, day] = d.split('-')
                      return `${day}/${m}/${y}`
                    }}
                  />
                  {trendMode === 'total' && (
                    <Area type="monotone" dataKey="total" name="Total" stroke="#6366f1" fill="url(#gradTotal)" strokeWidth={2} />
                  )}
                  {trendMode === 'status' && (
                    <Area type="monotone" dataKey="success" name="Completadas" stroke="#10b981" fill="url(#gradSuccess)" strokeWidth={2} />
                  )}
                  {trendMode === 'status' && (
                    <Area type="monotone" dataKey="failed" name="Error" stroke="#ef4444" fill="url(#gradFailed)" strokeWidth={2} />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <div />
        )}

        {/* Status Distribution */}
        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <h2 className="text-sm font-semibold text-slate-900 mb-4">
            Distribución por Estado
          </h2>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={3}
                >
                  {statusData.map((entry) => (
                    <Cell
                      key={entry.name}
                      fill={STATUS_COLORS[entry.name] ?? '#94a3b8'}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    fontSize: 12,
                    border: '1px solid #e2e8f0',
                    borderRadius: 6,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-4 mt-2">
            {statusData.map((d) => (
              <div key={d.name} className="flex items-center gap-1.5 text-xs text-slate-600">
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: STATUS_COLORS[d.name] }}
                />
                <span>{d.name} ({d.value})</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Agents list */}
      <div className="bg-white rounded-lg border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-900">Agentes</h2>
          <TrendingUp className="w-4 h-4 text-slate-400" />
        </div>
        <div className="space-y-2">
          {stats.executionsByAgent.map((agent) => (
            <Link
              key={agent.agentName}
              to={`/agents/${agent.agentId}`}
              className="flex items-center justify-between py-2.5 px-3 rounded hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-brand-50 rounded flex items-center justify-center">
                  <Bot className="w-4 h-4 text-brand-600" />
                </div>
                <span className="text-sm font-medium text-slate-700">
                  {agent.agentName}
                </span>
              </div>
              <span className="text-xs font-mono text-slate-500">
                {agent.count} ejecuciones
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
