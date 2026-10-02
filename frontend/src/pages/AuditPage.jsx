import { Fragment, useEffect, useState } from 'react'
import { auditApi, usersApi } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { Download, Search, ChevronLeft, ChevronRight, ChevronDown, History } from 'lucide-react'

const SECTION_LABELS = {
  auth: 'Inicio de sesión',
  products: 'Productos',
  stock: 'Stock',
  orders: 'Pedidos',
  payments: 'Pagos',
  routes: 'Hojas de ruta',
  customers: 'Clientes',
  price_lists: 'Listas de precios',
  users: 'Usuarios',
  config: 'Configuración',
  admin: 'Admin de Django',
}

const emptyFilters = { user: '', section: '', success: '', date_from: '', date_to: '', q: '' }

function fmtDateTime(iso) {
  return new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'medium' })
}

export default function AuditPage() {
  const { isAdmin } = useAuth()
  const [filters, setFilters] = useState(emptyFilters)
  const [search, setSearch] = useState('')   // texto libre; se aplica al presionar Enter o Buscar
  const [page, setPage] = useState(1)
  const [data, setData] = useState({ count: 0, results: [] })
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(null)

  const params = Object.fromEntries(Object.entries({ ...filters, page }).filter(([, v]) => v !== ''))

  useEffect(() => {
    if (!isAdmin) return
    usersApi.list().then(r => setUsers(r.data)).catch(() => {})
  }, [isAdmin])

  useEffect(() => {
    if (!isAdmin) return
    setLoading(true); setError('')
    auditApi.list(params)
      .then(r => setData(r.data))
      .catch(e => setError(e.response?.data?.detail || 'No se pudo cargar la auditoría'))
      .finally(() => setLoading(false))
  }, [isAdmin, JSON.stringify(params)])

  const setFilter = (key, value) => { setFilters(f => ({ ...f, [key]: value })); setPage(1); setExpanded(null) }

  const handleExport = async () => {
    const { page: _, ...exportParams } = params
    const res = await auditApi.exportCsv(exportParams)
    const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }))
    const a = document.createElement('a'); a.href = url; a.download = 'auditoria.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  if (!isAdmin) {
    return (
      <div className="page-body">
        <div className="alert alert-danger">La auditoría solo está disponible para administradores.</div>
      </div>
    )
  }

  const pages = Math.max(1, Math.ceil(data.count / 50))
  const anyFilter = Object.values(filters).some(Boolean)

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Auditoría</h1>
          <p className="page-subtitle">Acciones de los usuarios: altas, cambios, bajas e inicios de sesión</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={handleExport}><Download size={15} /> Exportar CSV</button>
        </div>
      </div>

      <div className="page-body">
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="toolbar" style={{ alignItems: 'flex-end' }}>
            <div className="form-group" style={{ margin: 0, flex: 2, minWidth: 220 }}>
              <label className="form-label" htmlFor="audit-q">Buscar</label>
              <form className="search-input" onSubmit={e => { e.preventDefault(); setFilter('q', search.trim()) }}>
                <Search className="search-icon" size={15} />
                <input id="audit-q" className="form-input" value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Descripción, N° de pedido, usuario o IP (Enter)" />
              </form>
            </div>
            <div className="form-group" style={{ margin: 0, minWidth: 150 }}>
              <label className="form-label" htmlFor="audit-user">Usuario</label>
              <select id="audit-user" className="form-select" value={filters.user} onChange={e => setFilter('user', e.target.value)}>
                <option value="">Todos</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ margin: 0, minWidth: 150 }}>
              <label className="form-label" htmlFor="audit-section">Sección</label>
              <select id="audit-section" className="form-select" value={filters.section} onChange={e => setFilter('section', e.target.value)}>
                <option value="">Todas</option>
                {Object.entries(SECTION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ margin: 0, minWidth: 130 }}>
              <label className="form-label" htmlFor="audit-success">Resultado</label>
              <select id="audit-success" className="form-select" value={filters.success} onChange={e => setFilter('success', e.target.value)}>
                <option value="">Todos</option>
                <option value="true">Correctos</option>
                <option value="false">Rechazados</option>
              </select>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" htmlFor="audit-from">Desde</label>
              <input id="audit-from" type="date" className="form-input" value={filters.date_from} onChange={e => setFilter('date_from', e.target.value)} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" htmlFor="audit-to">Hasta</label>
              <input id="audit-to" type="date" className="form-input" value={filters.date_to} onChange={e => setFilter('date_to', e.target.value)} />
            </div>
            {anyFilter && (
              <button className="btn btn-ghost" onClick={() => { setFilters(emptyFilters); setSearch(''); setPage(1) }}>Limpiar</button>
            )}
          </div>
        </div>

        {error && <div className="alert alert-danger" style={{ marginBottom: 16 }}>{error}</div>}

        <div className="card">
          {loading ? <div className="loading"><div className="spinner" /></div> : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 28 }}></th>
                    <th>Fecha y hora</th>
                    <th>Usuario</th>
                    <th>Acción</th>
                    <th>Sección</th>
                    <th>Resultado</th>
                    <th>IP</th>
                  </tr>
                </thead>
                <tbody>
                  {data.results.length === 0 && (
                    <tr><td colSpan={7}>
                      <div className="empty-state">
                        <History className="empty-state-icon" />
                        <div className="empty-state-title">{anyFilter ? 'Sin registros para estos filtros' : 'Todavía no hay registros'}</div>
                      </div>
                    </td></tr>
                  )}
                  {data.results.map(log => (
                    <Fragment key={log.id}>
                      <tr style={{ cursor: 'pointer' }} onClick={() => setExpanded(expanded === log.id ? null : log.id)}>
                        <td>{expanded === log.id ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</td>
                        <td className="mono text-sm" style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(log.created_at)}</td>
                        <td style={{ fontWeight: 600 }}>{log.user_display}</td>
                        <td>{log.description}</td>
                        <td className="text-muted text-sm">{SECTION_LABELS[log.section] || log.section || '—'}</td>
                        <td>
                          <span className={`badge badge-${log.success ? 'approved' : 'rejected'}`}>
                            {log.success ? 'Correcto' : `Rechazado (${log.status_code})`}
                          </span>
                        </td>
                        <td className="mono text-muted text-sm">{log.ip || '—'}</td>
                      </tr>
                      {expanded === log.id && (
                        <tr>
                          <td colSpan={7} style={{ background: 'var(--bg)', padding: '12px 16px 12px 42px' }}>
                            <div className="text-muted text-sm" style={{ marginBottom: 6 }}>
                              <span className="mono">{log.method} {log.path}</span>
                              {log.object_type && <> · {log.object_type} #{log.object_id}</>}
                              {log.user_agent && <> · {log.user_agent}</>}
                            </div>
                            <pre className="mono" style={{ fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>
                              {Object.keys(log.details || {}).length ? JSON.stringify(log.details, null, 2) : 'Sin datos adicionales'}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data.count > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 16px', borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
              <span className="text-muted text-sm">{data.count} registro{data.count === 1 ? '' : 's'} · página {page} de {pages}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => { setPage(p => p - 1); setExpanded(null) }}>
                  <ChevronLeft size={13} /> Anterior
                </button>
                <button className="btn btn-secondary btn-sm" disabled={page >= pages} onClick={() => { setPage(p => p + 1); setExpanded(null) }}>
                  Siguiente <ChevronRight size={13} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
