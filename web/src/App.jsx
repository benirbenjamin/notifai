import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import CreateTaskModal from './components/CreateTaskModal';

// User Pages
import Dashboard from './pages/Dashboard';
import TasksPage from './pages/TasksPage';
import SubscriptionsPage from './pages/SubscriptionsPage';
import PaymentCallbackPage from './pages/PaymentCallbackPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';

// Admin Pages
import AdminLoginPage from './pages/admin/AdminLoginPage';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminPlansPage from './pages/admin/AdminPlansPage';
import AdminUsersPage from './pages/admin/AdminUsersPage';

import api from './api/client';

function ProtectedRoute({ children, adminOnly = false }) {
  const { user, loading } = useAuth();
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-slate-500 text-sm">Loading Notifai space...</div>;
  }
  if (!user) {
    return <Navigate to={adminOnly ? "/admin/login" : "/login"} replace />;
  }
  if (adminOnly && user.role !== 'ADMIN') {
    return <Navigate to="/" replace />;
  }
  return children;
}

function MainLayout({ children }) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const { refreshProfile } = useAuth();

  const handleTaskCreated = async (taskData) => {
    await api.post('/tasks', taskData);
    await refreshProfile();
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar onOpenCreateTask={() => setIsCreateOpen(true)} />
      <main className="flex-1">
        {children}
      </main>
      <footer className="border-t border-slate-900 py-6 text-center text-xs text-slate-600">
        Notifai space &copy; 2026 • Powered by Neon DB (PostgreSQL), Flutterwave & Render
      </footer>

      <CreateTaskModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onTaskCreated={handleTaskCreated}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Auth */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/admin/login" element={<AdminLoginPage />} />

          {/* User Protected Routes */}
          <Route path="/" element={
            <ProtectedRoute>
              <MainLayout>
                <Dashboard onOpenCreateTask={() => {
                  const btn = document.querySelector('header button');
                  if (btn) btn.click();
                }} />
              </MainLayout>
            </ProtectedRoute>
          } />

          <Route path="/tasks" element={
            <ProtectedRoute>
              <MainLayout>
                <TasksPage />
              </MainLayout>
            </ProtectedRoute>
          } />

          <Route path="/subscriptions" element={
            <ProtectedRoute>
              <MainLayout>
                <SubscriptionsPage />
              </MainLayout>
            </ProtectedRoute>
          } />

          <Route path="/subscriptions/callback" element={
            <ProtectedRoute>
              <MainLayout>
                <PaymentCallbackPage />
              </MainLayout>
            </ProtectedRoute>
          } />

          {/* Admin Protected Routes */}
          <Route path="/admin" element={
            <ProtectedRoute adminOnly>
              <MainLayout>
                <AdminDashboard />
              </MainLayout>
            </ProtectedRoute>
          } />

          <Route path="/admin/plans" element={
            <ProtectedRoute adminOnly>
              <MainLayout>
                <AdminPlansPage />
              </MainLayout>
            </ProtectedRoute>
          } />

          <Route path="/admin/users" element={
            <ProtectedRoute adminOnly>
              <MainLayout>
                <AdminUsersPage />
              </MainLayout>
            </ProtectedRoute>
          } />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
