import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ThermalLabelOptions } from '../lib/escpos';
import { renderLabelRaster } from '../lib/tspl';
import { ensureLabelFont } from '../lib/labelRaster';

interface LabelRasterPreviewProps {
  options: ThermalLabelOptions;
  width: number;
  height: number;
  className?: string;
}

export const LabelRasterPreview: React.FC<LabelRasterPreviewProps> = ({
  options,
  width,
  height,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [fontReady, setFontReady] = useState(false);
  const serializedOptions = JSON.stringify(options);

  useEffect(() => {
    let active = true;
    ensureLabelFont().then(() => {
      if (active) setFontReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const raster = renderLabelRaster(JSON.parse(serializedOptions) as ThermalLabelOptions);
    if (!raster) return;

    canvas.width = raster.widthDots;
    canvas.height = raster.heightDots;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const imageData = ctx.createImageData(raster.widthDots, raster.heightDots);
    const pixels = imageData.data;
    let offset = 0;

    for (let y = 0; y < raster.heightDots; y++) {
      const row = y * raster.widthBytes;
      for (let x = 0; x < raster.widthDots; x++) {
        const isBlack = raster.data[row + (x >> 3)] & (0x80 >> (x & 7));
        const value = isBlack ? 0 : 255;
        pixels[offset++] = value;
        pixels[offset++] = value;
        pixels[offset++] = value;
        pixels[offset++] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }, [serializedOptions, fontReady]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label="Label print preview"
      className={`block bg-white ${className}`}
      style={{
        width: `${width}px`,
        height: `${height}px`,
      }}
    />
  );
};

export default LabelRasterPreview;
