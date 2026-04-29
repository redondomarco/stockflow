import { useEffect, useRef, useState } from 'react'
import { priceListsApi } from '../services/api'
import { Plus, X, Edit2, Tag, Upload, Download, AlertTriangle } from 'lucide-react'

const empty = { name: '', multiplier: 1, description: '' }

function pct(m) {
  const diff = (parseFloat(m) - 1) * 100
  if (Math.abs(diff) < 0.001) return 'precio base'
  return diff > 0 ? `+${diff.toFixed(2)}%` : `${diff.toFixed(2)}%`
}

export default function PriceListsPage() {
  const [lists, setLists] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // null | 'form' | 'import-preview' | 'import-result'
  const [selected, setSelected] = useState(null)
  const [form, setForm] = useState(empty)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(null)   // { to_create, to_update, errors }
  const [importFile, setImportFile] = useState(null)
  const [importResult, setImportResult] = useState(null)
  const [importing, setImporting] = useState(false)
  const fileRef = useRef()

  const load = () => {
    setLoading(true)
    priceListsApi.list().then(r => setLists(r.data.results || r.data)).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  // ── Form (create / edit) ──────────────────────────────────────────
  const openCreate = () => { setForm(empty); setError(''); setSelected(null); setModal('form') }
  const openEdit = (pl) => {
    setSelected(pl)
    setForm({ name: pl.name, multiplier: pl.multiplier, description: pl.description })
    setError('')
    setModal('form')
  }

  const save = async () => {
    setSaving(true); setError('')
    try {
      if (selected) await priceListsApi.update(selected.id, form)
      else await priceListsApi.create(form)
      setModal(null); load()
    } catch (e) {
      setError(JSON.stringify(e.response?.data || 'Error'))
    } finally { setSaving(false) }
  }

  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }))

  // ── Export ────────────────────────────────────────────────────────
  const exportCsv = async () => {
    const res = await priceListsApi.exportCsv()
    const url = URL.createObjectURL(new Blob([res.data]))
    const a = document.createElement('a')
    a.href = url; a.download = 'listas_precios.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  // ── Import ────────────────────────────────────────────────────────
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    fileRef.current.value = ''
    setImportFile(file)
    setImporting(true)
    try {
      const res = await priceListsApi.importCsv(file, false)
      setPreview(res.data)
      setModal('import-preview')
    } catch (e) {
      alert(e.response?.data?.error || 'Error al leer el archivo')
    } finally { setImporting(false) }
  }

  const confirmImport = async () => {
    setImporting(true)
    try {
      const res = await priceListsApi.importCsv(importFile, true)
      setImportResult(res.data)
      setModal('import-result')
      load()
    } catch (e) {
      alert(e.response?.data?.error || 'Error al importar')
    } finally { setImporting(false) }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Listas de precios</h1>
          <p className="page-subtitle">Multiplicadores aplicados al precio base de los productos</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-secondary" onClick={exportCsv} title="Exportar CSV">
            <Download size={14} /> Exportar
          </button>
          <button className="btn btn-secondary" onClick={() => fileRef.current.click()} disabled={importing} title="Importar CSV">
            <Upload size={14} /> {importing ? 'Leyendo...' : 'Importar'}
          </button>
          <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleFileChange} />
          <button className="btn btn-primary" onClick={openCreate}><Plus size={15} /> Nueva lista</button>
        </div>
      </div>

      <div className="page-body">
        <div className="card">
          {loading ? <div className="loading"><div className="spinner" /></div> : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Multiplicador</th>
                    <th>Variación</th>
                    <th>Descripción</th>
                    <th>Clientes</th>
                    <th style={{ width: 60 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {lists.length === 0 && (
                    <tr><td colSpan={6}>
                      <div className="empty-state">
                        <Tag className="empty-state-icon" />
                        <div className="empty-state-title">Sin listas de precios</div>
                        <p className="text-muted text-sm">Creá una lista para asignarla a tus clientes</p>
                      </div>
                    </td></tr>
                  )}
                  {lists.map(pl => (
                    <tr key={pl.id}>
                      <td style={{ fontWeight: 600 }}>{pl.name}</td>
                      <td>
                        <span className="mono" style={{ fontSize: 15, fontWeight: 700, color: 'var(--accent)' }}>
                          ×{parseFloat(pl.multiplier).toFixed(4)}
                        </span>
                      </td>
                      <td>
                        <span style={{
                          fontSize: 12, fontFamily: 'var(--font-mono)',
                          color: parseFloat(pl.multiplier) > 1 ? 'var(--green)' : parseFloat(pl.multiplier) < 1 ? 'var(--red)' : 'var(--text-muted)',
                        }}>
                          {pct(pl.multiplier)}
                        </span>
                      </td>
                      <td className="text-muted">{pl.description || '–'}</td>
                      <td>
                        <span style={{ background: 'var(--accent-glow)', color: 'var(--accent)', padding: '2px 10px', borderRadius: 100, fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700 }}>
                          {pl.customer_count}
                        </span>
                      </td>
                      <td>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(pl)} title="Editar"><Edit2 size={13} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Create / Edit modal ───────────────────────────────── */}
      {modal === 'form' && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{selected ? 'Editar lista' : 'Nueva lista de precios'}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setModal(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              {error && <div className="alert alert-danger">{error}</div>}
              <div className="form-group">
                <label className="form-label">Nombre *</label>
                <input className="form-input" value={form.name} onChange={f('name')} placeholder="Ej: Lista Verde" />
              </div>
              <div className="form-group">
                <label className="form-label">Multiplicador *</label>
                <input className="form-input mono" type="number" step="0.0001" min="0.0001" value={form.multiplier} onChange={f('multiplier')} placeholder="1.0000" />
                {form.multiplier && (
                  <div className="text-muted text-sm" style={{ marginTop: 4 }}>
                    Precio base ×{parseFloat(form.multiplier).toFixed(4)} → <strong>{pct(form.multiplier)}</strong>
                  </div>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Descripción</label>
                <input className="form-input" value={form.description} onChange={f('description')} placeholder="Opcional" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Import preview modal ──────────────────────────────── */}
      {modal === 'import-preview' && preview && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Vista previa de importación</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setModal(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">

              {/* Errors */}
              {preview.errors?.length > 0 && (
                <div className="alert alert-danger" style={{ marginBottom: 16 }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>Filas con errores (se omitirán):</div>
                  {preview.errors.map((e, i) => <div key={i} style={{ fontSize: 12 }}>• {e}</div>)}
                </div>
              )}

              {/* Replacements warning */}
              {preview.to_update?.length > 0 && (
                <div style={{ background: 'var(--yellow-dim)', border: '1px solid rgba(234,179,8,0.3)', borderRadius: 8, padding: 14, marginBottom: 16 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 600, color: 'var(--yellow)', marginBottom: 8 }}>
                    <AlertTriangle size={15} />
                    {preview.to_update.length} lista(s) serán reemplazadas
                  </div>
                  <table style={{ width: '100%', fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left', fontWeight: 600, paddingBottom: 4 }}>Nombre</th>
                        <th style={{ textAlign: 'right', fontWeight: 600, paddingBottom: 4 }}>Multiplicador actual</th>
                        <th style={{ textAlign: 'right', fontWeight: 600, paddingBottom: 4 }}>Nuevo multiplicador</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.to_update.map((r, i) => (
                        <tr key={i}>
                          <td style={{ padding: '3px 0' }}>{r.nombre}</td>
                          <td className="mono" style={{ textAlign: 'right', color: 'var(--text-muted)' }}>×{parseFloat(r.current_multiplier).toFixed(4)}</td>
                          <td className="mono" style={{ textAlign: 'right', color: 'var(--accent)', fontWeight: 700 }}>×{parseFloat(r.multiplicador).toFixed(4)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* New records */}
              {preview.to_create?.length > 0 && (
                <div style={{ background: 'var(--green-dim)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 8, padding: 14, marginBottom: 16 }}>
                  <div style={{ fontWeight: 600, color: 'var(--green)', marginBottom: 8 }}>
                    {preview.to_create.length} lista(s) nuevas
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {preview.to_create.map((r, i) => (
                      <span key={i} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 10px', fontSize: 12 }}>
                        {r.nombre} <span className="mono" style={{ color: 'var(--accent)' }}>×{parseFloat(r.multiplicador).toFixed(4)}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {preview.to_create?.length === 0 && preview.to_update?.length === 0 && (
                <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '8px 0' }}>
                  No hay registros válidos para importar.
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
              {(preview.to_create?.length > 0 || preview.to_update?.length > 0) && (
                <button className="btn btn-primary" onClick={confirmImport} disabled={importing}>
                  {importing ? 'Importando...' : `Confirmar importación`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Import result modal ───────────────────────────────── */}
      {modal === 'import-result' && importResult && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Importación completada</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setModal(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', gap: 16, marginBottom: importResult.errors?.length ? 16 : 0 }}>
                <div style={{ flex: 1, background: 'var(--green-dim)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 8, padding: 16, textAlign: 'center' }}>
                  <div className="mono" style={{ fontSize: 28, fontWeight: 700, color: 'var(--green)' }}>{importResult.created}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Creadas</div>
                </div>
                <div style={{ flex: 1, background: 'var(--yellow-dim)', border: '1px solid rgba(234,179,8,0.2)', borderRadius: 8, padding: 16, textAlign: 'center' }}>
                  <div className="mono" style={{ fontSize: 28, fontWeight: 700, color: 'var(--yellow)' }}>{importResult.updated}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>Reemplazadas</div>
                </div>
              </div>
              {importResult.errors?.length > 0 && (
                <div className="alert alert-danger">
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>Errores omitidos:</div>
                  {importResult.errors.map((e, i) => <div key={i} style={{ fontSize: 12 }}>• {e}</div>)}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => setModal(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
