import { useEffect, useState } from 'react'
import { paymentsApi } from '../services/api'
import { usePermissions } from '../context/AuthContext'
import { CheckCircle, XCircle, RotateCcw, AlertTriangle, Check } from 'lucide-react'

const STATUS_LABELS = { pending:'Pendiente', processing:'Procesando', approved:'Aprobado', rejected:'Rechazado', refunded:'Reembolsado' }
const METHOD_LABELS = { cash:'Efectivo', transfer:'Transferencia', credit_card:'T. Crédito', debit_card:'T. Débito', mercadopago:'MercadoPago', other:'Otro' }

export default function PaymentsPage() {
  // Con aprobación restringida el backend además exige "Puede aprobar pagos" (responde 403 con mensaje)
  const canWrite = usePermissions().can('payments', 'write')
  const [payments, setPayments] = useState([])
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState('')
  const [error, setError] = useState('')

  const load = () => {
    setLoading(true)
    const params = filterStatus === 'review' ? { needs_review: true } : { status: filterStatus || undefined }
    Promise.all([
      paymentsApi.list(params),
      paymentsApi.stats(),
    ]).then(([p, s]) => {
      setPayments(p.data.results || p.data)
      setStats(s.data)
    }).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [filterStatus])

  // Ejecuta una acción mostrando el error del backend si falla
  const run = async (fn) => {
    setError('')
    try { await fn(); load() }
    catch (e) { setError(e.response?.data?.error || 'Error al procesar el pago') }
  }

  const approve = (id) => {
    if (!confirm('¿Aprobar este pago?')) return
    run(async () => {
      try {
        await paymentsApi.approve(id, {})
      } catch (e) {
        // Política "avisar": el backend pide confirmar pagos que superan el saldo
        if (e.response?.data?.code !== 'overpayment_warning') throw e
        if (!confirm(e.response.data.error)) return
        await paymentsApi.approve(id, { confirm_overpayment: true })
      }
    })
  }

  const reject = (id) => {
    const reason = prompt('Motivo del rechazo:')
    if (reason === null) return
    run(() => paymentsApi.reject(id, { reason }))
  }

  const refund = (id) => {
    if (!confirm('¿Reembolsar este pago?')) return
    run(() => paymentsApi.refund(id))
  }

  const markReviewed = (id) => {
    if (!confirm('¿Conservar el cobro y quitar la marca de revisión?')) return
    run(() => paymentsApi.markReviewed(id))
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

        {error && <div className="alert alert-danger" style={{ marginBottom: 16 }}>{error}</div>}

        {stats?.needs_review_count > 0 && filterStatus !== 'review' && (
          <div className="alert alert-warning" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={14} />
            <span>{stats.needs_review_count} pago(s) aprobado(s) de pedidos anulados para revisar.</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setFilterStatus('review')}>Ver</button>
          </div>
        )}

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="toolbar">
            <select className="form-select" style={{ width: 180 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
              <option value="">Todos los estados</option>
              {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              <option value="review">Para revisar</option>
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
                      <td>
                        <span className={`badge badge-${p.status}`} title={p.notes || undefined}>{STATUS_LABELS[p.status]}</span>
                        {p.needs_review && (
                          <span className="badge badge-pending" style={{ marginLeft: 6 }} title="Pedido anulado: decidir si se reembolsa o se conserva">
                            Revisar
                          </span>
                        )}
                      </td>
                      <td><span className="mono text-muted text-sm">{new Date(p.created_at).toLocaleDateString('es-AR')}</span></td>
                      <td>
                        <div className="flex gap-2">
                          {canWrite && p.status === 'pending' && (
                            <>
                              <button className="btn btn-ghost btn-sm" onClick={() => approve(p.id)} title="Aprobar" style={{ color: 'var(--green)' }}>
                                <CheckCircle size={14} />
                              </button>
                              <button className="btn btn-ghost btn-sm" onClick={() => reject(p.id)} title="Rechazar" style={{ color: 'var(--red)' }}>
                                <XCircle size={14} />
                              </button>
                            </>
                          )}
                          {canWrite && p.status === 'approved' && (
                            <button className="btn btn-ghost btn-sm" onClick={() => refund(p.id)} title="Reembolsar" style={{ color: 'var(--yellow)' }}>
                              <RotateCcw size={14} />
                            </button>
                          )}
                          {canWrite && p.needs_review && (
                            <button className="btn btn-ghost btn-sm" onClick={() => markReviewed(p.id)} title="Conservar cobro (marcar revisado)" style={{ color: 'var(--green)' }}>
                              <Check size={14} />
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
