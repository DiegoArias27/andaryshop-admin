import { useState, type ReactNode } from 'react'
import { api, TOKEN_KEY } from '../api/client'
import { AuthContext } from './auth-context'

const EMAIL_KEY = 'andary-admin-email'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY))
  const [adminEmail, setAdminEmail] = useState<string | null>(() => localStorage.getItem(EMAIL_KEY))

  async function login(email: string, password: string) {
    const data = await api.login(email, password)
    localStorage.setItem(TOKEN_KEY, data.token)
    localStorage.setItem(EMAIL_KEY, data.admin.email)
    setToken(data.token)
    setAdminEmail(data.admin.email)
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(EMAIL_KEY)
    setToken(null)
    setAdminEmail(null)
  }

  return <AuthContext.Provider value={{ token, adminEmail, login, logout }}>{children}</AuthContext.Provider>
}
