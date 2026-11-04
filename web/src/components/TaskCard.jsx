import React from 'react';
import { 
  Check, 
  Trash2, 
  Clock, 
  DollarSign, 
  ShoppingBag, 
  Repeat, 
  Tag, 
  Calendar,
  AlertCircle
} from 'lucide-react';
import CountdownTimer from './CountdownTimer';

export default function TaskCard({ task, onToggle, onDelete }) {
  const isOverdue = !task.is_completed && task.due_date && new Date(task.due_date) < new Date();

  const getPriorityBadge = (priority) => {
    switch (priority) {
      case 'urgent':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/30';
      case 'high':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'low':
        return 'bg-slate-500/10 text-slate-400 border-slate-500/30';
      default:
        return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
    }
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case 'timed':
        return <Clock className="w-3.5 h-3.5 text-cyan-400" />;
      case 'payment':
        return <DollarSign className="w-3.5 h-3.5 text-emerald-400" />;
      case 'purchase':
        return <ShoppingBag className="w-3.5 h-3.5 text-purple-400" />;
      case 'recurring':
        return <Repeat className="w-3.5 h-3.5 text-amber-400" />;
      default:
        return <Tag className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  return (
    <div className={`p-4 rounded-xl border transition-all duration-200 group ${
      task.is_completed 
        ? 'bg-slate-900/40 border-slate-800/60 opacity-60' 
        : isOverdue 
          ? 'bg-slate-900 border-rose-900/40 hover:border-rose-700/60 shadow-lg shadow-rose-950/10'
          : 'bg-slate-900 border-slate-800 hover:border-slate-700 hover:shadow-lg hover:shadow-cyan-950/10'
    }`}>
      <div className="flex items-start justify-between gap-3">
        
        {/* Toggle Checkbox */}
        <button
          onClick={() => onToggle(task.id)}
          className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
            task.is_completed 
              ? 'bg-emerald-500 border-emerald-500 text-white' 
              : 'border-slate-600 hover:border-cyan-400 bg-slate-950/60'
          }`}
        >
          {task.is_completed && <Check className="w-3.5 h-3.5 stroke-[3]" />}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2 flex-wrap gap-y-1">
            <h3 className={`text-sm font-semibold truncate ${
              task.is_completed ? 'line-through text-slate-500' : 'text-white'
            }`}>
              {task.title}
            </h3>

            {/* Type badge */}
            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800 text-slate-300 border border-slate-700">
              {getTypeIcon(task.type)}
              <span className="capitalize">{task.type}</span>
            </span>

            {/* Priority */}
            <span className={`px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider border ${getPriorityBadge(task.priority)}`}>
              {task.priority}
            </span>

            {/* Category */}
            {task.category && (
              <span className="px-2 py-0.5 rounded text-[11px] bg-slate-800/80 text-cyan-400 border border-slate-700/60">
                #{task.category}
              </span>
            )}
          </div>

          {task.description && (
            <p className="mt-1 text-xs text-slate-400 line-clamp-2">
              {task.description}
            </p>
          )}

          {/* Payment Progress Bar */}
          {task.type === 'payment' && task.total_amount > 0 && (
            <div className="mt-2.5 p-2 rounded-lg bg-slate-950/60 border border-slate-800/80">
              <div className="flex justify-between text-[11px] text-slate-300 mb-1">
                <span>Paid: <strong className="text-emerald-400">${parseFloat(task.paid_amount || 0).toFixed(2)}</strong></span>
                <span>Remaining: <strong className="text-rose-400">${parseFloat(task.remaining_amount || 0).toFixed(2)}</strong></span>
                <span>Total: ${parseFloat(task.total_amount).toFixed(2)}</span>
              </div>
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-emerald-500 rounded-full"
                  style={{ width: `${Math.min(100, (task.paid_amount / task.total_amount) * 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* Timed & Due Date section */}
          <div className="mt-3 flex items-center space-x-3 flex-wrap gap-y-1 text-xs text-slate-400">
            {(task.due_date || task.end_time) && (
              <CountdownTimer 
                startTime={task.start_time} 
                endTime={task.end_time} 
                dueDate={task.due_date} 
                isCompleted={task.is_completed} 
              />
            )}

            {task.due_date && (
              <div className="flex items-center text-slate-400">
                <Calendar className="w-3.5 h-3.5 mr-1 text-slate-500" />
                <span>Due: {new Date(task.due_date).toLocaleDateString()} {new Date(task.due_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
            )}

            {task.recurring_type && (
              <div className="flex items-center text-amber-400">
                <Repeat className="w-3.5 h-3.5 mr-1" />
                <span className="capitalize">Repeats {task.recurring_type}</span>
              </div>
            )}
          </div>
        </div>

        {/* Delete action */}
        <button
          onClick={() => onDelete(task.id)}
          className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-500 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-all"
          title="Delete Task"
        >
          <Trash2 className="w-4 h-4" />
        </button>

      </div>
    </div>
  );
}
