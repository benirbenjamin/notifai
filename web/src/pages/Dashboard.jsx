import React, { useState, useEffect } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import TaskCard from '../components/TaskCard';
import { 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  DollarSign, 
  Plus, 
  ArrowRight,
  TrendingUp,
  Sparkles,
  Smartphone
} from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Dashboard({ onOpenCreateTask }) {
  const { user, quota } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [stats, setStats] = useState({ total: 0, completed: 0, pending: 0, overdue: 0 });
  const [todayTasks, setTodayTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [tasksRes, todayRes] = await Promise.all([
        api.get('/tasks'),
        api.get('/tasks/today')
      ]);
      setTasks(tasksRes.data.tasks || []);
      setStats(tasksRes.data.stats || { total: 0, completed: 0, pending: 0, overdue: 0 });
      setTodayTasks(todayRes.data.tasks || []);
    } catch (err) {
      console.error('Dashboard load error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleToggle = async (taskId) => {
    try {
      await api.patch(`/tasks/${taskId}/toggle`);
      fetchData();
    } catch (err) {
      console.error('Toggle error:', err);
    }
  };

  const handleDelete = async (taskId) => {
    if (!window.confirm('Delete this task?')) return;
    try {
      await api.delete(`/tasks/${taskId}`);
      fetchData();
    } catch (err) {
      console.error('Delete error:', err);
    }
  };

  // Calculate payment balances
  const paymentTasks = tasks.filter(t => t.type === 'payment');
  const totalDue = paymentTasks.reduce((sum, t) => sum + parseFloat(t.total_amount || 0), 0);
  const totalPaid = paymentTasks.reduce((sum, t) => sum + parseFloat(t.paid_amount || 0), 0);
  const totalRemaining = Math.max(0, totalDue - totalPaid);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      
      {/* Welcome Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-slate-900 to-cyan-950/40 border border-slate-800 p-8 shadow-xl">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center space-x-2 text-cyan-400 text-xs font-bold uppercase tracking-wider mb-2">
              <Sparkles className="w-4 h-4" />
              <span>Smart Workspace Dashboard</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Welcome back, {user?.first_name || 'User'}!
            </h1>
            <p className="mt-1 text-sm text-slate-400 max-w-xl">
              You have <strong className="text-white">{stats.pending}</strong> pending tasks, including{' '}
              <strong className="text-rose-400">{stats.overdue}</strong> overdue. All deadline alerts and push notifications are active.
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={onOpenCreateTask}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-lg shadow-cyan-500/20 active:scale-95 transition-all flex items-center"
            >
              <Plus className="w-4 h-4 mr-2" />
              New Task
            </button>
            <Link
              to="/tasks"
              className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 transition-all flex items-center"
            >
              View All Tasks
              <ArrowRight className="w-4 h-4 ml-2" />
            </Link>
          </div>
        </div>

        {/* Background glow circle */}
        <div className="absolute -right-16 -top-16 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center space-x-4">
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
            <Clock className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold text-white">{stats.pending}</div>
            <div className="text-xs text-slate-400">Pending Tasks</div>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center space-x-4">
          <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold text-rose-400">{stats.overdue}</div>
            <div className="text-xs text-slate-400">Overdue Tasks</div>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center space-x-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold text-emerald-400">{stats.completed}</div>
            <div className="text-xs text-slate-400">Completed</div>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center space-x-4">
          <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <div className="text-2xl font-bold text-cyan-400">
              {stats.total > 0 ? `${Math.round((stats.completed / stats.total) * 100)}%` : '0%'}
            </div>
            <div className="text-xs text-slate-400">Completion Rate</div>
          </div>
        </div>
      </div>

      {/* Main Grid: Today's Tasks & Side Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Today's Task Panel (Home Widget Mirror) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
              <h2 className="text-lg font-bold text-white">Today's Focus & Deadlines</h2>
              <span className="text-xs text-slate-400">({todayTasks.length})</span>
            </div>
            <span className="text-xs text-slate-500 flex items-center">
              <Smartphone className="w-3.5 h-3.5 mr-1 text-slate-400" />
              Mirrors Android Home Widget
            </span>
          </div>

          {loading ? (
            <div className="p-8 text-center text-slate-500 text-sm">Loading tasks...</div>
          ) : todayTasks.length === 0 ? (
            <div className="p-8 rounded-2xl bg-slate-900/40 border border-slate-800 text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-400/60 mx-auto mb-2" />
              <p className="text-sm font-semibold text-white">All clear for today!</p>
              <p className="text-xs text-slate-400 mt-1">No pending tasks due today.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {todayTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Payment Progress & Quota Tracker */}
        <div className="space-y-6">
          
          {/* Subscription Quota Card */}
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Subscription & Quota</h3>
              <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800">
                {quota?.planName || 'Free'}
              </span>
            </div>

            <div>
              <div className="flex justify-between text-xs text-slate-400 mb-1">
                <span>Task Limit Usage</span>
                <span><strong className="text-white">{quota?.currentTasks || 0}</strong> / {quota?.maxTasks || 10}</span>
              </div>
              <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all"
                  style={{ width: `${Math.min(100, ((quota?.currentTasks || 0) / (quota?.maxTasks || 10)) * 100)}%` }}
                />
              </div>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              Need to create more tasks? Upgrade for <strong>1, 3, 6, or 12 months</strong> to get higher task limits and premium alerts.
            </p>

            <Link
              to="/subscriptions"
              className="block text-center py-2 px-4 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700 transition-colors"
            >
              Manage Subscription Plans →
            </Link>
          </div>

          {/* Payment & Budget Overview */}
          {totalDue > 0 && (
            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
              <div className="flex items-center space-x-2">
                <DollarSign className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-white">Financial / Payments Due</h3>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between text-slate-300">
                  <span>Total Payments Due:</span>
                  <strong className="text-white">${totalDue.toFixed(2)}</strong>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Amount Paid So Far:</span>
                  <strong className="text-emerald-400">${totalPaid.toFixed(2)}</strong>
                </div>
                <div className="flex justify-between text-slate-300 pt-2 border-t border-slate-800 font-semibold">
                  <span>Remaining Balance:</span>
                  <strong className="text-rose-400">${totalRemaining.toFixed(2)}</strong>
                </div>
              </div>
            </div>
          )}

          {/* Mobile App Promotion Card */}
          <div className="p-6 rounded-2xl bg-gradient-to-b from-slate-900 to-cyan-950/30 border border-slate-800 space-y-3">
            <div className="flex items-center space-x-2 text-cyan-400">
              <Smartphone className="w-5 h-5" />
              <h3 className="text-sm font-bold text-white">Mobile App Installed?</h3>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Use Notifai space on your Android or iOS device with full offline support (up to 3 days), home screen note widget, and display-over-other-apps alarm alerts.
            </p>
          </div>

        </div>

      </div>

    </div>
  );
}
