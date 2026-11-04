import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { 
  CheckSquare, 
  LayoutDashboard, 
  CreditCard, 
  ShieldAlert, 
  LogOut, 
  Sparkles, 
  PlusCircle, 
  Smartphone 
} from 'lucide-react';

export default function Navbar({ onOpenCreateTask }) {
  const { user, quota, logout } = useAuth();
  const location = useLocation();

  const isActive = (path) => location.pathname === path;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800 bg-slate-950/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        
        {/* Brand / Logo */}
        <div className="flex items-center space-x-8">
          <Link to="/" className="flex items-center space-x-3 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 group-hover:scale-105 transition-transform">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <span className="text-xl font-bold bg-gradient-to-r from-white via-slate-100 to-cyan-400 bg-clip-text text-transparent">
                Notifai space
              </span>
              <span className="hidden sm:inline-block ml-2 text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full bg-cyan-950/60 text-cyan-400 border border-cyan-800/40">
                v2.0
              </span>
            </div>
          </Link>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center space-x-1">
            <Link
              to="/"
              className={`flex items-center px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive('/') 
                  ? 'bg-slate-800 text-white' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <LayoutDashboard className="w-4 h-4 mr-2 text-cyan-400" />
              Dashboard
            </Link>
            
            <Link
              to="/tasks"
              className={`flex items-center px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive('/tasks') 
                  ? 'bg-slate-800 text-white' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <CheckSquare className="w-4 h-4 mr-2 text-emerald-400" />
              Tasks
            </Link>

            <Link
              to="/subscriptions"
              className={`flex items-center px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive('/subscriptions') 
                  ? 'bg-slate-800 text-white' 
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
            >
              <CreditCard className="w-4 h-4 mr-2 text-amber-400" />
              Pricing & Plans
            </Link>

            {user?.role === 'ADMIN' && (
              <Link
                to="/admin"
                className={`flex items-center px-3.5 py-2 rounded-lg text-sm font-medium transition-colors ${
                  location.pathname.startsWith('/admin') 
                    ? 'bg-indigo-950/60 text-indigo-300 border border-indigo-700/50' 
                    : 'text-indigo-400 hover:bg-indigo-950/30'
                }`}
              >
                <ShieldAlert className="w-4 h-4 mr-2" />
                Admin Panel
              </Link>
            )}
          </nav>
        </div>

        {/* Right side controls: Quota pill & Actions */}
        <div className="flex items-center space-x-4">
          
          {/* Quota Progress Pill */}
          {quota && (
            <Link 
              to="/subscriptions" 
              className="hidden lg:flex items-center space-x-2 bg-slate-900 hover:bg-slate-800/80 border border-slate-800 px-3 py-1.5 rounded-full transition-all group"
              title="Click to view or upgrade subscription limits"
            >
              <div className="text-xs font-medium text-slate-300">
                <span className="font-semibold text-white">{quota.currentTasks}</span> / {quota.maxTasks} Tasks
              </div>
              <div className="w-16 h-2 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
                <div 
                  className={`h-full rounded-full transition-all ${
                    (quota.currentTasks / quota.maxTasks) >= 0.9 
                      ? 'bg-rose-500' 
                      : (quota.currentTasks / quota.maxTasks) >= 0.7 
                        ? 'bg-amber-500' 
                        : 'bg-cyan-500'
                  }`}
                  style={{ width: `${Math.min(100, (quota.currentTasks / quota.maxTasks) * 100)}%` }}
                />
              </div>
              <span className="text-[10px] font-bold uppercase text-cyan-400 group-hover:underline">
                Upgrade
              </span>
            </Link>
          )}

          {/* New Task Button */}
          {onOpenCreateTask && (
            <button
              onClick={onOpenCreateTask}
              className="flex items-center px-3.5 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-md shadow-cyan-500/20 active:scale-95 transition-all"
            >
              <PlusCircle className="w-4 h-4 mr-2" />
              <span>New Task</span>
            </button>
          )}

          {/* User info & Logout */}
          <div className="flex items-center space-x-3 pl-2 border-l border-slate-800">
            <div className="hidden sm:block text-right">
              <div className="text-xs font-semibold text-white">
                {user?.first_name} {user?.last_name}
              </div>
              <div className="text-[10px] text-slate-400">
                {user?.role === 'ADMIN' ? '👑 Admin' : 'Free Member'}
              </div>
            </div>

            <button
              onClick={logout}
              className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-900 transition-colors"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>

        </div>

      </div>
    </header>
  );
}
