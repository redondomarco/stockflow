import { useEffect, useState } from 'react'
import { productsApi } from '../services/api'
import { TrendingUp, TrendingDown, Settings } from 'lucide-react'

const TYPE_LABELS = { in: 'Entrada', out: 'Salida', adjustment: 'Ajuste' }
const TYPE_ICONS = { in: TrendingUp, out: TrendingDown, adjustment: Settings }
const TYPE_COLORS = { in: 'var(--green)', out: 'var(--red)', adjustment: 'var(--yellow)' }

export default function StockPage() {
  const [movements, setMovements] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterType, setFilterType] = useState('')

  useEffect(() => {
    setLoading(true)
    productsApi.stockMovements({ movement_type: filterType || undefined }).then(r => {
      setMovements(r.data.results || r.data)
    }).finally(() => setLoading(false))
  }, [filterType])

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Movimientos de stock</h1>
          <p className="page-subtitle">Historial completo de entradas, salidas y ajustes</p>
        </div>
      </div>

      <div className="page-body">
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="toolbar">
            <select className="form-select" style={{ width: 200 }} value={filterType} onChange={e => setFilterType(e.target.value)}>
              <option value="">Todos los movimientos</option>
              <option value="in">Entradas</option>
              <option value="out">Salidas</option>
              <option value="adjustment">Ajustes</option>
            </select>
          </div>
        </div>

        <div className="card">
          {loading ? <div className="loading"><div className="spinner" /></div> : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Producto</th>
                    <th>SKU</th>
                    <th>Cantidad</th>
                    <th>Stock anterior</th>
                    <th>Stock nuevo</th>
                    <th>Motivo</th>
                    <th>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.length === 0 && (
                    <tr><td colSpan={8}><div className="empty-state"><div className="empty-state-title">Sin movimientos</div></div></td></tr>
                  )}
                  {movements.map(m => {
                    const Icon = TYPE_ICONS[m.movement_type] || Settings
                    const color = TYPE_COLORS[m.movement_type]
                    return (
                      <tr key={m.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Icon size={14} style={{ color }} />
                            <span style={{ color, fontSize: 12, fontWeight: 600 }}>{TYPE_LABELS[m.movement_type]}</span>
                          </div>
                        </td>
                        <td style={{ fontWeight: 500 }}>{m.product_name}</td>
                        <td><span className="mono text-muted text-xs">{m.product_sku}</span></td>
                        <td>
                          <span className="mono" style={{ color, fontWeight: 700 }}>
                            {m.movement_type === 'in' ? '+' : m.movement_type === 'out' ? '-' : '='}{m.quantity}
                          </span>
                        </td>
                        <td><span className="mono text-muted">{m.stock_before}</span></td>
                        <td><span className="mono" style={{ fontWeight: 600 }}>{m.stock_after}</span></td>
                        <td><span className="text-muted text-sm">{m.reason || '–'}</span></td>
                        <td><span className="mono text-muted text-sm">{new Date(m.created_at).toLocaleString('es-AR')}</span></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
