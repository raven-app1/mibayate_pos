import React, { useEffect, useRef } from 'react';
import { buildLabelRaster, TsplLabelOptions } from '../lib/tspl';

interface LabelRasterPreviewProps {
  options: TsplLabelOptions;
  widthMm: number;
  heightMm: number;
  scale: number;
  className?: string;
}

function devicePixelRatio(): number {
  if (typeof window === 'undefined' || !window.devicePixelRatio) return 1;
  return Math.min(window.devicePixelRatio, 3);
}

export const LabelRasterPreview: React.FC<LabelRasterPreviewProps> = ({
  options,
  widthMm,
  heightMm,
  scale,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dpr = devicePixelRatio();
  const widthPx = Math.max(1, Math.round(widthMm * scale));
  const heightPx = Math.max(1, Math.round(heightMm * scale));
  const signature = JSON.stringify(options);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const frame = requestAnimationFrame(() => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const raster = buildLabelRaster(options);
      const image = raster.image;
      if (!image) return;

      const offscreen = document.createElement('canvas');
      offscreen.width = raster.labelWidthDots;
      offscreen.height = raster.heightDots;
      const offscreenCtx = offscreen.getContext('2d');
      if (!offscreenCtx) return;

      const pixels = offscreenCtx.createImageData(offscreen.width, offscreen.height);
      const data = pixels.data;

      for (let y = 0; y < image.heightDots; y++) {
        const row = y * image.widthBytes;
        const targetY = image.yDots + y;
        if (targetY < 0 || targetY >= offscreen.height) continue;
        for (let x = 0; x < image.widthDots; x++) {
          if (!(image.data[row + (x >> 3)] & (0x80 >> (x & 7)))) continue;
          const targetX = image.xDots + x;
          if (targetX < 0 || targetX >= offscreen.width) continue;
          const index = (targetY * offscreen.width + targetX) * 4;
          data[index] = 0;
          data[index + 1] = 0;
          data[index + 2] = 0;
          data[index + 3] = 255;
        }
      }

      offscreenCtx.putImageData(pixels, 0, 0);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(offscreen, 0, 0, canvas.width, canvas.height);
    });

    return () => cancelAnimationFrame(frame);
  }, [signature]);

  return (
    <canvas
      ref={canvasRef}
      width={Math.round(widthPx * dpr)}
      height={Math.round(heightPx * dpr)}
      className={`absolute inset-0 block h-full w-full pointer-events-none ${className}`}
      aria-hidden="true"
    />
  );
};

export default LabelRasterPreview;
