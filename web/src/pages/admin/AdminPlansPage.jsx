import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import { 
  Sliders, 
  Save, 
  Plus, 
  Check, 
  ArrowLeft, 
  Layers, 
  Clock, 
  DollarSign,
  AlertCircle
} from 'lucide-react';

export default function AdminPlansPage() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingPlanId, setSavingPlanId] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState('');
  const [error, setError] = useState('');

  const fetchPlans = async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/plans');
      setPlans(res.data.plans || []);
    } catch (err) {
      console.error('Fetch plans error:', err);
      setError('Failed to load plans from database');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
  }, []);

  const handleUpdatePlanLimit = async (planId, newMaxTasks) => {
    setSavingPlanId(planId);
    setError('');
    setSaveSuccess('');
    try {
      await api.put(`/admin/plans/${planId}`, {
        maxTasks: parseInt(newMaxTasks, 10)
      });
      setSaveSuccess(`Updated task limit for Plan #${planId}!`);
      fetchPlans();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update plan');
    } finally {
      setSavingPlanId(null);
    }
  };

  const handleUpdateTierPrice = async (planId, durationMonths, newPrice) => {
    setSavingPlanId(`${planId}-${durationMonths}`);
    setError('');
    setSaveSuccess('');
    try {
      await api.post(`/admin/plans/${planId}/tiers`, {
        durationMonths,
        price: parseFloat(newPrice)
      });
      setSaveSuccess(`Updated ${durationMonths}-Month price for Plan #${planId}!`);
      fetchPlans();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update tier');
    } finally {
      setSavingPlanId(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      
      {/* Header */}
      <div className="flex items-center justify-between pb-6 border-b border-slate-800">
        <div>
          <Link to="/admin" className="inline-flex items-center text-xs text-slate-400 hover:text-white mb-2">
            <ArrowLeft className="w-3.5 h-3.5 mr-1" />
            Back to Admin Dashboard
          </Link>
          <h1 className="text-2xl font-extrabold text-white">Subscription & Task Limits Configurator</h1>
          <p className="text-xs text-slate-400 mt-1">
            Configure how many tasks users can create and the pricing for 1, 3, 6, and 12 month subscriptions.
          </p>
        </div>
      </div>

      {saveSuccess && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 flex items-center space-x-2">
          <Check className="w-4 h-4 flex-shrink-0" />
          <span>{saveSuccess}</span>
        </div>
      )}

      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-slate-500 text-sm">Loading plans configuration...</div>
      ) : (
        <div className="space-y-8">
          {plans.map((plan) => (
            <div key={plan.id} className="p-6 rounded-3xl bg-slate-900 border border-slate-800 shadow-xl space-y-6">
              
              {/* Plan Title & Task Quota Setting */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
                <div>
                  <div className="flex items-center space-x-3">
                    <h2 className="text-xl font-bold text-white">{plan.name}</h2>
                    <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-slate-800 text-cyan-400 border border-slate-700">
                      Plan ID: {plan.id}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{plan.description}</p>
                </div>

                {/* Task Limit Setting Field */}
                <div className="flex items-center space-x-3 bg-slate-950 p-2.5 rounded-2xl border border-slate-800">
                  <div className="text-xs">
                    <span className="block text-slate-400">Task Creation Limit:</span>
                    <span className="text-white font-bold">{plan.max_tasks.toLocaleString()} tasks</span>
                  </div>

                  <input
                    type="number"
                    defaultValue={plan.max_tasks}
                    id={`limit-input-${plan.id}`}
                    className="w-24 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-cyan-500"
                  />

                  <button
                    onClick={() => {
                      const input = document.getElementById(`limit-input-${plan.id}`);
                      if (input) handleUpdatePlanLimit(plan.id, input.value);
                    }}
                    disabled={savingPlanId === plan.id}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-600 hover:bg-cyan-500 text-white flex items-center transition-all disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5 mr-1" />
                    Save
                  </button>
                </div>
              </div>

              {/* Duration Tiers: 1, 3, 6, 12 Months Pricing */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center">
                  <Clock className="w-3.5 h-3.5 mr-1 text-indigo-400" />
                  Duration Tiers & Pricing (Configurable)
                </h3>

                {plan.id === 1 ? (
                  <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-400">
                    Free Starter Plan has no payment duration tiers ($0.00 forever).
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {[1, 3, 6, 12].map((months) => {
                      const tier = plan.tiers?.find((t) => t.duration_months === months);
                      const currentPrice = tier ? tier.price : '0.00';
                      const inputId = `tier-input-${plan.id}-${months}`;

                      return (
                        <div
                          key={months}
                          className="p-4 rounded-2xl bg-slate-950 border border-slate-800/80 space-y-3"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-white">
                              {months} Month{months > 1 ? 's' : ''}
                            </span>
                            <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-800/60">
                              Active Tier
                            </span>
                          </div>

                          <div className="flex items-center space-x-2">
                            <span className="text-slate-400 text-xs">$</span>
                            <input
                              type="number"
                              step="0.01"
                              defaultValue={currentPrice}
                              id={inputId}
                              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-indigo-500"
                            />
                          </div>

                          <button
                            onClick={() => {
                              const input = document.getElementById(inputId);
                              if (input) handleUpdateTierPrice(plan.id, months, input.value);
                            }}
                            disabled={savingPlanId === `${plan.id}-${months}`}
                            className="w-full py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center transition-all disabled:opacity-50"
                          >
                            <Save className="w-3 h-3 mr-1" />
                            {savingPlanId === `${plan.id}-${months}` ? 'Saving...' : 'Update Price'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>
          ))}
        </div>
      )}

    </div>
  );
}
