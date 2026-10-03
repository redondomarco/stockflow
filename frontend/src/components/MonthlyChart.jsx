import { useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid } from 'recharts'
import { monthLabel } from './PeriodSelector'

// Paleta categórica validada (dataviz validate_palette.js, modo oscuro, superficie #111118):
// todos los checks pasan; ΔE CVD 26.8, normal 31.8, contraste ≥ 3:1. Orden fijo de slots.
const SERIES = [
  { key: 'billed', label: 'Facturado', color: '#3987e5' },   // slot 1
  { key: 'collected', label: 'Cobrado', color: '#d95926' },  // slot 2
]

const money = (n) => '$' + Math.round(n || 0).toLocaleString('es-AR')
const compact = (n) => {
  const abs = Math.abs(n)
  if (abs >= 1e6) return '$' + (n / 1e6).toLocaleString('es-AR', { maximumFractionDigits: 1 }) + ' M'
  if (abs >= 1e3) return '$' + Math.round(n / 1e3).toLocaleString('es-AR') + ' mil'
  return '$' + Math.round(n)
}

function ChartTooltip({ active, payload, label, series }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 8, padding: '8px 12px', fontSize: 12 }}>
      <div style={{ color: 'var(--text-muted)', marginBottom: 4 }}>{monthLabel(label)} · {row.orders} pedido{row.orders === 1 ? '' : 's'}</div>
      {series.map(s => (
        <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color }} />
          <strong style={{ color: 'var(--text)' }}>{money(row[s.key])}</strong>
          <span style={{ color: 'var(--text-muted)' }}>{s.label}</span>
        </div>
      ))}
    </div>
  )
}

// Evolución mensual: columnas agrupadas (un solo eje, ambas series en pesos).
// Tocar un mes lo selecciona como período del tablero.
export default function MonthlyChart({ data, includesCollected, selected, onSelect }) {
  const [asTable, setAsTable] = useState(false)
  const series = includesCollected ? SERIES : SERIES.slice(0, 1)
  const empty = !data.some(d => d.billed || d.collected)

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-header" style={{ flexWrap: 'wrap', gap: 8 }}>
        <span className="card-title">Evolución mensual · últimos {data.length} meses</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          {series.length > 1 && series.map(s => (
            <span key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)' }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: s.color }} aria-hidden="true" />{s.label}
            </span>
          ))}
          <button className="btn btn-ghost btn-sm" onClick={() => setAsTable(t => !t)}>{asTable ? 'Ver gráfico' : 'Ver tabla'}</button>
        </div>
      </div>

      {empty ? (
        <div className="empty-state" style={{ padding: 32 }}>Sin pedidos en los últimos meses</div>
      ) : asTable ? (
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Mes</th>
                <th style={{ textAlign: 'right' }}>Pedidos</th>
                {series.map(s => <th key={s.key} style={{ textAlign: 'right' }}>{s.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {[...data].reverse().map(d => (
                <tr key={d.month} style={{ cursor: 'pointer', background: d.month === selected ? 'var(--accent-glow)' : undefined }} onClick={() => onSelect(d.month)}>
                  <td>{monthLabel(d.month)}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{d.orders}</td>
                  {series.map(s => <td key={s.key} className="mono" style={{ textAlign: 'right' }}>{money(d[s.key])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data} barGap={2} barCategoryGap="22%" margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
              onClick={e => e?.activeLabel && onSelect(e.activeLabel)} style={{ cursor: 'pointer' }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="month" tickFormatter={m => monthLabel(m, 'short')} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis tickFormatter={compact} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={64} />
              <Tooltip content={<ChartTooltip series={series} />} cursor={{ fill: 'var(--bg-hover)' }} />
              {series.map(s => (
                // Sin animación: al cambiar de mes las barras no se redibujan desde cero
                <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} maxBarSize={20} radius={[4, 4, 0, 0]} isAnimationActive={false}>
                  {/* Con un mes elegido, los demás quedan atenuados */}
                  {data.map(d => <Cell key={d.month} fillOpacity={!selected || d.month === selected ? 1 : 0.35} />)}
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
          <div className="text-muted" style={{ fontSize: 11, marginTop: 4 }}>
            Facturado: pedidos no anulados, por mes de carga.{includesCollected && ' Cobrado: pagos aprobados, por mes del pago.'} Tocá un mes para verlo en detalle.
          </div>
        </>
      )}
    </div>
  )
}
