import { useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'

// Período de los tableros: '' = todo el historial (por defecto) o 'AAAA-MM'.
// Vive en la URL (?mes=2026-10) para compartirlo y mantenerlo entre Dashboard y Deudas.
const PARAM = 'mes'
const MONTHS_BACK = 24

export function monthLabel(ym, style = 'long') {
  const [y, m] = ym.split('-').map(Number)
  const text = new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: style, year: style === 'long' ? 'numeric' : '2-digit' })
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function recentMonths() {
  const now = new Date()
  return Array.from({ length: MONTHS_BACK }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
}

export function usePeriod() {
  const [params, setParams] = useSearchParams()
  const value = params.get(PARAM) || ''
  const setPeriod = (next) => {
    const updated = new URLSearchParams(params)
    if (next) updated.set(PARAM, next); else updated.delete(PARAM)
    setParams(updated, { replace: true })
  }
  return [/^\d{4}-\d{2}$/.test(value) ? value : '', setPeriod]
}

export default function PeriodSelector({ value, onChange }) {
  const months = recentMonths()
  if (value && !months.includes(value)) months.push(value)   // mes viejo llegado por URL
  const index = months.indexOf(value)
  // Las flechas recorren meses: ‹ más viejo, › más nuevo; desde "todo" entran al mes actual
  const older = value ? months[index + 1] : months[0]
  const newer = value && index > 0 ? months[index - 1] : null

  return (
    <div className="period-selector">
      <CalendarDays size={15} style={{ color: 'var(--text-muted)' }} aria-hidden="true" />
      <button className="btn btn-ghost btn-sm" onClick={() => onChange(older)} disabled={!older} aria-label="Mes anterior">
        <ChevronLeft size={15} />
      </button>
      <select className="form-select" value={value} onChange={e => onChange(e.target.value)} aria-label="Período">
        <option value="">Todo el historial</option>
        {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
      </select>
      <button className="btn btn-ghost btn-sm" onClick={() => onChange(newer)} disabled={!newer} aria-label="Mes siguiente">
        <ChevronRight size={15} />
      </button>
    </div>
  )
}
