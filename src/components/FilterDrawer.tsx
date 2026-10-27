import React, { useEffect, useState } from 'react';
import { useBackDismiss } from '../lib/backNavigation';
import { Filter, X, RotateCcw, Check } from 'lucide-react';

interface FilterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  activeCount?: number;
  onReset?: () => void;
  children: React.ReactNode;
}

export default function FilterDrawer({
  isOpen,
  onClose,
  title = 'Filters',
  subtitle = 'Refine search results & display',
  activeCount = 0,
  onReset,
  children
}: FilterDrawerProps) {
  useBackDismiss(isOpen, onClose);
  const [shouldRender, setShouldRender] = useState(isOpen);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    let animTimer: ReturnType<typeof setTimeout>;
    let renderTimer: ReturnType<typeof setTimeout>;

    if (isOpen) {
      setShouldRender(true);
      animTimer = setTimeout(() => setIsAnimating(true), 20);
    } else {
      setIsAnimating(false);
      renderTimer = setTimeout(() => setShouldRender(false), 260);
    }

    return () => {
      clearTimeout(animTimer);
      clearTimeout(renderTimer);
    };
  }, [isOpen]);

  if (!shouldRender && !isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden flex justify-end">
      <div
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className={`fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity duration-250 ease-out cursor-pointer ${
          isAnimating ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      />

      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative z-10 w-screen max-w-sm sm:max-w-md bg-white shadow-2xl flex flex-col h-full transform transition-transform duration-250 ease-out ${
          isAnimating ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-black text-white flex items-center justify-center shadow-xs">
              <Filter className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-sm text-slate-900 leading-tight">{title}</h3>
                {activeCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 text-[10px] font-black border border-slate-200">
                    {activeCount} active
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 font-medium">{subtitle}</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            aria-label="Close filters"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto android-scroll p-5 space-y-5">
          {children}
        </div>

        <div className="px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-slate-100 bg-slate-50/80 flex items-center gap-2.5 shrink-0">
          {onReset && (
            <button
              type="button"
              onClick={onReset}
              disabled={activeCount === 0}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 text-xs font-bold transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-black text-white hover:bg-gray-800 text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-98"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Apply Filters</span>
          </button>
        </div>
      </div>
    </div>
  );
}
