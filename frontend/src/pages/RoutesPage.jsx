import { useEffect, useState } from 'react'
import { routesApi, usersApi } from '../services/api'
import { Plus, X, FileDown, Truck, ChevronRight, Trash2 } from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const driverLabel = (u) => [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username

const STATUS_LABELS = { draft: 'Borrador', in_progress: 'En reparto', completed: 'Finalizada', cancelled: 'Cancelada' }
const STATUS_COLORS = { draft: 'var(--yellow)', in_progress: 'var(--blue)', completed: 'var(--green)', cancelled: 'var(--red)' }

const HEAD_COLOR = [30, 30, 50]

function fmt(n) {
  return parseFloat(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtDate(d) {
  if (!d) return ''
  return new Date(d + 'T12:00:00').toLocaleDateString('es-AR')
}

// ── PDF helpers ────────────────────────────────────────────────────────────────

function downloadRouteSheet(route) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })

  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text(`Hoja de Ruta - ${route.route_number}`, 14, 16)

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  const meta = `Fecha: ${fmtDate(route.date)}   Repartidor: ${route.driver_name || '-'}   Estado: ${STATUS_LABELS[route.status]}   Pedidos: ${route.items.length}`
  doc.text(meta, 14, 23)
  if (route.notes) doc.text(`Notas: ${route.notes}`, 14, 29)

  autoTable(doc, {
    startY: route.notes ? 33 : 28,
    head: [['#', 'Pedido', 'Cliente', 'Telefono', 'Direccion', 'Productos', 'Total', 'Notas']],
    body: route.items.map((item, i) => [
      i + 1,
      item.order_number,
      item.customer_name,
      item.customer_phone || '',
      item.shipping_address || item.customer_address || '',
      item.order_items.map(p => `${p.product_sku} x${p.quantity}`).join('\n'),
      `$${fmt(item.order_total)}`,
      item.notes || '',
    ]),
    styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
    headStyles: { fillColor: HEAD_COLOR, textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 8 },
      1: { cellWidth: 28 },
      2: { cellWidth: 48 },
      3: { cellWidth: 25 },
      4: { cellWidth: 50 },
      5: { cellWidth: 55 },
      6: { cellWidth: 24 },
      7: { cellWidth: 'auto' },
    },
  })

  doc.save(`hoja-ruta-${route.route_number}.pdf`)
}

function addReceiptPage(doc, item, date, driverName) {
  const m = 20
  let y = 22

  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('Comprobante de Entrega', 105, y, { align: 'center' })
  y += 10

  doc.setFontSize(10)
  const rows = [
    ['Pedido:', item.order_number],
    ['Fecha:', fmtDate(date)],
    ['Cliente:', item.customer_name],
  ]
  const addr = item.shipping_address || item.customer_address || ''
  if (addr) rows.push(['Direccion:', addr])
  if (item.customer_phone) rows.push(['Tel:', item.customer_phone])
  if (driverName) rows.push(['Repartidor:', driverName])

  rows.forEach(([label, value]) => {
    doc.setFont('helvetica', 'bold'); doc.text(label, m, y)
    doc.setFont('helvetica', 'normal'); doc.text(String(value ?? ''), m + 32, y)
    y += 7
  })
  y += 2

  const fmtNum = (n) => n != null ? parseFloat(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''
  const hasBundle = item.order_items.some(p => p.is_bundle)

  // Ancho útil: 210mm - 20mm (izq) - 10mm (der) = 180mm
  // Bundle:     SKU(25) + Cant(12) + Unidad(28) + Caja(28) + Subtotal(28) = 121 → Producto = 59
  // No bundle:  SKU(25) + Cant(12) + Unidad(32) + Subtotal(32) = 101 → Producto = 79

  const head = hasBundle
    ? [['SKU', 'Producto', 'Cant.', 'Unidad', 'Caja', 'Subtotal']]
    : [['SKU', 'Producto', 'Cant.', 'Unidad', 'Subtotal']]

  const body = item.order_items.map(p => {
    if (hasBundle) {
      return [
        p.product_sku,
        p.product_name,
        p.quantity,
        p.is_bundle && p.bundle_unit_price ? `$${fmtNum(p.bundle_unit_price)}` : `$${fmtNum(p.unit_price)}`,
        p.is_bundle ? `$${fmtNum(p.unit_price)}` : '',
        `$${fmtNum(p.subtotal)}`,
      ]
    }
    return [p.product_sku, p.product_name, p.quantity, `$${fmtNum(p.unit_price)}`, `$${fmtNum(p.subtotal)}`]
  })

  autoTable(doc, {
    startY: y,
    head,
    body,
    styles: { fontSize: 8, cellPadding: 1.5, overflow: 'ellipsize' },
    headStyles: { fillColor: HEAD_COLOR, textColor: 255, fontSize: 8 },
    columnStyles: hasBundle
      ? { 0: { cellWidth: 25 }, 1: { cellWidth: 59 }, 2: { cellWidth: 12, halign: 'center' }, 3: { cellWidth: 28, halign: 'right' }, 4: { cellWidth: 28, halign: 'right' }, 5: { cellWidth: 28, halign: 'right' } }
      : { 0: { cellWidth: 25 }, 1: { cellWidth: 79 }, 2: { cellWidth: 12, halign: 'center' }, 3: { cellWidth: 32, halign: 'right' }, 4: { cellWidth: 32, halign: 'right' } },
    margin: { left: m, right: 10 },
  })

  y = doc.lastAutoTable.finalY + 8
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text(`Total: $${fmt(item.order_total)}`, 200, y, { align: 'right' })

  if (item.notes) {
    y += 7
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text(`Notas: ${item.notes}`, m, y)
  }

  const sigY = Math.max(y + 25, doc.lastAutoTable.finalY + 35)
  doc.setDrawColor(150)
  doc.line(m, sigY, 90, sigY)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text('Firma', m, sigY + 5)
}

function downloadAllReceipts(route) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  route.items.forEach((item, i) => {
    if (i > 0) doc.addPage()
    addReceiptPage(doc, item, route.date, route.driver_name)
  })
  doc.save(`comprobantes-${route.route_number}.pdf`)
}

