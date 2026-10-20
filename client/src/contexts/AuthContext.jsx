import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { API_URL } from '../config';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('swalef_token');
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      axios.get(`${API_URL}/auth/verify`)
        .then(res => setUser(res.data.user))
        .catch(() => {
          localStorage.removeItem('swalef_token');
          delete axios.defaults.headers.common['Authorization'];
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await axios.post(`${API_URL}/auth/login`, { email, password });
    const { token, user } = res.data;
    localStorage.setItem('swalef_token', token);
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    setUser(user);
    return user;
  }, []);

  const register = useCallback(async (email, password, username) => {
    const res = await axios.post(`${API_URL}/auth/register`, { email, password, username });
    const { token, user } = res.data;
    localStorage.setItem('swalef_token', token);
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    setUser(user);
    return user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('swalef_token');
    delete axios.defaults.headers.common['Authorization'];
    setUser(null);
  }, []);

  const updateUsername = useCallback(async (username) => {
    const res = await axios.put(`${API_URL}/auth/username`, { username });
    const { token } = res.data;
    localStorage.setItem('swalef_token', token);
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    setUser(prev => ({ ...prev, username }));
    return username;
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateUsername }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
