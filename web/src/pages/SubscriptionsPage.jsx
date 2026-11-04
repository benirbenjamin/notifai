import React, { useState, useEffect } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { 
  Check, 
  Sparkles, 
  ShieldCheck, 
  CreditCard, 
  Clock, 
  Smartphone, 
  Bell, 
  Zap,
  ArrowRight
} from 'lucide-react';

export default function SubscriptionsPage() {
  const { user, subscription, quota } = useAuth();
  const [plans, setPlans] = useState([]);
  const [selectedDuration, setSelectedDuration] = useState(1); // 1, 3, 6, 12 months
  const [loading, setLoading] = useState(true);
  const [payingPlanId, setPayingPlanId] = useState(null);

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const res = await api.get('/subscriptions/plans');
        setPlans(res.data.plans || []);
      } catch (err) {
        console.error('Failed to load plans:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchPlans();
  }, []);

  const handleSubscribe = async (plan) => {
    // Free plan does not need checkout
    if (plan.id === 1) return;

    // Find the tier for selectedDuration
    const tier = plan.tiers?.find(t => t.duration_months === selectedDuration) || plan.tiers?.[0];
    if (!tier) {
      alert('Selected duration tier is not available for this plan.');
      return;
    }

    setPayingPlanId(plan.id);
    try {
      const res = await api.post('/subscriptions/initialize', {
        planId: plan.id,
        tierId: tier.id
      });

      if (res.data?.link) {
        // Redirect to Flutterwave checkout or test verification URL
        window.location.href = res.data.link;
      } else {
        alert('Could not initialize payment with Flutterwave');
      }
    } catch (err) {
      console.error('Payment initialization error:', err);
      alert(err.response?.data?.message || 'Payment initiation failed');
    } finally {
      setPayingPlanId(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12">
      
      {/* Title */}
      <div className="text-center max-w-2xl mx-auto space-y-3">
        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-cyan-950 text-cyan-400 border border-cyan-800">
          <Sparkles className="w-3.5 h-3.5 mr-1" />
          Flexible Task Limit Plans
        </span>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
          Create More Tasks. Stay On Track.
        </h1>
        <p className="text-sm text-slate-400">
          Choose your plan duration. Task quotas and advance deadline reminders are instantly unlocked upon Flutterwave payment.
        </p>

        {/* Current Active Plan Badge */}
        {subscription && (
          <div className="inline-block mt-2 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300">
            Active: <strong>{subscription.plan_name}</strong> (Limit: {subscription.task_limit} tasks) • Valid until {new Date(subscription.end_date).toLocaleDateString()}
          </div>
        )}
      </div>

      {/* Duration Selector Tabs: 1, 3, 6, 12 Months */}
      <div className="flex justify-center">
        <div className="inline-flex p-1.5 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl">
          {[
            { months: 1, label: '1 Month' },
            { months: 3, label: '3 Months (Save 15%)' },
            { months: 6, label: '6 Months (Save 25%)' },
            { months: 12, label: '12 Months (Best Value)' },
          ].map((item) => (
            <button
              key={item.months}
              onClick={() => setSelectedDuration(item.months)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                selectedDuration === item.months
                  ? 'bg-cyan-500 text-white shadow-md shadow-cyan-500/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Pricing Cards */}
      {loading ? (
        <div className="py-16 text-center text-slate-500 text-sm">Loading pricing options...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {plans.map((plan) => {
            const tier = plan.tiers?.find(t => t.duration_months === selectedDuration) || plan.tiers?.[0];
            const price = plan.id === 1 ? '0.00' : (tier ? tier.price : '—');
            const isCurrentPlan = subscription?.plan_id === plan.id;
            const isPopular = plan.id === 2;

            return (
              <div
                key={plan.id}
                className={`relative flex flex-col p-8 rounded-3xl border transition-all duration-300 ${
                  isPopular 
                    ? 'bg-slate-900 border-cyan-500/60 shadow-2xl shadow-cyan-950/40 ring-1 ring-cyan-500/40' 
                    : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                }`}
              >
                {isPopular && (
                  <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[11px] font-extrabold uppercase tracking-wider bg-gradient-to-r from-cyan-500 to-blue-500 text-white shadow-md">
                    Most Popular
                  </span>
                )}

                <div>
                  <h3 className="text-xl font-bold text-white">{plan.name}</h3>
                  <p className="mt-1 text-xs text-slate-400 min-h-[32px]">{plan.description}</p>

                  <div className="mt-6 flex items-baseline">
                    <span className="text-4xl font-extrabold text-white">${price}</span>
                    <span className="ml-2 text-xs text-slate-400">
                      / {plan.id === 1 ? 'forever' : `${selectedDuration} month${selectedDuration > 1 ? 's' : ''}`}
                    </span>
                  </div>
                </div>

                {/* Features List */}
                <div className="mt-8 space-y-3.5 flex-1 text-xs text-slate-300">
                  <div className="flex items-center space-x-2.5">
                    <div className="w-4 h-4 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </div>
                    <span>
                      <strong className="text-white font-bold">{plan.max_tasks.toLocaleString()}</strong> Active Tasks Limit
                    </span>
                  </div>

                  <div className="flex items-center space-x-2.5">
                    <div className="w-4 h-4 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </div>
                    <span>Push & Full-Screen Overlay Alarms</span>
                  </div>

                  <div className="flex items-center space-x-2.5">
                    <div className="w-4 h-4 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </div>
                    <span>Email Deadline Reminders (1-Click Snooze)</span>
                  </div>

                  <div className="flex items-center space-x-2.5">
                    <div className="w-4 h-4 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </div>
                    <span>Android Home Screen Note Widget</span>
                  </div>

                  <div className="flex items-center space-x-2.5">
                    <div className="w-4 h-4 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </div>
                    <span>Up to 3 Days Offline Synchronization</span>
                  </div>
                </div>

                {/* Checkout Button */}
                <button
                  onClick={() => handleSubscribe(plan)}
                  disabled={isCurrentPlan || payingPlanId === plan.id}
                  className={`mt-8 w-full py-3 px-4 rounded-2xl text-xs font-bold transition-all flex items-center justify-center shadow-lg ${
                    plan.id === 1
                      ? 'bg-slate-800 text-slate-400 cursor-default'
                      : isPopular
                        ? 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-cyan-500/25 active:scale-95'
                        : 'bg-slate-800 hover:bg-slate-700 text-white active:scale-95'
                  }`}
                >
                  <CreditCard className="w-4 h-4 mr-2" />
                  {payingPlanId === plan.id 
                    ? 'Connecting Flutterwave...' 
                    : isCurrentPlan 
                      ? 'Current Active Plan' 
                      : plan.id === 1 
                        ? 'Included by Default' 
                        : `Pay with Flutterwave ($${price})`}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Flutterwave Security guarantee */}
      <div className="max-w-xl mx-auto p-4 rounded-2xl bg-slate-900/60 border border-slate-800 flex items-center space-x-4 text-xs text-slate-400">
        <ShieldCheck className="w-8 h-8 text-emerald-400 flex-shrink-0" />
        <p>
          Payments are secured and processed through <strong>Flutterwave</strong>. Cards, Mobile Money, Bank Transfers, and USSD are accepted globally.
        </p>
      </div>

    </div>
  );
}
