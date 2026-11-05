import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import logo from '../assets/AndaryShop.jpg'

export default function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // body's own background is the light gray used by the rest of the admin
  // (see index.css) — .login-page's own min-height:100dvh doesn't always
  // cover a mobile browser's full scrollable area in every edge case (a
  // momentary overscroll bounce, an address bar show/hide resizing the
  // viewport), which otherwise briefly reveals that light background behind
  // this page's own black one. Switching it to match while Login is
  // mounted means whatever peeks through is the right tone regardless of
  // which exact gap exposed it, and it's restored the instant this page
  // unmounts (redirecting into the normal light-toned admin).
  useEffect(() => {
    const html = document.documentElement
    const previousHtmlBackground = html.style.background
    const previousBodyBackground = document.body.style.background
    html.style.background = 'var(--black)'
    document.body.style.background = 'var(--black)'
    return () => {
      html.style.background = previousHtmlBackground
      document.body.style.background = previousBodyBackground
    }
  }, [])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await login(email, password)
      navigate('/productos')
    } catch (err) {
      // client.ts's request() already translates the raw "Invalid
      // credentials" the backend sends into Spanish.
      setError(err instanceof Error ? err.message : 'Error al iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-orbs" aria-hidden="true">
        <span className="login-orb login-orb--1" />
        <span className="login-orb login-orb--filled login-orb--2" />
        <span className="login-orb login-orb--3" />
        <span className="login-orb login-orb--filled login-orb--4" />
        <span className="login-orb login-orb--5" />
        <span className="login-orb login-orb--filled login-orb--6" />
      </div>
      <form className="login-card" onSubmit={handleSubmit}>
        <img src={logo} alt="Andary Shop" className="login-card__logo" />
        <h1>
          ANDARY SHOP <span>Admin</span>
        </h1>
        <label className="form-field">
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
        </label>
        <label className="form-field">
          Contraseña
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button type="submit" className="btn btn--primary btn--block" disabled={loading}>
          {loading ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
    </div>
  )
}
