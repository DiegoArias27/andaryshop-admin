import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import logo from '../../assets/AndaryShop.jpg'
import BackToTop from '../BackToTop'
import HeldSalesWidget from '../HeldSalesWidget'
import NotificationsBell from '../NotificationsBell'
import {
  AwardIcon,
  BellIcon,
  CartIcon,
  ChevronRightIcon,
  CloseIcon,
  HistoryIcon,
  ImageIcon,
  LayersIcon,
  LogoutIcon,
  MenuIcon,
  PackageIcon,
  PercentIcon,
  ReturnIcon,
  ScissorsIcon,
  SettingsIcon,
  TagIcon,
  UploadCloudIcon,
  UsersIcon,
} from '../icons'

const navGroups = [
  {
    label: 'Catálogo',
    items: [
      { to: '/productos', label: 'Productos', icon: <PackageIcon style={{ color: 'var(--blue)' }} /> },
      { to: '/categorias', label: 'Categorías', icon: <TagIcon style={{ color: 'var(--pink)' }} /> },
      { to: '/marcas', label: 'Marcas', icon: <AwardIcon style={{ color: 'var(--amber)' }} /> },
      { to: '/colecciones', label: 'Colecciones', icon: <LayersIcon style={{ color: 'var(--green)' }} /> },
      { to: '/banners', label: 'Banners', icon: <ImageIcon style={{ color: 'var(--blue)' }} /> },
    ],
  },
  {
    label: 'Ventas',
    items: [
      { to: '/stock', label: 'Punto de venta', icon: <CartIcon style={{ color: 'var(--green)' }} /> },
      { to: '/pedidos', label: 'Ventas', icon: <HistoryIcon style={{ color: 'var(--blue)' }} /> },
      { to: '/cortes', label: 'Cortes', icon: <ScissorsIcon style={{ color: 'var(--red)' }} /> },
      { to: '/devoluciones', label: 'Devoluciones', icon: <ReturnIcon style={{ color: 'var(--pink)' }} /> },
      { to: '/reabastecimientos', label: 'Reabastecimiento', icon: <UploadCloudIcon style={{ color: 'var(--amber)' }} /> },
    ],
  },
  {
    label: 'Clientes',
    items: [
      { to: '/clientes', label: 'Clientes', icon: <UsersIcon style={{ color: 'var(--blue)' }} /> },
      { to: '/mayoreo', label: 'Mayoreo', icon: <PercentIcon style={{ color: 'var(--green)' }} /> },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { to: '/notificaciones', label: 'Notificaciones', icon: <BellIcon style={{ color: 'var(--red)' }} /> },
      { to: '/configuracion', label: 'Configuración', icon: <SettingsIcon style={{ color: 'var(--gray-400)' }} /> },
    ],
  },
]

const NAV_COLLAPSE_STORAGE_KEY = 'andary-admin-nav-collapsed'

function loadCollapsedGroups(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(NAV_COLLAPSE_STORAGE_KEY) ?? '{}')
  } catch {
    return {}
  }
}

/** Shared between the desktop sidebar and the mobile drawer so the
 * collapse/expand behavior (and its persisted state) doesn't have to be
 * kept in sync by hand across two separate copies of the same markup. */
function NavGroups({
  collapsedGroups,
  onToggleGroup,
  onLinkClick,
}: {
  collapsedGroups: Record<string, boolean>
  onToggleGroup: (label: string) => void
  onLinkClick?: () => void
}) {
  return (
    <>
      {navGroups.map((group) => {
        const collapsed = !!collapsedGroups[group.label]
        return (
          <div key={group.label} className="admin-nav__group">
            <button
              type="button"
              className="admin-nav__group-label admin-nav__group-label--toggle"
              onClick={() => onToggleGroup(group.label)}
              aria-expanded={!collapsed}
            >
              <span>{group.label}</span>
              <ChevronRightIcon
                width={13}
                height={13}
                className={`admin-nav__group-chevron ${collapsed ? '' : 'admin-nav__group-chevron--open'}`}
              />
            </button>
            {!collapsed &&
              group.items.map((item) => (
                <NavLink key={item.to} to={item.to} className="admin-nav__link" onClick={onLinkClick}>
                  {item.icon}
                  {item.label}
                </NavLink>
              ))}
          </div>
        )
      })}
    </>
  )
}

