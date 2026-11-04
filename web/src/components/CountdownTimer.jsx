import React, { useState, useEffect } from 'react';
import { Clock, AlertTriangle, CheckCircle2 } from 'lucide-react';

export default function CountdownTimer({ startTime, endTime, dueDate, isCompleted }) {
  const [timeLeft, setTimeLeft] = useState('');
  const [status, setStatus] = useState('active'); // upcoming, active, overdue, completed

  useEffect(() => {
    if (isCompleted) {
      setStatus('completed');
      setTimeLeft('Completed');
      return;
    }

    const calculateTime = () => {
      const now = new Date().getTime();
      const targetTime = endTime ? new Date(endTime).getTime() : (dueDate ? new Date(dueDate).getTime() : null);
      const start = startTime ? new Date(startTime).getTime() : null;

      if (!targetTime) {
        setTimeLeft('No deadline');
        setStatus('none');
        return;
      }

      // If timed task and hasn't started yet
      if (start && now < start) {
        const diff = start - now;
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        setStatus('upcoming');
        setTimeLeft(`Starts in ${hours > 0 ? `${hours}h ` : ''}${minutes}m`);
        return;
      }

      // Check if expired / overdue
      if (now > targetTime) {
        const diff = now - targetTime;
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        setStatus('overdue');
        setTimeLeft(`Expired ${hours > 0 ? `${hours}h ` : ''}${minutes}m ago`);
        return;
      }

      // Currently active countdown
      const diff = targetTime - now;
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setStatus(hours < 1 && days === 0 ? 'imminent' : 'active');

      if (days > 0) {
        setTimeLeft(`${days}d ${hours}h left`);
      } else if (hours > 0) {
        setTimeLeft(`${hours}h ${minutes}m left`);
      } else {
        setTimeLeft(`${minutes}m ${seconds}s left`);
      }
    };

    calculateTime();
    const interval = setInterval(calculateTime, 1000);
    return () => clearInterval(interval);
  }, [startTime, endTime, dueDate, isCompleted]);

  const getBadgeStyle = () => {
    switch (status) {
      case 'completed':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      case 'overdue':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/30 animate-pulse';
      case 'imminent':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
      case 'upcoming':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/30';
      default:
        return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30';
    }
  };

  const getIcon = () => {
    if (status === 'completed') return <CheckCircle2 className="w-3.5 h-3.5 mr-1" />;
    if (status === 'overdue') return <AlertTriangle className="w-3.5 h-3.5 mr-1" />;
    return <Clock className="w-3.5 h-3.5 mr-1" />;
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${getBadgeStyle()}`}>
      {getIcon()}
      {timeLeft}
    </span>
  );
}
