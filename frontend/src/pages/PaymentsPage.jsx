import { useEffect, useState } from 'react'
import { paymentsApi } from '../services/api'
import { CheckCircle, XCircle, RotateCcw, Search } from 'lucide-react'

const STATUS_LABELS = { pending:'Pendiente', processing:'Procesando', approved:'Aprobado', rejected:'Rechazado', refunded:'Reembolsado' }
const METHOD_LABELS = { cash:'Efectivo', transfer:'Transferencia', credit_card:'T. Crédito', debit_card:'T. Débito', mercadopago:'MercadoPago', other:'Otro' }

export default function PaymentsPage() {
  const [payments, setPayments] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState('')

  const load = () => {
    setLoading(true)
    Promise.all([
      paymentsApi.list({ status: filterStatus || undefined }),
      paymentsApi.stats(),
    ]).then(([p, s]) => {
      setPayments(p.data.results || p.data)
      setStats(s.data)
    }).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [filterStatus])

  const approve = async (id) => {
    if (!confirm('¿Aprobar este pago?')) return
    await paymentsApi.approve(id, {})
    load()
  }

  const reject = async (id) => {
    const reason = prompt('Motivo del rechazo:')
    if (reason === null) return
    await paymentsApi.reject(id, { reason })
    load()
  }

  const refund = async (id) => {
    if (!confirm('¿Reembolsar este pago?')) return
    await paymentsApi.refund(id)
    load()
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Pagos</h1>
          <p className="page-subtitle">Gestión de pagos de pedidos</p>
        </div>
      </div>

      <div className="page-body">
        {stats && (
          <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: 24 }}>
            <div className="stat-card">
              <div className="stat-label">Ingresos aprobados</div>
              <div className="stat-value green">${stats.total_approved?.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Pendiente de cobro</div>
              <div className="stat-value yellow">${stats.total_pending?.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</div>
            </div>
            <div className="stat-card">
              <div className="stat-label">Reembolsado</div>
              <div className="stat-value red">${stats.total_refunded?.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</div>
            </div>
          </div>
        )}

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="toolbar">
            <select className="form-select" style={{ width: 180 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">Todos los estados</option>
              {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>

        <div className="card">
          {loading ? <div className="loading"><div className="spinner" /></div> : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Pedido</th>
                    <th>Monto</th>
                    <th>Método</th>
                    <th>Estado</th>
                    <th>Fecha</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.length === 0 && (
                    <tr><td colSpan={6}><div className="empty-state"><div className="empty-state-title">Sin pagos registrados</div></div></td></tr>
                  )}
                  {payments.map(p => (
                    <tr key={p.id}>
                      <td><span className="mono text-accent">{p.order_number}</span></td>
                      <td><span className="mono" style={{ fontWeight: 700 }}>${parseFloat(p.amount).toLocaleString('es-AR')}</span></td>
                      <td><span className="text-muted">{METHOD_LABELS[p.payment_method] || p.payment_method}</span></td>
                      <td><span className={`badge badge-${p.status}`}>{STATUS_LABELS[p.status]}</span></td>
                      <td><span className="mono text-muted text-sm">{new Date(p.created_at).toLocaleDateString('es-AR')}</span></td>
                      <td>
                        <div className="flex gap-2">
                          {p.status === 'pending' && (
                            <>
                              <button className="btn btn-ghost btn-sm" onClick={() => approve(p.id)} title="Aprobar" style={{ color: 'var(--green)' }}>
                                <CheckCircle size={14} />
                              </button>
                              <button className="btn btn-ghost btn-sm" onClick={() => reject(p.id)} title="Rechazar" style={{ color: 'var(--red)' }}>
                                <XCircle size={14} />
                              </button>
                            </>
                          )}
                          {p.status === 'approved' && (
                            <button className="btn btn-ghost btn-sm" onClick={() => refund(p.id)} title="Reembolsar" style={{ color: 'var(--yellow)' }}>
                              <RotateCcw size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
