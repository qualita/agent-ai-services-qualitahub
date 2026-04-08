import { useState, useEffect, useMemo } from 'react'
import { toast } from 'sonner'
import { cn, formatDate } from '@/lib/utils'
import { api } from '@/api/client'
import * as XLSX from 'xlsx'
import {
  Mail,
  FileSpreadsheet,
  FileText,
  FileJson,
  File,
  FileImage,
  Download,
  Eye,
  ChevronUp,
  Loader2,
} from 'lucide-react'

function getMimeForType(type: string, mimeType: string | null): string {
  if (mimeType) return mimeType
  const t = type.toLowerCase()
  if (t === 'email') return 'message/rfc822'
  if (t === 'csv') return 'text/csv'
  if (t === 'json') return 'application/json'
  if (t === 'pdf') return 'application/pdf'
  return 'text/plain'
}

function stampedName(name: string): string {
  const ts = new Date().toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15) // 20260326_084412
  const dot = name.lastIndexOf('.')
  if (dot > 0) return `${name.slice(0, dot)}_${ts}${name.slice(dot)}`
  return `${name}_${ts}`
}

export async function downloadFile(
  filePath: string | null,
  contentText: string | null,
  fileName: string | null,
  type: string,
  mimeType: string | null,
) {
  const name = stampedName(fileName ?? `file.${type.toLowerCase()}`)
  try {
    if (filePath) {
      // Use same-origin content proxy to avoid CORS issues with Blob Storage
      const url = api.getFileDownloadUrl(filePath, name)
      const res = await fetch(url)
      if (!res.ok) throw new Error('Download failed')
      const blob = await res.blob()
      const objUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objUrl
      a.download = name
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(objUrl)
    } else if (contentText) {
      const blob = new Blob([contentText], { type: getMimeForType(type, mimeType) })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = name
      a.style.display = 'none'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(a.href)
    }
    toast.success(`Archivo descargado: ${name}`)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error desconocido'
    toast.error(`Error al descargar: ${msg}`)
  }
}

export function fileTypeIcon(type: string | null, mimeType: string | null, size = 4) {
  const t = (type ?? '').toLowerCase()
  const m = (mimeType ?? '').toLowerCase()
  const cls = `w-${size} h-${size}`
  if (t === 'email' || m.includes('message/rfc822'))
    return <Mail className={`${cls} text-amber-600`} />
  if (t === 'csv' || m.includes('csv'))
    return <FileSpreadsheet className={`${cls} text-emerald-600`} />
  if (t === 'excel' || m.includes('spreadsheet') || m.includes('excel'))
    return <FileSpreadsheet className={`${cls} text-emerald-700`} />
  if (t === 'json' || m.includes('json'))
    return <FileJson className={`${cls} text-blue-600`} />
  if (t === 'pdf' || m.includes('pdf'))
    return <FileText className={`${cls} text-red-600`} />
  if (m.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(t))
    return <FileImage className={`${cls} text-purple-600`} />
  if (t.includes('txt') || t.includes('summary') || m.includes('text/plain'))
    return <FileText className={`${cls} text-slate-600`} />
  return <File className={`${cls} text-slate-400`} />
}

export function fileTypeBadgeColor(type: string | null): string {
  const t = (type ?? '').toLowerCase()
  if (t === 'email') return 'bg-amber-50 text-amber-700 border-amber-200'
  if (t === 'csv') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (t === 'excel') return 'bg-emerald-50 text-emerald-800 border-emerald-200'
  if (t === 'json') return 'bg-blue-50 text-blue-700 border-blue-200'
  if (t === 'pdf') return 'bg-red-50 text-red-700 border-red-200'
  if (t.includes('txt') || t.includes('summary')) return 'bg-slate-50 text-slate-600 border-slate-200'
  return 'bg-slate-50 text-slate-500 border-slate-200'
}

export async function downloadAllFiles(
  files: { filePath: string | null; contentText: string | null; fileName: string | null; type: string; mimeType: string | null }[],
) {
  const downloadable = files.filter((f) => f.filePath || f.contentText)
  for (const file of downloadable) {
    await downloadFile(file.filePath, file.contentText, file.fileName, file.type, file.mimeType)
    // Small delay between downloads to avoid browser blocking
    if (downloadable.length > 1) await new Promise((r) => setTimeout(r, 400))
  }
}

