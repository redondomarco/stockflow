import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ordersApi, paymentsApi, productsApi } from '../services/api'
import { Plus, X, ChevronRight, CreditCard, Search, Truck, Edit2 } from 'lucide-react'

function CustomerCombobox({ customers, value, onChange }) {
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const ref = useRef()

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selected = customers.find(c => String(c.id) === String(value))
  const filtered = customers.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))

  const handleSelect = (c) => { onChange(String(c.id)); setSearch(''); setOpen(false) }
  const handleClear = (e) => { e.stopPropagation(); onChange(''); setSearch('') }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div
        className="form-input"
        style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'text', padding: '0 10px', minHeight: 36 }}
        onClick={() => { setOpen(true) }}
      >
        {open ? (
          <input
            autoFocus
            style={{ border: 'none', background: 'transparent', outline: 'none', flex: 1, color: 'var(--text)', fontSize: 'inherit', fontFamily: 'inherit', padding: '6px 0' }}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar cliente..."
          />
        ) : (
          <span style={{ flex: 1, padding: '6px 0', color: selected ? 'var(--text)' : 'var(--text-muted)', fontSize: 13 }}>
            {selected ? selected.name : 'Seleccionar cliente'}
            {selected?.last_order_date && (
              <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                último: {new Date(selected.last_order_date + 'T12:00:00').toLocaleDateString('es-AR')}
              </span>
            )}
          </span>
        )}
        {selected && !open && (
          <span onClick={handleClear} style={{ cursor: 'pointer', color: 'var(--text-muted)', lineHeight: 1, display: 'flex' }}>
            <X size={13} />
          </span>
        )}
      </div>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 200,
          background: 'var(--bg-card)', border: '1px solid var(--border-light)',
          borderRadius: 6, marginTop: 4, maxHeight: 220, overflowY: 'auto',
          boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
        }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '10px 12px', color: 'var(--text-muted)', fontSize: 13 }}>Sin resultados</div>
          ) : filtered.map(c => (
            <div
              key={c.id}
              onMouseDown={() => handleSelect(c)}
              style={{
                padding: '8px 12px', cursor: 'pointer', fontSize: 13,
                background: String(c.id) === String(value) ? 'var(--accent-glow)' : 'transparent',
                color: String(c.id) === String(value) ? 'var(--accent)' : 'var(--text)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span>{c.name}</span>
                {c.last_order_date && (
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                    {new Date(c.last_order_date + 'T12:00:00').toLocaleDateString('es-AR')}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const STATUS_LABELS = {
  pending: 'Pendiente',
  partial: 'Entrega parcial',
  delivered: 'Entregado',
  cancelled: 'Anulado',
}
const STATUS_COLORS = {
  pending: 'var(--yellow)',
  partial: 'var(--orange)',
  delivered: 'var(--green)',
  cancelled: 'var(--red)',
}
const METHOD_LABELS = {
  cash: 'Efectivo', transfer: 'Transferencia',
  credit_card: 'T. Crédito', debit_card: 'T. Débito',
  mercadopago: 'MercadoPago', other: 'Otro',
}

function StatusBadge({ status }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABELS[status] || status}</span>
}

function fmt(n) {
  return parseFloat(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const ROUTE_STATUS_COLORS = { draft: 'var(--yellow)', in_progress: 'var(--blue)', completed: 'var(--green)', cancelled: 'var(--red)' }
const ROUTE_STATUS_LABELS = { draft: 'Borrador', in_progress: 'En reparto', completed: 'Finalizada', cancelled: 'Cancelada' }

export default function OrdersPage() {
  const navigate = useNavigate()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [modal, setModal] = useState(null)
  const [selected, setSelected] = useState(null)
  const [customers, setCustomers] = useState([])
  const [customerProducts, setCustomerProducts] = useState([])
  const [loadingProducts, setLoadingProducts] = useState(false)
  const [activeMultiplier, setActiveMultiplier] = useState(null)
  const [orderForm, setOrderForm] = useState({ customer: '', shipping_cost: 0, discount: 0, notes: '', shipping_address: '' })
  const [editForm, setEditForm] = useState({})
  const [editProducts, setEditProducts] = useState([])
  const [editMultiplier, setEditMultiplier] = useState(null)
  const [editLoadingProducts, setEditLoadingProducts] = useState(false)
  const [deliverItems, setDeliverItems] = useState([]) // [{ order_item_id, product_name, max, qty }]
  const [deliverComment, setDeliverComment] = useState('')
  const [paymentForm, setPaymentForm] = useState({ payment_method: 'transfer', amount: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerProducts, setPickerProducts] = useState([])
  const [pickerSelected, setPickerSelected] = useState(new Set())
  const [pickerSaving, setPickerSaving] = useState(false)

  const load = () => {
    setLoading(true)
    ordersApi.list({ search, status: filterStatus || undefined })
      .then(r => setOrders(r.data.results || r.data))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [search, filterStatus])

  // ── Create order ──────────────────────────────────────────────────
  const openCreate = async () => {
    const c = await ordersApi.customers()
    setCustomers(c.data.results || c.data)
    setOrderForm({ customer: '', shipping_cost: 0, discount: 0, notes: '', shipping_address: '' })
    setCustomerProducts([])
    setActiveMultiplier(null)
    setError('')
    setModal('create')
  }

  const handleCustomerChange = async (customerId) => {
    setOrderForm(p => ({ ...p, customer: customerId }))
    const c = customers.find(c => String(c.id) === String(customerId))
    setActiveMultiplier(c?.price_list_multiplier ? { name: c.price_list_name, value: parseFloat(c.price_list_multiplier) } : null)
    setCustomerProducts([])
    if (!customerId) return
    setLoadingProducts(true)
    try {
      const res = await ordersApi.getCustomerProducts(customerId)
      setCustomerProducts((res.data || []).map(p => ({ ...p, qty: 0 })))
    } finally { setLoadingProducts(false) }
  }

  const updateQty = (productId, qty) =>
    setCustomerProducts(prev => prev.map(p => p.id === productId ? { ...p, qty: Math.max(0, qty || 0) } : p))

  const effectiveMult = (p) => (p.fixed_price ? 1 : (activeMultiplier?.value || 1))

  const computeSubtotal = () =>
    customerProducts.reduce((acc, p) => acc + parseFloat(p.price) * effectiveMult(p) * (p.qty || 0), 0)

  const createOrder = async () => {
    setSaving(true); setError('')
    try {
      const items = customerProducts
        .filter(p => p.qty > 0)
        .map(p => ({
          product: p.id,
          quantity: p.qty,
          unit_price: parseFloat((parseFloat(p.price) * effectiveMult(p)).toFixed(2)),
        }))
      if (!items.length) { setError('Seleccioná al menos un producto'); setSaving(false); return }
      await ordersApi.create({ ...orderForm, items })
      setModal(null); load()
    } catch (e) {
      setError(e.response?.data?.error || JSON.stringify(e.response?.data) || 'Error')
    } finally { setSaving(false) }
  }

  // ── Edit order ───────────────────────────────────────────────────
  const openEditOrder = async (o) => {
    setSelected(o)
    setEditForm({
      shipping_address: o.shipping_address || '',
      shipping_cost: parseFloat(o.shipping_cost || 0),
      discount: parseFloat(o.discount || 0),
      notes: o.notes || '',
    })
    setError('')

    if (o.status === 'pending') {
      setEditLoadingProducts(true)
      try {
        const [prodRes, custRes] = await Promise.all([
          ordersApi.getCustomerProducts(o.customer),
          ordersApi.customers(),
        ])
        const customer = (custRes.data.results || custRes.data).find(c => c.id === o.customer)
        setEditMultiplier(customer?.price_list_multiplier
          ? { name: customer.price_list_name, value: parseFloat(customer.price_list_multiplier) }
          : null)

        const orderQtyMap = {}
        for (const it of (o.items || [])) orderQtyMap[it.product] = it.quantity

        setEditProducts((prodRes.data || []).map(p => ({ ...p, qty: orderQtyMap[p.id] || 0 })))
      } finally { setEditLoadingProducts(false) }
    }

    setModal('edit-order')
  }

  const updateEditQty = (productId, qty) =>
    setEditProducts(prev => prev.map(p => p.id === productId ? { ...p, qty: Math.max(0, qty || 0) } : p))

  const editEffectiveMult = (p) => (p.fixed_price ? 1 : (editMultiplier?.value || 1))

  const submitEditOrder = async () => {
    setSaving(true); setError('')
    try {
      const payload = { ...editForm }
      if (selected.status === 'pending') {
        const items = editProducts
          .filter(p => p.qty > 0)
          .map(p => ({
            product: p.id,
            quantity: p.qty,
            unit_price: parseFloat((parseFloat(p.price) * editEffectiveMult(p)).toFixed(2)),
          }))
        if (!items.length) { setError('Seleccioná al menos un producto'); setSaving(false); return }
        payload.items = items
      }
      await ordersApi.update(selected.id, payload)
      setModal(null); load()
    } catch (e) {
      setError(e.response?.data?.error || JSON.stringify(e.response?.data) || 'Error')
    } finally { setSaving(false) }
  }

  // ── Deliver ───────────────────────────────────────────────────────
  const openDeliver = (o) => {
    setSelected(o)
    setDeliverItems(
      (o.items || []).map(it => ({
        order_item_id: it.id,
        product_name: it.product_name,
        product_sku: it.product_sku,
        max: it.quantity - it.delivered_quantity,
        qty: it.quantity - it.delivered_quantity,
      })).filter(it => it.max > 0)
    )
    setDeliverComment('')
    setError('')
    setModal('deliver')
  }

  const updateDeliverQty = (id, qty) =>
    setDeliverItems(prev => prev.map(it => it.order_item_id === id ? { ...it, qty: Math.min(Math.max(0, qty || 0), it.max) } : it))

  const submitDeliver = async () => {
    setSaving(true); setError('')
    try {
      const items = deliverItems.filter(it => it.qty > 0).map(it => ({ order_item_id: it.order_item_id, quantity: it.qty }))
      if (!items.length) { setError('Ingresá al menos una unidad a entregar'); setSaving(false); return }
      await ordersApi.deliver(selected.id, { items, comment: deliverComment })
      setModal(null); load()
    } catch (e) {
      setError(e.response?.data?.error || 'Error')
    } finally { setSaving(false) }
  }

  // ── Cancel ────────────────────────────────────────────────────────
  const cancelOrder = async (o) => {
    if (!confirm(`¿Anular el pedido ${o.order_number}? El stock no entregado se restaurará.`)) return
    try {
      await ordersApi.changeStatus(o.id, { status: 'cancelled', comment: 'Anulado por el usuario' })
      load()
    } catch (e) {
      alert(e.response?.data?.error || 'Error al anular')
    }
  }

  // ── Payment ───────────────────────────────────────────────────────
  const openPayment = (o) => {
    setSelected(o)
    setPaymentForm({ payment_method: 'transfer', amount: fmt(o.balance).replace(/\./g, '').replace(',', '.') })
    setError('')
    setModal('payment')
  }

  const createPayment = async () => {
    setSaving(true); setError('')
    try {
      await paymentsApi.create({ order: selected.id, ...paymentForm })
      setModal(null); load()
    } catch (e) {
      setError(e.response?.data?.error || 'Error')
    } finally { setSaving(false) }
  }

  // ── Detail ────────────────────────────────────────────────────────
  const openDetail = (o) => { setSelected(o); setModal('detail') }

  // ── Product picker (habilitar productos al cliente desde el pedido) ──
  const openPicker = async () => {
    const [allRes] = await Promise.all([productsApi.list()])
    const all = allRes.data || []
    setPickerProducts(all.filter(p => p.is_active))
    setPickerSelected(new Set(customerProducts.map(p => p.id)))
    setPickerOpen(true)
  }

  const savePicker = async () => {
    setPickerSaving(true)
    try {
      await ordersApi.setCustomerProducts(orderForm.customer, [...pickerSelected])
      setPickerOpen(false)
      // Reload customer products
      const res = await ordersApi.getCustomerProducts(orderForm.customer)
      setCustomerProducts((res.data || []).map(p => ({ ...p, qty: 0 })))
    } finally { setPickerSaving(false) }
  }

  const togglePicker = (id) => setPickerSelected(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Pedidos</h1>
          <p className="page-subtitle">Gestión de pedidos y entregas</p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}><Plus size={15} /> Nuevo pedido</button>
      </div>

      <div className="page-body">
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="toolbar">
            <div className="search-input" style={{ flex: 1 }}>
              <Search className="search-icon" size={15} />
              <input className="form-input" placeholder="Buscar por N° pedido o cliente..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
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
                    <th>N° Pedido</th>
                    <th>Cliente</th>
                    <th>Estado</th>
                    <th>Total</th>
                    <th>Cobrado</th>
                    <th>Saldo</th>
                    <th>Hoja de ruta</th>
                    <th>Fecha</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.length === 0 && (
                    <tr><td colSpan={8}><div className="empty-state"><div className="empty-state-title">Sin pedidos</div></div></td></tr>
                  )}
                  {orders.map(o => {
                    const balance = parseFloat(o.balance || 0)
                    const canCancel = o.status === 'pending' || o.status === 'partial'
                    const canDeliver = o.status === 'pending' || o.status === 'partial'
                    return (
                      <tr key={o.id}>
                        <td><span className="mono text-accent" style={{ fontWeight: 700 }}>{o.order_number}</span></td>
                        <td>
                          <div style={{ fontWeight: 500 }}>{o.customer_name}</div>
                          <div className="text-muted text-xs">{o.customer_email || ''}</div>
                        </td>
                        <td><StatusBadge status={o.status} /></td>
                        <td><span className="mono">${fmt(o.total)}</span></td>
                        <td>
                          <span className="mono" style={{ color: 'var(--green)' }}>
                            ${fmt(o.amount_paid)}
                          </span>
                        </td>
                        <td>
                          <span className="mono" style={{ color: balance > 0 ? 'var(--red)' : 'var(--green)', fontWeight: balance > 0 ? 700 : 400 }}>
                            ${fmt(balance)}
                          </span>
                        </td>
                        <td>
                          {o.route_info ? (
                            <button
                              className="btn btn-ghost btn-sm"
                              style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: ROUTE_STATUS_COLORS[o.route_info.route_status], padding: '2px 6px' }}
                              onClick={() => navigate('/routes')}
                              title={ROUTE_STATUS_LABELS[o.route_info.route_status]}
                            >
                              <Truck size={11} style={{ marginRight: 4 }} />
                              {o.route_info.route_number}
                            </button>
                          ) : (
                            <span className="text-muted text-xs">—</span>
                          )}
                        </td>
                        <td><span className="text-muted text-sm mono">{new Date(o.created_at).toLocaleDateString('es-AR')}</span></td>
                        <td>
                          <div className="flex gap-2">
                            <button className="btn btn-ghost btn-sm" onClick={() => openDetail(o)} title="Ver detalle"><ChevronRight size={13} /></button>
                            {(o.status === 'pending' || o.status === 'partial') && (
                              <button className="btn btn-ghost btn-sm" onClick={() => openEditOrder(o)} title="Editar pedido"><Edit2 size={13} /></button>
                            )}
                            {canDeliver && (
                              <button className="btn btn-secondary btn-sm" onClick={() => openDeliver(o)} title="Registrar entrega">
                                <Truck size={13} />
                              </button>
                            )}
                            {o.status !== 'cancelled' && balance > 0 && (
                              <button className="btn btn-ghost btn-sm" onClick={() => openPayment(o)} title="Registrar pago" style={{ color: 'var(--accent)' }}>
                                <CreditCard size={13} />
                              </button>
                            )}
                            {canCancel && (
                              <button className="btn btn-ghost btn-sm" onClick={() => cancelOrder(o)} title="Anular" style={{ color: 'var(--red)' }}>
                                <X size={13} />
                              </button>
                            )}
                          </div>
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

      {/* ── Create order modal ─────────────────────────────────── */}
      {modal === 'create' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()} style={{ maxHeight: '92vh' }}>
            <div className="modal-header">
              <span className="modal-title">Nuevo pedido</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setModal(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              {error && <div className="alert alert-danger">{error}</div>}
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Cliente *</label>
                  <CustomerCombobox customers={customers} value={orderForm.customer} onChange={handleCustomerChange} />
                  {activeMultiplier && (
                    <div style={{ marginTop: 5, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                      <span style={{ background: 'var(--accent-glow)', color: 'var(--accent)', padding: '2px 8px', borderRadius: 4, fontFamily: 'var(--font-mono)', fontWeight: 700 }}>×{activeMultiplier.value.toFixed(4)}</span>
                      <span className="text-muted">Lista: <strong style={{ color: 'var(--text)' }}>{activeMultiplier.name}</strong></span>
                    </div>
                  )}
                </div>
                <div className="form-group">
                  <label className="form-label">Dirección de envío</label>
                  <input className="form-input" value={orderForm.shipping_address} onChange={e => setOrderForm(p => ({ ...p, shipping_address: e.target.value }))} />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Productos</label>
                {!orderForm.customer ? (
                  <div style={{ padding: '12px 0', color: 'var(--text-muted)', fontSize: 13 }}>Seleccioná un cliente para ver sus productos disponibles.</div>
                ) : loadingProducts ? (
                  <div className="loading" style={{ minHeight: 60 }}><div className="spinner" /></div>
                ) : customerProducts.length === 0 ? (
                  <div style={{ padding: '12px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>Este cliente no tiene productos habilitados.</span>
                    <button className="btn btn-secondary btn-sm" onClick={openPicker}>
                      <Plus size={13} /> Habilitar productos
                    </button>
                  </div>
                ) : (
                  <div className="table-wrapper">
                    <table>
                      <thead><tr><th>SKU</th><th>Stock</th><th>Precio</th><th style={{ width: 110 }}>Cantidad</th></tr></thead>
                      <tbody>
                        {customerProducts.map(p => {
                          const price = parseFloat(p.price) * effectiveMult(p)
                          return (
                            <tr key={p.id} style={(p.qty || 0) > 0 ? { background: 'var(--accent-glow)' } : {}}>
                              <td>
                                <span className="mono" style={{ fontWeight: 600, fontSize: 13 }}>{p.sku}</span>
                                {p.fixed_price && (
                                  <span style={{ marginLeft: 6, fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--blue)', background: 'var(--blue-dim)', padding: '1px 5px', borderRadius: 3 }}>FIJO</span>
                                )}
                              </td>
                              <td><span className="mono" style={{ color: p.stock <= 0 ? 'var(--red)' : p.is_low_stock ? 'var(--yellow)' : 'var(--green)', fontWeight: 700 }}>{p.stock}</span></td>
                              <td><span className="mono">${price.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></td>
                              <td>
                                <input className="form-input mono" type="number" min="0" value={p.qty || ''} placeholder="0"
                                  onChange={e => updateQty(p.id, parseInt(e.target.value))}
                                  style={{ padding: '4px 8px', textAlign: 'center' }} />
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Costo de envío</label>
                  <input className="form-input mono" type="number" value={orderForm.shipping_cost} onChange={e => setOrderForm(p => ({ ...p, shipping_cost: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Descuento</label>
                  <input className="form-input mono" type="number" value={orderForm.discount} onChange={e => setOrderForm(p => ({ ...p, discount: e.target.value }))} />
                </div>
              </div>

              {customerProducts.some(p => p.qty > 0) && (
                <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: 13 }}>
                    <span>Subtotal</span><span className="mono">${computeSubtotal().toLocaleString('es-AR', { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: 13, marginTop: 6 }}>
                    <span>Envío</span><span className="mono">+${parseFloat(orderForm.shipping_cost || 0).toLocaleString('es-AR')}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--red)', fontSize: 13, marginTop: 6 }}>
                    <span>Descuento</span><span className="mono">-${parseFloat(orderForm.discount || 0).toLocaleString('es-AR')}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 16, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
                    <span>Total</span>
                    <span className="mono text-accent">
                      ${(computeSubtotal() + parseFloat(orderForm.shipping_cost || 0) - parseFloat(orderForm.discount || 0)).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Notas</label>
                <textarea className="form-textarea" value={orderForm.notes} onChange={e => setOrderForm(p => ({ ...p, notes: e.target.value }))} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={createOrder} disabled={saving}>{saving ? 'Guardando...' : 'Crear pedido'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit order modal ──────────────────────────────────── */}
      {modal === 'edit-order' && selected && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()} style={{ maxHeight: '92vh' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="modal-title">Editar pedido — {selected.order_number}</span>
                <StatusBadge status={selected.status} />
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setModal(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              {error && <div className="alert alert-danger">{error}</div>}

              {/* Cliente (solo lectura) */}
              <div className="form-group">
                <label className="form-label">Cliente</label>
                <div style={{ padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-muted)', fontSize: 13 }}>
                  {selected.customer_name}
                  {editMultiplier && (
                    <span style={{ marginLeft: 10, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)', background: 'var(--accent-glow)', padding: '1px 7px', borderRadius: 4 }}>
                      ×{editMultiplier.value.toFixed(4)} {editMultiplier.name}
                    </span>
                  )}
                </div>
              </div>

              {/* Productos (solo para pending) */}
              {selected.status === 'pending' && (
                <div className="form-group">
                  <label className="form-label">Productos</label>
                  {editLoadingProducts ? (
                    <div className="loading" style={{ minHeight: 60 }}><div className="spinner" /></div>
                  ) : editProducts.length === 0 ? (
                    <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Este cliente no tiene productos habilitados.</div>
                  ) : (
                    <div className="table-wrapper">
                      <table>
                        <thead><tr><th>SKU</th><th>Stock</th><th>Precio</th><th style={{ width: 110 }}>Cantidad</th></tr></thead>
                        <tbody>
                          {editProducts.map(p => {
                            const price = parseFloat(p.price) * editEffectiveMult(p)
                            return (
                              <tr key={p.id} style={(p.qty || 0) > 0 ? { background: 'var(--accent-glow)' } : {}}>
                                <td>
                                  <span className="mono" style={{ fontWeight: 600, fontSize: 13 }}>{p.sku}</span>
                                  {p.fixed_price && <span style={{ marginLeft: 6, fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--blue)', background: 'var(--blue-dim)', padding: '1px 5px', borderRadius: 3 }}>FIJO</span>}
                                </td>
                                <td><span className="mono" style={{ color: p.stock <= 0 ? 'var(--red)' : p.is_low_stock ? 'var(--yellow)' : 'var(--green)', fontWeight: 700 }}>{p.stock}</span></td>
                                <td><span className="mono">${price.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span></td>
                                <td>
                                  <input className="form-input mono" type="number" min="0" value={p.qty || ''} placeholder="0"
                                    onChange={e => updateEditQty(p.id, parseInt(e.target.value))}
                                    style={{ padding: '4px 8px', textAlign: 'center' }} />
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {selected.status === 'partial' && (
                <div style={{ background: 'var(--yellow-dim)', border: '1px solid rgba(234,179,8,0.3)', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 13, color: 'var(--yellow)' }}>
                  Los ítems no se pueden modificar una vez iniciada la entrega.
                </div>
              )}

              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Costo de envío</label>
                  <input className="form-input mono" type="number" value={editForm.shipping_cost}
                    onChange={e => setEditForm(p => ({ ...p, shipping_cost: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Descuento</label>
                  <input className="form-input mono" type="number" value={editForm.discount}
                    onChange={e => setEditForm(p => ({ ...p, discount: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Dirección de envío</label>
                <input className="form-input" value={editForm.shipping_address}
                  onChange={e => setEditForm(p => ({ ...p, shipping_address: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Notas</label>
                <textarea className="form-textarea" value={editForm.notes}
                  onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={submitEditOrder} disabled={saving}>{saving ? 'Guardando...' : 'Guardar cambios'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Deliver modal ─────────────────────────────────────── */}
      {modal === 'deliver' && selected && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="modal-title">Registrar entrega — {selected.order_number}</span>
                <StatusBadge status={selected.status} />
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setModal(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              {error && <div className="alert alert-danger">{error}</div>}
              {deliverItems.length === 0 ? (
                <div style={{ color: 'var(--green)', padding: '12px 0', fontSize: 13 }}>Todos los ítems de este pedido ya fueron entregados.</div>
              ) : (
                <>
                  <div className="table-wrapper" style={{ marginBottom: 16 }}>
                    <table>
                      <thead>
                        <tr>
                          <th>SKU</th>
                          <th>Producto</th>
                          <th style={{ textAlign: 'center' }}>Pendiente</th>
                          <th style={{ width: 120, textAlign: 'center' }}>A entregar</th>
                        </tr>
                      </thead>
                      <tbody>
                        {deliverItems.map(it => (
                          <tr key={it.order_item_id}>
                            <td><span className="mono text-muted text-xs">{it.product_sku}</span></td>
                            <td>{it.product_name}</td>
                            <td className="mono" style={{ textAlign: 'center' }}>{it.max}</td>
                            <td>
                              <input
                                className="form-input mono"
                                type="number"
                                min="0"
                                max={it.max}
                                value={it.qty}
                                onChange={e => updateDeliverQty(it.order_item_id, parseInt(e.target.value))}
                                style={{ padding: '4px 8px', textAlign: 'center' }}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Comentario</label>
                    <input className="form-input" value={deliverComment} onChange={e => setDeliverComment(e.target.value)} placeholder="Opcional" />
                  </div>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
              {deliverItems.length > 0 && (
                <button className="btn btn-primary" onClick={submitDeliver} disabled={saving}>{saving ? 'Guardando...' : 'Confirmar entrega'}</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Detail modal ──────────────────────────────────────── */}
      {modal === 'detail' && selected && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="modal-title">{selected.order_number}</span>
                <StatusBadge status={selected.status} />
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setModal(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div className="form-grid" style={{ marginBottom: 16 }}>
                <div>
                  <div className="text-muted text-xs">Cliente</div>
                  <div style={{ fontWeight: 500 }}>{selected.customer_name}</div>
                  <div className="text-muted text-sm">{selected.customer_email || ''}</div>
                </div>
                <div style={{ display: 'flex', gap: 24 }}>
                  <div>
                    <div className="text-muted text-xs">Total</div>
                    <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent)' }}>${fmt(selected.total)}</div>
                  </div>
                  <div>
                    <div className="text-muted text-xs">Cobrado</div>
                    <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: 'var(--green)' }}>${fmt(selected.amount_paid)}</div>
                  </div>
                  <div>
                    <div className="text-muted text-xs">Saldo</div>
                    <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: parseFloat(selected.balance) > 0 ? 'var(--red)' : 'var(--green)' }}>${fmt(selected.balance)}</div>
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <div className="form-label" style={{ marginBottom: 8 }}>Ítems</div>
                <table style={{ width: '100%' }}>
                  <thead>
                    <tr><th>SKU</th><th>Producto</th><th>Pedido</th><th>Entregado</th><th>Precio</th><th>Subtotal</th></tr>
                  </thead>
                  <tbody>
                    {selected.items?.map(it => (
                      <tr key={it.id}>
                        <td><span className="mono text-muted text-xs">{it.product_sku}</span></td>
                        <td>{it.product_name}</td>
                        <td className="mono">{it.quantity}</td>
                        <td className="mono" style={{ color: it.delivered_quantity === it.quantity ? 'var(--green)' : it.delivered_quantity > 0 ? 'var(--orange)' : 'var(--text-muted)' }}>
                          {it.delivered_quantity}
                        </td>
                        <td className="mono">${fmt(it.unit_price)}</td>
                        <td className="mono" style={{ fontWeight: 500 }}>${fmt(it.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {selected.payment_status && (
                <div style={{ marginBottom: 16 }}>
                  <div className="form-label" style={{ marginBottom: 8 }}>Pagos</div>
                  <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, fontSize: 13 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span className="text-muted">{selected.payment_status.count} pago(s) registrado(s)</span>
                      <span className="mono" style={{ color: 'var(--green)' }}>Cobrado: ${fmt(selected.payment_status.amount_paid)}</span>
                    </div>
                    {selected.payment_status.has_pending && (
                      <div style={{ marginTop: 6, color: 'var(--yellow)', fontSize: 12 }}>Hay pagos pendientes de aprobación</div>
                    )}
                  </div>
                </div>
              )}

              <div>
                <div className="form-label" style={{ marginBottom: 8 }}>Historial</div>
                <div className="timeline">
                  {selected.status_history?.map((h, i) => (
                    <div key={i} className="timeline-item">
                      <div className="timeline-dot" />
                      <div className="timeline-content">
                        <div className="timeline-title">
                          {h.old_status ? `${STATUS_LABELS[h.old_status] || h.old_status} → ` : ''}
                          {STATUS_LABELS[h.new_status] || h.new_status}
                          {h.comment && <span className="text-muted"> — {h.comment}</span>}
                        </div>
                        <div className="timeline-time">{new Date(h.created_at).toLocaleString('es-AR')}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Payment modal ─────────────────────────────────────── */}
      {modal === 'payment' && selected && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Registrar pago — {selected.order_number}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setModal(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              {error && <div className="alert alert-danger">{error}</div>}
              <div style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="text-muted">Total pedido</span>
                  <span className="mono">${fmt(selected.total)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                  <span className="text-muted">Ya cobrado</span>
                  <span className="mono" style={{ color: 'var(--green)' }}>${fmt(selected.amount_paid)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontWeight: 700 }}>
                  <span>Saldo pendiente</span>
                  <span className="mono" style={{ color: 'var(--red)' }}>${fmt(selected.balance)}</span>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Monto a cobrar</label>
                <input className="form-input mono" type="number" value={paymentForm.amount} onChange={e => setPaymentForm(p => ({ ...p, amount: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Método de pago</label>
                <select className="form-select" value={paymentForm.payment_method} onChange={e => setPaymentForm(p => ({ ...p, payment_method: e.target.value }))}>
                  {Object.entries(METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={createPayment} disabled={saving}>{saving ? '...' : 'Registrar pago'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Product picker modal ──────────────────────────────── */}
      {pickerOpen && (
        <div className="modal-overlay" onClick={() => setPickerOpen(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()} style={{ maxHeight: '88vh' }}>
            <div className="modal-header">
              <span className="modal-title">Habilitar productos para el cliente</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setPickerOpen(false)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 36 }}></th>
                      <th>SKU</th>
                      <th>Nombre</th>
                      <th>Categoría</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pickerProducts.map(p => (
                      <tr key={p.id} style={pickerSelected.has(p.id) ? { background: 'var(--accent-glow)' } : {}}>
                        <td style={{ textAlign: 'center' }}>
                          <input type="checkbox" checked={pickerSelected.has(p.id)} onChange={() => togglePicker(p.id)}
                            style={{ width: 14, height: 14, accentColor: 'var(--accent)', cursor: 'pointer' }} />
                        </td>
                        <td><span className="mono text-sm">{p.sku}</span></td>
                        <td style={{ fontWeight: 500 }}>{p.name}</td>
                        <td className="text-muted text-sm">{p.category_name || '–'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="modal-footer">
              <span className="text-muted text-sm">{pickerSelected.size} seleccionado{pickerSelected.size !== 1 ? 's' : ''}</span>
              <button className="btn btn-secondary" onClick={() => setPickerOpen(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={savePicker} disabled={pickerSaving}>
                {pickerSaving ? 'Guardando...' : 'Guardar y continuar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
