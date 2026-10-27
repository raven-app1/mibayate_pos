import React, { useState, useEffect, useCallback } from 'react';
import {
  Printer, X, Search, CheckSquare, Square, Settings2,
  Tag, Bluetooth, BluetoothOff, Loader2, CheckCircle2, AlertCircle,
  Minus, Plus, Ruler, Scissors, Maximize2, Minimize2, ZoomIn, ZoomOut, RotateCcw,
  SlidersHorizontal, Store, Type, DollarSign, ChevronDown, ChevronUp,
} from 'lucide-react';
import { Product, LabelConfig } from '../types';
import LabelRasterPreview from './LabelRasterPreview';
import * as printerBridge from '../lib/printerBridge';
import { getPrintableMm } from '../lib/escpos';
import { buildTsplLabel, testPrintTspl, feedTspl, fontSizeToPt } from '../lib/tspl';
import { ensureLabelFont } from '../lib/labelRaster';
import { loadLabelConfig, saveLabelConfig, DEFAULT_LABEL_CONFIG, computeLabelOffsetMm } from '../lib/labelConfig';

interface BarcodePrintModalProps {
  products: Product[];
  isOpen: boolean;
  onClose: () => void;
  selectedProductId?: string | null;
  currencySymbol?: string;
  businessName?: string;
}

const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);
const parseMm = (v: string) => {
  const n = parseFloat(v);
  return isFinite(n) && n > 0 ? n : 0;
};

