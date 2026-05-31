import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useAuth, usePermissions } from '../context/AuthContext'
import { useConfig } from '../context/ConfigContext'
import {
  LayoutDashboard, Package, BarChart3, ShoppingCart,
  CreditCard, Users, LogOut, Tag, FileText, AlertCircle, Truck, UserCog, Settings, MapPin
} from 'lucide-react'

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { section: 'Inventario' },
  { to: '/products', icon: Package, label: 'Productos', perm: 'products' },
  { to: '/stock', icon: BarChart3, label: 'Movimientos', perm: 'stock' },
  { section: 'Ventas' },
  { to: '/orders', icon: ShoppingCart, label: 'Pedidos', perm: 'orders' },
  { to: '/payments', icon: CreditCard, label: 'Pagos', perm: 'payments' },
  { to: '/routes', icon: Truck, label: 'Hojas de ruta', perm: 'routes' },
  { to: '/map', icon: MapPin, label: 'Mapa', perm: 'customers' },
  { section: 'CRM' },
  { to: '/customers', icon: Users, label: 'Clientes', perm: 'customers' },
  { to: '/price-lists', icon: Tag, label: 'Listas de precios', perm: 'price_lists' },
  { to: '/account-statement', icon: FileText, label: 'Cuenta corriente', perm: 'customers' },
  { to: '/debt-dashboard', icon: AlertCircle, label: 'Deudas', perm: 'customers' },
]

export default function Layout() {
  const { user, isAdmin, logout } = useAuth()
  const { isHidden } = usePermissions()
  const { logoSvg, logoWidth } = useConfig()
  const navigate = useNavigate()

  const handleLogout = () => { logout(); navigate('/login') }

  const initials = user?.username?.slice(0, 2).toUpperCase() || 'SF'

  const visibleItems = navItems.filter(item => {
    if (item.section || !item.perm) return true
    return !isHidden(item.perm)
  })

  const filtered = visibleItems.filter((item, i) => {
    if (!item.section) return true
    const next = visibleItems[i + 1]
    return next && !next.section
  })

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          {logoSvg ? (
            <div
              dangerouslySetInnerHTML={{ __html: logoSvg }}
              style={{ width: logoWidth, maxHeight: 60, display: 'flex', alignItems: 'center' }}
            />
          ) : (
            <>
              <div className="logo-text">StockFlow</div>
              <div className="logo-sub">Sistema de gestión</div>
            </>
          )}
        </div>

        <nav className="sidebar-nav">
          {filtered.map((item, i) => {
            if (item.section) return <div key={i} className="nav-section">{item.section}</div>
            const Icon = item.icon
            return (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
                <Icon className="icon" />
                {item.label}
              </NavLink>
            )
          })}
          {isAdmin && (
            <>
              <div className="nav-section">Sistema</div>
              <NavLink to="/users" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
                <UserCog className="icon" /> Usuarios
              </NavLink>
              <NavLink to="/settings" className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
                <Settings className="icon" /> Configuración
              </NavLink>
            </>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">{initials}</div>
            <div style={{ flex: 1 }}>
              <div className="user-name">{user?.username}</div>
              <div className="user-role">{isAdmin ? 'Administrador' : 'Usuario'}</div>
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