export default function AdminLayout() {
  const { adminEmail, logout } = useAuth()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(loadCollapsedGroups)

  function toggleGroup(label: string) {
    setCollapsedGroups((prev) => {
      const next = { ...prev, [label]: !prev[label] }
      try {
        localStorage.setItem(NAV_COLLAPSE_STORAGE_KEY, JSON.stringify(next))
      } catch {
        // Private browsing / storage disabled — collapsing still works, it
        // just won't be remembered for next time.
      }
      return next
    })
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="sidebar-orbs" aria-hidden="true">
          <span className="login-orb login-orb--1" />
          <span className="login-orb login-orb--filled login-orb--2" />
          <span className="login-orb login-orb--3" />
          <span className="login-orb login-orb--filled login-orb--4" />
          <span className="login-orb login-orb--5" />
          <span className="login-orb login-orb--filled login-orb--6" />
        </div>
        <div className="admin-sidebar__brand">
          <img src={logo} alt="Andary Shop" className="admin-sidebar__logo" />
          <span className="admin-sidebar__brand-text">
            ANDARY
            <em>Admin</em>
          </span>
        </div>
        <nav className="admin-nav">
          <NavGroups collapsedGroups={collapsedGroups} onToggleGroup={toggleGroup} />
        </nav>
        <div className="admin-sidebar__footer">
          <span className="admin-sidebar__email">{adminEmail}</span>
          <button className="admin-logout-btn" onClick={logout}>
            <LogoutIcon />
            Cerrar sesión
          </button>
        </div>
      </aside>

      <header className="admin-topbar">
        <button className="icon-btn" onClick={() => setDrawerOpen(true)} aria-label="Menú">
          <MenuIcon />
        </button>
        <div className="admin-topbar__brand">
          <img src={logo} alt="Andary Shop" className="admin-topbar__logo" />
          ANDARY Admin
        </div>
        <button className="icon-btn" onClick={logout} aria-label="Cerrar sesión">
          <LogoutIcon />
        </button>
      </header>

      {drawerOpen && (
        <div className="admin-drawer-overlay" onClick={() => setDrawerOpen(false)}>
          <nav className="admin-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="sidebar-orbs" aria-hidden="true">
              <span className="login-orb login-orb--1" />
              <span className="login-orb login-orb--filled login-orb--2" />
              <span className="login-orb login-orb--3" />
              <span className="login-orb login-orb--filled login-orb--4" />
              <span className="login-orb login-orb--5" />
              <span className="login-orb login-orb--filled login-orb--6" />
            </div>
            <div className="admin-drawer__header">
              <span className="admin-sidebar__brand-text">
                ANDARY
                <em>Admin</em>
              </span>
              <button className="icon-btn" onClick={() => setDrawerOpen(false)} aria-label="Cerrar">
                <CloseIcon />
              </button>
            </div>
            <NavGroups
              collapsedGroups={collapsedGroups}
              onToggleGroup={toggleGroup}
              onLinkClick={() => setDrawerOpen(false)}
            />
            <div className="admin-sidebar__footer">
              <span className="admin-sidebar__email">{adminEmail}</span>
              <button className="admin-logout-btn" onClick={logout}>
                <LogoutIcon />
                Cerrar sesión
              </button>
            </div>
          </nav>
        </div>
      )}

      <main className="admin-main">
        <Outlet />
      </main>

      <BackToTop />
      <HeldSalesWidget />
      <NotificationsBell />
    </div>
  )
}
