import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import { ConfirmProvider } from './context/ConfirmContext'
import { PosSessionProvider } from './context/PosSessionContext'
import { useAuth } from './hooks/useAuth'
import AdminLayout from './components/layout/AdminLayout'
import Login from './pages/Login'
import ProductsList from './pages/ProductsList'
import ProductEditor from './pages/ProductEditor'
import Categories from './pages/Categories'
import Brands from './pages/Brands'
import Collections from './pages/Collections'
import Banners from './pages/Banners'
import Wholesale from './pages/Wholesale'
import StockLookup from './pages/StockLookup'
import Orders from './pages/Orders'
import Customers from './pages/Customers'
import Returns from './pages/Returns'
import CashCuts from './pages/CashCuts'
import RestockHistory from './pages/RestockHistory'
import Settings from './pages/Settings'
import NotificationsHistory from './pages/NotificationsHistory'

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { token } = useAuth()
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <ProtectedRoute>
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<Navigate to="/productos" replace />} />
        <Route path="/productos" element={<ProductsList />} />
        <Route path="/productos/nuevo" element={<ProductEditor />} />
        <Route path="/productos/:id" element={<ProductEditor />} />
        <Route path="/categorias" element={<Categories />} />
        <Route path="/marcas" element={<Brands />} />
        <Route path="/colecciones" element={<Collections />} />
        <Route path="/banners" element={<Banners />} />
        <Route path="/pedidos" element={<Orders />} />
        <Route path="/clientes" element={<Customers />} />
        <Route path="/devoluciones" element={<Returns />} />
        <Route path="/cortes" element={<CashCuts />} />
        <Route path="/mayoreo" element={<Wholesale />} />
        <Route path="/stock" element={<StockLookup />} />
        <Route path="/reabastecimientos" element={<RestockHistory />} />
        <Route path="/configuracion" element={<Settings />} />
        <Route path="/notificaciones" element={<NotificationsHistory />} />
        <Route path="*" element={<Navigate to="/productos" replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <AuthProvider>
          <PosSessionProvider>
            <BrowserRouter>
              <AppRoutes />
            </BrowserRouter>
          </PosSessionProvider>
        </AuthProvider>
      </ConfirmProvider>
    </ToastProvider>
  )
}
