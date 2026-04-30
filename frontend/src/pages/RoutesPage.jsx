import { useEffect, useState } from 'react'
import { routesApi, driversApi } from '../services/api'
import { Plus, X, Printer, Truck, Users, ChevronRight, Trash2 } from 'lucide-react'

const STATUS_LABELS = { draft: 'Borrador', in_progress: 'En reparto', completed: 'Finalizada', cancelled: 'Cancelada' }
const STATUS_COLORS = { draft: 'var(--yellow)', in_progress: 'var(--blue)', completed: 'var(--green)', cancelled: 'var(--red)' }

function fmt(n) {
  return parseFloat(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtDate(d) {
  if (!d) return ''
  return new Date(d + 'T12:00:00').toLocaleDateString('es-AR')
}

// ── Print helpers ──────────────────────────────────────────────────────────────

function buildPrintPage(body) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body{font-family:Arial,sans-serif;font-size:11px;margin:16px}
    h1{font-size:15px;margin:0 0 4px}
    .meta{color:#666;font-size:10px;margin-bottom:12px}
    table{width:100%;border-collapse:collapse}
    th,td{border:1px solid #ccc;padding:5px 7px;vertical-align:top}
    th{background:#eee;font-weight:bold}
    .mono{font-family:monospace}
    .receipt{max-width:90mm;margin:12px auto;padding:14px;border:1px solid #ccc}
    .receipt h2{font-size:13px;text-align:center;margin:0 0 10px}
    .receipt .row{margin:3px 0}
    .receipt .label{font-weight:bold}
    .sig{margin-top:24px;border-top:1px solid #ccc;padding-top:8px;color:#666;font-size:10px}
    @media print{body{margin:0}}
  </style></head><body>${body}</body></html>`
}

function receiptBlock(item, date, driverName) {
  const rows = item.order_items.map(p =>
    `<tr><td class="mono">${p.product_sku}</td><td>${p.product_name}</td><td class="mono" style="text-align:right">${p.quantity}</td></tr>`
  ).join('')
  const addr = item.shipping_address || item.customer_address || ''
  return `<div class="receipt">
    <h2>Comprobante de Entrega</h2>
    <div class="row"><span class="label">Pedido:</span> <span class="mono">${item.order_number}</span></div>
    <div class="row"><span class="label">Fecha:</span> ${fmtDate(date)}</div>
    <div class="row"><span class="label">Cliente:</span> ${item.customer_name}</div>
    ${addr ? `<div class="row"><span class="label">Dirección:</span> ${addr}</div>` : ''}
    ${item.customer_phone ? `<div class="row"><span class="label">Tel:</span> ${item.customer_phone}</div>` : ''}
    ${driverName ? `<div class="row"><span class="label">Chofer:</span> ${driverName}</div>` : ''}
    <table style="margin-top:10px"><thead><tr><th>SKU</th><th>Producto</th><th>Cant.</th></tr></thead>
    <tbody>${rows}</tbody></table>
    <div style="text-align:right;margin-top:10px;font-weight:bold">Total: <span class="mono">$${fmt(item.order_total)}</span></div>
    ${item.notes ? `<div style="margin-top:6px;font-size:10px;color:#666">Notas: ${item.notes}</div>` : ''}
    <div class="sig">Firma: _________________________________</div>
  </div>`
}

function printRouteSheet(route) {
  const rows = route.items.map((item, i) => {
    const addr = item.shipping_address || item.customer_address || '—'
    const prods = item.order_items.map(p => `${p.product_sku} ×${p.quantity}`).join('<br>')
    return `<tr>
      <td>${i + 1}</td>
      <td class="mono">${item.order_number}</td>
      <td>${item.customer_name}<br><span style="color:#666;font-size:10px">${item.customer_phone || ''}</span></td>
      <td>${addr}</td>
      <td>${prods}</td>
      <td class="mono">$${fmt(item.order_total)}</td>
      <td>${item.notes || ''}</td>
    </tr>`
  }).join('')
  const body = `
    <h1>Hoja de Ruta — ${route.route_number}</h1>
    <div class="meta">Fecha: ${fmtDate(route.date)} | Chofer: ${route.driver_name || '—'} | Estado: ${STATUS_LABELS[route.status]} | ${route.items.length} pedidos</div>
    ${route.notes ? `<div class="meta">Notas: ${route.notes}</div>` : ''}
    <table><thead><tr><th>#</th><th>Pedido</th><th>Cliente</th><th>Dirección</th><th>Productos</th><th>Total</th><th>Notas</th></tr></thead>
    <tbody>${rows}</tbody></table>`
  const win = window.open('', '_blank', 'width=1000,height=700')
  win.document.write(buildPrintPage(body))
  win.document.close(); win.focus(); win.print()
}

function printAllReceipts(route) {
  const body = route.items
    .map((item, i) => receiptBlock(item, route.date, route.driver_name) + (i < route.items.length - 1 ? '<div style="page-break-after:always"></div>' : ''))
    .join('')
  const win = window.open('', '_blank', 'width=500,height=700')
  win.document.write(buildPrintPage(body))
  win.document.close(); win.focus(); win.print()
}

function printSingleReceipt(item, date, driverName) {
  const win = window.open('', '_blank', 'width=500,height=600')
  win.document.write(buildPrintPage(receiptBlock(item, date, driverName)))
  win.document.close(); win.focus(); win.print()
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function RoutesPage() {
  const [routes, setRoutes] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // null | 'create' | 'detail' | 'drivers' | 'add-orders'
  const [selected, setSelected] = useState(null)
  const [drivers, setDrivers] = useState([])
  const [availableOrders, setAvailableOrders] = useState([])
  const [orderSelections, setOrderSelections] = useState({}) // {orderId: {checked, notes}}
  const [form, setForm] = useState({ date: '', driver: '', notes: '' })
  const [driverForm, setDriverForm] = useState({ name: '', phone: '', is_active: true })
  const [editingDriver, setEditingDriver] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const today = new Date().toISOString().slice(0, 10)

  const loadRoutes = () => {
    setLoading(true)
    routesApi.list().then(r => setRoutes(r.data)).finally(() => setLoading(false))
  }

  const loadDrivers = () => driversApi.list({ active: 1 }).then(r => setDrivers(r.data))

  useEffect(() => { loadRoutes() }, [])

  // ── Create ─────────────────────────────────────────────────────────────────

  const openCreate = async () => {
    setError('')
    setForm({ date: today, driver: '', notes: '' })
    setOrderSelections({})
    const [, avail] = await Promise.all([loadDrivers(), routesApi.availableOrders()])
    setAvailableOrders(avail.data)
    setModal('create')
  }

  const toggleOrder = (orderId) => {
    setOrderSelections(prev => {
      if (prev[orderId]) {
        const next = { ...prev }; delete next[orderId]; return next
      }
      return { ...prev, [orderId]: { notes: '' } }
    })
  }

  const updateSelection = (orderId, field, value) => {
    setOrderSelections(prev => ({ ...prev, [orderId]: { ...prev[orderId], [field]: value } }))
  }

  const createRoute = async () => {
    setSaving(true); setError('')
    const items = Object.entries(orderSelections).map(([orderId, sel]) => ({
      order: parseInt(orderId),
      notes: sel.notes || '',
    }))
    try {
      const res = await routesApi.create({ ...form, driver: form.driver || null, items })
      setModal(null)
      loadRoutes()
      openDetail(res.data)
    } catch (e) {
      setError(e.response?.data?.error || JSON.stringify(e.response?.data) || 'Error')
    } finally { setSaving(false) }
  }

  // ── Detail ─────────────────────────────────────────────────────────────────

  const openDetail = async (route) => {
    setSelected(route); setError(''); setModal('detail')
    if (drivers.length === 0) await loadDrivers()
  }

  const refreshSelected = async (id) => {
    const r = await routesApi.get(id)
    setSelected(r.data)
    loadRoutes()
  }

  const changeStatus = async (newStatus) => {
    try {
      const r = await routesApi.changeStatus(selected.id, newStatus)
      setSelected(r.data); loadRoutes()
    } catch (e) { setError(e.response?.data?.error || 'Error') }
  }

  const removeItem = async (itemId) => {
    try {
      const r = await routesApi.removeItem(selected.id, itemId)
      setSelected(r.data); loadRoutes()
    } catch (e) { setError(e.response?.data?.error || 'Error') }
  }

  // ── Add orders to existing draft ───────────────────────────────────────────

  const openAddOrders = async () => {
    setOrderSelections({})
    const avail = await routesApi.availableOrders()
    setAvailableOrders(avail.data)
    setModal('add-orders')
  }

  const addOrders = async () => {
    setSaving(true); setError('')
    const items = Object.entries(orderSelections).map(([orderId, sel]) => ({
      order: parseInt(orderId),
      notes: sel.notes || '',
    }))
    if (!items.length) { setError('Seleccioná al menos un pedido'); setSaving(false); return }
    try {
      const r = await routesApi.addOrders(selected.id, items)
      setSelected(r.data); loadRoutes(); setModal('detail')
    } catch (e) {
      setError(e.response?.data?.error || 'Error')
    } finally { setSaving(false) }
  }

  // ── Drivers ────────────────────────────────────────────────────────────────

  const openDrivers = async () => {
    await driversApi.list().then(r => setDrivers(r.data))
    setDriverForm({ name: '', phone: '', is_active: true })
    setEditingDriver(null); setError('')
    setModal('drivers')
  }

  const saveDriver = async () => {
    setSaving(true); setError('')
    try {
      if (editingDriver) {
        await driversApi.update(editingDriver.id, driverForm)
      } else {
        await driversApi.create(driverForm)
      }
      const r = await driversApi.list()
      setDrivers(r.data)
      setDriverForm({ name: '', phone: '', is_active: true }); setEditingDriver(null)
    } catch (e) {
      setError(e.response?.data?.error || JSON.stringify(e.response?.data) || 'Error')
    } finally { setSaving(false) }
  }

  const deleteDriver = async (id) => {
    if (!confirm('¿Eliminar este chofer?')) return
    await driversApi.delete(id)
    driversApi.list().then(r => setDrivers(r.data))
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Hojas de Ruta</h1>
          <p className="page-subtitle">Organización de repartos</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={openDrivers}><Users size={15} /> Choferes</button>
          <button className="btn btn-primary" onClick={openCreate}><Plus size={15} /> Nueva hoja</button>
        </div>
      </div>

      <div className="page-body">
        <div className="card">
          {loading ? <div className="loading"><div className="spinner" /></div> : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>N° Hoja</th>
                    <th>Fecha</th>
                    <th>Estado</th>
                    <th>Pedidos</th>
                    <th>Notas</th>
                    <th style={{ width: 60 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {routes.length === 0 && (
                    <tr><td colSpan={6}>
                      <div className="empty-state">
                        <Truck className="empty-state-icon" />
                        <div className="empty-state-title">Sin hojas de ruta</div>
                        <p className="text-muted text-sm">Creá la primera hoja de ruta</p>
                      </div>
                    </td></tr>
                  )}
                  {routes.map(r => (
                    <tr key={r.id}>
                      <td><span className="mono text-accent" style={{ fontWeight: 700 }}>{r.route_number}</span></td>
                      <td><span className="text-muted text-sm">{fmtDate(r.date)}</span></td>
                      <td>
                        <span style={{ color: STATUS_COLORS[r.status], fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700 }}>
                          {STATUS_LABELS[r.status]}
                        </span>
                      </td>
                      <td><span className="mono">{r.items_count}</span></td>
                      <td><span className="text-muted text-sm">{r.notes || '—'}</span></td>
                      <td>
                        <button className="btn btn-ghost btn-sm" onClick={() => openDetail(r)} title="Ver detalle">
                          <ChevronRight size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Create modal ──────────────────────────────────────────── */}
      {modal === 'create' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()} style={{ maxHeight: '92vh' }}>
            <div className="modal-header">
              <span className="modal-title">Nueva hoja de ruta</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setModal(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              {error && <div className="alert alert-danger">{error}</div>}
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Fecha *</label>
                  <input className="form-input" type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Chofer</label>
                  <select className="form-select" value={form.driver} onChange={e => setForm(p => ({ ...p, driver: e.target.value }))}>
                    <option value="">Sin asignar</option>
                    {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Notas</label>
                <input className="form-input" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Opcional" />
              </div>

              <div className="form-group">
                <label className="form-label">
                  Pedidos disponibles
                  <span className="text-muted" style={{ fontWeight: 400, marginLeft: 8 }}>
                    ({Object.keys(orderSelections).length} seleccionados)
                  </span>
                </label>
                {availableOrders.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '8px 0' }}>
                    No hay pedidos pendientes o parciales disponibles.
                  </div>
                ) : (
                  <div className="table-wrapper">
                    <table>
                      <thead>
                        <tr>
                          <th style={{ width: 32 }}></th>
                          <th>Pedido</th>
                          <th>Cliente</th>
                          <th>Dirección</th>
                          <th>Notas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {availableOrders.map(o => {
                          const sel = orderSelections[o.id]
                          const checked = !!sel
                          return (
                            <tr key={o.id} style={checked ? { background: 'var(--accent-glow)' } : {}}>
                              <td style={{ textAlign: 'center' }}>
                                <input type="checkbox" checked={checked} onChange={() => toggleOrder(o.id)}
                                  style={{ width: 14, height: 14, cursor: 'pointer', accentColor: 'var(--accent)' }} />
                              </td>
                              <td>
                                <span className="mono text-accent" style={{ fontWeight: 700, fontSize: 12 }}>{o.order_number}</span>
                                <div className="text-muted text-xs">{o.status === 'partial' ? 'Parcial' : 'Pendiente'}</div>
                              </td>
                              <td>{o.customer_name}</td>
                              <td><span className="text-muted text-sm">{o.shipping_address || '—'}</span></td>
                              <td>
                                {checked && (
                                  <input className="form-input" style={{ fontSize: 12, padding: '3px 6px' }}
                                    value={sel.notes} onChange={e => updateSelection(o.id, 'notes', e.target.value)}
                                    placeholder="Opcional" />
                                )}
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
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={createRoute} disabled={saving || !form.date}>
                {saving ? 'Guardando...' : 'Crear hoja de ruta'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Detail modal ──────────────────────────────────────────── */}
      {modal === 'detail' && selected && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()} style={{ maxHeight: '92vh' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="modal-title">{selected.route_number}</span>
                <span style={{ color: STATUS_COLORS[selected.status], fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700 }}>
                  {STATUS_LABELS[selected.status]}
                </span>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setModal(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              {error && <div className="alert alert-danger">{error}</div>}

              {/* Meta + acciones */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div className="text-muted text-sm">Fecha: <strong style={{ color: 'var(--text)' }}>{fmtDate(selected.date)}</strong></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className="text-muted text-sm">Chofer:</span>
                    <select className="form-select" style={{ fontSize: 12, padding: '3px 8px', width: 'auto' }}
                      value={selected.driver || ''}
                      onChange={async e => {
                        try {
                          const r = await routesApi.update(selected.id, { driver: e.target.value || null })
                          setSelected(r.data); loadRoutes()
                        } catch {}
                      }}>
                      <option value="">Sin asignar</option>
                      {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </div>
                  {selected.notes && <div className="text-muted text-sm">{selected.notes}</div>}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {selected.items?.length > 0 && (
                    <>
                      <button className="btn btn-secondary btn-sm" onClick={() => printRouteSheet(selected)}>
                        <Printer size={13} /> Hoja
                      </button>
                      <button className="btn btn-secondary btn-sm" onClick={() => printAllReceipts(selected)}>
                        <Printer size={13} /> Comprobantes
                      </button>
                    </>
                  )}
                  {selected.status === 'draft' && (
                    <>
                      <button className="btn btn-secondary btn-sm" onClick={openAddOrders}>
                        <Plus size={13} /> Agregar pedidos
                      </button>
                      <button className="btn btn-primary btn-sm" onClick={() => changeStatus('in_progress')}>
                        <Truck size={13} /> Iniciar reparto
                      </button>
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => changeStatus('cancelled')}>
                        Cancelar
                      </button>
                    </>
                  )}
                  {selected.status === 'in_progress' && (
                    <>
                      <button className="btn btn-primary btn-sm" onClick={() => changeStatus('completed')}>
                        Finalizar
                      </button>
                      <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => changeStatus('cancelled')}>
                        Cancelar
                      </button>
                    </>
                  )}
                  {selected.status === 'cancelled' && (
                    <button className="btn btn-secondary btn-sm" onClick={() => changeStatus('draft')}>
                      Rehabilitar
                    </button>
                  )}
                </div>
              </div>

              {/* Items */}
              {selected.items?.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '12px 0' }}>Sin pedidos en esta hoja.</div>
              ) : (
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th>Pedido</th>
                        <th>Cliente / Dirección</th>
                        <th>Productos</th>
                        <th>Total</th>
                        <th style={{ width: 60 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.items.map(item => (
                        <tr key={item.id}>
                          <td>
                            <span className="mono text-accent" style={{ fontWeight: 700, fontSize: 12 }}>{item.order_number}</span>
                            <div className="text-muted text-xs">{item.notes || ''}</div>
                          </td>
                          <td>
                            <div style={{ fontWeight: 500 }}>{item.customer_name}</div>
                            <div className="text-muted text-xs">{item.shipping_address || item.customer_address || '—'}</div>
                          </td>
                          <td>
                            <div style={{ fontSize: 12 }}>
                              {item.order_items.map((p, i) => (
                                <div key={i}><span className="mono text-muted">{p.product_sku}</span> ×{p.quantity}</div>
                              ))}
                            </div>
                          </td>
                          <td><span className="mono">${fmt(item.order_total)}</span></td>
                          <td>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button className="btn btn-ghost btn-sm" title="Imprimir comprobante"
                                onClick={() => printSingleReceipt(item, selected.date, selected.driver_name)}>
                                <Printer size={12} />
                              </button>
                              {selected.status === 'draft' && (
                                <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }}
                                  title="Quitar de la hoja" onClick={() => removeItem(item.id)}>
                                  <Trash2 size={12} />
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
        </div>
      )}

      {/* ── Add orders modal ──────────────────────────────────────── */}
      {modal === 'add-orders' && selected && (
        <div className="modal-overlay" onClick={() => setModal('detail')}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()} style={{ maxHeight: '92vh' }}>
            <div className="modal-header">
              <span className="modal-title">Agregar pedidos — {selected.route_number}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setModal('detail')}><X size={16} /></button>
            </div>
            <div className="modal-body">
              {error && <div className="alert alert-danger">{error}</div>}
              {availableOrders.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No hay pedidos disponibles para agregar.</div>
              ) : (
                <div className="table-wrapper">
                  <table>
                    <thead>
                      <tr>
                        <th style={{ width: 32 }}></th>
                        <th>Pedido</th>
                        <th>Cliente</th>
                        <th>Dirección</th>
                      </tr>
                    </thead>
                    <tbody>
                      {availableOrders.map(o => {
                        const checked = !!orderSelections[o.id]
                        return (
                          <tr key={o.id} style={checked ? { background: 'var(--accent-glow)' } : {}}>
                            <td style={{ textAlign: 'center' }}>
                              <input type="checkbox" checked={checked} onChange={() => toggleOrder(o.id)}
                                style={{ width: 14, height: 14, cursor: 'pointer', accentColor: 'var(--accent)' }} />
                            </td>
                            <td><span className="mono text-accent" style={{ fontWeight: 700, fontSize: 12 }}>{o.order_number}</span></td>
                            <td>{o.customer_name}</td>
                            <td><span className="text-muted text-sm">{o.shipping_address || '—'}</span></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModal('detail')}>Cancelar</button>
              <button className="btn btn-primary" onClick={addOrders} disabled={saving}>
                {saving ? 'Agregando...' : 'Agregar seleccionados'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Drivers modal ─────────────────────────────────────────── */}
      {modal === 'drivers' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Choferes</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setModal(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              {error && <div className="alert alert-danger">{error}</div>}

              {/* Form */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 16, alignItems: 'flex-end' }}>
                <div className="form-group" style={{ flex: 1, margin: 0 }}>
                  <label className="form-label">Nombre</label>
                  <input className="form-input" value={driverForm.name}
                    onChange={e => setDriverForm(p => ({ ...p, name: e.target.value }))} placeholder="Nombre del chofer" />
                </div>
                <div className="form-group" style={{ flex: 1, margin: 0 }}>
                  <label className="form-label">Teléfono</label>
                  <input className="form-input" value={driverForm.phone}
                    onChange={e => setDriverForm(p => ({ ...p, phone: e.target.value }))} placeholder="Opcional" />
                </div>
                <button className="btn btn-primary" onClick={saveDriver} disabled={saving || !driverForm.name}>
                  {editingDriver ? 'Guardar' : 'Agregar'}
                </button>
                {editingDriver && (
                  <button className="btn btn-secondary" onClick={() => { setEditingDriver(null); setDriverForm({ name: '', phone: '', is_active: true }) }}>
                    Cancelar
                  </button>
                )}
              </div>

              {/* List */}
              <table style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Teléfono</th>
                    <th>Activo</th>
                    <th style={{ width: 80 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {drivers.length === 0 && (
                    <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 16, fontSize: 13 }}>Sin choferes</td></tr>
                  )}
                  {drivers.map(d => (
                    <tr key={d.id}>
                      <td style={{ fontWeight: 500 }}>{d.name}</td>
                      <td className="text-muted text-sm">{d.phone || '—'}</td>
                      <td>
                        <span style={{ color: d.is_active ? 'var(--green)' : 'var(--red)', fontSize: 12 }}>
                          {d.is_active ? 'Sí' : 'No'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => { setEditingDriver(d); setDriverForm({ name: d.name, phone: d.phone, is_active: d.is_active }) }}>
                            Editar
                          </button>
                          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => deleteDriver(d.id)}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
