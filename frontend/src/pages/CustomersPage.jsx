import { useEffect, useRef, useState } from 'react'
import { ordersApi, priceListsApi, productsApi } from '../services/api'
import { Plus, X, Users, Search, Download, Upload, CheckCircle, AlertCircle, Edit2, Package } from 'lucide-react'

const emptyCustomer = { name: '', cuit: '', email: '', phone: '', address: '', localidad: '', price_list: '', priority: 5 }

export default function CustomersPage() {
  const [customers, setCustomers] = useState([])
  const [priceLists, setPriceLists] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(null)
  const [selected, setSelected] = useState(null)
  const [form, setForm] = useState(emptyCustomer)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const fileRef = useRef()

  // Products modal
  const [productModal, setProductModal] = useState(null) // null | { customer, selectedIds: Set }
  const [allProducts, setAllProducts] = useState([])
  const [loadingPM, setLoadingPM] = useState(false)
  const [savingPM, setSavingPM] = useState(false)

  const load = () => {
    setLoading(true)
    Promise.all([
      ordersApi.customers({ search }),
      priceListsApi.list(),
    ]).then(([c, pl]) => {
      setCustomers(c.data.results || c.data)
      setPriceLists(pl.data.results || pl.data)
    }).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [search])

  const openCreate = () => { setForm(emptyCustomer); setError(''); setModal('create') }
  const openEdit = (c) => {
    setSelected(c)
    setForm({ name: c.name, cuit: c.cuit ?? '', email: c.email ?? '', phone: c.phone, address: c.address, localidad: c.localidad ?? '', price_list: c.price_list ?? '', priority: c.priority ?? 5 })
    setError('')
    setModal('edit')
  }

  const save = async () => {
    setSaving(true); setError('')
    try {
      const payload = { ...form, price_list: form.price_list || null, email: form.email || null }
      if (modal === 'edit') await ordersApi.updateCustomer(selected.id, payload)
      else await ordersApi.createCustomer(payload)
      setModal(null); load()
    } catch (e) {
      setError(JSON.stringify(e.response?.data || 'Error'))
    } finally { setSaving(false) }
  }

  const openProductModal = async (customer) => {
    setLoadingPM(true)
    try {
      const [prods, enabled] = await Promise.all([
        productsApi.list({ all: 1 }),
        ordersApi.getCustomerProducts(customer.id),
      ])
      setAllProducts(prods.data.results || prods.data)
      setProductModal({ customer, selectedIds: new Set((enabled.data).map(p => p.id)) })
    } finally { setLoadingPM(false) }
  }

  const toggleProduct = (id) => {
    setProductModal(prev => {
      const ids = new Set(prev.selectedIds)
      ids.has(id) ? ids.delete(id) : ids.add(id)
      return { ...prev, selectedIds: ids }
    })
  }

  const saveProductModal = async () => {
    setSavingPM(true)
    try {
      await ordersApi.setCustomerProducts(productModal.customer.id, [...productModal.selectedIds])
      setProductModal(null)
    } finally { setSavingPM(false) }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const res = await ordersApi.exportCustomers()
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }))
      const a = document.createElement('a')
      a.href = url; a.download = 'clientes.csv'; a.click()
      URL.revokeObjectURL(url)
    } finally { setExporting(false) }
  }

  const handleImport = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    fileRef.current.value = ''
    setImporting(true); setImportResult(null)
    try {
      const res = await ordersApi.importCustomers(file)
      setImportResult({ ok: true, ...res.data }); load()
    } catch (err) {
      setImportResult({ ok: false, error: err.response?.data?.error || 'Error al importar' })
    } finally { setImporting(false) }
  }

  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }))

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Clientes</h1>
          <p className="page-subtitle">Base de datos de clientes</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={handleExport} disabled={exporting}>
            <Download size={15} /> {exporting ? 'Exportando...' : 'Exportar CSV'}
          </button>
          <button className="btn btn-secondary" onClick={() => fileRef.current.click()} disabled={importing}>
            <Upload size={15} /> {importing ? 'Importando...' : 'Importar CSV'}
          </button>
          <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleImport} />
          <button className="btn btn-primary" onClick={openCreate}><Plus size={15} /> Nuevo cliente</button>
        </div>
      </div>

      <div className="page-body">
        {importResult && (
          <div className="card" style={{ marginBottom: 16, padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 10, borderColor: importResult.ok ? 'var(--green)' : 'var(--red)', background: importResult.ok ? 'var(--green-dim)' : 'var(--red-dim)' }}>
            {importResult.ok ? <CheckCircle size={16} color="var(--green)" style={{ flexShrink: 0, marginTop: 1 }} /> : <AlertCircle size={16} color="var(--red)" style={{ flexShrink: 0, marginTop: 1 }} />}
            <div style={{ flex: 1, fontSize: 13 }}>
              {importResult.ok ? (
                <>
                  <strong>{importResult.created} cliente{importResult.created !== 1 ? 's' : ''} importado{importResult.created !== 1 ? 's' : ''}</strong>
                  {importResult.skipped > 0 && <span className="text-muted"> · {importResult.skipped} omitido{importResult.skipped !== 1 ? 's' : ''} (email duplicado)</span>}
                  {importResult.errors?.length > 0 && <ul style={{ marginTop: 6, paddingLeft: 16, color: 'var(--yellow)' }}>{importResult.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
                </>
              ) : <span>{importResult.error}</span>}
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => setImportResult(null)}><X size={14} /></button>
          </div>
        )}

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="toolbar">
            <div className="search-input" style={{ flex: 1 }}>
              <Search className="search-icon" size={15} />
              <input className="form-input" placeholder="Buscar por nombre o email..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="card">
          {loading ? <div className="loading"><div className="spinner" /></div> : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>CUIT</th>
                    <th>Email</th>
                    <th>Teléfono</th>
                    <th>Localidad</th>
                    <th>Prioridad</th>
                    <th>Lista de precios</th>
                    <th>Pedidos</th>
                    <th>Registrado</th>
                    <th style={{ width: 80 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {customers.length === 0 && (
                    <tr><td colSpan={7}><div className="empty-state"><Users className="empty-state-icon" /><div className="empty-state-title">Sin clientes</div></div></td></tr>
                  )}
                  {customers.map(c => (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 500 }}>{c.name}</td>
                      <td><span className="mono text-sm">{c.cuit || '–'}</span></td>
                      <td className="text-muted">{c.email || '–'}</td>
                      <td className="text-muted">{c.phone || '–'}</td>
                      <td className="text-muted text-sm">{c.localidad || '–'}</td>
                      <td>
                        <span className="mono" style={{ fontWeight: 700, color: c.priority <= 3 ? 'var(--red)' : c.priority <= 6 ? 'var(--yellow)' : 'var(--text-muted)', fontSize: 13 }}>
                          {c.priority}
                        </span>
                      </td>
                      <td>
                        {c.price_list_name ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                            <span style={{ fontWeight: 600 }}>{c.price_list_name}</span>
                            <span className="mono" style={{ fontSize: 11, color: 'var(--accent)', background: 'var(--accent-glow)', padding: '1px 6px', borderRadius: 4 }}>×{parseFloat(c.price_list_multiplier).toFixed(4)}</span>
                          </span>
                        ) : <span className="text-muted text-sm">–</span>}
                      </td>
                      <td>
                        <span style={{ background: 'var(--accent-glow)', color: 'var(--accent)', padding: '2px 10px', borderRadius: 100, fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700 }}>{c.order_count}</span>
                      </td>
                      <td className="mono text-muted text-sm">{new Date(c.created_at).toLocaleDateString('es-AR')}</td>
                      <td>
                        <div className="flex gap-2">
                          <button className="btn btn-ghost btn-sm" onClick={() => openProductModal(c)} title="Productos habilitados" disabled={loadingPM}><Package size={13} /></button>
                          <button className="btn btn-ghost btn-sm" onClick={() => openEdit(c)} title="Editar"><Edit2 size={13} /></button>
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

      {/* Customer create/edit modal */}
      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{modal === 'edit' ? 'Editar cliente' : 'Nuevo cliente'}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setModal(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              {error && <div className="alert alert-danger">{error}</div>}
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Nombre *</label>
                  <input className="form-input" value={form.name} onChange={f('name')} />
                </div>
                <div className="form-group">
                  <label className="form-label">CUIT</label>
                  <input className="form-input mono" value={form.cuit} onChange={f('cuit')} placeholder="20-12345678-9" />
                </div>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input className="form-input" type="email" value={form.email} onChange={f('email')} />
                </div>
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Teléfono</label>
                  <input className="form-input" value={form.phone} onChange={f('phone')} />
                </div>
                <div className="form-group">
                  <label className="form-label">Dirección</label>
                  <input className="form-input" value={form.address} onChange={f('address')} />
                </div>
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Localidad</label>
                  <input className="form-input" value={form.localidad} onChange={f('localidad')} />
                </div>
              </div>
              <div className="form-grid">
                <div className="form-group" style={{ maxWidth: 200 }}>
                  <label className="form-label">Prioridad de entrega (1–10)</label>
                  <input className="form-input mono" type="number" min="1" max="10" value={form.priority} onChange={f('priority')} />
                  <span className="text-muted text-xs" style={{ marginTop: 4, display: 'block' }}>1 = más urgente · 10 = menor prioridad</span>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Lista de precios</label>
                <select className="form-select" value={form.price_list} onChange={f('price_list')}>
                  <option value="">Sin lista (precio base)</option>
                  {priceLists.map(pl => <option key={pl.id} value={pl.id}>{pl.name} — ×{parseFloat(pl.multiplier).toFixed(4)}</option>)}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Products modal */}
      {productModal && (
        <div className="modal-overlay" onClick={() => setProductModal(null)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Productos — {productModal.customer.name}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setProductModal(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              {allProducts.length === 0 ? (
                <div className="text-muted text-sm">No hay productos cargados en el sistema.</div>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <span className="text-muted text-sm">{productModal.selectedIds.size} producto{productModal.selectedIds.size !== 1 ? 's' : ''} habilitado{productModal.selectedIds.size !== 1 ? 's' : ''}</span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => setProductModal(p => ({ ...p, selectedIds: new Set(allProducts.map(pr => pr.id)) }))}>Todos</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setProductModal(p => ({ ...p, selectedIds: new Set() }))}>Ninguno</button>
                    </div>
                  </div>
                  <div className="table-wrapper" style={{ maxHeight: 400, overflowY: 'auto' }}>
                    <table>
                      <thead>
                        <tr>
                          <th style={{ width: 36 }}></th>
                          <th>SKU</th>
                          <th>Nombre</th>
                          <th>Stock</th>
                          <th>Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allProducts.map(p => (
                          <tr
                            key={p.id}
                            style={{ cursor: 'pointer', opacity: !p.is_active ? 0.45 : 1 }}
                            onClick={() => toggleProduct(p.id)}
                          >
                            <td>
                              <input
                                type="checkbox"
                                checked={productModal.selectedIds.has(p.id)}
                                onChange={() => toggleProduct(p.id)}
                                onClick={e => e.stopPropagation()}
                                style={{ width: 15, height: 15, accentColor: 'var(--accent)', cursor: 'pointer' }}
                              />
                            </td>
                            <td><span className="mono" style={{ fontSize: 12 }}>{p.sku}</span></td>
                            <td style={{ fontWeight: 500 }}>{p.name}</td>
                            <td><span className="mono" style={{ color: p.stock === 0 ? 'var(--red)' : p.is_low_stock ? 'var(--yellow)' : 'var(--green)', fontWeight: 700 }}>{p.stock}</span></td>
                            <td>{!p.is_active && <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--red)', background: 'var(--red-dim)', padding: '1px 5px', borderRadius: 3 }}>INACTIVO</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setProductModal(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={saveProductModal} disabled={savingPM}>{savingPM ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
