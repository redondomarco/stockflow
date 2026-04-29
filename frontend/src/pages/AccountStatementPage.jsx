import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ordersApi } from '../services/api'
import { Search, ChevronDown, ChevronRight } from 'lucide-react'

const STATUS_LABELS = {
  pending: 'Pendiente',
  partial: 'Entrega parcial',
  delivered: 'Entregado',
  cancelled: 'Anulado',
}

const METHOD_LABELS = {
  cash: 'Efectivo', transfer: 'Transferencia',
  credit_card: 'T. Crédito', debit_card: 'T. Débito',
  mercadopago: 'MercadoPago', other: 'Otro',
}

function fmt(n) {
  return parseFloat(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function AccountStatementPage() {
  const [searchParams] = useSearchParams()
  const [customers, setCustomers] = useState([])
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState(searchParams.get('customer') || '')
  const [statement, setStatement] = useState(null)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState({})

  useEffect(() => {
    ordersApi.customers().then(r => setCustomers(r.data.results || r.data))
  }, [])

  useEffect(() => {
    if (!selectedId) { setStatement(null); return }
    setLoading(true)
    ordersApi.accountStatement(selectedId)
      .then(r => setStatement(r.data))
      .finally(() => setLoading(false))
  }, [selectedId])

  const filtered = customers.filter(c =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || (c.email || '').toLowerCase().includes(search.toLowerCase())
  )

  const toggleExpand = (id) => setExpanded(p => ({ ...p, [id]: !p[id] }))

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Cuenta corriente</h1>
          <p className="page-subtitle">Informe de facturación y pagos por cliente</p>
        </div>
      </div>

      <div className="page-body">
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="toolbar">
            <div className="search-input" style={{ width: 280 }}>
              <Search className="search-icon" size={15} />
              <input
                className="form-input"
                placeholder="Buscar cliente..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <select
              className="form-select"
              style={{ flex: 1, maxWidth: 340 }}
              value={selectedId}
              onChange={e => setSelectedId(e.target.value)}
            >
              <option value="">Seleccionar cliente</option>
              {filtered.map(c => (
                <option key={c.id} value={c.id}>{c.name}{c.email ? ` — ${c.email}` : ''}</option>
              ))}
            </select>
          </div>
        </div>

        {loading && <div className="loading"><div className="spinner" /></div>}

        {statement && !loading && (
          <>
            {/* Summary */}
            <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 16 }}>
              <div className="stat-card">
                <div className="stat-label">Pedidos activos</div>
                <div className="stat-value accent">{statement.summary.order_count}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Total facturado</div>
                <div className="stat-value" style={{ fontSize: 20 }}>${fmt(statement.summary.total_billed)}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Total cobrado</div>
                <div className="stat-value green" style={{ fontSize: 20 }}>${fmt(statement.summary.total_paid)}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Saldo pendiente</div>
                <div className="stat-value" style={{ fontSize: 20, color: statement.summary.balance > 0 ? 'var(--red)' : 'var(--green)' }}>
                  ${fmt(statement.summary.balance)}
                </div>
              </div>
            </div>

            {/* Orders table */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">{statement.customer.name}</span>
                {statement.customer.email && <span className="text-muted text-sm">{statement.customer.email}</span>}
              </div>

              {statement.orders.length === 0 ? (
                <div className="empty-state" style={{ padding: 32 }}>
                  <div className="empty-state-title">Sin pedidos activos</div>
                </div>
              ) : (
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: 28 }}></th>
                        <th>N° Pedido</th>
                        <th>Fecha</th>
                        <th>Estado</th>
                        <th style={{ textAlign: 'right' }}>Total</th>
                        <th style={{ textAlign: 'right' }}>Cobrado</th>
                        <th style={{ textAlign: 'right' }}>Saldo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {statement.orders.map(order => (
                        <>
                          <tr
                            key={order.id}
                            style={{ cursor: 'pointer' }}
                            onClick={() => toggleExpand(order.id)}
                          >
                            <td>
                              <button className="btn btn-ghost btn-sm" style={{ padding: '2px 4px' }}>
                                {expanded[order.id] ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                              </button>
                            </td>
                            <td><span className="mono text-accent" style={{ fontWeight: 700 }}>{order.order_number}</span></td>
                            <td><span className="mono text-muted text-sm">{new Date(order.date).toLocaleDateString('es-AR')}</span></td>
                            <td><span className={`badge badge-${order.status}`}>{order.status_display}</span></td>
                            <td className="mono" style={{ textAlign: 'right' }}>${fmt(order.total)}</td>
                            <td className="mono" style={{ textAlign: 'right', color: 'var(--green)' }}>${fmt(order.amount_paid)}</td>
                            <td className="mono" style={{ textAlign: 'right', color: order.balance > 0 ? 'var(--red)' : 'var(--green)', fontWeight: order.balance > 0 ? 700 : 400 }}>
                              ${fmt(order.balance)}
                            </td>
                          </tr>

                          {expanded[order.id] && (
                            <tr key={`exp-${order.id}`}>
                              <td colSpan={7} style={{ padding: '0 0 8px 32px', background: 'var(--bg)' }}>
                                {order.payments.length === 0 ? (
                                  <div style={{ padding: '8px 0', color: 'var(--text-muted)', fontSize: 12 }}>Sin pagos registrados</div>
                                ) : (
                                  <table style={{ width: '100%', marginTop: 8 }}>
                                    <thead>
                                      <tr>
                                        <th style={{ fontSize: 11 }}>Fecha</th>
                                        <th style={{ fontSize: 11 }}>Método</th>
                                        <th style={{ fontSize: 11 }}>Estado</th>
                                        <th style={{ fontSize: 11, textAlign: 'right' }}>Monto</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {order.payments.map(p => (
                                        <tr key={p.id}>
                                          <td className="mono text-muted" style={{ fontSize: 12 }}>{new Date(p.created_at).toLocaleDateString('es-AR')}</td>
                                          <td style={{ fontSize: 12 }}>{METHOD_LABELS[p.payment_method] || p.payment_method}</td>
                                          <td><span className={`badge badge-${p.status}`} style={{ fontSize: 10 }}>{p.status}</span></td>
                                          <td className="mono" style={{ textAlign: 'right', fontSize: 13, fontWeight: 600, color: 'var(--green)' }}>${fmt(p.amount)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                )}
                              </td>
                            </tr>
                          )}
                        </>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: '2px solid var(--border)' }}>
                        <td colSpan={4} style={{ fontWeight: 700, padding: '10px 12px' }}>Total</td>
                        <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>${fmt(statement.summary.total_billed)}</td>
                        <td className="mono" style={{ textAlign: 'right', fontWeight: 700, color: 'var(--green)' }}>${fmt(statement.summary.total_paid)}</td>
                        <td className="mono" style={{ textAlign: 'right', fontWeight: 700, color: statement.summary.balance > 0 ? 'var(--red)' : 'var(--green)' }}>
                          ${fmt(statement.summary.balance)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {!selectedId && !loading && (
          <div className="card">
            <div className="empty-state" style={{ padding: 48 }}>
              <div className="empty-state-title">Seleccioná un cliente</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 6 }}>Elegí un cliente para ver su cuenta corriente</div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