export function DownloadAllButton({
  files,
  label,
}: {
  files: { filePath: string | null; contentText: string | null; fileName: string | null; type: string; mimeType: string | null }[]
  label?: string
}) {
  const [downloading, setDownloading] = useState(false)
  const downloadable = files.filter((f) => f.filePath || f.contentText)
  if (downloadable.length === 0) return null

  return (
    <button
      onClick={async (e) => {
        e.stopPropagation()
        setDownloading(true)
        try {
          await downloadAllFiles(downloadable)
        } finally {
          setDownloading(false)
        }
      }}
      disabled={downloading}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-brand-700 bg-brand-50 border border-brand-200 rounded-md hover:bg-brand-100 transition-colors disabled:opacity-50"
      title={`Download all (${downloadable.length})`}
    >
      {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
      {label ?? `Download all (${downloadable.length})`}
    </button>
  )
}

export function FilePill({ type, fileName, mimeType }: { type: string; fileName: string | null; mimeType: string | null }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs font-medium', fileTypeBadgeColor(type))}>
      {fileTypeIcon(type, mimeType, 3.5)}
      <span className="truncate max-w-[160px]">{fileName ?? type}</span>
    </span>
  )
}

export function emailSubject(contentText: string | null): string | null {
  if (!contentText) return null
  const { headers } = parseEmail(contentText)
  return headers['subject'] || null
}

function parseEmail(content: string) {
  const lines = content.split('\n')
  const headers: Record<string, string> = {}
  let bodyStart = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.trim() === '') {
      bodyStart = i + 1
      break
    }
    const match = line.match(/^([A-Za-z-]+):\s*(.*)$/)
    if (match) {
      headers[match[1].toLowerCase()] = match[2]
    }
  }
  const body = lines.slice(bodyStart).join('\n').trim()
  return { headers, body }
}

export function EmailViewer({ content }: { content: string }) {
  const { headers, body } = parseEmail(content)
  return (
    <div className="border border-amber-200 rounded-lg overflow-hidden">
      <div className="bg-amber-50 px-4 py-3 space-y-1.5">
        {headers['from'] && (
          <div className="flex gap-2 text-xs">
            <span className="font-semibold text-amber-800 w-14 shrink-0">From:</span>
            <span className="text-amber-700">{headers['from']}</span>
          </div>
        )}
        {headers['to'] && (
          <div className="flex gap-2 text-xs">
            <span className="font-semibold text-amber-800 w-14 shrink-0">To:</span>
            <span className="text-amber-700">{headers['to']}</span>
          </div>
        )}
        {headers['subject'] && (
          <div className="flex gap-2 text-xs">
            <span className="font-semibold text-amber-800 w-14 shrink-0">Subject:</span>
            <span className="text-amber-700 font-medium">{headers['subject']}</span>
          </div>
        )}
        {headers['date'] && (
          <div className="flex gap-2 text-xs">
            <span className="font-semibold text-amber-800 w-14 shrink-0">Date:</span>
            <span className="text-amber-700">{headers['date']}</span>
          </div>
        )}
      </div>
      {body && (
        <div className="px-4 py-3 text-xs text-slate-700 whitespace-pre-wrap bg-white">
          {body}
        </div>
      )}
    </div>
  )
}

