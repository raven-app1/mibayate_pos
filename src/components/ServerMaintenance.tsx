import React, { useState, useEffect } from 'react';
import {
  Wrench,
  Server,
  RefreshCw,
  ShieldCheck,
  Clock,
  Activity,
  AlertTriangle,
  Wifi,
  WifiOff,
  CheckCircle2,
  HardDrive,
  Info
} from 'lucide-react';
import { isSupabaseConfigured, supabase } from '../lib/supabase';

interface ServerMaintenanceProps {
  onRetry?: () => void;
}

export default function ServerMaintenance({ onRetry }: ServerMaintenanceProps) {
  const [isChecking, setIsChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date>(new Date());
  const [checkResult, setCheckResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleCheckStatus = async () => {
    if (isChecking) return;
    setIsChecking(true);
    setCheckResult(null);

    const startTime = Date.now();

    try {
      if (!navigator.onLine) {
        setCheckResult({
          success: false,
          message: 'No internet connection. Please check your network.',
        });
        setLastChecked(new Date());
        return;
      }

      if (isSupabaseConfigured && supabase) {
        // Attempt a lightweight ping query
        const { error } = await supabase
          .from('business_profile')
          .select('name')
          .limit(1)
          .maybeSingle();

        const elapsed = Date.now() - startTime;
        if (elapsed < 600) {
          await new Promise<void>((resolve) => setTimeout(resolve, 600 - elapsed));
        }

        if (error) {
          setCheckResult({
            success: false,
            message:
              'Maintenance in progress: Server is not accepting requests yet.',
          });
        } else {
          setCheckResult({
            success: true,
            message:
              'Server connection detected! Reloading application...',
          });
          setTimeout(() => {
            if (onRetry) {
              onRetry();
            } else {
              window.location.reload();
            }
          }, 1000);
        }
      } else {
        await new Promise<void>((resolve) => setTimeout(resolve, 800));
        setCheckResult({
          success: false,
          message:
            'System maintenance is active. Please try again in a few minutes.',
        });
      }
    } catch {
      setCheckResult({
        success: false,
        message:
          'Maintenance active: Backend database is currently updating.',
      });
    } finally {
      setIsChecking(false);
      setLastChecked(new Date());
    }
  };

  return (
    <div className="h-full w-full bg-gradient-to-b from-gray-950 via-gray-900 to-slate-900 text-white flex flex-col justify-between overflow-y-auto android-scroll">
      {/* Top Safe Area & Brand Header */}
      <header className="shrink-0 px-6 pt-6 pb-4 safe-area-top">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-500/20 backdrop-blur-md rounded-2xl flex items-center justify-center border border-amber-500/30 shadow-lg shadow-amber-500/10">
              <span className="font-black text-xl text-amber-400 leading-none">M</span>
            </div>
            <div>
              <h1 className="text-base font-black text-white tracking-tight leading-tight">
                Mibayate POS
              </h1>
              <p className="text-[11px] text-gray-400 font-medium">
                Retail Management System
              </p>
            </div>
          </div>

          {/* Live Status Pill */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 backdrop-blur-md">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
            </span>
            <span className="text-[11px] font-bold tracking-wide uppercase text-amber-300">
              Maintenance
            </span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 px-5 py-4 max-w-xl mx-auto w-full flex flex-col justify-center">
        {/* Glowing Icon Container */}
        <div className="flex flex-col items-center text-center">
          <div className="relative mb-6">
            {/* Ambient background glow */}
            <div className="absolute inset-0 bg-amber-500/20 rounded-full blur-2xl transform scale-150 animate-pulse" />
            <div className="relative w-24 h-24 rounded-3xl bg-gradient-to-br from-amber-500/20 via-gray-800 to-gray-900 border border-amber-500/40 flex items-center justify-center shadow-2xl shadow-amber-500/10">
              <div className="relative">
                <Server className="w-10 h-10 text-amber-400" />
                <div className="absolute -bottom-2 -right-2 bg-amber-500 rounded-lg p-1 text-gray-950 shadow-md">
                  <Wrench className="w-4 h-4 animate-bounce" />
                </div>
              </div>
            </div>
          </div>

          {/* Title & Subtitle */}
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mb-1">
            Server Under Maintenance
          </h2>
          <p className="text-sm font-semibold text-amber-400/90 mb-3">
            ဆာဗာ ပြုပြင်ထိန်းသိမ်းမှု လုပ်ဆောင်နေပါသည်
          </p>
          <p className="text-xs sm:text-sm text-gray-300 max-w-md leading-relaxed mb-6">
            We are performing scheduled system updates and optimizations to ensure fast and reliable service. Cashier and Management dashboards are temporarily paused.
          </p>

          {/* Status Breakdown Grid */}
          <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-3 text-left mb-6">
            {/* Card 1 */}
            <div className="bg-white/5 backdrop-blur-md rounded-2xl p-3.5 border border-white/10 flex items-start gap-3">
              <div className="p-2 rounded-xl bg-amber-500/15 text-amber-400 shrink-0 mt-0.5">
                <Activity className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <h3 className="text-xs font-bold text-white">System Status</h3>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300">
                    In Progress
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 mt-1 leading-snug">
                  Database upgrades & server maintenance active.
                </p>
              </div>
            </div>

            {/* Card 2 */}
            <div className="bg-white/5 backdrop-blur-md rounded-2xl p-3.5 border border-white/10 flex items-start gap-3">
              <div className="p-2 rounded-xl bg-emerald-500/15 text-emerald-400 shrink-0 mt-0.5">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <h3 className="text-xs font-bold text-white">Data Safety</h3>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300">
                    100% Secured
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 mt-1 leading-snug">
                  All sales, inventory, and records are safely backed up.
                </p>
              </div>
            </div>

            {/* Card 3 */}
            <div className="bg-white/5 backdrop-blur-md rounded-2xl p-3.5 border border-white/10 flex items-start gap-3">
              <div className="p-2 rounded-xl bg-blue-500/15 text-blue-400 shrink-0 mt-0.5">
                <HardDrive className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <h3 className="text-xs font-bold text-white">POS Terminal</h3>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-300">
                    Paused
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 mt-1 leading-snug">
                  Transactions will resume immediately once online.
                </p>
              </div>
            </div>

            {/* Card 4 */}
            <div className="bg-white/5 backdrop-blur-md rounded-2xl p-3.5 border border-white/10 flex items-start gap-3">
              <div className="p-2 rounded-xl bg-purple-500/15 text-purple-400 shrink-0 mt-0.5">
                <Clock className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <h3 className="text-xs font-bold text-white">Estimated Time</h3>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-300">
                    Soon
                  </span>
                </div>
                <p className="text-[11px] text-gray-400 mt-1 leading-snug">
                  Services are expected to resume shortly.
                </p>
              </div>
            </div>
          </div>

          {/* Action Button & Live Feedback */}
          <div className="w-full space-y-3">
            <button
              onClick={handleCheckStatus}
              disabled={isChecking}
              className="w-full py-3.5 px-4 rounded-2xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-gray-950 font-bold text-sm tracking-wide flex items-center justify-center gap-2 shadow-lg shadow-amber-500/25 transition-all duration-150 active:scale-[0.98] disabled:opacity-75 disabled:cursor-not-allowed cursor-pointer"
            >
              <RefreshCw
                className={`w-4 h-4 text-gray-950 ${
                  isChecking ? 'animate-spin' : ''
                }`}
              />
              <span>
                {isChecking ? 'Checking Server Status...' : 'Check Server Status / Refresh'}
              </span>
            </button>

            {/* Result alert */}
            {checkResult && (
              <div
                className={`p-3 rounded-xl text-xs font-medium flex items-center gap-2 border transition-all animate-fadeIn ${
                  checkResult.success
                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                    : 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                }`}
              >
                {checkResult.success ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                ) : (
                  <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                )}
                <span>{checkResult.message}</span>
              </div>
            )}

            {/* Network and Last checked timestamp */}
            <div className="flex items-center justify-between text-[11px] text-gray-400 px-1 pt-1">
              <div className="flex items-center gap-1.5">
                {isOnline ? (
                  <>
                    <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Internet Connected</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="w-3.5 h-3.5 text-rose-400" />
                    <span className="text-rose-400">Offline</span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-1 text-gray-400">
                <Clock className="w-3 h-3 text-gray-400" />
                <span>
                  Last checked: {lastChecked.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer info */}
      <footer className="shrink-0 px-6 py-4 border-t border-white/5 safe-area-bottom">
        <div className="max-w-xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-center sm:text-left">
          <div className="flex items-center gap-2 text-[11px] text-gray-400">
            <Info className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <span>
              Store staff: Please contact your system administrator if urgent.
            </span>
          </div>
          <div className="text-[10px] text-gray-400 font-mono tracking-wider">
            STATUS 503 • POS v1.0.1
          </div>
        </div>
      </footer>
    </div>
  );
}