export const BarcodePrintModal: React.FC<BarcodePrintModalProps> = ({
  products,
  isOpen,
  onClose,
  selectedProductId,
  currencySymbol = 'Ks',
  businessName,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const [selectedProducts, setSelectedProducts] = useState<{ [id: string]: number }>(() => {
    const initialMap: { [id: string]: number } = {};
    if (selectedProductId) {
      const prod = products.find(p => p.id === selectedProductId);
      if (prod) initialMap[prod.id] = 1;
    } else {
      products.forEach(p => { initialMap[p.id] = 1; });
    }
    return initialMap;
  });

  const initialConfig = loadLabelConfig(businessName);
  const [storeName, setStoreName] = useState(initialConfig.storeName);
  const [showStoreName, setShowStoreName] = useState(initialConfig.showStoreName);
  const [showProductName, setShowProductName] = useState(initialConfig.showProductName);
  const [showPrice, setShowPrice] = useState(initialConfig.showPrice);
  const [showCodeText, setShowCodeText] = useState(initialConfig.showCodeText);

  const [paperMode, setPaperMode] = useState<'sticker' | 'receipt'>(initialConfig.paperMode);

  const [paperWidth, setPaperWidth] = useState(initialConfig.paperWidth);
  const [labelWidth, setLabelWidth] = useState(initialConfig.labelWidth);
  const [labelHeight, setLabelHeight] = useState(initialConfig.labelHeight);
  const [barcodeWidth, setBarcodeWidth] = useState(initialConfig.barcodeWidth);
  const [barcodeHeight, setBarcodeHeight] = useState(initialConfig.barcodeHeight);
  const [cutMode, setCutMode] = useState<'off' | 'full' | 'partial'>(initialConfig.cutMode);
  const [labelGap, setLabelGap] = useState(initialConfig.labelGap);
  const [feedOffset, setFeedOffset] = useState(initialConfig.feedOffset);
  const [labelAlign, setLabelAlign] = useState<LabelConfig['labelAlign']>(initialConfig.labelAlign);
  const [labelOffsetX, setLabelOffsetX] = useState(initialConfig.labelOffsetX);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoomFactor, setZoomFactor] = useState(1);

  const [layoutXY, setLayoutXY] = useState<{
    store: { x: string; y: string; w?: string; h?: string };
    product: { x: string; y: string; w?: string; h?: string };
    barcode: { x: string; y: string; w?: string; h?: string };
    price: { x: string; y: string; w?: string; h?: string };
  }>(initialConfig.layoutXY);

  const [fontSize, setFontSize] = useState<{ store: number; product: number; price: number }>(initialConfig.fontSize);
  const [showPositionControls, setShowPositionControls] = useState(false);

  useEffect(() => {
    if (isOpen) {
      const cfg = loadLabelConfig(businessName);
      setStoreName(cfg.storeName);
      setShowStoreName(cfg.showStoreName);
      setShowProductName(cfg.showProductName);
      setShowPrice(cfg.showPrice);
      setShowCodeText(cfg.showCodeText);
      setPaperMode(cfg.paperMode);
      setPaperWidth(cfg.paperWidth);
      setLabelWidth(cfg.labelWidth);
      setLabelHeight(cfg.labelHeight);
      setBarcodeWidth(cfg.barcodeWidth);
      setBarcodeHeight(cfg.barcodeHeight);
      setCutMode(cfg.cutMode);
      setLabelGap(cfg.labelGap);
      setFeedOffset(cfg.feedOffset);
      setLabelAlign(cfg.labelAlign);
      setLabelOffsetX(cfg.labelOffsetX);
      setLayoutXY(cfg.layoutXY);
      setFontSize(cfg.fontSize);
    }
  }, [isOpen, businessName]);

  const updateConfig = useCallback((updater: (prev: ReturnType<typeof loadLabelConfig>) => ReturnType<typeof loadLabelConfig>) => {
    const current = loadLabelConfig(businessName);
    const next = updater({
      ...current,
      paperMode,
      paperWidth,
      labelWidth,
      labelHeight,
      barcodeWidth,
      barcodeHeight,
      cutMode,
      labelGap,
      feedOffset,
      labelAlign,
      labelOffsetX,
      showStoreName,
      showProductName,
      showPrice,
      showCodeText,
      storeName,
      layoutXY,
      fontSize,
    });
    setStoreName(next.storeName);
    setShowStoreName(next.showStoreName);
    setShowProductName(next.showProductName);
    setShowPrice(next.showPrice);
    setShowCodeText(next.showCodeText);
    setPaperMode(next.paperMode);
    setPaperWidth(next.paperWidth);
    setLabelWidth(next.labelWidth);
    setLabelHeight(next.labelHeight);
    setBarcodeWidth(next.barcodeWidth);
    setBarcodeHeight(next.barcodeHeight);
    setCutMode(next.cutMode);
    setLabelGap(next.labelGap);
    setFeedOffset(next.feedOffset);
    setLabelAlign(next.labelAlign);
    setLabelOffsetX(next.labelOffsetX);
    setLayoutXY(next.layoutXY);
    setFontSize(next.fontSize);
    saveLabelConfig(next);
  }, [paperMode, paperWidth, labelWidth, labelHeight, barcodeWidth, barcodeHeight, cutMode, labelGap, feedOffset, labelAlign, labelOffsetX, showStoreName, showProductName, showPrice, showCodeText, storeName, layoutXY, fontSize, businessName]);

  const handleResetElementSizes = () => {
    updateConfig(p => ({
      ...p,
      barcodeWidth: DEFAULT_LABEL_CONFIG.barcodeWidth,
      barcodeHeight: DEFAULT_LABEL_CONFIG.barcodeHeight,
      layoutXY: {
        ...p.layoutXY,
        store: { ...p.layoutXY.store, w: DEFAULT_LABEL_CONFIG.layoutXY.store.w, h: DEFAULT_LABEL_CONFIG.layoutXY.store.h },
        product: { ...p.layoutXY.product, w: DEFAULT_LABEL_CONFIG.layoutXY.product.w, h: DEFAULT_LABEL_CONFIG.layoutXY.product.h },
        barcode: { ...p.layoutXY.barcode, w: DEFAULT_LABEL_CONFIG.layoutXY.barcode.w, h: DEFAULT_LABEL_CONFIG.layoutXY.barcode.h },
        price: { ...p.layoutXY.price, w: DEFAULT_LABEL_CONFIG.layoutXY.price.w, h: DEFAULT_LABEL_CONFIG.layoutXY.price.h },
      },
      fontSize: { ...DEFAULT_LABEL_CONFIG.fontSize },
    }));
  };

  const isNative = printerBridge.isNativeShell();
  const [btAvailable] = useState(() => printerBridge.isBluetoothAvailable());
  const [btConnected, setBtConnected] = useState(() => printerBridge.isConnected());
  const [printerName, setPrinterName] = useState(() => printerBridge.getDeviceName());
  const [btConnecting, setBtConnecting] = useState(false);
  const [btPrinting, setBtPrinting] = useState(false);
  const [btProgress, setBtProgress] = useState({ current: 0, total: 0 });
  const [btError, setBtError] = useState<string | null>(null);
  const [pairedDevices, setPairedDevices] = useState<printerBridge.PairedPrinter[]>([]);
  const [selectedAddress, setSelectedAddress] = useState('');

  const effPaperWidth = clamp(parseMm(paperWidth) || 72, 15, 300);
  const printableMm = getPrintableMm(effPaperWidth);
  const effLabelWidth = clamp(parseMm(labelWidth) || effPaperWidth, 5, effPaperWidth);
  const effLabelHeight = clamp(parseMm(labelHeight) || 20, 8, 300);

  const effElemX = (k: 'store' | 'product' | 'barcode' | 'price') =>
    clamp(parseMm(layoutXY[k].x) || 0, 0, Math.max(0, effLabelWidth - 5));

  const effElemY = (k: 'store' | 'product' | 'barcode' | 'price') =>
    clamp(parseMm(layoutXY[k].y) || 0, 0, Math.max(0, effLabelHeight - 3));

  const effElemW = (k: 'store' | 'product' | 'barcode' | 'price') => {
    const rawStr = layoutXY[k]?.w;
    if (rawStr !== undefined && rawStr !== '') {
      const n = parseFloat(rawStr);
      if (isFinite(n)) {
        return clamp(n, 1, Math.max(1, effLabelWidth - effElemX(k)));
      }
      return 1;
    }
    const defaultW = k === 'barcode' ? (parseMm(barcodeWidth) || Math.max(10, effLabelWidth - 4)) : Math.max(1, effLabelWidth - effElemX(k));
    return clamp(defaultW, 1, Math.max(1, effLabelWidth - effElemX(k)));
  };

  const effElemH = (k: 'store' | 'product' | 'barcode' | 'price') => {
    const rawStr = layoutXY[k]?.h;
    if (rawStr !== undefined && rawStr !== '') {
      const n = parseFloat(rawStr);
      if (isFinite(n)) {
        return clamp(n, 1, Math.max(1, effLabelHeight - effElemY(k)));
      }
      return 1;
    }
    const defaultH = k === 'barcode' ? (parseMm(barcodeHeight) || 10) : (k === 'price' ? 5 : 4);
    return clamp(defaultH, 1, Math.max(1, effLabelHeight - effElemY(k)));
  };

  const effBarcodeWidth = effElemW('barcode');
  const effBarcodeHeight = effElemH('barcode');
  const effBarcodeX = effElemX('barcode');
  const effBarcodeY = effElemY('barcode');

  const effLabelGap = clamp(parseMm(labelGap) || 3, 2, 10);
  const effFeedOffset = clamp(parseMm(feedOffset) || 0, -10, 10);
  const effLabelOffsetMm = computeLabelOffsetMm({ paperWidth, labelWidth, labelAlign, labelOffsetX });
  const [viewportSize, setViewportSize] = useState({
    w: typeof window !== 'undefined' ? window.innerWidth : 375,
    h: typeof window !== 'undefined' ? window.innerHeight : 667,
  });

  useEffect(() => {
    const handleResize = () => {
      setViewportSize({ w: window.innerWidth, h: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isMobile = viewportSize.w < 768;

  const maxCanvasW = isFullscreen
    ? (isMobile ? viewportSize.w - 20 : viewportSize.w - 80)
    : (isMobile ? Math.min(viewportSize.w - 48, 340) : 340);

  const maxCanvasH = isFullscreen
    ? (isMobile ? viewportSize.h - 130 : viewportSize.h - 160)
    : 300;

  const basePreviewScale = Math.min(
    maxCanvasW / effLabelWidth,
    maxCanvasH / effLabelHeight,
    isFullscreen ? (isMobile ? 18 : 22) : 8
  );

  const previewScale = Math.max(0.5, basePreviewScale * zoomFactor);
  const previewW = Math.round(effLabelWidth * previewScale);
  const previewH = Math.round(effLabelHeight * previewScale);

  useEffect(() => {
    if (!isOpen) return;
    if (isNative) {
      printerBridge.getPairedPrinters().then(devs => {
        setPairedDevices(devs);
        if (devs.length > 0) setSelectedAddress(devs[0].address);
      }).catch(() => {});
    }
    printerBridge.onDisconnect(() => {
      setBtConnected(false);
      setPrinterName('');
    });
    return () => {
      printerBridge.offDisconnect();
    };
  }, [isOpen, isNative]);

  useEffect(() => {
    if (!isFullscreen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullscreen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  const handleConnectPrinter = useCallback(async () => {
    if (btConnecting) return;
    setBtError(null);
    setBtConnecting(true);
    try {
      const device = pairedDevices.find(d => d.address === selectedAddress);
      const name = await printerBridge.connect(device);
      setBtConnected(true);
      setPrinterName(name);
      setBtError(null);
    } catch (err: any) {
      if (err?.name !== 'NotFoundError') {
        setBtError(err?.message || 'Failed to connect to printer');
      }
    } finally {
      setBtConnecting(false);
    }
  }, [btConnecting, pairedDevices, selectedAddress]);

  const handleDisconnectPrinter = useCallback(async () => {
    await printerBridge.disconnect();
    setBtConnected(false);
    setPrinterName('');
  }, []);

  const handleZoomIn = () => setZoomFactor(prev => Math.min(3, Math.round((prev + 0.25) * 100) / 100));
  const handleZoomOut = () => setZoomFactor(prev => Math.max(0.5, Math.round((prev - 0.25) * 100) / 100));
  const handleResetZoom = () => setZoomFactor(1);

  const layoutForPrint = {
    storeName: showStoreName ? { xMm: effElemX('store'), yMm: effElemY('store'), size: fontSize.store } : undefined,
    productName: showProductName ? { xMm: effElemX('product'), yMm: effElemY('product'), size: fontSize.product } : undefined,
    barcode: { xMm: effBarcodeX, yMm: effBarcodeY, widthMm: effBarcodeWidth, heightMm: effBarcodeHeight },
    price: showPrice ? { xMm: effElemX('price'), yMm: effElemY('price'), size: fontSize.price } : undefined,
  };

  const printItemsList: Array<{ product: Product; labelIndex: number }> = [];
  Object.entries(selectedProducts).forEach(([prodId, rawQty]) => {
    const qty = Number(rawQty) || 0;
    const prod = products.find(p => p.id === prodId);
    if (prod && qty > 0) {
      for (let i = 0; i < qty; i++) {
        printItemsList.push({ product: prod, labelIndex: i + 1 });
      }
    }
  });

  const labelOptionsFor = (product: Product) => ({
    storeName,
    productName: product.name,
    barcodeValue: product.barcode || product.sku || '000000',
    price: product.price,
    showStoreName,
    showProductName,
    showPrice,
    showBarcodeText: showCodeText,
    currencySymbol,
    paperWidthMm: effPaperWidth,
    labelWidthMm: effLabelWidth,
    labelHeightMm: effLabelHeight,
    barcodeType: 'CODE128' as const,
    barcodeWidthMm: effBarcodeWidth,
    barcodeHeightMm: effBarcodeHeight,
    cutMode: paperMode === 'sticker' ? ('off' as const) : cutMode,
    paperMode,
    labelGapMm: effLabelGap,
    feedOffsetMm: effFeedOffset,
    labelOffsetMm: effLabelOffsetMm,
    dotsPerMm: 8,
    layout: layoutForPrint,
  });

  const handleBtPrint = useCallback(async () => {
    if (!printerBridge.isConnected() || printItemsList.length === 0 || btPrinting) return;

    setBtPrinting(true);
    setBtError(null);
    setBtProgress({ current: 0, total: printItemsList.length });

    try {
      await ensureLabelFont();
      await new Promise(r => setTimeout(r, 400));

      for (let i = 0; i < printItemsList.length; i++) {
        const item = printItemsList[i];
        await printerBridge.send(buildTsplLabel({ ...labelOptionsFor(item.product), copies: 1 }));
        setBtProgress({ current: i + 1, total: printItemsList.length });
        if (i < printItemsList.length - 1) {
          await new Promise(r => setTimeout(r, 150));
        }
      }
    } catch (err: any) {
      setBtError(err?.message || 'Print failed. Check printer connection.');
      if (!printerBridge.isConnected()) {
        setBtConnected(false);
        setPrinterName('');
      }
    } finally {
      setBtPrinting(false);
      setBtProgress({ current: 0, total: 0 });
    }
  }, [printItemsList, labelOptionsFor, btPrinting]);

  const handleTestPrint = useCallback(async () => {
    if (!printerBridge.isConnected() || btPrinting) return;
    setBtError(null);
    try {
      await ensureLabelFont();
      await printerBridge.send(
        testPrintTspl(storeName || businessName || 'My Store', effLabelWidth, effLabelHeight, effLabelGap)
      );
    } catch (err: any) {
      setBtError(err?.message || 'Test print failed');
    }
  }, [btPrinting, storeName, businessName, effLabelWidth, effLabelHeight, effLabelGap]);

  const handleFeedAlign = useCallback(async () => {
    if (!printerBridge.isConnected() || btPrinting) return;
    setBtError(null);
    try {
      await printerBridge.send(feedTspl());
    } catch (err: any) {
      setBtError(err?.message || 'Feed failed');
    }
  }, [btPrinting]);

  if (!isOpen) return null;

  const filteredProducts = products.filter(p => {
    if (!p) return false;
    const q = (searchTerm || '').toLowerCase();
    return (p.name || '').toLowerCase().includes(q) ||
           (p.sku || '').toLowerCase().includes(q) ||
           (p.barcode || '').toLowerCase().includes(q);
  });

  const toggleSelectProduct = (id: string) => {
    setSelectedProducts(prev => {
      const copy = { ...prev };
      if (copy[id] !== undefined) {
        delete copy[id];
      } else {
        copy[id] = 1;
      }
      return copy;
    });
  };

  const setAllQuantities = (mode: 'one' | 'stock') => {
    const newMap: { [id: string]: number } = {};
    products.forEach(p => {
      newMap[p.id] = mode === 'stock' ? Math.max(1, p.stock) : 1;
    });
    setSelectedProducts(newMap);
  };

  const selectAll = () => {
    const newMap: { [id: string]: number } = {};
    products.forEach(p => {
      newMap[p.id] = selectedProducts[p.id] || 1;
    });
    setSelectedProducts(newMap);
  };

  const deselectAll = () => setSelectedProducts({});

  const updateQuantity = (id: string, qty: number) => {
    if (qty <= 0) {
      setSelectedProducts(prev => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
    } else {
      setSelectedProducts(prev => ({ ...prev, [id]: qty }));
    }
  };

  const totalLabels = printItemsList.length;

  const numInputClass = "w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:border-gray-900";
  const segBtn = (active: boolean) =>
    `flex-1 px-2 py-1.5 rounded-lg border font-bold text-[11px] transition-all text-center cursor-pointer ${
      active
        ? 'bg-gray-50 border-gray-900 text-gray-900 shadow-2xs'
        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
    }`;
  const miniSegBtn = (active: boolean) =>
    `flex-1 py-1.5 px-2 rounded-lg border font-bold text-xs transition-all text-center cursor-pointer ${
      active
        ? 'bg-black text-white border-black shadow-xs'
        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
    }`;

  const ToggleSwitch: React.FC<{
    checked: boolean;
    onChange: (val: boolean) => void;
    title?: string;
  }> = ({ checked, onChange, title }) => (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`w-8 h-4.5 flex items-center rounded-full p-0.5 transition-colors cursor-pointer shrink-0 ${
        checked ? 'bg-black' : 'bg-slate-300'
      }`}
      title={title}
    >
      <div
        className={`bg-white w-3.5 h-3.5 rounded-full shadow-xs transform transition-transform ${
          checked ? 'translate-x-3.5' : 'translate-x-0'
        }`}
      />
    </button>
  );

  const FontSizeControl: React.FC<{
    label?: string;
    value: number;
    onChange: (val: number) => void;
    min?: number;
    max?: number;
  }> = ({ label = 'Font Size', value, onChange, min = 6, max = 36 }) => {
    const currentPt = fontSizeToPt(value);
    const presets = [8, 10, 11, 12, 14, 16, 18, 20];

    return (
      <div className="space-y-1.5">
        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">
          {label}
        </label>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onChange(Math.max(min, currentPt - 1))}
            disabled={currentPt <= min}
            className="w-7 h-7 flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold text-xs cursor-pointer disabled:opacity-30 transition-colors shrink-0"
            title="Decrease font size"
          >
            <Minus className="w-3 h-3" />
          </button>
          <div className="flex-1 relative">
            <input
              type="number"
              min={min}
              max={max}
              step={1}
              value={currentPt}
              onChange={e => {
                const n = parseInt(e.target.value, 10);
                if (isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
              }}
              className="w-full text-center py-1 px-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold font-mono text-slate-800 focus:outline-none focus:border-gray-900"
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-slate-400 pointer-events-none">
              pt
            </span>
          </div>
          <button
            type="button"
            onClick={() => onChange(Math.min(max, currentPt + 1))}
            disabled={currentPt >= max}
            className="w-7 h-7 flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold text-xs cursor-pointer disabled:opacity-30 transition-colors shrink-0"
            title="Increase font size"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
        <div className="flex gap-1 overflow-x-auto scrollbar-none pt-0.5">
          {presets.map(pt => (
            <button
              key={pt}
              type="button"
              onClick={() => onChange(pt)}
              className={`px-1.5 py-0.5 rounded text-[9px] font-bold transition-all cursor-pointer shrink-0 font-mono ${
                currentPt === pt
                  ? 'bg-black text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {pt}pt
            </button>
          ))}
        </div>
      </div>
    );
  };

  const renderSingleLabelCard = (productItem: Product) => (
    <LabelRasterPreview
      options={labelOptionsFor(productItem)}
      width={previewW}
      height={previewH}
      className="border border-slate-400 rounded shadow-xs"
    />
  );

  return (
    <div className="fixed inset-0 bg-slate-900/70 z-50 flex items-center justify-center p-2 sm:p-4 backdrop-blur-xs transition-opacity animate-fade-in">
      
      {/* Fullscreen Overlay */}
      {isFullscreen && (
        <div className="fixed inset-0 z-50 bg-slate-950/95 text-white flex flex-col p-4 sm:p-6 backdrop-blur-md overflow-hidden animate-fade-in">
          <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-800">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-white text-black rounded-xl">
                <Tag className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-white text-sm sm:text-base">
                  Fullscreen Label Print Preview
                </h3>
                <p className="text-xs text-slate-400 font-medium">
                  {effLabelWidth.toFixed(0)} × {effLabelHeight.toFixed(0)}mm · CODE 128
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <div className="flex items-center space-x-1 bg-slate-800 p-1 rounded-xl border border-slate-700 text-xs">
                <button
                  onClick={handleZoomOut}
                  disabled={zoomFactor <= 0.5}
                  className="p-1.5 text-slate-300 hover:text-white disabled:opacity-30 cursor-pointer"
                  title="Zoom Out (-25%)"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <button
                  onClick={handleResetZoom}
                  className="px-2 py-1 text-xs font-extrabold text-white hover:bg-slate-700 rounded-lg cursor-pointer font-mono"
                  title="Reset Zoom (100%)"
                >
                  {Math.round(zoomFactor * 100)}%
                </button>
                <button
                  onClick={handleZoomIn}
                  disabled={zoomFactor >= 3}
                  className="p-1.5 text-slate-300 hover:text-white disabled:opacity-30 cursor-pointer"
                  title="Zoom In (+25%)"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
                <button
                  onClick={handleResetZoom}
                  className="p-1.5 text-slate-400 hover:text-white cursor-pointer"
                  title="Reset Zoom Scale"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>

              <button
                onClick={() => setIsFullscreen(false)}
                className="px-3.5 py-1.5 bg-white text-black font-extrabold text-xs rounded-xl shadow-xs hover:bg-slate-200 transition-colors flex items-center space-x-1.5 cursor-pointer"
              >
                <Minimize2 className="w-4 h-4" />
                <span>Exit Fullscreen</span>
              </button>
            </div>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center overflow-auto p-8 my-4 bg-slate-900/60 rounded-2xl border border-slate-800 shadow-2xl relative select-none">
            {printItemsList.length > 0 ? (
              renderSingleLabelCard(printItemsList[0].product)
            ) : (
              <div className="text-center text-slate-400 text-xs">No product selected</div>
            )}
          </div>

          <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <div className="flex items-center space-x-4 font-mono">
              <span>Store: {effElemX('store').toFixed(1)},{effElemY('store').toFixed(1)}mm ({effElemW('store').toFixed(1)}×{effElemH('store').toFixed(1)}mm)</span>
              <span>Product: {effElemX('product').toFixed(1)},{effElemY('product').toFixed(1)}mm ({effElemW('product').toFixed(1)}×{effElemH('product').toFixed(1)}mm)</span>
              <span>Barcode: {effBarcodeX.toFixed(1)},{effBarcodeY.toFixed(1)}mm ({effBarcodeWidth.toFixed(1)}×{effBarcodeHeight.toFixed(1)}mm)</span>
              <span>Price: {effElemX('price').toFixed(1)},{effElemY('price').toFixed(1)}mm ({effElemW('price').toFixed(1)}×{effElemH('price').toFixed(1)}mm)</span>
            </div>
            <span>Press <kbd className="bg-slate-800 px-1.5 py-0.5 rounded text-white font-mono">ESC</kbd> to exit fullscreen</span>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden">

        {/* MODAL HEADER */}
        <div className="p-4 sm:p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50/80">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-black text-white rounded-xl shadow-xs">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-sm sm:text-base">
                Barcode Label Generator
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Print sticker labels to a Bluetooth thermal printer (CODE 128)
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {btAvailable && (
              <div className="flex items-center space-x-1.5 mr-1">
                {btConnected ? (
                  <>
                    <div className="flex items-center space-x-1 px-2 py-1 bg-gray-50 border border-gray-200 rounded-lg text-[10px] font-bold text-gray-900">
                      <CheckCircle2 className="w-3 h-3" />
                      <span className="max-w-[100px] truncate">{printerName}</span>
                    </div>
                    <button
                      onClick={handleDisconnectPrinter}
                      className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                      title="Disconnect printer"
                    >
                      <BluetoothOff className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <>
                    {isNative && pairedDevices.length > 0 && (
                      <select
                        value={selectedAddress}
                        onChange={(e) => setSelectedAddress(e.target.value)}
                        className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-semibold text-slate-800 focus:outline-none focus:border-gray-900 max-w-[140px] cursor-pointer"
                      >
                        {pairedDevices.map(d => (
                          <option key={d.address} value={d.address}>{d.name}</option>
                        ))}
                      </select>
                    )}
                    <button
                      onClick={handleConnectPrinter}
                      disabled={btConnecting}
                      className="px-2.5 py-1.5 bg-black hover:bg-gray-800 text-white font-bold text-[10px] rounded-lg shadow-xs transition-all flex items-center space-x-1 disabled:opacity-50 cursor-pointer"
                    >
                      {btConnecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Bluetooth className="w-3 h-3" />}
                      <span>{btConnecting ? 'Connecting...' : 'Connect Printer'}</span>
                    </button>
                  </>
                )}
              </div>
            )}

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* MODAL BODY */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">

          {/* LEFT PANEL */}
          <div className="lg:col-span-5 flex flex-col overflow-y-auto p-4 space-y-4 bg-slate-50/50">

             {/* LABEL SIZE (MM) */}
             <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
               <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                 <Ruler className="w-4 h-4 text-gray-900" />
                 <span>Label Size (Set by Number)</span>
                 <span className="text-[10px] font-semibold text-slate-400">({printableMm}mm printable)</span>
               </div>

               <div>
                 <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                   Paper Type
                 </label>
                 <div className="flex gap-1.5 text-xs">
                   <button onClick={() => setPaperMode('sticker')} className={segBtn(paperMode === 'sticker')}>
                     <span className="inline-flex items-center justify-center gap-1"><Tag className="w-3 h-3" />Sticker Labels</span>
                   </button>
                   <button onClick={() => setPaperMode('receipt')} className={segBtn(paperMode === 'receipt')}>
                     <span className="inline-flex items-center justify-center gap-1"><Printer className="w-3 h-3" />Receipt Roll</span>
                   </button>
                 </div>
               </div>

               <div className="grid grid-cols-3 gap-2">
                 <div>
                   <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                     Paper W (mm)
                   </label>
                   <input type="number" min={15} max={300} value={paperWidth}
                     onChange={e => setPaperWidth(e.target.value)} className={numInputClass} />
                 </div>
                 <div>
                   <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                     Label W (mm)
                   </label>
                   <input type="number" min={5} max={300} value={labelWidth}
                     onChange={e => setLabelWidth(e.target.value)} className={numInputClass} />
                 </div>
                 <div>
                   <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                     Label H (mm)
                   </label>
                   <input type="number" min={8} max={300} value={labelHeight}
                     onChange={e => setLabelHeight(e.target.value)} className={numInputClass} />
                 </div>
               </div>

               {paperMode === 'sticker' && (
                 <div className="grid grid-cols-2 gap-2">
                   <div>
                     <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                       Label Gap (mm)
                     </label>
                     <input type="number" min={2} max={10} step={0.5} value={labelGap}
                       onChange={e => setLabelGap(e.target.value)} className={numInputClass} />
                   </div>
                   <div>
                     <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                       Feed Offset (mm)
                     </label>
                     <input type="number" min={-10} max={10} step={0.5} value={feedOffset}
                       onChange={e => setFeedOffset(e.target.value)} className={numInputClass} />
                   </div>
                 </div>
               )}

               <div>
                 <div className="flex items-center justify-between gap-2 mt-1.5">
                   <span className="text-[10px] font-bold text-slate-600">Alignment: Left ({effLabelOffsetMm.toFixed(1)} mm offset)</span>
                   <div className="flex items-center gap-1">
                     <span className="text-[10px] font-bold text-slate-500">Nudge</span>
                     <input type="number" min={-20} max={20} step={0.5} value={labelOffsetX}
                       onChange={e => updateConfig(p => ({ ...p, labelOffsetX: e.target.value }))}
                       className="w-16 px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:border-gray-900" />
                   </div>
                 </div>
               </div>
             </div>

             {/* LABEL DESIGN */}
             <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-3">
               <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                 <Settings2 className="w-4 h-4 text-gray-900" />
                 <span>Label Design & Format</span>
               </div>

               <div>
                 <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                   Store / Header Text
                 </label>
                 <input
                   type="text"
                   value={storeName}
                   onChange={e => setStoreName(e.target.value)}
                   placeholder="Store or Branch Name"
                   className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:border-gray-900"
                 />
               </div>

               <div className="grid grid-cols-2 gap-2 text-[11px] font-medium text-slate-700">
                 <label className="flex items-center space-x-2 cursor-pointer">
                   <input type="checkbox" checked={showStoreName} onChange={e => setShowStoreName(e.target.checked)} className="rounded text-gray-900 focus:ring-black/20" />
                   <span>Store Name</span>
                 </label>
                 <label className="flex items-center space-x-2 cursor-pointer">
                   <input type="checkbox" checked={showProductName} onChange={e => setShowProductName(e.target.checked)} className="rounded text-gray-900 focus:ring-black/20" />
                   <span>Product Title</span>
                 </label>
                 <label className="flex items-center space-x-2 cursor-pointer">
                   <input type="checkbox" checked={showPrice} onChange={e => setShowPrice(e.target.checked)} className="rounded text-gray-900 focus:ring-black/20" />
                   <span>Selling Price</span>
                 </label>
                 <label className="flex items-center space-x-2 cursor-pointer">
                   <input type="checkbox" checked={showCodeText} onChange={e => setShowCodeText(e.target.checked)} className="rounded text-gray-900 focus:ring-black/20" />
                   <span>SKU / BC Text</span>
                 </label>
               </div>

               <div className="grid grid-cols-2 gap-2">
                 <div className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                   <span className="text-[10px] font-bold text-slate-700">Barcode Format</span>
                   <span className="font-mono bg-black text-white px-2 py-0.5 rounded text-[10px] font-bold">CODE 128</span>
                 </div>
                 {paperMode === 'receipt' && (
                   <div>
                     <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                       Cut Mode
                     </label>
                     <div className="flex gap-1.5 text-xs">
                       <button onClick={() => setCutMode('off')} className={segBtn(cutMode === 'off')}>
                         <span className="inline-flex items-center justify-center gap-1"><Scissors className="w-3 h-3" />Off</span>
                       </button>
                       <button onClick={() => setCutMode('partial')} className={segBtn(cutMode === 'partial')}>
                         <span className="inline-flex items-center justify-center gap-1"><Scissors className="w-3 h-3" />Partial</span>
                       </button>
                       <button onClick={() => setCutMode('full')} className={segBtn(cutMode === 'full')}>
                         <span className="inline-flex items-center justify-center gap-1"><Scissors className="w-3 h-3" />Full</span>
                       </button>
                     </div>
                   </div>
                 )}
               </div>

               {/* Element Sizing & Font Sizes */}
               <div className="border border-slate-200 rounded-xl p-3 bg-white space-y-3">
                 <div className="flex items-center justify-between">
                   <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                     <SlidersHorizontal className="w-4 h-4 text-gray-900" />
                     <span>Element Sizing & Font Sizes</span>
                   </div>
                   <button
                     type="button"
                     onClick={handleResetElementSizes}
                     className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 hover:text-black hover:bg-slate-100 px-2 py-0.5 rounded transition-colors cursor-pointer"
                     title="Reset element dimensions and font sizes to defaults"
                   >
                     <RotateCcw className="w-3 h-3" />
                     <span>Reset</span>
                   </button>
                 </div>

                 <div className="space-y-2.5">
                   {/* Store Name */}
                   <div className="bg-slate-50/70 p-2.5 rounded-lg border border-slate-200/80 space-y-2">
                     <div className="flex items-center justify-between">
                       <div className="flex items-center gap-1.5">
                         <Store className="w-3.5 h-3.5 text-slate-700" />
                         <span className="font-bold text-[11px] text-slate-900">Store Name</span>
                       </div>
                       <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${showStoreName ? 'bg-black text-white' : 'bg-slate-200 text-slate-500'}`}>
                         {showStoreName ? 'Active' : 'Hidden'}
                       </span>
                     </div>

                     <FontSizeControl
                       value={fontSize.store ?? 12}
                       onChange={val => {
                         setFontSize(prev => ({ ...prev, store: val }));
                         updateConfig(p => ({ ...p, fontSize: { ...p.fontSize, store: val } }));
                       }}
                     />

                     <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200/60">
                       <div>
                         <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">X Pos (mm)</label>
                         <input
                           type="number"
                           step={0.5}
                           min={0}
                           max={Math.max(0, effLabelWidth - 1)}
                           value={layoutXY.store.x ?? '0'}
                           onChange={e => {
                             const v = e.target.value;
                             setLayoutXY(prev => ({ ...prev, store: { ...prev.store, x: v } }));
                             updateConfig(p => ({ ...p, layoutXY: { ...p.layoutXY, store: { ...p.layoutXY.store, x: v } } }));
                           }}
                           className={numInputClass}
                         />
                       </div>
                       <div>
                         <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Y Pos (mm)</label>
                         <input
                           type="number"
                           step={0.5}
                           min={0}
                           max={Math.max(0, effLabelHeight - 1)}
                           value={layoutXY.store.y ?? '1'}
                           onChange={e => {
                             const v = e.target.value;
                             setLayoutXY(prev => ({ ...prev, store: { ...prev.store, y: v } }));
                             updateConfig(p => ({ ...p, layoutXY: { ...p.layoutXY, store: { ...p.layoutXY.store, y: v } } }));
                           }}
                           className={numInputClass}
                         />
                       </div>
                     </div>
                   </div>

                   {/* Product Title */}
                   <div className="bg-slate-50/70 p-2.5 rounded-lg border border-slate-200/80 space-y-2">
                     <div className="flex items-center justify-between">
                       <div className="flex items-center gap-1.5">
                         <Tag className="w-3.5 h-3.5 text-slate-700" />
                         <span className="font-bold text-[11px] text-slate-900">Product Title</span>
                       </div>
                       <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${showProductName ? 'bg-black text-white' : 'bg-slate-200 text-slate-500'}`}>
                         {showProductName ? 'Active' : 'Hidden'}
                       </span>
                     </div>

                     <FontSizeControl
                       value={fontSize.product ?? 10}
                       onChange={val => {
                         setFontSize(prev => ({ ...prev, product: val }));
                         updateConfig(p => ({ ...p, fontSize: { ...p.fontSize, product: val } }));
                       }}
                     />

                     <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200/60">
                       <div>
                         <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">X Pos (mm)</label>
                         <input
                           type="number"
                           step={0.5}
                           min={0}
                           max={Math.max(0, effLabelWidth - 1)}
                           value={layoutXY.product.x ?? '0'}
                           onChange={e => {
                             const v = e.target.value;
                             setLayoutXY(prev => ({ ...prev, product: { ...prev.product, x: v } }));
                             updateConfig(p => ({ ...p, layoutXY: { ...p.layoutXY, product: { ...p.layoutXY.product, x: v } } }));
                           }}
                           className={numInputClass}
                         />
                       </div>
                       <div>
                         <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Y Pos (mm)</label>
                         <input
                           type="number"
                           step={0.5}
                           min={0}
                           max={Math.max(0, effLabelHeight - 1)}
                           value={layoutXY.product.y ?? '3.5'}
                           onChange={e => {
                             const v = e.target.value;
                             setLayoutXY(prev => ({ ...prev, product: { ...prev.product, y: v } }));
                             updateConfig(p => ({ ...p, layoutXY: { ...p.layoutXY, product: { ...p.layoutXY.product, y: v } } }));
                           }}
                           className={numInputClass}
                         />
                       </div>
                     </div>
                   </div>

                   {/* Barcode Box */}
                   <div className="bg-slate-50/70 p-2.5 rounded-lg border border-slate-200/80 space-y-2">
                     <div className="flex items-center justify-between">
                       <div className="flex items-center gap-1.5">
                         <Type className="w-3.5 h-3.5 text-slate-700" />
                         <span className="font-bold text-[11px] text-slate-900">Barcode Box</span>
                       </div>
                       <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-black text-white font-mono">
                         CODE 128
                       </span>
                     </div>

                     <div className="grid grid-cols-2 gap-2 items-end">
                       <div>
                         <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">Barcode Width (mm)</label>
                         <input
                           type="number"
                           step={0.5}
                           min={10}
                           max={effLabelWidth}
                           value={barcodeWidth !== undefined ? barcodeWidth : effBarcodeWidth.toFixed(1)}
                           onChange={e => {
                             const v = e.target.value;
                             setBarcodeWidth(v);
                             setLayoutXY(prev => ({ ...prev, barcode: { ...prev.barcode, w: v } }));
                             updateConfig(p => ({ ...p, barcodeWidth: v, layoutXY: { ...p.layoutXY, barcode: { ...p.layoutXY.barcode, w: v } } }));
                           }}
                           className={numInputClass}
                         />
                       </div>
                       <div>
                         <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">Barcode Height (mm)</label>
                         <input
                           type="number"
                           step={0.5}
                           min={4}
                           max={effLabelHeight}
                           value={barcodeHeight}
                           onChange={e => {
                             const v = e.target.value;
                             setBarcodeHeight(v);
                             setLayoutXY(prev => ({ ...prev, barcode: { ...prev.barcode, h: v } }));
                             updateConfig(p => ({ ...p, barcodeHeight: v, layoutXY: { ...p.layoutXY, barcode: { ...p.layoutXY.barcode, h: v } } }));
                           }}
                           className={numInputClass}
                         />
                       </div>
                     </div>

                     <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200/60">
                       <div>
                         <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">X Pos (mm)</label>
                         <input
                           type="number"
                           step={0.5}
                           min={0}
                           max={Math.max(0, effLabelWidth - effBarcodeWidth)}
                           value={layoutXY.barcode.x ?? '0'}
                           onChange={e => {
                             const v = e.target.value;
                             setLayoutXY(prev => ({ ...prev, barcode: { ...prev.barcode, x: v } }));
                             updateConfig(p => ({ ...p, layoutXY: { ...p.layoutXY, barcode: { ...p.layoutXY.barcode, x: v } } }));
                           }}
                           className={numInputClass}
                         />
                       </div>
                       <div>
                         <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Y Pos (mm)</label>
                         <input
                           type="number"
                           step={0.5}
                           min={0}
                           max={Math.max(0, effLabelHeight - effBarcodeHeight)}
                           value={layoutXY.barcode.y ?? '8'}
                           onChange={e => {
                             const v = e.target.value;
                             setLayoutXY(prev => ({ ...prev, barcode: { ...prev.barcode, y: v } }));
                             updateConfig(p => ({ ...p, layoutXY: { ...p.layoutXY, barcode: { ...p.layoutXY.barcode, y: v } } }));
                           }}
                           className={numInputClass}
                         />
                       </div>
                     </div>

                     <div className="flex items-center justify-between text-xs py-1 border-t border-slate-200/60">
                       <span className="text-[10px] font-semibold text-slate-700">Display Code Text (HRI)</span>
                       <ToggleSwitch checked={showCodeText} onChange={val => {
                         setShowCodeText(val);
                         updateConfig(p => ({ ...p, showCodeText: val }));
                       }} />
                     </div>
                   </div>

                   {/* Selling Price */}
                   <div className="bg-slate-50/70 p-2.5 rounded-lg border border-slate-200/80 space-y-2">
                     <div className="flex items-center justify-between">
                       <div className="flex items-center gap-1.5">
                         <DollarSign className="w-3.5 h-3.5 text-slate-700" />
                         <span className="font-bold text-[11px] text-slate-900">Selling Price</span>
                       </div>
                       <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${showPrice ? 'bg-black text-white' : 'bg-slate-200 text-slate-500'}`}>
                         {showPrice ? 'Active' : 'Hidden'}
                       </span>
                     </div>

                     <FontSizeControl
                       value={fontSize.price ?? 13}
                       onChange={val => {
                         setFontSize(prev => ({ ...prev, price: val }));
                         updateConfig(p => ({ ...p, fontSize: { ...p.fontSize, price: val } }));
                       }}
                     />

                     <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200/60">
                       <div>
                         <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">X Pos (mm)</label>
                         <input
                           type="number"
                           step={0.5}
                           min={0}
                           max={Math.max(0, effLabelWidth - 1)}
                           value={layoutXY.price.x ?? '0'}
                           onChange={e => {
                             const v = e.target.value;
                             setLayoutXY(prev => ({ ...prev, price: { ...prev.price, x: v } }));
                             updateConfig(p => ({ ...p, layoutXY: { ...p.layoutXY, price: { ...p.layoutXY.price, x: v } } }));
                           }}
                           className={numInputClass}
                         />
                       </div>
                       <div>
                         <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">Y Pos (mm)</label>
                         <input
                           type="number"
                           step={0.5}
                           min={0}
                           max={Math.max(0, effLabelHeight - 1)}
                           value={layoutXY.price.y ?? '16'}
                           onChange={e => {
                             const v = e.target.value;
                             setLayoutXY(prev => ({ ...prev, price: { ...prev.price, y: v } }));
                             updateConfig(p => ({ ...p, layoutXY: { ...p.layoutXY, price: { ...p.layoutXY.price, y: v } } }));
                           }}
                           className={numInputClass}
                         />
                       </div>
                     </div>
                   </div>
                 </div>
               </div>
             </div>

            {/* PRODUCT SELECTION */}
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs flex-1 flex flex-col min-h-[260px]">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-extrabold text-slate-800">Select Products</span>
                <div className="flex items-center space-x-1.5 text-[10px]">
                  <button onClick={selectAll} className="text-gray-900 font-bold hover:underline cursor-pointer">All</button>
                  <span className="text-slate-300">|</span>
                  <button onClick={deselectAll} className="text-slate-500 hover:underline cursor-pointer">None</button>
                  <span className="text-slate-300">|</span>
                  <button onClick={() => setAllQuantities('stock')} className="text-slate-600 font-medium hover:underline cursor-pointer" title="Set label count equal to current inventory stock">Qty = Stock</button>
                </div>
              </div>

              <div className="relative mb-2">
                <Search className="absolute inset-y-0 left-0 pl-2.5 w-3.5 h-3.5 my-auto text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Filter by name, SKU, barcode..."
                  className="w-full pl-8 pr-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-gray-900"
                />
              </div>

              <div className="flex-1 overflow-y-auto space-y-1.5 max-h-[240px] pr-1">
                {filteredProducts.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-xs">No products found.</div>
                ) : (
                  filteredProducts.map(prod => {
                    const isSelected = selectedProducts[prod.id] !== undefined;
                    const qty = selectedProducts[prod.id] || 0;
                    const code = prod.barcode || prod.sku;
                    return (
                      <div
                        key={prod.id}
                        className={`p-2 rounded-lg border transition-all flex items-center justify-between text-xs ${
                          isSelected ? 'bg-gray-50/50 border-gray-200' : 'bg-white border-slate-100 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center space-x-2.5 min-w-0 pr-2">
                          <button onClick={() => toggleSelectProduct(prod.id)} className="text-gray-900 shrink-0 cursor-pointer">
                            {isSelected ? <CheckSquare className="w-4 h-4 text-gray-900" /> : <Square className="w-4 h-4 text-slate-300" />}
                          </button>
                          <div className="min-w-0">
                            <p className="font-bold text-slate-900 truncate text-[11px]">{prod.name}</p>
                            <p className="text-[10px] text-slate-500 font-mono">
                              {code} • <span className="font-semibold text-slate-700">{prod.price.toLocaleString()} {currencySymbol}</span>
                            </p>
                          </div>
                        </div>

                        {isSelected && (
                          <div className="flex items-center space-x-1 shrink-0 bg-white border border-slate-200 rounded-md p-0.5 shadow-2xs">
                            <button onClick={() => updateQuantity(prod.id, qty - 1)} className="w-5 h-5 flex items-center justify-center text-slate-600 hover:bg-slate-100 rounded font-bold cursor-pointer">
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="w-6 text-center font-bold text-xs font-mono">{qty}</span>
                            <button onClick={() => updateQuantity(prod.id, qty + 1)} className="w-5 h-5 flex items-center justify-center text-slate-600 hover:bg-slate-100 rounded font-bold cursor-pointer">
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* RIGHT PANEL: LIVE INTERACTIVE CANVAS */}
          <div className="lg:col-span-7 flex flex-col overflow-hidden bg-slate-100/70 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                <Tag className="w-4 h-4 text-gray-900" />
                <span className="font-extrabold text-slate-900 text-xs sm:text-sm">
                  Print Preview ({totalLabels} labels · {effLabelWidth.toFixed(0)}×{effLabelHeight.toFixed(0)}mm)
                </span>
              </div>

              <div className="flex items-center space-x-1.5">
                <div className="flex items-center space-x-1 bg-white p-0.5 rounded-lg border border-slate-200 text-xs shadow-2xs">
                  <button
                    onClick={handleZoomOut}
                    disabled={zoomFactor <= 0.5}
                    className="p-1 text-slate-600 hover:text-black disabled:opacity-30 cursor-pointer"
                    title="Zoom Out (-25%)"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={handleResetZoom}
                    className="px-1.5 py-0.5 text-[10px] font-extrabold text-slate-800 hover:bg-slate-100 rounded cursor-pointer font-mono"
                    title="Reset Zoom (100%)"
                  >
                    {Math.round(zoomFactor * 100)}%
                  </button>
                  <button
                    onClick={handleZoomIn}
                    disabled={zoomFactor >= 3}
                    className="p-1 text-slate-600 hover:text-black disabled:opacity-30 cursor-pointer"
                    title="Zoom In (+25%)"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                </div>

                <button
                  onClick={() => setIsFullscreen(true)}
                  className="p-1.5 bg-black hover:bg-gray-800 text-white rounded-lg shadow-xs transition-colors cursor-pointer"
                  title="Fullscreen Canvas Mode"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>

                {btAvailable && (
                  <div className="flex items-center space-x-1.5 ml-1">
                    <button
                      onClick={handleTestPrint}
                      disabled={!btConnected || btPrinting}
                      className="px-2.5 py-1.5 bg-slate-600 hover:bg-slate-700 text-white font-bold text-xs rounded-lg shadow-xs transition-colors flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Test Print</span>
                    </button>
                    <button
                      onClick={handleFeedAlign}
                      disabled={!btConnected || btPrinting}
                      className="px-2.5 py-1.5 bg-slate-400 hover:bg-slate-500 text-white font-bold text-xs rounded-lg shadow-xs transition-colors flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer"
                    >
                      <Ruler className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Feed</span>
                    </button>
                    <button
                      onClick={handleBtPrint}
                      disabled={totalLabels === 0 || !btConnected || btPrinting}
                      className="px-3 py-1.5 bg-black hover:bg-gray-800 text-white font-bold text-xs rounded-lg shadow-xs transition-colors flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer"
                    >
                      {btPrinting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bluetooth className="w-3.5 h-3.5" />}
                      <span>{btPrinting ? `${btProgress.current}/${btProgress.total}` : 'BT Print'}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {btError && (
              <div className="mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-2 text-xs text-red-700">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span className="flex-1">{btError}</span>
                <button onClick={() => setBtError(null)} className="text-red-400 hover:text-red-600 cursor-pointer">
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto bg-slate-200/50 p-4 rounded-xl border border-slate-300 shadow-inner">
              {totalLabels === 0 ? (
                <div className="text-center py-16 text-slate-400 text-xs">
                  <Printer className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                  <p className="font-semibold text-slate-600">No products selected.</p>
                  <p className="text-[11px] text-slate-400 mt-1">Check the product boxes on the left to add barcode labels.</p>
                </div>
              ) : (
                <div className="flex flex-wrap gap-3 justify-center items-start">
                  {printItemsList.map((item) => renderSingleLabelCard(item.product))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* MODAL FOOTER */}
        <div className="p-3.5 bg-slate-50 border-t border-slate-200 flex justify-between items-center text-xs">
          <span className="text-slate-500 font-medium">
            Total Labels: <strong className="text-slate-900 font-bold">{totalLabels}</strong>
          </span>

          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>

            {btAvailable && (
              <button
                onClick={handleBtPrint}
                disabled={totalLabels === 0 || !btConnected || btPrinting}
                className="px-5 py-2 bg-black hover:bg-gray-800 text-white font-bold rounded-xl shadow-xs transition-all flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer"
              >
                {btPrinting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                <span>
                  {btPrinting ? `Printing ${btProgress.current}/${btProgress.total}` : `Print ${totalLabels} Labels`}
                </span>
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default BarcodePrintModal;
