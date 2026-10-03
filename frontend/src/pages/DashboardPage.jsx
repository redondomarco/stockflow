import { useEffect, useState } from 'react'
import { productsApi, ordersApi, paymentsApi } from '../services/api'
import { Package, ShoppingCart, CreditCard, AlertTriangle, TrendingUp, ArrowUpRight } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { Link } from 'react-router-dom'
import PeriodSelector, { monthLabel, usePeriod } from '../components/PeriodSelector'
import MonthlyChart from '../components/MonthlyChart'

const STATUS_LABELS = {
  pending: 'Pendiente',
  partial: 'Parcial',
  delivered: 'Entregado',
  cancelled: 'Anulado',
}

const STATUS_COLORS = {
  pending: '#eab308',
  partial: '#f97316',
  delivered: '#22c55e',
  cancelled: '#ef4444',
}

function fmt(n) {
  return parseFloat(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

export default function DashboardPage() {
  const [period, setPeriod] = usePeriod()
  const [productStats, setProductStats] = useState(null)
  const [orderStats, setOrderStats] = useState(null)
  const [paymentStats, setPaymentStats] = useState(null)
  const [lowStock, setLowStock] = useState([])
  const [debtors, setDebtors] = useState(null)
  const [monthly, setMonthly] = useState(null)
  const [loading, setLoading] = useState(true)

  // Datos que no dependen del período (stock actual y evolución de los últimos 12 meses)
  useEffect(() => {
    Promise.allSettled([productsApi.stats(), productsApi.lowStock(), ordersApi.monthly({ months: 12 })])
      .then(([p, ls, mon]) => {
        setProductStats(p.status === 'fulfilled' ? p.value.data : null)
        setLowStock(ls.status === 'fulfilled' ? ls.value.data.slice(0, 5) : [])
        setMonthly(mon.status === 'fulfilled' ? mon.value.data : null)
      })
  }, [])

  // Datos del período. Cada fuente es independiente: si el usuario no tiene permiso
  // en una sección (403), solo se oculta esa tarjeta.
  useEffect(() => {
    const params = period ? { month: period } : undefined
    setLoading(true)
    Promise.allSettled([ordersApi.stats(params), paymentsApi.stats(params), ordersApi.debtDashboard(params)])
      .then(([o, pay, debt]) => {
        setOrderStats(o.status === 'fulfilled' ? o.value.data : null)
        setPaymentStats(pay.status === 'fulfilled' ? pay.value.data : null)
        setDebtors(debt.status === 'fulfilled' ? debt.value.data || [] : null)
      })
      .finally(() => setLoading(false))
  }, [period])

  const orderChartData = orderStats
    ? ['pending', 'partial', 'delivered', 'cancelled']
        .map(k => ({ name: STATUS_LABELS[k], value: orderStats[k] || 0, color: STATUS_COLORS[k] }))
        .filter(d => d.value > 0)
    : []

  // Deuda total de TODOS los deudores (la tabla de abajo muestra solo los primeros 8)
  const totalDebt = (debtors || []).reduce((acc, d) => acc + d.balance, 0)
  const inMonth = Boolean(period)
  const periodText = inMonth ? monthLabel(period) : 'todo el historial'
  const debtLink = `/debt-dashboard${period ? `?mes=${period}` : ''}`

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Resumen de {periodText}</p>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      <div className="page-body">
        {monthly && (
          <MonthlyChart data={monthly.months} includesCollected={monthly.includes_collected}
            selected={period} onSelect={m => setPeriod(m === period ? '' : m)} />
        )}

        {loading && !orderStats ? <div className="loading"><div className="spinner" /> Cargando dashboard...</div> : (
        <>
        <div className="stats-grid" style={{ opacity: loading ? 0.6 : 1, transition: 'opacity 0.15s' }}>
          {orderStats && (
            <div className="stat-card">
              <div className="stat-label">{inMonth ? 'Pedidos del mes' : 'Pedidos totales'}</div>
              <div className="stat-value">{orderStats.total}</div>
              <div className="stat-meta flex items-center gap-2" style={{ gap: 6 }}><ShoppingCart size={12} /> {(orderStats.pending || 0) + (orderStats.partial || 0)} en curso</div>
            </div>
          )}

          {orderStats && (
            <div className="stat-card">
              <div className="stat-label">Facturado</div>
              <div className="stat-value accent">${fmt(orderStats.total_billed)}</div>
              <div className="stat-meta flex items-center gap-2" style={{ gap: 6 }}><TrendingUp size={12} /> Pedidos no anulados{inMonth ? ' del mes' : ''}</div>
            </div>
          )}

          {orderStats && (
            <div className="stat-card">
              <div className="stat-label">Ingresos (entregados)</div>
              <div className="stat-value green">${fmt(orderStats.total_revenue)}</div>
              <div className="stat-meta flex items-center gap-2" style={{ gap: 6 }}><TrendingUp size={12} /> {inMonth ? 'Pedidos del mes ya entregados' : 'Total facturado entregado'}</div>
            </div>
          )}

          {paymentStats && (
            <div className="stat-card">
              <div className="stat-label">{inMonth ? 'Cobrado en el mes' : 'Cobrado'}</div>
              <div className="stat-value green">${fmt(paymentStats.total_approved)}</div>
              <div className="stat-meta flex items-center gap-2" style={{ gap: 6 }}><CreditCard size={12} /> Pagos aprobados</div>
            </div>
          )}

          {debtors && (
            <div className="stat-card">
              <div className="stat-label">{inMonth ? 'Saldo de pedidos del mes' : 'Deuda total'}</div>
              <div className="stat-value red">${fmt(totalDebt)}</div>
              <div className="stat-meta flex items-center gap-2" style={{ gap: 6 }}><CreditCard size={12} /> {debtors.length} clientes con saldo</div>
            </div>
          )}

          {productStats && (
            <>
              <div className="stat-card">
                <div className="stat-label">Productos activos</div>
                <div className="stat-value accent">{productStats.total_products}</div>
                <div className="stat-meta flex items-center gap-2" style={{ gap: 6 }}><Package size={12} /> {inMonth ? 'Estado actual' : 'Total en catálogo'}</div>
              </div>

              <div className="stat-card">
                <div className="stat-label">Stock bajo mínimo</div>
                <div className="stat-value yellow">{productStats.low_stock_count}</div>
                <div className="stat-meta flex items-center gap-2" style={{ gap: 6 }}><AlertTriangle size={12} /> {inMonth ? 'Estado actual' : 'Requieren atención'}</div>
              </div>

              <div className="stat-card">
                <div className="stat-label">Sin stock</div>
                <div className="stat-value red">{productStats.out_of_stock_count}</div>
                <div className="stat-meta">{inMonth ? 'Estado actual' : 'Productos agotados'}</div>
              </div>
            </>
          )}
        </div>

        <div className="two-col-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Order chart */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Estado de pedidos{inMonth ? ` · ${monthLabel(period)}` : ''}</span>
            </div>
            {orderChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={orderChartData} barSize={28}>
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} labelStyle={{ color: 'var(--text)' }} cursor={{ fill: 'var(--bg-hover)' }} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {orderChartData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-state" style={{ padding: 32 }}>Sin datos</div>
            )}
          </div>

          {/* Low stock */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Stock bajo mínimo{inMonth ? ' · estado actual' : ''}</span>
              <a href="/stock" className="btn btn-ghost btn-sm">Ver todos <ArrowUpRight size={12} /></a>
            </div>
            {lowStock.length === 0 ? (
              <div style={{ color: 'var(--green)', fontSize: 13, padding: '16px 0' }}>✓ Todos los productos tienen stock suficiente</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {lowStock.map(p => (
                  <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{p.sku}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ color: p.stock === 0 ? 'var(--red)' : 'var(--yellow)', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 15 }}>{p.stock}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>mín: {p.stock_min}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Debt table */}
        {debtors && debtors.length > 0 && (
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-header">
              <span className="card-title">Clientes con saldo pendiente{inMonth ? ` · pedidos de ${monthLabel(period)}` : ''}</span>
              <Link to={debtLink} className="btn btn-ghost btn-sm">Ver todos <ArrowUpRight size={12} /></Link>
            </div>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th style={{ textAlign: 'right' }}>Pedidos</th>
                    <th style={{ textAlign: 'right' }}>Facturado</th>
                    <th style={{ textAlign: 'right' }}>Cobrado</th>
                    <th style={{ textAlign: 'right' }}>Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {debtors.slice(0, 8).map(d => (
                    <tr key={d.customer_id}>
                      <td>
                        <div style={{ fontWeight: 500 }}>{d.customer_name}</div>
                        {d.customer_email && <div className="text-muted text-xs">{d.customer_email}</div>}
                      </td>
                      <td className="mono" style={{ textAlign: 'right' }}>{d.order_count}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>${fmt(d.total_billed)}</td>
                      <td className="mono" style={{ textAlign: 'right', color: 'var(--green)' }}>${fmt(d.total_paid)}</td>
                      <td className="mono" style={{ textAlign: 'right', color: 'var(--red)', fontWeight: 700 }}>${fmt(d.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        </>
        )}
      </div>
    </>
  )
}
