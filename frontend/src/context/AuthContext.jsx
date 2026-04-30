import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { login as apiLogin } from '../services/api'
import api from '../services/api'

const AuthContext = createContext(null)

const LEVEL_ORDER = { hidden: 0, read: 1, write: 2 }

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [permissions, setPermissions] = useState(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  const fetchMe = useCallback(async () => {
    try {
      const { data } = await api.get('/users/me/')
      setPermissions(data.permissions)
      setIsAdmin(data.is_superuser)
    } catch {
      // token invalid or expired — will be handled by the interceptor
    }
  }, [])

  useEffect(() => {
    const token = localStorage.getItem('access_token')
    const username = localStorage.getItem('username')
    if (token && username) {
      setUser({ username })
      fetchMe().finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  const login = async (username, password) => {
    const { data } = await apiLogin(username, password)
    localStorage.setItem('access_token', data.access)
    localStorage.setItem('refresh_token', data.refresh)
    localStorage.setItem('username', username)
    setUser({ username })
    await fetchMe()
  }

  const logout = () => {
    localStorage.clear()
    setUser(null)
    setPermissions(null)
    setIsAdmin(false)
  }

  return (
    <AuthContext.Provider value={{ user, permissions, isAdmin, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)

export function usePermissions() {
  const { permissions, isAdmin } = useContext(AuthContext)
  const can = (section, level = 'read') => {
    if (isAdmin) return true
    if (!permissions) return true
    const userLevel = permissions[section] ?? 'write'
    return LEVEL_ORDER[userLevel] >= LEVEL_ORDER[level]
  }
  const isHidden = (section) => {
    if (isAdmin) return false
    if (!permissions) return false
    return (permissions[section] ?? 'write') === 'hidden'
  }
  return { can, isHidden }
}
