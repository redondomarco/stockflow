import { useEffect, useState } from 'react'
import { productsApi, ordersApi, paymentsApi } from '../services/api'
import { Package, ShoppingCart, CreditCard, AlertTriangle, TrendingUp, ArrowUpRight } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

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
  const [productStats, setProductStats] = useState(null)
  const [orderStats, setOrderStats] = useState(null)
  const [paymentStats, setPaymentStats] = useState(null)
  const [lowStock, setLowStock] = useState([])
  const [debtors, setDebtors] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      productsApi.stats(),
      ordersApi.stats(),
      paymentsApi.stats(),
      productsApi.lowStock(),
      ordersApi.debtDashboard(),
    ]).then(([p, o, pay, ls, debt]) => {
      setProductStats(p.data)
      setOrderStats(o.data)
      setPaymentStats(pay.data)
      setLowStock(ls.data.slice(0, 5))
      setDebtors((debt.data || []).slice(0, 8))
    }).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="loading"><div className="spinner" /> Cargando dashboard...</div>

  const orderChartData = orderStats
    ? ['pending', 'partial', 'delivered', 'cancelled']
        .map(k => ({ name: STATUS_LABELS[k], value: orderStats[k] || 0, color: STATUS_COLORS[k] }))
        .filter(d => d.value > 0)
    : []

  const totalDebt = debtors.reduce((acc, d) => acc + d.balance, 0)

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Resumen general del sistema</p>
        </div>
      </div>

      <div className="page-body">
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">Productos activos</div>
            <div className="stat-value accent">{productStats?.total_products ?? '–'}</div>
            <div className="stat-meta flex items-center gap-2" style={{ gap: 6 }}><Package size={12} /> Total en catálogo</div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Stock bajo mínimo</div>
            <div className="stat-value yellow">{productStats?.low_stock_count ?? '–'}</div>
            <div className="stat-meta flex items-center gap-2" style={{ gap: 6 }}><AlertTriangle size={12} /> Requieren atención</div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Pedidos totales</div>
            <div className="stat-value">{orderStats?.total ?? '–'}</div>
            <div className="stat-meta flex items-center gap-2" style={{ gap: 6 }}><ShoppingCart size={12} /> {(orderStats?.pending || 0) + (orderStats?.partial || 0)} en curso</div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Ingresos (entregados)</div>
            <div className="stat-value green">${fmt(orderStats?.total_revenue)}</div>
            <div className="stat-meta flex items-center gap-2" style={{ gap: 6 }}><TrendingUp size={12} /> Total facturado entregado</div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Deuda total</div>
            <div className="stat-value red">${fmt(totalDebt)}</div>
            <div className="stat-meta flex items-center gap-2" style={{ gap: 6 }}><CreditCard size={12} /> {debtors.length} clientes con saldo</div>
          </div>

          <div className="stat-card">
            <div className="stat-label">Sin stock</div>
            <div className="stat-value red">{productStats?.out_of_stock_count ?? '–'}</div>
            <div className="stat-meta">Productos agotados</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Order chart */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Estado de pedidos</span>
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
              <span className="card-title">Stock bajo mínimo</span>
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
        {debtors.length > 0 && (
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-header">
              <span className="card-title">Clientes con saldo pendiente</span>
              <a href="/debt-dashboard" className="btn btn-ghost btn-sm">Ver todos <ArrowUpRight size={12} /></a>
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
                  {debtors.map(d => (
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
      </div>
    </>
  )
}
