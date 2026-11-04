import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import { ArrowLeft, Users, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';

export default function AdminUsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await api.get('/admin/users');
        setUsers(res.data.users || []);
      } catch (err) {
        console.error('Failed to load users:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchUsers();
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      
      <div className="flex items-center justify-between pb-6 border-b border-slate-800">
        <div>
          <Link to="/admin" className="inline-flex items-center text-xs text-slate-400 hover:text-white mb-2">
            <ArrowLeft className="w-3.5 h-3.5 mr-1" />
            Back to Admin Dashboard
          </Link>
          <h1 className="text-2xl font-extrabold text-white">Registered Users & Task Quotas</h1>
          <p className="text-xs text-slate-400 mt-1">View user subscription status and real-time task usage.</p>
        </div>
      </div>

      {loading ? (
        <div className="py-16 text-center text-slate-500 text-sm">Loading users list...</div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900 shadow-xl">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-950 text-slate-400 font-bold uppercase tracking-wider text-[11px] border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">User</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Assigned Plan</th>
                <th className="py-3 px-4">Active Tasks / Limit</th>
                <th className="py-3 px-4">Subscription Status</th>
                <th className="py-3 px-4">Valid Until</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {users.map((u) => {
                const isLimitExceeded = parseInt(u.task_count, 10) >= parseInt(u.current_limit, 10);
                return (
                  <tr key={u.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-white">{u.first_name} {u.last_name}</div>
                      <div className="text-[11px] text-slate-400">{u.email}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        u.role === 'ADMIN' ? 'bg-indigo-950 text-indigo-400 border border-indigo-800' : 'bg-slate-800 text-slate-400'
                      }`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-medium text-cyan-400">
                      {u.plan_name || 'Free Starter'}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center space-x-2">
                        <span className={`font-bold ${isLimitExceeded ? 'text-rose-400' : 'text-white'}`}>
                          {u.task_count}
                        </span>
                        <span className="text-slate-500">/</span>
                        <span className="text-slate-400">{u.current_limit}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        u.subscription_status === 'active' 
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' 
                          : 'bg-slate-800 text-slate-500'
                      }`}>
                        {u.subscription_status || 'Free Tier'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-400">
                      {u.subscription_end_date ? new Date(u.subscription_end_date).toLocaleDateString() : 'N/A'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
}
