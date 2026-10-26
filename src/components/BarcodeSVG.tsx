import React from 'react';
import { CODE128_QUIET_MODULES, code128Elements } from '../lib/code128';

interface BarcodeSVGProps {
  value: string;
  width?: number;
  height?: number;
  showValue?: boolean;
  className?: string;
}

export const BarcodeSVG: React.FC<BarcodeSVGProps> = ({
  value,
  height = 50,
  showValue = true,
  className = '',
}) => {
  const cleanVal = (value || '000000').replace(/[^ -~]/g, '');
  const displayVal = cleanVal || '000000';
  const { elements, totalUnits } = code128Elements(displayVal);

  const quietZone = CODE128_QUIET_MODULES;
  const fullWidth = totalUnits + quietZone * 2;
  let currentX = quietZone;

  const rects: React.ReactNode[] = [];

  elements.forEach((el, idx) => {
    if (el.isBar) {
      rects.push(
        <rect
          key={idx}
          x={currentX}
          y={0}
          width={el.units}
          height={height}
          fill="#000000"
        />
      );
    }
    currentX += el.units;
  });

  return (
    <div className={`flex flex-col items-center select-none w-full h-full ${className}`}>
      <svg
        viewBox={`0 0 ${fullWidth} ${height}`}
        className="w-full h-full block"
        preserveAspectRatio="none"
      >
        {rects}
      </svg>
      {showValue && (
        <span className="font-mono text-[10px] sm:text-xs font-bold text-slate-800 tracking-widest mt-0.5">
          {displayVal}
        </span>
      )}
    </div>
  );
};

export default BarcodeSVG;

