import { useEffect, useRef, useState } from 'react'
import { productsApi } from '../services/api'
import { Plus, Search, Edit2, ArrowUpDown, X, Package, Download, Upload, CheckCircle, AlertCircle } from 'lucide-react'

const emptyProduct = { name: '', sku: '', description: '', category: '', supplier: '', price: '', cost: '', stock: 0, stock_min: 5, sort_order: 0, fixed_price: false, is_active: true }

export default function ProductsPage() {
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState('')
  const [modal, setModal] = useState(null) // null | 'create' | 'edit' | 'stock'
  const [selected, setSelected] = useState(null)
  const [form, setForm] = useState(emptyProduct)
  const [stockForm, setStockForm] = useState({ quantity: 0, movement_type: 'in', reason: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const fileRef = useRef()

  const load = () => {
    setLoading(true)
    Promise.all([
      productsApi.list({ search, category: filterCat || undefined, all: 1 }),
      productsApi.categories(),
      productsApi.suppliers(),
    ]).then(([p, c, s]) => {
      setProducts(p.data.results || p.data)
      setCategories(c.data.results || c.data)
      setSuppliers(s.data.results || s.data)
    }).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [search, filterCat])

  const openCreate = () => { setForm(emptyProduct); setError(''); setModal('create') }
  const openEdit = (p) => { setSelected(p); setForm({ ...p, category: p.category || '', supplier: p.supplier || '' }); setError(''); setModal('edit') }
  const openStock = (p) => { setSelected(p); setStockForm({ quantity: 0, movement_type: 'in', reason: '' }); setModal('stock') }

  const saveProduct = async () => {
    setSaving(true); setError('')
    try {
      const data = {
        ...form,
        category: form.category || null,
        supplier: form.supplier || null,
        cost: form.cost === '' ? 0 : form.cost,
        price: form.price === '' ? 0 : form.price,
      }
      if (modal === 'create') await productsApi.create(data)
      else await productsApi.update(selected.id, data)
      setModal(null)
      load()
    } catch (e) {
      setError(JSON.stringify(e.response?.data || 'Error al guardar'))
    } finally { setSaving(false) }
  }

  const saveStock = async () => {
    setSaving(true); setError('')
    try {
      await productsApi.adjustStock(selected.id, stockForm)
      setModal(null)
      load()
    } catch (e) {
      setError(e.response?.data?.error || 'Error')
    } finally { setSaving(false) }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const res = await productsApi.exportProducts()
      const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }))
      const a = document.createElement('a')
      a.href = url
      a.download = 'productos.csv'
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setExporting(false)
    }
  }

  const handleImport = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    fileRef.current.value = ''
    setImporting(true)
    setImportResult(null)
    try {
      const res = await productsApi.importProducts(file)
      setImportResult({ ok: true, ...res.data })
      load()
    } catch (err) {
      setImportResult({ ok: false, error: err.response?.data?.error || 'Error al importar' })
    } finally {
      setImporting(false)
    }
  }

  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }))

  const stockColor = (p) => {
    if (p.stock <= 0) return 'var(--red)'
    if (p.is_low_stock) return 'var(--yellow)'
    return 'var(--green)'
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Productos</h1>
          <p className="page-subtitle">Gestión del catálogo de productos</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={handleExport} disabled={exporting}>
            <Download size={15} /> {exporting ? 'Exportando...' : 'Exportar CSV'}
          </button>
          <button className="btn btn-secondary" onClick={() => fileRef.current.click()} disabled={importing}>
            <Upload size={15} /> {importing ? 'Importando...' : 'Importar CSV'}
          </button>
          <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleImport} />
          <button className="btn btn-primary" onClick={openCreate}><Plus size={15} /> Nuevo producto</button>
        </div>
      </div>

      <div className="page-body">
        {importResult && (
          <div
            className="card"
            style={{
              marginBottom: 16,
              padding: '12px 16px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              borderColor: importResult.ok ? 'var(--green)' : 'var(--red)',
              background: importResult.ok ? 'var(--green-dim)' : 'var(--red-dim)',
            }}
          >
            {importResult.ok
              ? <CheckCircle size={16} color="var(--green)" style={{ flexShrink: 0, marginTop: 1 }} />
              : <AlertCircle size={16} color="var(--red)" style={{ flexShrink: 0, marginTop: 1 }} />
            }
            <div style={{ flex: 1, fontSize: 13 }}>
              {importResult.ok ? (
                <>
                  <strong>{importResult.created} producto{importResult.created !== 1 ? 's' : ''} creado{importResult.created !== 1 ? 's' : ''}</strong>
                  {importResult.updated > 0 && <span style={{ color: 'var(--yellow)' }}> · {importResult.updated} precio{importResult.updated !== 1 ? 's' : ''} actualizado{importResult.updated !== 1 ? 's' : ''}</span>}
                  {importResult.errors?.length > 0 && (
                    <ul style={{ marginTop: 6, paddingLeft: 16, color: 'var(--yellow)' }}>
                      {importResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  )}
                </>
              ) : (
                <span>{importResult.error}</span>
              )}
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => setImportResult(null)}><X size={14} /></button>
          </div>
        )}

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="toolbar">
            <div className="search-input" style={{ flex: 1 }}>
              <Search className="search-icon" size={15} />
              <input className="form-input" placeholder="Buscar por nombre o SKU..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <select className="form-select" style={{ width: 180 }} value={filterCat} onChange={e => setFilterCat(e.target.value)}>
              <option value="">Todas las categorías</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>

        <div className="card">
          {loading ? <div className="loading"><div className="spinner" /> Cargando...</div> : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Nombre</th>
                    <th>Categoría</th>
                    <th>Precio</th>
                    <th>Costo</th>
                    <th>Stock</th>
                    <th>Margen</th>
                    <th style={{ width: 100 }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {products.length === 0 && (
                    <tr><td colSpan={8}>
                      <div className="empty-state">
                        <Package className="empty-state-icon" />
                        <div className="empty-state-title">Sin productos</div>
                        <p className="text-muted text-sm">Crea tu primer producto</p>
                      </div>
                    </td></tr>
                  )}
                  {products.map(p => (
                    <tr key={p.id} style={!p.is_active ? { opacity: 0.45 } : {}}>
                      <td>
                        <span className="mono text-muted" style={{ fontSize: 12 }}>{p.sku}</span>
                        {!p.is_active && (
                          <span style={{ marginLeft: 6, fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--red)', background: 'var(--red-dim)', padding: '1px 5px', borderRadius: 3, verticalAlign: 'middle' }}>
                            INACTIVO
                          </span>
                        )}
                      </td>
                      <td><span style={{ fontWeight: 500 }}>{p.name}</span></td>
                      <td><span className="text-muted">{p.category_name || '–'}</span></td>
                      <td>
                        <span className="mono">${parseFloat(p.price).toLocaleString('es-AR')}</span>
                        {p.fixed_price && (
                          <span style={{ marginLeft: 6, fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--blue)', background: 'var(--blue-dim)', padding: '1px 5px', borderRadius: 3, verticalAlign: 'middle' }}>
                            FIJO
                          </span>
                        )}
                      </td>
                      <td><span className="mono text-muted">${parseFloat(p.cost).toLocaleString('es-AR')}</span></td>
                      <td>
                        <div className="stock-indicator">
                          <div className={`stock-dot ${p.stock <= 0 ? 'danger' : p.is_low_stock ? 'warning' : ''}`} />
                          <span className="mono" style={{ color: stockColor(p), fontWeight: 700 }}>{p.stock}</span>
                          <span className="text-muted text-xs">/ mín {p.stock_min}</span>
                        </div>
                      </td>
                      <td>
                        {p.margin != null ? (
                          <span style={{ color: p.margin > 30 ? 'var(--green)' : p.margin > 10 ? 'var(--yellow)' : 'var(--red)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                            {p.margin}%
                          </span>
                        ) : '–'}
                      </td>
                      <td>
                        <div className="flex gap-2">
                          <button className="btn btn-ghost btn-sm" onClick={() => openEdit(p)} title="Editar"><Edit2 size={13} /></button>
                          <button className="btn btn-ghost btn-sm" onClick={() => openStock(p)} title="Ajustar stock"><ArrowUpDown size={13} /></button>
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

      {/* Create/Edit modal */}
      {(modal === 'create' || modal === 'edit') && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{modal === 'create' ? 'Nuevo producto' : 'Editar producto'}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setModal(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              {error && <div className="alert alert-danger">{error}</div>}
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Nombre *</label>
                  <input className="form-input" value={form.name} onChange={f('name')} placeholder="Nombre del producto" />
                </div>
                <div className="form-group">
                  <label className="form-label">SKU *</label>
                  <input className="form-input mono" value={form.sku} onChange={f('sku')} placeholder="PROD-001" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Descripción</label>
                <textarea className="form-textarea" value={form.description} onChange={f('description')} />
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Categoría</label>
                  <select className="form-select" value={form.category} onChange={f('category')}>
                    <option value="">Sin categoría</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Proveedor</label>
                  <select className="form-select" value={form.supplier || ''} onChange={f('supplier')}>
                    <option value="">Sin proveedor</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-grid-3">
                <div className="form-group">
                  <label className="form-label">Precio venta *</label>
                  <input className="form-input mono" type="number" value={form.price} onChange={f('price')} placeholder="0.00" />
                </div>
                <div className="form-group">
                  <label className="form-label">Costo</label>
                  <input className="form-input mono" type="number" value={form.cost} onChange={f('cost')} placeholder="0.00" />
                </div>
                <div className="form-group">
                  <label className="form-label">Stock inicial</label>
                  <input className="form-input mono" type="number" value={form.stock} onChange={f('stock')} />
                </div>
              </div>
              <div className="form-grid">
                <div className="form-group" style={{ maxWidth: 200 }}>
                  <label className="form-label">Stock mínimo</label>
                  <input className="form-input mono" type="number" value={form.stock_min} onChange={f('stock_min')} />
                </div>
                <div className="form-group" style={{ maxWidth: 200 }}>
                  <label className="form-label">Orden</label>
                  <input className="form-input mono" type="number" value={form.sort_order} onChange={f('sort_order')} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 22 }}>
                  <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 10, margin: 0 }}>
                    <input
                      id="fixed_price_toggle"
                      type="checkbox"
                      checked={!!form.fixed_price}
                      onChange={e => setForm(p => ({ ...p, fixed_price: e.target.checked }))}
                      style={{ width: 16, height: 16, accentColor: 'var(--blue)', cursor: 'pointer' }}
                    />
                    <label htmlFor="fixed_price_toggle" className="form-label" style={{ margin: 0, cursor: 'pointer' }}>
                      Precio fijo <span className="text-muted" style={{ fontWeight: 400 }}>(no aplica lista de precios)</span>
                    </label>
                  </div>
                  {modal === 'edit' && (
                    <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 10, margin: 0 }}>
                      <input
                        id="is_active_toggle"
                        type="checkbox"
                        checked={!!form.is_active}
                        onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))}
                        style={{ width: 16, height: 16, accentColor: 'var(--accent)', cursor: 'pointer' }}
                      />
                      <label htmlFor="is_active_toggle" className="form-label" style={{ margin: 0, cursor: 'pointer' }}>
                        Producto activo
                      </label>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={saveProduct} disabled={saving}>
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stock adjust modal */}
      {modal === 'stock' && selected && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Ajustar stock — {selected.name}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setModal(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              {error && <div className="alert alert-danger">{error}</div>}
              <div style={{ display: 'flex', gap: 16, padding: '8px 0', marginBottom: 8 }}>
                <div>
                  <div className="text-muted text-sm">Stock actual</div>
                  <div className="mono" style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent)' }}>{selected.stock}</div>
                </div>
                <div>
                  <div className="text-muted text-sm">Mínimo</div>
                  <div className="mono" style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-muted)' }}>{selected.stock_min}</div>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Tipo de movimiento</label>
                <select className="form-select" value={stockForm.movement_type} onChange={e => setStockForm(p => ({ ...p, movement_type: e.target.value }))}>
                  <option value="in">Entrada</option>
                  <option value="out">Salida</option>
                  <option value="adjustment">Ajuste (nuevo total)</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Cantidad</label>
                <input className="form-input mono" type="number" value={stockForm.quantity} onChange={e => setStockForm(p => ({ ...p, quantity: parseInt(e.target.value) || 0 }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Motivo</label>
                <input className="form-input" value={stockForm.reason} onChange={e => setStockForm(p => ({ ...p, reason: e.target.value }))} placeholder="Opcional" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={saveStock} disabled={saving}>
                {saving ? 'Guardando...' : 'Aplicar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
