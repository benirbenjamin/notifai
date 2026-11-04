import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../api/client';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('notifai_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [token, setToken] = useState(() => localStorage.getItem('notifai_token'));
  const [quota, setQuota] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async () => {
    try {
      if (!token) {
        setLoading(false);
        return;
      }
      const res = await api.get('/auth/me');
      setUser(res.data.user);
      setSubscription(res.data.subscription);
      setQuota(res.data.quota);
      localStorage.setItem('notifai_user', JSON.stringify(res.data.user));
    } catch (err) {
      console.error('Failed to load profile:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [token]);

  const login = (newToken, newUser, newSub = null) => {
    localStorage.setItem('notifai_token', newToken);
    localStorage.setItem('notifai_user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
    if (newSub) setSubscription(newSub);
  };

  const logout = () => {
    localStorage.removeItem('notifai_token');
    localStorage.removeItem('notifai_user');
    setToken(null);
    setUser(null);
    setSubscription(null);
    setQuota(null);
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{ user, token, subscription, quota, loading, login, logout, refreshProfile: fetchProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
