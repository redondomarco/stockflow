import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import {
  LayoutDashboard, Package, BarChart3, ShoppingCart,
  CreditCard, Users, LogOut, Tag, FileText, AlertCircle
} from 'lucide-react'

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { section: 'Inventario' },
  { to: '/products', icon: Package, label: 'Productos' },
  { to: '/stock', icon: BarChart3, label: 'Movimientos' },
  { section: 'Ventas' },
  { to: '/orders', icon: ShoppingCart, label: 'Pedidos' },
  { to: '/payments', icon: CreditCard, label: 'Pagos' },
  { section: 'CRM' },
  { to: '/customers', icon: Users, label: 'Clientes' },
  { to: '/price-lists', icon: Tag, label: 'Listas de precios' },
  { to: '/account-statement', icon: FileText, label: 'Cuenta corriente' },
  { to: '/debt-dashboard', icon: AlertCircle, label: 'Deudas' },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const initials = user?.username?.slice(0, 2).toUpperCase() || 'SF'

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-text">StockFlow</div>
          <div className="logo-sub">Sistema de gestión</div>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item, i) => {
            if (item.section) {
              return <div key={i} className="nav-section">{item.section}</div>
            }
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
              >
                <Icon className="icon" />
                {item.label}
              </NavLink>
            )
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">{initials}</div>
            <div style={{ flex: 1 }}>
              <div className="user-name">{user?.username}</div>
              <div className="user-role">Administrador</div>
            </div>
            <button className="btn btn-ghost" style={{ padding: '6px' }} onClick={handleLogout} title="Cerrar sesión">
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  )
}
