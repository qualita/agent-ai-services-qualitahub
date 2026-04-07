import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null) return '--'
  if (seconds < 1) return `${Math.round(seconds * 1000)}ms`
  const s = Math.floor(seconds)
  if (s < 60) return `${s}s`
  const minutes = Math.floor(s / 60)
  const remaining = s % 60
  return `${minutes}m ${remaining}s`
}

export function formatDate(dateStr: string | null): string {
  if (!dateStr) return '--'
  const d = new Date(dateStr)
  return d.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const STATUS_LABELS: Record<string, string> = {
  SUCCESS: 'Completado',
  FAILED: 'Error',
  RUNNING: 'En ejecución',
  PENDING: 'Pendiente',
  WARNING: 'Advertencia',
  SKIPPED: 'Omitido',
}

export function statusLabel(code: string | undefined): string {
  if (!code) return '--'
  return STATUS_LABELS[code.toUpperCase()] ?? code
}

export function isRunning(status: string | undefined): boolean {
  return status?.toUpperCase() === 'RUNNING'
}

export function statusColor(status: string | undefined): string {
  switch (status?.toUpperCase()) {
    case 'SUCCESS':
      return 'bg-emerald-100 text-emerald-800'
    case 'FAILED':
      return 'bg-red-100 text-red-800'
    case 'RUNNING':
      return 'bg-blue-100 text-blue-800'
    case 'PENDING':
      return 'bg-gray-100 text-gray-800'
    case 'WARNING':
      return 'bg-amber-100 text-amber-800'
    case 'SKIPPED':
      return 'bg-slate-100 text-slate-600'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}
