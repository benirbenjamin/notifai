import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { X, Clock, DollarSign, Calendar, AlertCircle, ShoppingBag, Repeat } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function CreateTaskModal({ isOpen, onClose, onTaskCreated }) {
  const { quota, refreshProfile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    type: 'general',
    category: '',
    priority: 'medium',
    dueDate: '',
    startTime: '',
    endTime: '',
    reminderMinutes: '30',
    totalAmount: '',
    paidAmount: '0',
    targetItem: '',
    recurringType: 'daily'
  });

  if (!isOpen) return null;

  const isQuotaReached = quota && quota.currentTasks >= quota.maxTasks;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!formData.title.trim()) {
      setError('Please provide a task title');
      return;
    }

    setLoading(true);
    try {
      await onTaskCreated(formData);
      await refreshProfile();
      onClose();
    } catch (err) {
      if (err.response?.data?.error === 'TASK_LIMIT_REACHED') {
        setError(err.response.data.message);
      } else {
        setError(err.response?.data?.message || 'Failed to create task');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 overflow-hidden">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-white">Create New Task</h2>
            <p className="text-xs text-slate-400">
              Usage: <span className="text-cyan-400 font-semibold">{quota?.currentTasks || 0}</span> / {quota?.maxTasks || 10} tasks
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quota limit warning */}
        {isQuotaReached && (
          <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start space-x-3 text-amber-300 text-xs">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-400" />
            <div>
              <p className="font-semibold">Plan Task Limit Reached</p>
              <p className="mt-0.5 text-slate-300">
                You have reached your limit of {quota.maxTasks} tasks under your current plan.
              </p>
              <Link 
                to="/subscriptions" 
                onClick={onClose}
                className="inline-block mt-2 font-bold text-cyan-400 hover:underline"
              >
                Upgrade to 1, 3, 6, or 12 Months Tier →
              </Link>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          {/* Title */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Task Title *</label>
            <input
              type="text"
              required
              placeholder="e.g., Deliver Quarterly Report or Rent Payment"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500 transition-colors"
            />
          </div>

          {/* Type Selector */}
          <div className="grid grid-cols-5 gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800 text-center">
            {['general', 'timed', 'payment', 'purchase', 'recurring'].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setFormData({ ...formData, type: t })}
                className={`py-1.5 px-2 rounded-lg text-xs font-semibold capitalize transition-all ${
                  formData.type === t 
                    ? 'bg-cyan-500 text-white shadow-sm' 
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">Description</label>
            <textarea
              rows="2"
              placeholder="Add any specific context or steps..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500 transition-colors"
            />
          </div>

          {/* Conditional: Timed Task Fields */}
          {formData.type === 'timed' && (
            <div className="grid grid-cols-2 gap-3 p-3 bg-cyan-950/20 border border-cyan-800/40 rounded-xl">
              <div>
                <label className="block text-xs font-medium text-cyan-300 mb-1">Start Time</label>
                <input
                  type="datetime-local"
                  value={formData.startTime}
                  onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-cyan-300 mb-1">End Time</label>
                <input
                  type="datetime-local"
                  value={formData.endTime}
                  onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                />
              </div>
            </div>
          )}

          {/* Conditional: Payment Task Fields */}
          {formData.type === 'payment' && (
            <div className="grid grid-cols-2 gap-3 p-3 bg-emerald-950/20 border border-emerald-800/40 rounded-xl">
              <div>
                <label className="block text-xs font-medium text-emerald-300 mb-1">Total Amount ($)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.totalAmount}
                  onChange={(e) => setFormData({ ...formData, totalAmount: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-emerald-300 mb-1">Paid Amount ($)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.paidAmount}
                  onChange={(e) => setFormData({ ...formData, paidAmount: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
                />
              </div>
            </div>
          )}

          {/* Conditional: Purchase Goal Fields */}
          {formData.type === 'purchase' && (
            <div className="p-3 bg-purple-950/20 border border-purple-800/40 rounded-xl">
              <label className="block text-xs font-medium text-purple-300 mb-1">Target Item</label>
              <input
                type="text"
                placeholder="e.g., New Laptop, Flight Ticket"
                value={formData.targetItem}
                onChange={(e) => setFormData({ ...formData, targetItem: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
              />
            </div>
          )}

          {/* Conditional: Recurring Task Fields */}
          {formData.type === 'recurring' && (
            <div className="p-3 bg-amber-950/20 border border-amber-800/40 rounded-xl">
              <label className="block text-xs font-medium text-amber-300 mb-1">Repeat Cycle</label>
              <select
                value={formData.recurringType}
                onChange={(e) => setFormData({ ...formData, recurringType: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
          )}

          {/* Due Date & Reminder settings */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Due Date & Time</label>
              <input
                type="datetime-local"
                value={formData.dueDate}
                onChange={(e) => setFormData({ ...formData, dueDate: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-xs text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Advance Alert</label>
              <select
                value={formData.reminderMinutes}
                onChange={(e) => setFormData({ ...formData, reminderMinutes: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-xs text-white"
              >
                <option value="0">At deadline</option>
                <option value="15">15 minutes before</option>
                <option value="30">30 minutes before</option>
                <option value="60">1 hour before</option>
                <option value="1440">1 day before</option>
              </select>
            </div>
          </div>

          {/* Priority & Category */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Priority</label>
              <select
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-xs text-white"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Category</label>
              <input
                type="text"
                placeholder="e.g., Work, Finance, Health"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-xs text-white"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="pt-4 flex items-center justify-end space-x-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={loading || isQuotaReached}
              className="px-5 py-2 rounded-lg text-xs font-semibold bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50 text-white shadow-md shadow-cyan-500/20 transition-all"
            >
              {loading ? 'Creating...' : isQuotaReached ? 'Quota Reached' : 'Create Task'}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
