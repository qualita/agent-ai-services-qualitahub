import { cn } from '@/lib/utils'
import { X } from 'lucide-react'
import { useEffect } from 'react'

const sizeClasses: Record<string, string> = {
  md: 'w-full max-w-xl',
  lg: 'w-full max-w-3xl',
  xl: 'w-full max-w-5xl',
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  icon,
  children,
  wide,
  size,
  noPadding,
  headerExtra,
}: {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: React.ReactNode
  icon?: React.ReactNode
  children: React.ReactNode
  wide?: boolean
  size?: 'md' | 'lg' | 'xl'
  noPadding?: boolean
  headerExtra?: React.ReactNode
}) {
  const resolvedSize = size ?? (wide ? 'lg' : 'md')

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className={cn(
          'relative bg-white rounded-xl shadow-2xl border border-slate-200 flex flex-col h-[75vh]',
          sizeClasses[resolvedSize]
        )}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2">
            {icon && <span className="text-slate-500">{icon}</span>}
            <div>
              <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
              {subtitle && <div className="mt-0.5">{subtitle}</div>}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {headerExtra}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div
          className={cn(
            'flex-1 min-h-0',
            noPadding ? 'flex flex-col' : 'overflow-y-auto px-6 py-4'
          )}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
