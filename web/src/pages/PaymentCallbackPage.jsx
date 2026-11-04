import React, { useEffect, useState } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { CheckCircle2, AlertCircle, Sparkles, ArrowRight } from 'lucide-react';

export default function PaymentCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { refreshProfile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [details, setDetails] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const verifyPayment = async () => {
      try {
        const transactionId = searchParams.get('transaction_id') || 'mock_payment';
        const txRef = searchParams.get('tx_ref');
        const mock = searchParams.get('mock');
        const planId = searchParams.get('planId');
        const tierId = searchParams.get('tierId');
        const duration = searchParams.get('duration');
        const amount = searchParams.get('amount');

        const res = await api.get('/subscriptions/verify', {
          params: {
            transaction_id: transactionId,
            tx_ref: txRef,
            mock,
            planId,
            tierId,
            duration,
            amount
          }
        });

        if (res.data?.success) {
          setSuccess(true);
          setDetails(res.data);
          await refreshProfile();
        } else {
          setError(res.data?.message || 'Payment verification failed');
        }
      } catch (err) {
        console.error('Verification error:', err);
        setError(err.response?.data?.message || 'Verification request failed');
      } finally {
        setLoading(false);
      }
    };

    verifyPayment();
  }, [searchParams]);

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <div className="w-full max-w-md p-8 rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl text-center space-y-6">
        
        {loading ? (
          <div className="space-y-4">
            <div className="w-12 h-12 rounded-full border-4 border-cyan-500 border-t-transparent animate-spin mx-auto" />
            <h2 className="text-lg font-bold text-white">Verifying Flutterwave Payment...</h2>
            <p className="text-xs text-slate-400">Please do not close this window.</p>
          </div>
        ) : success ? (
          <div className="space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <h2 className="text-2xl font-extrabold text-white">Payment Successful!</h2>
            <p className="text-xs text-slate-300">
              Your subscription to <strong className="text-cyan-400">{details?.planName}</strong> is now active.
            </p>

            <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-xs text-left space-y-2">
              <div className="flex justify-between text-slate-400">
                <span>New Task Limit:</span>
                <strong className="text-white">{details?.taskLimit} tasks</strong>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Valid Until:</span>
                <strong className="text-white">{new Date(details?.endDate).toLocaleDateString()}</strong>
              </div>
            </div>

            <Link
              to="/tasks"
              className="w-full py-3 px-4 rounded-xl text-xs font-bold bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/20 flex items-center justify-center"
            >
              Start Creating Tasks
              <ArrowRight className="w-4 h-4 ml-2" />
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mx-auto text-rose-400">
              <AlertCircle className="w-10 h-10" />
            </div>

            <h2 className="text-xl font-bold text-white">Payment Verification Issue</h2>
            <p className="text-xs text-rose-300">{error}</p>

            <Link
              to="/subscriptions"
              className="inline-block py-2.5 px-4 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white"
            >
              Return to Plans
            </Link>
          </div>
        )}

      </div>
    </div>
  );
}