function downloadSingleReceipt(item, date, driverName, routeNumber) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  addReceiptPage(doc, item, date, driverName)
  doc.save(`comprobante-${item.order_number}.pdf`)
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function RoutesPage() {
  const [routes, setRoutes] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // null | 'create' | 'detail' | 'add-orders'
  const [selected, setSelected] = useState(null)
  const [drivers, setDrivers] = useState([]) // active users
  const [availableOrders, setAvailableOrders] = useState([])
  const [orderSelections, setOrderSelections] = useState({}) // {orderId: {checked, notes}}
  const [form, setForm] = useState({ date: '', driver: '', notes: '' })

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const today = new Date().toISOString().slice(0, 10)

  const loadRoutes = () => {
    setLoading(true)
    routesApi.list().then(r => setRoutes(r.data)).finally(() => setLoading(false))
  }

  const loadDrivers = () => usersApi.list().then(r => setDrivers((r.data || []).filter(u => u.is_active && u.is_driver)))

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

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Hojas de Ruta</h1>
          <p className="page-subtitle">Organización de repartos</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}><Plus size={15} /> Nueva hoja</button>
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
                  <label className="form-label">Repartidor</label>
                  <select className="form-select" value={form.driver} onChange={e => setForm(p => ({ ...p, driver: e.target.value }))}>
                    <option value="">Sin asignar</option>
                    {drivers.map(d => <option key={d.id} value={d.id}>{driverLabel(d)}</option>)}
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
                          <th style={{ width: 48 }}>Prioridad</th>
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
                          const prio = o.customer?.priority ?? 5
                          return (
                            <tr key={o.id} style={checked ? { background: 'var(--accent-glow)' } : {}}>
                              <td style={{ textAlign: 'center' }}>
                                <input type="checkbox" checked={checked} onChange={() => toggleOrder(o.id)}
                                  style={{ width: 14, height: 14, cursor: 'pointer', accentColor: 'var(--accent)' }} />
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <span className="mono" style={{ fontWeight: 700, fontSize: 13, color: prio <= 3 ? 'var(--red)' : prio <= 6 ? 'var(--yellow)' : 'var(--text-muted)' }}>
                                  {prio}
                                </span>
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
                    <span className="text-muted text-sm">Repartidor:</span>
                    <select className="form-select" style={{ fontSize: 12, padding: '3px 8px', width: 'auto' }}
                      value={selected.driver || ''}
                      onChange={async e => {
                        try {
                          const r = await routesApi.update(selected.id, { driver: e.target.value || null })
                          setSelected(r.data); loadRoutes()
                        } catch {}
                      }}>
                      <option value="">Sin asignar</option>
                      {drivers.map(d => <option key={d.id} value={d.id}>{driverLabel(d)}</option>)}
                    </select>
                  </div>
                  {selected.notes && <div className="text-muted text-sm">{selected.notes}</div>}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {selected.items?.length > 0 && (
                    <>
                      <button className="btn btn-secondary btn-sm" onClick={() => downloadRouteSheet(selected)}>
                        <FileDown size={13} /> Hoja PDF
                      </button>
                      <button className="btn btn-secondary btn-sm" onClick={() => downloadAllReceipts(selected)}>
                        <FileDown size={13} /> Comprobantes PDF
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
                              <button className="btn btn-ghost btn-sm" title="Descargar comprobante PDF"
                                onClick={() => downloadSingleReceipt(item, selected.date, selected.driver_name, selected.route_number)}>
                                <FileDown size={12} />
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

    </>
  )
}
