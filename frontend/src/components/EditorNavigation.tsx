'use client'

import Link from 'next/link'
import { ArrowLeft, Check, Loader2, TriangleAlert } from 'lucide-react'

interface Props {
  href: string
  label: string
  compact?: boolean
  pending: boolean
  saving: boolean
  saved: boolean
  error: Error | null
}

export function EditorNavigation({ href, label, compact = false, pending, saving, saved, error }: Props) {
  const status = error && !pending && !saving
    ? 'Not saved'
    : pending || saving
      ? 'Saving...'
      : saved
        ? 'Saved'
        : null

  return (
    <div className={`flex min-w-0 ${compact ? 'flex-col items-start gap-0.5' : 'items-center justify-between gap-2'}`}>
      <Link
        href={href}
        className="inline-flex max-w-full items-center gap-1.5 rounded-[7px] px-2 py-1 text-[11px] font-medium text-text-secondary hover:bg-glass-hover hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        <ArrowLeft className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="truncate">{label}</span>
      </Link>
      {status && (
        <span role="status" aria-live="polite" className={`inline-flex items-center gap-1 text-[11px] text-text-secondary flex-shrink-0 ${compact ? 'self-end' : ''}`}>
          {error && !pending && !saving ? <TriangleAlert className="w-3.5 h-3.5 text-red-400" />
            : pending || saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Check className="w-3.5 h-3.5 text-green-400" />}
          {status}
        </span>
      )}
    </div>
  )
}