export function CsvViewer({ content }: { content: string }) {
  const lines = content.trim().split('\n')
  if (lines.length === 0) return null
  const headers = lines[0].split(',').map((h) => h.trim())
  const rows = lines.slice(1).map((line) => line.split(',').map((c) => c.trim()))
  return (
    <div className="border border-emerald-200 rounded-lg overflow-hidden">
      <div className="overflow-x-auto max-h-60">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-emerald-50">
              {headers.map((h, i) => (
                <th key={i} className="text-left px-3 py-2 font-semibold text-emerald-800 border-b border-emerald-200 whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-emerald-100">
            {rows.map((row, ri) => (
              <tr key={ri} className="hover:bg-emerald-50/50">
                {row.map((cell, ci) => (
                  <td key={ci} className="px-3 py-1.5 text-slate-700 whitespace-nowrap">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function JsonViewer({ content }: { content: string }) {
  let formatted: string
  try {
    formatted = JSON.stringify(JSON.parse(content), null, 2)
  } catch {
    formatted = content
  }
  return (
    <div className="border border-blue-200 rounded-lg overflow-hidden">
      <pre className="text-xs text-blue-900 bg-blue-50 p-4 overflow-x-auto max-h-60 whitespace-pre-wrap font-mono">
        {formatted}
      </pre>
    </div>
  )
}

/* ── Blob preview helpers ─────────────────────────────────── */

function isTextPreviewable(type: string, mimeType: string | null, filePath: string | null = null): boolean {
  const t = type.toLowerCase()
  const m = (mimeType ?? '').toLowerCase()
  const fp = (filePath ?? '').toLowerCase()
  return (
    t === 'email' || t === 'csv' || t === 'json' || t === 'txt' || t === 'text' || t === 'summary' ||
    m.includes('text/') || m.includes('json') || m.includes('csv') || m.includes('message/rfc822') ||
    fp.endsWith('.txt') || fp.endsWith('.csv') || fp.endsWith('.json') || fp.endsWith('.eml')
  )
}

function isExcel(type: string, mimeType: string | null, filePath: string | null = null): boolean {
  const t = type.toLowerCase()
  const m = (mimeType ?? '').toLowerCase()
  const fp = (filePath ?? '').toLowerCase()
  return (
    t === 'excel' || m.includes('spreadsheet') || m.includes('excel') ||
    fp.endsWith('.xlsx') || fp.endsWith('.xls')
  )
}

function isImagePreviewable(type: string, mimeType: string | null): boolean {
  const m = (mimeType ?? '').toLowerCase()
  return m.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(type)
}

function isPdf(type: string, mimeType: string | null): boolean {
  return type.toLowerCase() === 'pdf' || (mimeType ?? '').toLowerCase().includes('pdf')
}

export function canPreview(type: string, mimeType: string | null, contentText: string | null, filePath: string | null): boolean {
  if (contentText) return true
  if (!filePath) return false
  return isPdf(type, mimeType) || isImagePreviewable(type, mimeType) || isExcel(type, mimeType, filePath) || isTextPreviewable(type, mimeType, filePath)
}

/** Fetches text content from a blob via SAS URL, then renders with the right viewer */
export function BlobPreview({
  type,
  mimeType,
  filePath,
  maxHeight,
}: {
  type: string
  mimeType: string | null
  filePath: string
  maxHeight?: string
}) {
  const t = type.toLowerCase()

  // PDF — iframe with SAS URL
  if (isPdf(t, mimeType)) {
    return <BlobPdfViewer filePath={filePath} />
  }

  // Image — img with SAS URL
  if (isImagePreviewable(type, mimeType)) {
    return <BlobImageViewer filePath={filePath} />
  }

  // Excel — fetch binary, parse with SheetJS
  if (isExcel(type, mimeType, filePath)) {
    return <BlobExcelViewer filePath={filePath} />
  }

  // Text-based — fetch content, render with viewer
  return <BlobTextViewer filePath={filePath} type={t} maxHeight={maxHeight} />
}

function BlobExcelViewer({ filePath }: { filePath: string }) {
  const [data, setData] = useState<(string | number | null)[][] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    api.getFileContentBuffer(filePath).then((buffer) => {
      if (cancelled) return
      const workbook = XLSX.read(new Uint8Array(buffer), { type: 'array' })
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]]
      const rows: (string | number | null)[][] = XLSX.utils.sheet_to_json(firstSheet, { header: 1 })
      setData(rows)
    }).catch(() => {
      if (!cancelled) setError(true)
    })
    return () => { cancelled = true }
  }, [filePath])

  if (error) return <PreviewError message="Error al cargar el archivo Excel" />
  if (!data) return <PreviewLoading />
  if (data.length === 0) return <PreviewError message="El archivo Excel está vacío" />

  const headers = data[0] ?? []
  const rows = data.slice(1)

  return (
    <div className="border border-emerald-200 rounded-lg overflow-hidden">
      <div className="overflow-x-auto max-h-80">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-emerald-50">
              {headers.map((h, i) => (
                <th key={i} className="text-left px-3 py-2 font-semibold text-emerald-800 border-b border-emerald-200 whitespace-nowrap">
                  {h ?? ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-emerald-100">
            {rows.slice(0, 100).map((row, ri) => (
              <tr key={ri} className="hover:bg-emerald-50/50">
                {headers.map((_, ci) => (
                  <td key={ci} className="px-3 py-1.5 text-slate-700 whitespace-nowrap">
                    {row[ci] ?? ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 100 && (
        <div className="px-3 py-2 text-xs text-slate-400 bg-slate-50 border-t border-emerald-200">
          Mostrando 100 de {rows.length} filas
        </div>
      )}
    </div>
  )
}

function BlobPdfViewer({ filePath }: { filePath: string }) {
  // Use same-origin content proxy URL directly — no CORS issues
  const url = api.getFileContentUrl(filePath)
  return (
    <iframe
      src={url}
      className="w-full rounded-lg border border-slate-200"
      style={{ height: '500px' }}
      title="PDF preview"
    />
  )
}

function BlobImageViewer({ filePath }: { filePath: string }) {
  // Use same-origin content proxy URL directly — no CORS issues
  const url = api.getFileContentUrl(filePath)
  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50 p-2">
      <img src={url} alt="Preview" className="max-w-full max-h-[500px] mx-auto rounded" />
    </div>
  )
}

function BlobTextViewer({ filePath, type, maxHeight }: { filePath: string; type: string; maxHeight?: string }) {
  const [content, setContent] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    api.getFileContentText(filePath).then((text) => {
      if (!cancelled) setContent(text)
    }).catch(() => {
      if (!cancelled) setError(true)
    })
    return () => { cancelled = true }
  }, [filePath])

  if (error) return <PreviewError message="Error al cargar el archivo" />
  if (content === null) return <PreviewLoading />
  return <InlinePreview type={type} content={content} maxHeight={maxHeight} />
}

function PreviewLoading() {
  return (
    <div className="flex items-center justify-center py-8 text-slate-400">
      <Loader2 className="w-5 h-5 animate-spin mr-2" />
      <span className="text-sm">Cargando vista previa...</span>
    </div>
  )
}

function PreviewError({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-slate-400">
      <FileText className="w-10 h-10 mb-2" />
      <p className="text-sm font-medium">{message}</p>
      <p className="text-xs mt-1">Descargue el archivo para ver su contenido</p>
    </div>
  )
}

/** Renders text content with the appropriate viewer */
export function InlinePreview({ type, content, maxHeight }: { type: string; content: string; maxHeight?: string }) {
  const t = type.toLowerCase()
  if (t === 'email') return <EmailViewer content={content} />
  if (t === 'csv') return <CsvViewer content={content} />
  if (t === 'json') return <JsonViewer content={content} />
  return (
    <pre className={cn('text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg p-4 overflow-x-auto whitespace-pre-wrap font-mono', maxHeight ?? 'max-h-60')}>
      {content}
    </pre>
  )
}

export function FileCard({
  type,
  fileName,
  mimeType,
  contentText,
  filePath,
  timestamp,
  direction,
}: {
  type: string
  fileName: string | null
  mimeType: string | null
  contentText: string | null
  filePath: string | null
  timestamp: string | null
  direction: 'input' | 'output'
}) {
  const [expanded, setExpanded] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const t = type.toLowerCase()
  const hasPreview = canPreview(type, mimeType, contentText, filePath)
  const canDownload = !!filePath || !!contentText

  // For emails, derive display name from subject header
  const displayName = useMemo(() => {
    if (fileName) return fileName
    if (t === 'email') {
      const subj = emailSubject(contentText)
      if (subj) return subj
    }
    return `${direction}.${t}`
  }, [fileName, t, contentText, direction])

  const renderContent = () => {
    if (contentText) {
      return <InlinePreview type={t} content={contentText} />
    }
    if (filePath) {
      return <BlobPreview type={type} mimeType={mimeType} filePath={filePath} />
    }
    return null
  }

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-white">
        <div className="flex items-center gap-3 min-w-0">
          {fileTypeIcon(type, mimeType)}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-800 truncate">
                {displayName}
              </span>
            </div>
            <div className="flex items-center gap-3 mt-0.5">
              {timestamp && (
                <span className="text-[11px] text-slate-400">{formatDate(timestamp)}</span>
              )}
              {filePath && (
                <span className="text-[11px] text-slate-400 font-mono truncate max-w-[200px]" title={filePath}>
                  {filePath}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-3">
          {hasPreview && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1.5 rounded hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-600"
              title={expanded ? 'Collapse' : 'Preview'}
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          )}
          {canDownload && (
            <button
              onClick={async () => {
                setDownloading(true)
                try {
                  await downloadFile(filePath, contentText, fileName, type, mimeType)
                } finally {
                  setDownloading(false)
                }
              }}
              className="p-1.5 rounded hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-600"
              title="Download"
              disabled={downloading}
            >
              {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>
      {expanded && hasPreview && (
        <div className="px-4 pb-4 pt-1">{renderContent()}</div>
      )}
    </div>
  )
}
