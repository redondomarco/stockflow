import { useEffect, useState } from 'react'
import { ordersApi } from '../services/api'
import { useNavigate } from 'react-router-dom'
import { Search, ArrowUpRight } from 'lucide-react'

function fmt(n) {
  return parseFloat(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function DebtDashboardPage() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    ordersApi.debtDashboard()
      .then(r => setData(r.data || []))
      .finally(() => setLoading(false))
  }, [])

  const filtered = data.filter(d =>
    !search ||
    d.customer_name.toLowerCase().includes(search.toLowerCase()) ||
    (d.customer_email || '').toLowerCase().includes(search.toLowerCase())
  )

  const totalDebt = filtered.reduce((acc, d) => acc + d.balance, 0)
  const totalBilled = filtered.reduce((acc, d) => acc + d.total_billed, 0)
  const totalPaid = filtered.reduce((acc, d) => acc + d.total_paid, 0)

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard de deudas</h1>
          <p className="page-subtitle">Clientes con saldo pendiente de cobro</p>
        </div>
      </div>

      <div className="page-body">
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 16 }}>
          <div className="stat-card">
            <div className="stat-label">Total facturado</div>
            <div className="stat-value" style={{ fontSize: 20 }}>${fmt(totalBilled)}</div>
            <div className="stat-meta">{filtered.length} cliente(s)</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Total cobrado</div>
            <div className="stat-value green" style={{ fontSize: 20 }}>${fmt(totalPaid)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Deuda total</div>
            <div className="stat-value red" style={{ fontSize: 20 }}>${fmt(totalDebt)}</div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="toolbar">
            <div className="search-input" style={{ flex: 1 }}>
              <Search className="search-icon" size={15} />
              <input
                className="form-input"
                placeholder="Buscar cliente..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="card">
          {loading ? (
            <div className="loading"><div className="spinner" /></div>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th style={{ textAlign: 'center' }}>Pedidos</th>
                    <th style={{ textAlign: 'right' }}>Facturado</th>
                    <th style={{ textAlign: 'right' }}>Cobrado</th>
                    <th style={{ textAlign: 'right' }}>Saldo</th>
                    <th style={{ textAlign: 'right' }}>% Cobrado</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={7}>
                        <div className="empty-state" style={{ padding: 32 }}>
                          <div className="empty-state-title">
                            {data.length === 0 ? 'Sin deudas pendientes' : 'Sin resultados'}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                  {filtered.map(d => {
                    const pct = d.total_billed > 0 ? (d.total_paid / d.total_billed) * 100 : 0
                    return (
                      <tr key={d.customer_id}>
                        <td>
                          <div style={{ fontWeight: 500 }}>{d.customer_name}</div>
                          {d.customer_email && <div className="text-muted text-xs">{d.customer_email}</div>}
                        </td>
                        <td className="mono" style={{ textAlign: 'center' }}>{d.order_count}</td>
                        <td className="mono" style={{ textAlign: 'right' }}>${fmt(d.total_billed)}</td>
                        <td className="mono" style={{ textAlign: 'right', color: 'var(--green)' }}>${fmt(d.total_paid)}</td>
                        <td className="mono" style={{ textAlign: 'right', color: 'var(--red)', fontWeight: 700 }}>${fmt(d.balance)}</td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                            <div style={{ width: 60, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                              <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: pct > 80 ? 'var(--green)' : pct > 40 ? 'var(--yellow)' : 'var(--red)', borderRadius: 3 }} />
                            </div>
                            <span className="mono text-muted text-xs">{pct.toFixed(0)}%</span>
                          </div>
                        </td>
                        <td>
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => navigate(`/account-statement?customer=${d.customer_id}`)}
                            title="Ver cuenta corriente"
                          >
                            <ArrowUpRight size={13} />
                          </button>
                        </td>
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
