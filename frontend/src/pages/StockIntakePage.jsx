import { useEffect, useMemo, useRef, useState } from 'react'
import { intakeApi, productsApi } from '../services/api'
import { usePermissions } from '../context/AuthContext'
import { PackagePlus, Plus, Save, Search, Trash2, X, CheckCircle } from 'lucide-react'

// Ingreso de stock por lote: la lista habitual (compartida) aparece cargada y solo
// hay que completar las cantidades. Se pueden sumar productos para un ingreso puntual.
export default function StockIntakePage() {
  const canWrite = usePermissions().can('stock', 'write')
  const [allProducts, setAllProducts] = useState([])
  const [rows, setRows] = useState([])            // productos en pantalla (en orden)
  const [savedIds, setSavedIds] = useState([])    // lista habitual guardada
  const [qty, setQty] = useState({})              // { productId: '12' }
  const [reason, setReason] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [message, setMessage] = useState(null)
  const [result, setResult] = useState(null)
  const inputs = useRef({})

  const load = () => {
    setLoading(true)
    return Promise.all([intakeApi.list(), productsApi.list()])
      .then(([intake, products]) => {
        setRows(intake.data)
        setSavedIds(intake.data.map(p => p.id))
        setAllProducts(products.data.results || products.data)
      })
      .catch(() => setMessage({ type: 'danger', text: 'No se pudo cargar la lista de ingreso.' }))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const parsed = (id) => {
    const n = parseInt(qty[id], 10)
    return Number.isFinite(n) && n > 0 ? n : 0
  }
  const filled = rows.filter(p => parsed(p.id) > 0)
  const totalUnits = filled.reduce((acc, p) => acc + parsed(p.id), 0)
  const listChanged = rows.map(p => p.id).join(',') !== savedIds.join(',')

  const matches = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return []
    const inList = new Set(rows.map(p => p.id))
    return allProducts
      .filter(p => !inList.has(p.id) && (p.name.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term)))
      .slice(0, 8)
  }, [search, rows, allProducts])

  const addRow = (product) => {
    setRows(r => [...r, product])
    setSearch('')
    setTimeout(() => inputs.current[product.id]?.focus(), 0)
  }

  const removeRow = (id) => {
    setRows(r => r.filter(p => p.id !== id))
    setQty(q => { const next = { ...q }; delete next[id]; return next })
  }

  // Enter pasa a la cantidad del producto siguiente
  const focusNext = (index) => {
    const next = rows[index + 1]
    if (next) inputs.current[next.id]?.focus()
  }

  const saveList = async () => {
    setSaving(true); setMessage(null)
    try {
      const res = await intakeApi.configure(rows.map(p => p.id))
      setSavedIds(res.data.map(p => p.id))
      setMessage({ type: 'success', text: 'Lista habitual guardada.' })
    } catch (e) {
      setMessage({ type: 'danger', text: e.response?.data?.error || 'No se pudo guardar la lista.' })
    } finally { setSaving(false) }
  }

  const applyIntake = async () => {
    setSaving(true); setMessage(null)
    try {
      const res = await intakeApi.apply({
        items: filled.map(p => ({ product: p.id, quantity: parsed(p.id) })),
        reason: reason.trim(),
      })
      setResult(res.data)
      setQty({}); setReason(''); setConfirming(false)
      // Refresca el stock mostrado sin perder los productos agregados para este ingreso
      const fresh = await productsApi.list()
      const byId = Object.fromEntries((fresh.data.results || fresh.data).map(p => [p.id, p]))
      setAllProducts(fresh.data.results || fresh.data)
      setRows(r => r.map(p => byId[p.id] || p))
    } catch (e) {
      setConfirming(false)
      setMessage({ type: 'danger', text: e.response?.data?.error || e.response?.data?.detail || 'No se pudo registrar el ingreso.' })
    } finally { setSaving(false) }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Ingreso de stock</h1>
          <p className="page-subtitle">Completá las cantidades recibidas y confirmá el ingreso</p>
        </div>
        {canWrite && listChanged && !loading && (
          <button className="btn btn-secondary" onClick={saveList} disabled={saving}>
            <Save size={15} /> Guardar como lista habitual
          </button>
        )}
      </div>

      <div className="page-body">
        {message && <div className={`alert alert-${message.type}`} style={{ marginBottom: 16 }}>{message.text}</div>}

        {result && (
          <div className="card" style={{ marginBottom: 16, padding: '12px 16px', borderColor: 'var(--green)', background: 'var(--green-dim)', display: 'flex', gap: 10 }}>
            <CheckCircle size={16} color="var(--green)" style={{ flexShrink: 0, marginTop: 2 }} />
            <div style={{ flex: 1, fontSize: 13 }}>
              <strong>Ingreso registrado: {result.items.length} producto{result.items.length === 1 ? '' : 's'}, {result.total_units} unidades</strong>
              {result.reason && <span className="text-muted"> · {result.reason}</span>}
              <div className="text-muted" style={{ marginTop: 4 }}>
                {result.items.map(it => `${it.sku}: ${it.stock_before} → ${it.stock_after}`).join(' · ')}
              </div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => setResult(null)}><X size={14} /></button>
          </div>
        )}

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="toolbar" style={{ alignItems: 'flex-end' }}>
            <div className="form-group" style={{ margin: 0, flex: 1, minWidth: 220 }}>
              <label className="form-label" htmlFor="intake-reason">Referencia (opcional)</label>
              <input id="intake-reason" className="form-input" value={reason} onChange={e => setReason(e.target.value)}
                placeholder="Remito, proveedor, observaciones…" maxLength={200} />
            </div>
            <div className="form-group" style={{ margin: 0, flex: 1, minWidth: 220, position: 'relative' }}>
              <label className="form-label" htmlFor="intake-add">Agregar producto a este ingreso</label>
              <div className="search-input">
                <Search className="search-icon" size={15} />
                <input id="intake-add" className="form-input" value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar por nombre o SKU" autoComplete="off"
                  onKeyDown={e => { if (e.key === 'Enter' && matches[0]) { e.preventDefault(); addRow(matches[0]) } }} />
              </div>
              {matches.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, marginTop: 4, background: 'var(--bg-card)', border: '1px solid var(--border-light)', borderRadius: 8, boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
                  {matches.map(p => (
                    <button key={p.id} type="button" className="nav-item" style={{ borderRadius: 0 }} onClick={() => addRow(p)}>
                      <Plus size={13} /> <span className="mono" style={{ fontWeight: 600 }}>{p.sku}</span> {p.name}
                      <span className="text-muted" style={{ marginLeft: 'auto', fontSize: 12 }}>stock {p.stock}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="card">
          {loading ? <div className="loading"><div className="spinner" /></div> : (
            <>
              <div className="table-wrapper">
                <table>
                  <thead>
                    {/* 4 columnas: entra en un celular sin desplazamiento lateral */}
                    <tr>
                      <th>Producto</th>
                      <th style={{ textAlign: 'right' }}>Stock</th>
                      <th style={{ width: 110 }}>Ingresa</th>
                      <th style={{ width: 36 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 && (
                      <tr><td colSpan={4}>
                        <div className="empty-state">
                          <PackagePlus className="empty-state-icon" />
                          <div className="empty-state-title">No hay productos en la lista</div>
                          <div className="text-muted text-sm" style={{ marginTop: 4 }}>
                            Agregalos con el buscador de arriba{canWrite ? ' y guardalos como lista habitual para la próxima vez' : ''}.
                          </div>
                        </div>
                      </td></tr>
                    )}
                    {rows.map((p, i) => {
                      const n = parsed(p.id)
                      return (
                        <tr key={p.id} style={n > 0 ? { background: 'var(--accent-glow)' } : {}}>
                          <td style={{ padding: '10px 8px 10px 14px' }}>
                            <div className="mono" style={{ fontWeight: 700 }}>{p.sku}</div>
                            <div className="text-muted" style={{ fontSize: 12, wordBreak: 'break-word' }}>{p.name}</div>
                          </td>
                          <td className="mono" style={{ textAlign: 'right', whiteSpace: 'nowrap', padding: '10px 8px' }}>
                            <span style={{ color: p.stock <= 0 ? 'var(--red)' : undefined }}>{p.stock}</span>
                            {n > 0 && <span style={{ color: 'var(--green)', fontWeight: 700 }}> → {p.stock + n}</span>}
                          </td>
                          <td style={{ padding: '10px 8px' }}>
                            <input
                              ref={el => { inputs.current[p.id] = el }}
                              className="form-input mono" type="number" min="1" step="1" inputMode="numeric"
                              aria-label={`Cantidad a ingresar de ${p.name}`}
                              value={qty[p.id] ?? ''} placeholder="0" disabled={!canWrite}
                              onChange={e => setQty(q => ({ ...q, [p.id]: e.target.value }))}
                              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); focusNext(i) } }}
                              style={{ padding: '6px 10px', textAlign: 'right' }}
                            />
                          </td>
                          <td style={{ padding: '10px 6px' }}>
                            <button className="btn btn-ghost btn-sm" title="Quitar de este ingreso" onClick={() => removeRow(p.id)}>
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {rows.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13 }}>
                    <strong>{filled.length}</strong> producto{filled.length === 1 ? '' : 's'} con cantidad · <strong>{totalUnits}</strong> unidades
                  </span>
                  {Object.keys(qty).length > 0 && (
                    <button className="btn btn-ghost btn-sm" onClick={() => setQty({})}>Vaciar cantidades</button>
                  )}
                  {canWrite ? (
                    <button className="btn btn-primary" style={{ marginLeft: 'auto' }} disabled={!filled.length || saving}
                      onClick={() => setConfirming(true)}>
                      <PackagePlus size={15} /> Confirmar ingreso
                    </button>
                  ) : (
                    <span className="text-muted text-sm" style={{ marginLeft: 'auto' }}>Tu usuario tiene permiso de solo lectura en Stock.</span>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {confirming && (
        <div className="modal-overlay" onClick={() => !saving && setConfirming(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Confirmar ingreso de stock</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirming(false)} disabled={saving}><X size={16} /></button>
            </div>
            <div className="modal-body">
              {reason.trim() && <div className="text-muted text-sm">Referencia: <strong style={{ color: 'var(--text)' }}>{reason.trim()}</strong></div>}
              <div className="table-wrapper">
                <table>
                  <thead><tr><th>Producto</th><th style={{ textAlign: 'right' }}>Ingresa</th><th style={{ textAlign: 'right' }}>Stock</th></tr></thead>
                  <tbody>
                    {filled.map(p => (
                      <tr key={p.id}>
                        <td><span className="mono" style={{ fontWeight: 600 }}>{p.sku}</span> {p.name}</td>
                        <td className="mono" style={{ textAlign: 'right', color: 'var(--green)', fontWeight: 700 }}>+{parsed(p.id)}</td>
                        <td className="mono" style={{ textAlign: 'right' }}>{p.stock} → {p.stock + parsed(p.id)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setConfirming(false)} disabled={saving}>Volver</button>
              <button className="btn btn-primary" onClick={applyIntake} disabled={saving}>
                {saving ? 'Registrando...' : `Ingresar ${totalUnits} unidades`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
