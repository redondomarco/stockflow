import { useEffect, useRef, useState } from 'react'
import { usersApi } from '../services/api'
import { Plus, X, Edit2, Trash2, UserCog, Download, Upload, CheckCircle, AlertCircle } from 'lucide-react'

const SECTIONS = [
  { key: 'products',    label: 'Productos' },
  { key: 'stock',       label: 'Movimientos de stock' },
  { key: 'orders',      label: 'Pedidos' },
  { key: 'payments',    label: 'Pagos' },
  { key: 'customers',   label: 'Clientes y precios' },
  { key: 'price_lists', label: 'Listas de precios' },
  { key: 'routes',      label: 'Hojas de ruta' },
]

const LEVEL_LABELS = { hidden: 'Oculto', read: 'Solo lectura', write: 'Lectura y escritura' }
const LEVEL_COLORS = { hidden: 'var(--red)', read: 'var(--yellow)', write: 'var(--green)' }

const defaultPermissions = () => Object.fromEntries(SECTIONS.map(s => [s.key, 'write']))

const emptyForm = { username: '', email: '', password: '', first_name: '', last_name: '', is_active: true, is_driver: false, permissions: defaultPermissions() }

export default function UsersPage() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(null) // null | 'create' | 'edit'
  const [selected, setSelected] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)
  const fileRef = useRef()

  const load = () => {
    setLoading(true)
    usersApi.list().then(r => setUsers(r.data)).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const openCreate = () => {
    setForm(emptyForm)
    setError('')
    setModal('create')
  }

  const openEdit = (u) => {
    setSelected(u)
    setForm({
      username: u.username,
      email: u.email || '',
      password: '',
      first_name: u.first_name || '',
      last_name: u.last_name || '',
      is_active: u.is_active,
      is_driver: u.is_driver || false,
      permissions: { ...defaultPermissions(), ...u.permissions },
    })
    setError('')
    setModal('edit')
  }

  const save = async () => {
    setSaving(true); setError('')
    try {
      const payload = { ...form }
      if (!payload.password) delete payload.password
      if (modal === 'create') await usersApi.create(payload)
      else await usersApi.update(selected.id, payload)
      setModal(null); load()
    } catch (e) {
      setError(JSON.stringify(e.response?.data || 'Error'))
    } finally { setSaving(false) }
  }

  const deleteUser = async (u) => {
    if (!confirm(`¿Eliminar el usuario "${u.username}"?`)) return
    try {
      await usersApi.delete(u.id); load()
    } catch (e) {
      alert(e.response?.data?.error || 'Error al eliminar')
    }
  }

  const setPermLevel = (key, level) => {
    setForm(p => ({ ...p, permissions: { ...p.permissions, [key]: level } }))
  }

  const handleExport = async () => {
    const res = await usersApi.exportCsv()
    const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }))
    const a = document.createElement('a'); a.href = url; a.download = 'usuarios.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    fileRef.current.value = ''
    setImporting(true); setImportResult(null)
    try {
      const res = await usersApi.importCsv(file)
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
          <h1 className="page-title">Usuarios</h1>
          <p className="page-subtitle">Administración de accesos</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={handleExport}><Download size={15} /> Exportar CSV</button>
          <button className="btn btn-secondary" onClick={() => fileRef.current.click()} disabled={importing}>
            <Upload size={15} /> {importing ? 'Importando...' : 'Importar CSV'}
          </button>
          <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleImport} />
          <button className="btn btn-primary" onClick={openCreate}><Plus size={15} /> Nuevo usuario</button>
        </div>
      </div>

      <div className="page-body">
        {importResult && (
          <div className="card" style={{ marginBottom: 16, padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 10, borderColor: importResult.ok ? 'var(--green)' : 'var(--red)', background: importResult.ok ? 'var(--green-dim)' : 'var(--red-dim)' }}>
            {importResult.ok
              ? <CheckCircle size={16} color="var(--green)" style={{ flexShrink: 0, marginTop: 1 }} />
              : <AlertCircle size={16} color="var(--red)" style={{ flexShrink: 0, marginTop: 1 }} />}
            <div style={{ flex: 1, fontSize: 13 }}>
              {importResult.ok ? (
                <>
                  <strong>{importResult.created?.length || 0} usuario{importResult.created?.length !== 1 ? 's' : ''} creado{importResult.created?.length !== 1 ? 's' : ''}</strong>
                  {importResult.updated > 0 && <span style={{ color: 'var(--yellow)' }}> · {importResult.updated} actualizado{importResult.updated !== 1 ? 's' : ''}</span>}
                  {importResult.created?.some(u => u.generated_password) && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>Contraseñas generadas automáticamente:</div>
                      {importResult.created.filter(u => u.generated_password).map((u, i) => (
                        <div key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                          <strong>{u.username}</strong>: {u.generated_password}
                        </div>
                      ))}
                    </div>
                  )}
                  {importResult.errors?.length > 0 && (
                    <ul style={{ marginTop: 6, paddingLeft: 16, color: 'var(--yellow)' }}>
                      {importResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  )}
                </>
              ) : <span>{importResult.error}</span>}
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => setImportResult(null)}><X size={14} /></button>
          </div>
        )}
        <div className="card">
          {loading ? <div className="loading"><div className="spinner" /></div> : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Usuario</th>
                    <th>Nombre</th>
                    <th>Email</th>
                    <th>Rol</th>
                    <th>Chofer</th>
                    <th>Estado</th>
                    <th>Permisos</th>
                    <th style={{ width: 80 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 && (
                    <tr><td colSpan={7}>
                      <div className="empty-state">
                        <UserCog className="empty-state-icon" />
                        <div className="empty-state-title">Sin usuarios</div>
                      </div>
                    </td></tr>
                  )}
                  {users.map(u => (
                    <tr key={u.id} style={!u.is_active ? { opacity: 0.5 } : {}}>
                      <td><span style={{ fontWeight: 600 }}>{u.username}</span></td>
                      <td className="text-muted text-sm">{[u.first_name, u.last_name].filter(Boolean).join(' ') || '—'}</td>
                      <td className="text-muted text-sm">{u.email || '—'}</td>
                      <td>
                        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: u.is_superuser ? 'var(--accent)' : 'var(--text-muted)' }}>
                          {u.is_superuser ? 'Admin' : 'Usuario'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        {u.is_driver && <span style={{ fontSize: 11, color: 'var(--accent)', fontFamily: 'var(--font-mono)' }}>✓</span>}
                      </td>
                      <td>
                        <span style={{ fontSize: 11, color: u.is_active ? 'var(--green)' : 'var(--red)' }}>
                          {u.is_active ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td>
                        {u.is_superuser ? (
                          <span className="text-muted text-xs">Acceso total</span>
                        ) : (
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {SECTIONS.map(s => {
                              const level = u.permissions?.[s.key] ?? 'write'
                              if (level === 'write') return null
                              return (
                                <span key={s.key} style={{ fontSize: 10, fontFamily: 'var(--font-mono)', color: LEVEL_COLORS[level], background: 'var(--bg)', padding: '1px 5px', borderRadius: 3, border: `1px solid ${LEVEL_COLORS[level]}33` }}>
                                  {s.label}: {LEVEL_LABELS[level]}
                                </span>
                              )
                            })}
                            {SECTIONS.every(s => (u.permissions?.[s.key] ?? 'write') === 'write') && (
                              <span className="text-muted text-xs">Acceso total</span>
                            )}
                          </div>
                        )}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          {!u.is_superuser && (
                            <>
                              <button className="btn btn-ghost btn-sm" onClick={() => openEdit(u)} title="Editar"><Edit2 size={13} /></button>
                              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => deleteUser(u)} title="Eliminar"><Trash2 size={13} /></button>
                            </>
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

      {(modal === 'create' || modal === 'edit') && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()} style={{ maxHeight: '92vh' }}>
            <div className="modal-header">
              <span className="modal-title">{modal === 'create' ? 'Nuevo usuario' : `Editar — ${selected?.username}`}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setModal(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              {error && <div className="alert alert-danger">{error}</div>}

              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Usuario *</label>
                  <input className="form-input mono" value={form.username} onChange={f('username')} placeholder="nombre_usuario" />
                </div>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input className="form-input" type="email" value={form.email} onChange={f('email')} placeholder="email@ejemplo.com" />
                </div>
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">Nombre</label>
                  <input className="form-input" value={form.first_name} onChange={f('first_name')} />
                </div>
                <div className="form-group">
                  <label className="form-label">Apellido</label>
                  <input className="form-input" value={form.last_name} onChange={f('last_name')} />
                </div>
              </div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">{modal === 'create' ? 'Contraseña *' : 'Nueva contraseña'}</label>
                  <input className="form-input" type="password" value={form.password} onChange={f('password')}
                    placeholder={modal === 'edit' ? 'Dejar vacío para no cambiar' : ''} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 22 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input id="is_active_toggle" type="checkbox" checked={!!form.is_active}
                      onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))}
                      style={{ width: 16, height: 16, accentColor: 'var(--accent)', cursor: 'pointer' }} />
                    <label htmlFor="is_active_toggle" className="form-label" style={{ margin: 0, cursor: 'pointer' }}>Usuario activo</label>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input id="is_driver_toggle" type="checkbox" checked={!!form.is_driver}
                      onChange={e => setForm(p => ({ ...p, is_driver: e.target.checked }))}
                      style={{ width: 16, height: 16, accentColor: 'var(--accent)', cursor: 'pointer' }} />
                    <label htmlFor="is_driver_toggle" className="form-label" style={{ margin: 0, cursor: 'pointer' }}>
                      Chofer <span className="text-muted" style={{ fontWeight: 400 }}>(aparece en hojas de ruta)</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Permissions */}
              <div style={{ marginTop: 8 }}>
                <div className="form-label" style={{ marginBottom: 10 }}>Permisos por sección</div>
                <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                  {SECTIONS.map((s, i) => (
                    <div key={s.key} style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', borderBottom: i < SECTIONS.length - 1 ? '1px solid var(--border)' : 'none', gap: 16 }}>
                      <span style={{ flex: 1, fontSize: 13 }}>{s.label}</span>
                      {(['hidden', 'read', 'write']).map(level => (
                        <label key={level} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 12, color: form.permissions[s.key] === level ? LEVEL_COLORS[level] : 'var(--text-muted)' }}>
                          <input type="radio" name={`perm_${s.key}`} value={level}
                            checked={form.permissions[s.key] === level}
                            onChange={() => setPermLevel(s.key, level)}
                            style={{ accentColor: LEVEL_COLORS[level] }} />
                          {LEVEL_LABELS[level]}
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModal(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={save} disabled={saving || !form.username}>
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
