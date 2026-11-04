import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import { 
  Users, 
  CheckSquare, 
  AlertTriangle, 
  CreditCard, 
  DollarSign, 
  Settings, 
  Sliders, 
  ArrowRight,
  ShieldCheck
} from 'lucide-react';

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await api.get('/admin/stats');
        setStats(res.data.stats);
      } catch (err) {
        console.error('Failed to load admin stats:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center space-x-2 text-indigo-400 text-xs font-bold uppercase tracking-wider mb-1">
            <ShieldCheck className="w-4 h-4" />
            <span>Administrator Control Center</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white">Notifai space Admin Panel</h1>
          <p className="text-xs text-slate-400 mt-1">Configure plan task limits, duration pricing (1-12 mo), and user quotas.</p>
        </div>

        <div className="flex items-center space-x-3">
          <Link
            to="/admin/plans"
            className="px-4 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20 flex items-center transition-all"
          >
            <Sliders className="w-4 h-4 mr-2" />
            Configure Plans & Tiers
          </Link>
          <Link
            to="/admin/users"
            className="px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 flex items-center transition-all"
          >
            <Users className="w-4 h-4 mr-2" />
            Manage Users
          </Link>
        </div>
      </div>

      {/* Metrics Grid */}
      {loading ? (
        <div className="py-12 text-center text-slate-500 text-sm">Loading admin metrics...</div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <div className="text-2xl font-extrabold text-white">{stats?.totalUsers || 0}</div>
            <div className="text-xs text-slate-400">Total Registered Users</div>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
              <CheckSquare className="w-5 h-5" />
            </div>
            <div className="text-2xl font-extrabold text-white">{stats?.totalTasks || 0}</div>
            <div className="text-xs text-slate-400">Total Active Tasks</div>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <CreditCard className="w-5 h-5" />
            </div>
            <div className="text-2xl font-extrabold text-white">{stats?.activeSubscriptions || 0}</div>
            <div className="text-xs text-slate-400">Active Paid Subscriptions</div>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center">
              <DollarSign className="w-5 h-5" />
            </div>
            <div className="text-2xl font-extrabold text-white">${stats?.totalRevenue?.toFixed(2) || '0.00'}</div>
            <div className="text-xs text-slate-400">Total Revenue (Flutterwave)</div>
          </div>
        </div>
      )}

      {/* Quick Action Navigation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link
          to="/admin/plans"
          className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-indigo-500/40 transition-all group space-y-3"
        >
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
            <Sliders className="w-5 h-5" />
          </div>
          <h3 className="text-base font-bold text-white group-hover:text-indigo-400 transition-colors flex items-center">
            Subscription Plans & Task Limit Tiers
            <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            Configure how many tasks each tier allows (e.g., 10, 50, 100, 10,000 tasks) and customize pricing for 1 month, 3 months, 6 months, and 12 months.
          </p>
        </Link>

        <Link
          to="/admin/users"
          className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-indigo-500/40 transition-all group space-y-3"
        >
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
            <Users className="w-5 h-5" />
          </div>
          <h3 className="text-base font-bold text-white group-hover:text-cyan-400 transition-colors flex items-center">
            User Quota & Activity Management
            <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
          </h3>
          <p className="text-xs text-slate-400 leading-relaxed">
            View all users, inspect current task consumption against subscription quotas, and manage subscription statuses.
          </p>
        </Link>
      </div>

    </div>
  );
}
