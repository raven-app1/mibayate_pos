import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Printer, X, Search, CheckSquare, Square, Settings2,
  Tag, Bluetooth, BluetoothOff, Loader2, CheckCircle2, AlertCircle,
  Minus, Plus, Ruler, Scissors, Save, Layers,
  Maximize2, Minimize2, ZoomIn, ZoomOut, RotateCcw,
  SlidersHorizontal, Type, Store, DollarSign, ChevronDown, ChevronUp,
  FileText, Check, MoreVertical,
} from 'lucide-react';
import { Product, LabelConfig } from '../types';
import LabelRasterPreview from './LabelRasterPreview';
import * as printerBridge from '../lib/printerBridge';
import { getPrintableMm } from '../lib/escpos';
import { buildTsplLabel, testPrintTspl, feedTspl } from '../lib/tspl';
import { ensureLabelFont } from '../lib/labelRaster';
import { loadLabelConfig, saveLabelConfig, DEFAULT_LABEL_CONFIG, computeLabelOffsetMm } from '../lib/labelConfig';
import { isSupabaseConfigured } from '../lib/supabase';

interface LabelGeneratorTabProps {
  products: Product[];
  currencySymbol?: string;
  businessName?: string;
}

type DesignerTab = 'layout' | 'content' | 'appearance' | 'printer' | 'advanced';

const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);
const parseMm = (v: string) => {
  const n = parseFloat(v);
  return isFinite(n) && n > 0 ? n : 0;
};

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

const MmInput: React.FC<{
  label: string;
  value: string | number;
  onChange: (val: string) => void;
  min?: number;
  max?: number;
  step?: number;
}> = ({ label, value, onChange, min = 0, max = 300, step = 0.5 }) => (
  <div>
    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1 truncate">
      {label}
    </label>
    <div className="relative">
      <input
        type="number"
        step={step}
        min={min}
        max={max}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full pr-7 pl-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-gray-900"
      />
      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400 pointer-events-none">
        mm
      </span>
    </div>
  </div>
);

const FieldEditorCard: React.FC<{
  title: string;
  icon: React.ElementType;
  enabled: boolean;
  onToggleEnabled?: (enabled: boolean) => void;
  subtitle?: string;
  width: string | number;
  onWidthChange: (val: string) => void;
  maxWidth: number;
  height: string | number;
  onHeightChange: (val: string) => void;
  maxHeight: number;
  fontSize?: number;
  onFontSizeChange?: (size: number) => void;
  posX: string | number;
  onPosXChange: (val: string) => void;
  posY: string | number;
  onPosYChange: (val: string) => void;
  extraContent?: React.ReactNode;
}> = ({
  title,
  icon: Icon,
  enabled,
  onToggleEnabled,
  subtitle,
  width,
  onWidthChange,
  maxWidth,
  height,
  onHeightChange,
  maxHeight,
  fontSize,
  onFontSizeChange,
  posX,
  onPosXChange,
  posY,
  onPosYChange,
  extraContent,
}) => {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className={`rounded-xl border transition-all ${enabled ? 'bg-white border-slate-200/90 shadow-2xs' : 'bg-slate-50/70 border-slate-200/60 opacity-80'}`}>
      <div className="p-3 flex items-center justify-between gap-2.5">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer"
        >
          <div className={`p-1.5 rounded-lg shrink-0 ${enabled ? 'bg-black text-white' : 'bg-slate-200 text-slate-500'}`}>
            <Icon className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-xs text-slate-900 truncate">{title}</span>
              {subtitle && <span className="text-[10px] text-slate-400 font-medium truncate hidden sm:inline">· {subtitle}</span>}
            </div>
            <div className="text-[10px] text-slate-500 font-mono mt-0.5">
              {width}×{height}mm · X:{posX}, Y:{posY}
            </div>
          </div>
          <div className="text-slate-400 p-1 hover:text-slate-700">
            {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </button>

        {onToggleEnabled && (
          <div className="flex items-center gap-2 shrink-0 border-l border-slate-200/80 pl-2.5">
            <ToggleSwitch checked={enabled} onChange={onToggleEnabled} title={`Toggle ${title}`} />
          </div>
        )}
      </div>

      {isOpen && (
        <div className="px-3 pb-3 pt-1 border-t border-slate-100 space-y-2.5">
          {extraContent}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 items-end">
            <MmInput label="Width" value={width} onChange={onWidthChange} min={1} max={maxWidth} />
            <MmInput label="Height" value={height} onChange={onHeightChange} min={1} max={maxHeight} />
            {fontSize !== undefined && onFontSizeChange && (
              <div className="col-span-2 sm:col-span-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  Font Size
                </label>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => onFontSizeChange(1)}
                    className={`flex-1 py-1.5 px-2 rounded-lg border font-bold text-xs transition-all text-center cursor-pointer ${
                      fontSize === 1
                        ? 'bg-black text-white border-black shadow-xs'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    Normal (1x)
                  </button>
                  <button
                    type="button"
                    onClick={() => onFontSizeChange(2)}
                    className={`flex-1 py-1.5 px-2 rounded-lg border font-bold text-xs transition-all text-center cursor-pointer ${
                      fontSize === 2
                        ? 'bg-black text-white border-black shadow-xs'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    Large (2x)
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
            <MmInput label="X Position" value={posX} onChange={onPosXChange} min={0} max={maxWidth} />
            <MmInput label="Y Position" value={posY} onChange={onPosYChange} min={0} max={maxHeight} />
          </div>
        </div>
      )}
    </div>
  );
};

export const LabelGeneratorTab: React.FC<LabelGeneratorTabProps> = ({
  products,
  currencySymbol = 'Ks',
  businessName,
}) => {
  const [config, setConfig] = useState<LabelConfig>(() => loadLabelConfig(businessName));
  const [savedConfig, setSavedConfig] = useState<LabelConfig>(() => loadLabelConfig(businessName));
  const [activeTab, setActiveTab] = useState<DesignerTab>('layout');

  const [saveToast, setSaveToast] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showOverflowMenu, setShowOverflowMenu] = useState(false);
  const [showBulkPrint, setShowBulkPrint] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sampleProductId, setSampleProductId] = useState<string>(() => (products[0] ? products[0].id : ''));
  const [selectedProducts, setSelectedProducts] = useState<{ [id: string]: number }>({});

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoomFactor, setZoomFactor] = useState(1);
  const [viewportSize, setViewportSize] = useState({
    w: typeof window !== 'undefined' ? window.innerWidth : 375,
    h: typeof window !== 'undefined' ? window.innerHeight : 667,
  });

  const overflowRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleResize = () => {
      setViewportSize({ w: window.innerWidth, h: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setShowOverflowMenu(false);
      }
    };
    if (showOverflowMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showOverflowMenu]);

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

  useEffect(() => {
    const last = printerBridge.getLastPrinter();
    if (last?.address) {
      setSelectedAddress(last.address);
    }

    if (isNative) {
      printerBridge.getPairedPrinters().then(devs => {
        setPairedDevices(devs);
        if (devs.length > 0 && !last?.address) {
          setSelectedAddress(devs[0].address);
        }
      }).catch(() => {});

      if (!printerBridge.isConnected()) {
        printerBridge.autoConnectLastPrinter().then(name => {
          if (name) {
            setBtConnected(true);
            setPrinterName(name);
          }
        }).catch(() => {});
      }
    }

    printerBridge.onDisconnect(() => {
      setBtConnected(false);
      setPrinterName('');
    });
    return () => {
      printerBridge.offDisconnect();
    };
  }, [isNative]);

  useEffect(() => {
    if (!isFullscreen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullscreen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  const isDirty = useMemo(() => {
    return JSON.stringify(config) !== JSON.stringify(savedConfig);
  }, [config, savedConfig]);

  const updateConfig = (updater: (prev: LabelConfig) => LabelConfig) => {
    setConfig(prev => {
      const next = updater(prev);
      saveLabelConfig(next);
      return next;
    });
  };

  const handleSaveSettings = () => {
    saveLabelConfig(config);
    setSavedConfig(config);
    if (selectedAddress) {
      const dev = pairedDevices.find(d => d.address === selectedAddress);
      printerBridge.saveLastPrinter(selectedAddress, dev?.name || printerName || selectedAddress);
    }
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 2500);
  };

  const handleResetDefaults = () => {
    const fresh: LabelConfig = {
      ...DEFAULT_LABEL_CONFIG,
      storeName: businessName || DEFAULT_LABEL_CONFIG.storeName,
    };
    setConfig(fresh);
    setSavedConfig(fresh);
    saveLabelConfig(fresh);
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 2500);
  };

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

  const effPaperWidth = clamp(parseMm(config.paperWidth) || 72, 15, 300);
  const printableMm = getPrintableMm(effPaperWidth);
  const effLabelWidth = clamp(parseMm(config.labelWidth) || effPaperWidth, 5, effPaperWidth);
  const effLabelHeight = clamp(parseMm(config.labelHeight) || 20, 8, 300);

  const effElemX = (k: 'store' | 'product' | 'barcode' | 'price') =>
    clamp(parseMm(config.layoutXY[k].x) || 0, 0, Math.max(0, effLabelWidth - 5));

  const effElemY = (k: 'store' | 'product' | 'barcode' | 'price') =>
    clamp(parseMm(config.layoutXY[k].y) || 0, 0, Math.max(0, effLabelHeight - 2));

  const effElemW = (k: 'store' | 'product' | 'barcode' | 'price') => {
    const rawStr = config.layoutXY[k]?.w;
    if (rawStr !== undefined && rawStr !== '') {
      const n = parseFloat(rawStr);
      if (isFinite(n)) {
        return clamp(n, 1, Math.max(1, effLabelWidth - effElemX(k)));
      }
      return 1;
    }
    const defaultW = k === 'barcode' ? (parseMm(config.barcodeWidth) || Math.max(10, effLabelWidth - 4)) : Math.max(1, effLabelWidth - effElemX(k));
    return clamp(defaultW, 1, Math.max(1, effLabelWidth - effElemX(k)));
  };

  const effElemH = (k: 'store' | 'product' | 'barcode' | 'price') => {
    const rawStr = config.layoutXY[k]?.h;
    if (rawStr !== undefined && rawStr !== '') {
      const n = parseFloat(rawStr);
      if (isFinite(n)) {
        return clamp(n, 1, Math.max(1, effLabelHeight - effElemY(k)));
      }
      return 1;
    }
    const defaultH = k === 'barcode' ? (parseMm(config.barcodeHeight) || 10) : (k === 'price' ? 3 : 2);
    return clamp(defaultH, 1, Math.max(1, effLabelHeight - effElemY(k)));
  };

  const effBarcodeWidth = effElemW('barcode');
  const effBarcodeHeight = effElemH('barcode');
  const effBarcodeX = effElemX('barcode');
  const effBarcodeY = effElemY('barcode');

  const effLabelGap = clamp(parseMm(config.labelGap) || 1, 1, 10);
  const effFeedOffset = clamp(parseMm(config.feedOffset) || 0, -10, 10);
  const effLabelOffsetMm = computeLabelOffsetMm(config);

  const isMobile = viewportSize.w < 1024;

  const maxCanvasW = isFullscreen
    ? (isMobile ? viewportSize.w - 24 : viewportSize.w - 80)
    : (isMobile ? Math.min(viewportSize.w - 48, 300) : 300);

  const maxCanvasH = isFullscreen
    ? (isMobile ? viewportSize.h - 140 : viewportSize.h - 160)
    : 150;

  const basePreviewScale = Math.min(
    maxCanvasW / effLabelWidth,
    maxCanvasH / effLabelHeight,
    isFullscreen ? (isMobile ? 18 : 22) : 7
  );

  const previewScale = Math.max(0.5, basePreviewScale * zoomFactor);
  const previewW = Math.round(effLabelWidth * previewScale);
  const previewH = Math.round(effLabelHeight * previewScale);

  const sampleProduct: Product = products.find(p => p.id === sampleProductId) || products[0] || {
    id: 'sample',
    name: 'Sample Product Item',
    sku: 'SAMPLE-101',
    barcode: '885001234567',
    price: 15000,
    cost: 10000,
    stock: 25,
    min_stock_level: 5,
    category: 'General',
    created_at: new Date().toISOString(),
  };

  const layoutForPrint = {
    storeName: config.showStoreName ? { xMm: effElemX('store'), yMm: effElemY('store'), widthMm: effElemW('store'), heightMm: effElemH('store'), size: config.fontSize.store as 1 | 2 } : undefined,
    productName: config.showProductName ? { xMm: effElemX('product'), yMm: effElemY('product'), widthMm: effElemW('product'), heightMm: effElemH('product'), size: config.fontSize.product as 1 | 2 } : undefined,
    barcode: { xMm: effBarcodeX, yMm: effBarcodeY, widthMm: effBarcodeWidth, heightMm: effBarcodeHeight },
    price: config.showPrice ? { xMm: effElemX('price'), yMm: effElemY('price'), widthMm: effElemW('price'), heightMm: effElemH('price'), size: config.fontSize.price as 1 | 2 } : undefined,
  };

  const labelOptionsFor = (productItem: Product) => ({
    storeName: config.storeName || businessName || 'Mibayate',
    productName: productItem.name,
    barcodeValue: productItem.barcode || productItem.sku || '000000',
    price: productItem.price,
    showStoreName: config.showStoreName,
    showProductName: config.showProductName,
    showPrice: config.showPrice,
    showBarcodeText: config.showCodeText,
    currencySymbol,
    paperWidthMm: effPaperWidth,
    labelWidthMm: effLabelWidth,
    labelHeightMm: effLabelHeight,
    barcodeType: 'CODE128' as const,
    barcodeWidthMm: effBarcodeWidth,
    barcodeHeightMm: effBarcodeHeight,
    cutMode: config.paperMode === 'sticker' ? ('off' as const) : config.cutMode,
    paperMode: config.paperMode,
    labelGapMm: effLabelGap,
    feedOffsetMm: effFeedOffset,
    labelOffsetMm: effLabelOffsetMm,
    dotsPerMm: config.dpi === 300 ? 12 : 8,
    layout: layoutForPrint,
  });

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

  const handleBtPrintBulk = useCallback(async () => {
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
        testPrintTspl(config.storeName || businessName || 'Mibayate', effLabelWidth, effLabelHeight, effLabelGap, effLabelOffsetMm)
      );
      setSaveToast(true);
      setTimeout(() => setSaveToast(false), 2500);
    } catch (err: any) {
      setBtError(err?.message || 'Test print failed. Check printer connection.');
    }
  }, [btPrinting, config.storeName, businessName, effLabelWidth, effLabelHeight, effLabelGap, effLabelOffsetMm]);

  const handleFeedAlign = useCallback(async () => {
    if (!printerBridge.isConnected() || btPrinting) return;
    setBtError(null);
    try {
      await printerBridge.send(feedTspl());
    } catch (err: any) {
      setBtError(err?.message || 'Feed failed');
    }
  }, [btPrinting]);

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

  const segBtn = (active: boolean) =>
    `flex-1 px-3 py-1.5 rounded-xl border font-bold text-xs transition-all text-center cursor-pointer ${
      active
        ? 'bg-black text-white border-black shadow-xs'
        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
    }`;

  const renderCanvasCard = () => (
    <LabelRasterPreview
      options={labelOptionsFor(sampleProduct)}
      width={previewW}
      height={previewH}
      className="border border-slate-300 rounded shadow-xs"
    />
  );

  const tabs: Array<{ id: DesignerTab; label: string; icon: React.ElementType }> = [
    { id: 'layout', label: 'Layout', icon: Ruler },
    { id: 'content', label: 'Content', icon: FileText },
    { id: 'appearance', label: 'Appearance', icon: SlidersHorizontal },
    { id: 'printer', label: 'Printer', icon: Printer },
    { id: 'advanced', label: 'Advanced', icon: Settings2 },
  ];

  return (
    <div className="space-y-4 pb-28 sm:pb-16 animate-fade-in">
      {isFullscreen && (
        <div className="fixed inset-0 z-50 bg-slate-950/95 text-white flex flex-col p-3 sm:p-6 backdrop-blur-md overflow-hidden animate-fade-in">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800 shrink-0">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-white text-black rounded-xl shrink-0">
                <Tag className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-white text-sm sm:text-base">
                  Fullscreen Label Print Preview
                </h3>
                <p className="text-[10px] sm:text-xs text-slate-400 font-medium font-mono">
                  {effLabelWidth.toFixed(0)} × {effLabelHeight.toFixed(0)} mm · Exact 1-bit thermal raster
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={sampleProductId}
                onChange={e => setSampleProductId(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold text-white focus:outline-none max-w-[160px] cursor-pointer"
              >
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>

              <div className="flex items-center space-x-1 bg-slate-800 p-1 rounded-xl border border-slate-700 text-xs">
                <button
                  type="button"
                  onClick={handleZoomOut}
                  disabled={zoomFactor <= 0.5}
                  className="p-1 text-slate-300 hover:text-white disabled:opacity-30 cursor-pointer"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleResetZoom}
                  className="px-2 py-0.5 text-xs font-extrabold text-white hover:bg-slate-700 rounded cursor-pointer font-mono"
                  title="Reset Zoom"
                >
                  {Math.round(zoomFactor * 100)}%
                </button>
                <button
                  type="button"
                  onClick={handleZoomIn}
                  disabled={zoomFactor >= 3}
                  className="p-1 text-slate-300 hover:text-white disabled:opacity-30 cursor-pointer"
                  title="Zoom In"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>

              <button
                type="button"
                onClick={() => setIsFullscreen(false)}
                className="px-3.5 py-1.5 bg-white text-black font-extrabold text-xs rounded-xl shadow-xs hover:bg-slate-200 transition-colors flex items-center space-x-1.5 cursor-pointer shrink-0"
              >
                <Minimize2 className="w-4 h-4" />
                <span>Exit</span>
              </button>
            </div>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center overflow-auto p-4 sm:p-8 my-3 bg-slate-900/60 rounded-2xl border border-slate-800 shadow-2xl relative select-none">
            {renderCanvasCard()}
          </div>

          <div className="pt-2.5 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400 shrink-0 font-mono">
            <span>Layout: {effLabelWidth}×{effLabelHeight}mm on {effPaperWidth}mm roll</span>
            <span>Press ESC to exit</span>
          </div>
        </div>
      )}

      {showResetConfirm && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in" onClick={() => setShowResetConfirm(false)}>
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full border border-slate-200 shadow-xl space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-slate-100 rounded-xl text-slate-800 shrink-0 mt-0.5">
                <RotateCcw className="w-5 h-5" />
              </div>
              <div>
                <h4 className="font-extrabold text-sm text-slate-900">Reset to Defaults?</h4>
                <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">
                  This will restore the standard <strong>40×20 mm</strong> label on <strong>72 mm</strong> paper at <strong>203 DPI</strong>, with Store Name (Mibayate) and Product Title.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="px-3.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  handleResetDefaults();
                  setShowResetConfirm(false);
                }}
                className="px-4 py-1.5 bg-black hover:bg-gray-800 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                Reset Defaults
              </button>
            </div>
          </div>
        </div>
      )}

      {/* A. Compact Responsive Header */}
      <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-wrap items-center justify-between gap-2.5 sticky top-0 z-20 backdrop-blur-md bg-white/95">
        <div className="flex items-center space-x-2.5 min-w-0">
          <div className="p-2 bg-black text-white rounded-xl shadow-xs shrink-0">
            <Printer className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-xs sm:text-base font-extrabold text-slate-900 tracking-tight truncate">
                Label Designer
              </h2>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-mono hidden sm:inline">
                {effLabelWidth.toFixed(0)}×{effLabelHeight.toFixed(0)} mm
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-[10px] sm:text-[11px]">
              <span className="inline-flex items-center gap-1 font-semibold text-slate-700">
                <span className={`w-1.5 h-1.5 rounded-full ${isSupabaseConfigured ? 'bg-black' : 'bg-slate-400'}`} />
                {isSupabaseConfigured ? 'Cloud Connected' : 'Offline'}
              </span>
              <span className="text-slate-300">·</span>
              <span className="inline-flex items-center gap-1 font-semibold text-slate-600 truncate max-w-[120px] sm:max-w-[180px]">
                <Bluetooth className="w-3 h-3 text-slate-500 shrink-0" />
                <span className="truncate">{btConnected ? (printerName || 'Connected') : 'Disconnected'}</span>
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] sm:text-[11px] font-bold border transition-colors bg-slate-50 border-slate-200/80 text-slate-600">
            {isDirty ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-slate-900 animate-pulse" />
                <span>Unsaved</span>
              </>
            ) : (
              <>
                <Check className="w-3 h-3 text-slate-800" />
                <span>Saved</span>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={handleSaveSettings}
            disabled={!isDirty}
            className={`px-3 py-1 sm:px-4 sm:py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs ${
              isDirty
                ? 'bg-black text-white hover:bg-gray-800 active:scale-95'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            }`}
          >
            <Save className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{isDirty ? 'Save Changes' : 'Saved'}</span>
          </button>

          {/* Overflow Menu */}
          <div className="relative" ref={overflowRef}>
            <button
              type="button"
              onClick={() => setShowOverflowMenu(!showOverflowMenu)}
              className="p-1.5 sm:p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors cursor-pointer flex items-center justify-center"
              title="More Actions"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {showOverflowMenu && (
              <div className="absolute right-0 mt-1.5 w-48 bg-white rounded-xl shadow-lg border border-slate-200 py-1.5 z-30 animate-fade-in text-xs font-bold text-slate-700">
                <button
                  type="button"
                  onClick={() => {
                    setIsFullscreen(true);
                    setShowOverflowMenu(false);
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                >
                  <Maximize2 className="w-3.5 h-3.5 text-slate-500" />
                  <span>Fullscreen Preview</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleTestPrint();
                    setShowOverflowMenu(false);
                  }}
                  disabled={!btConnected || btPrinting}
                  className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center gap-2 cursor-pointer disabled:opacity-40"
                >
                  <Printer className="w-3.5 h-3.5 text-slate-500" />
                  <span>Print Test Label</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowBulkPrint(!showBulkPrint);
                    setShowOverflowMenu(false);
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                >
                  <Layers className="w-3.5 h-3.5 text-slate-500" />
                  <span>{showBulkPrint ? 'Hide Bulk Print' : 'Bulk Print Inventory'}</span>
                </button>
                <div className="my-1 border-t border-slate-100" />
                <button
                  type="button"
                  onClick={() => {
                    setShowResetConfirm(true);
                    setShowOverflowMenu(false);
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-slate-50 text-slate-800 flex items-center gap-2 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                  <span>Reset to Defaults</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {saveToast && (
        <div className="px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl flex items-center space-x-2 text-xs text-gray-900 font-bold shadow-xs animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-gray-900 shrink-0" />
          <span>Label layout configuration saved successfully!</span>
        </div>
      )}

      {btError && (
        <div className="px-3.5 py-2.5 bg-red-50 border border-red-200 rounded-xl flex items-center space-x-2 text-xs text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{btError}</span>
          <button onClick={() => setBtError(null)} className="text-red-400 hover:text-red-600 cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Grid: Desktop 2-column (Preview Left, Settings Right), Mobile single-column (Preview Top) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-start">
        
        {/* B. Live Label Preview — Prominent Column on Desktop, Top on Mobile */}
        <div className="lg:col-span-5 xl:col-span-4 lg:sticky lg:top-16 space-y-4">
          <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200/80 shadow-2xs space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-slate-900" />
                <h3 className="font-extrabold text-slate-900 text-xs sm:text-sm">
                  Live Preview
                </h3>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-black text-white font-mono">
                  {effLabelWidth.toFixed(0)}×{effLabelHeight.toFixed(0)} mm
                </span>
              </div>

              <div className="flex items-center gap-1">
                <div className="flex items-center space-x-0.5 bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
                  <button
                    type="button"
                    onClick={handleZoomOut}
                    disabled={zoomFactor <= 0.5}
                    className="p-1 text-slate-600 hover:text-black disabled:opacity-30 cursor-pointer"
                    title="Zoom Out"
                  >
                    <ZoomOut className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={handleResetZoom}
                    className="px-1.5 py-0.5 text-[10px] font-bold text-slate-800 hover:bg-slate-200 rounded cursor-pointer font-mono"
                    title="Reset Zoom (Fit)"
                  >
                    {Math.round(zoomFactor * 100)}%
                  </button>
                  <button
                    type="button"
                    onClick={handleZoomIn}
                    disabled={zoomFactor >= 3}
                    className="p-1 text-slate-600 hover:text-black disabled:opacity-30 cursor-pointer"
                    title="Zoom In"
                  >
                    <ZoomIn className="w-3 h-3" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setIsFullscreen(true)}
                  className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors cursor-pointer"
                  title="Fullscreen"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 text-xs bg-slate-50 p-2 rounded-xl border border-slate-200/80">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider shrink-0">Sample:</span>
              <select
                value={sampleProductId}
                onChange={e => setSampleProductId(e.target.value)}
                className="flex-1 min-w-0 bg-transparent text-xs font-bold text-slate-800 focus:outline-none cursor-pointer truncate"
              >
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {/* Canvas Container with subtle neutral backdrop and clean label border */}
            <div className="bg-slate-100/80 p-3 sm:p-5 rounded-xl border border-slate-200 flex flex-col items-center justify-center min-h-[140px] sm:min-h-[160px] relative overflow-hidden">
              <div className="p-0.5 bg-white rounded-md shadow-xs border border-slate-300">
                {renderCanvasCard()}
              </div>
              <div className="mt-2 flex items-center justify-between w-full text-[10px] font-mono text-slate-500">
                <span>{effLabelWidth}×{effLabelHeight}mm · {config.dpi ?? 203} DPI</span>
                <span>Roll: {effPaperWidth}mm (Left)</span>
              </div>
            </div>

            {/* Print Test Label & Feed Actions */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={handleTestPrint}
                disabled={!btConnected || btPrinting}
                className="py-2 px-2.5 bg-black hover:bg-gray-800 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center space-x-1.5 disabled:opacity-40 cursor-pointer"
              >
                {btPrinting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />}
                <span>{btPrinting ? 'Printing...' : 'Print Test'}</span>
              </button>
              <button
                type="button"
                onClick={handleFeedAlign}
                disabled={!btConnected || btPrinting}
                className="py-2 px-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors disabled:opacity-40 cursor-pointer flex items-center justify-center space-x-1"
                title="Advance roll to align with next label gap"
              >
                <Ruler className="w-3.5 h-3.5" />
                <span>Feed & Align</span>
              </button>
            </div>
          </div>
        </div>

        {/* Settings Column: Tabs Navigation and Editor Cards */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-4">
          
          {/* C. Horizontally Scrollable / Segmented Tab Navigation */}
          <div className="bg-white p-1.5 rounded-2xl border border-slate-200/80 shadow-2xs flex gap-1 overflow-x-auto scrollbar-none snap-x">
            {tabs.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 shrink-0 cursor-pointer snap-start ${
                    isActive
                      ? 'bg-black text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* TAB 1: LAYOUT */}
          {activeTab === 'layout' && (
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4 animate-fade-in">
              <div className="flex items-center space-x-2">
                <Ruler className="w-4 h-4 text-slate-900" />
                <h3 className="font-extrabold text-slate-900 text-sm">
                  Paper & Label Dimensions
                </h3>
              </div>

              <div className="space-y-3.5">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                    Paper Type
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => updateConfig(p => ({ ...p, paperMode: 'sticker' }))}
                      className={segBtn(config.paperMode === 'sticker')}
                    >
                      Sticker Labels
                    </button>
                    <button
                      type="button"
                      onClick={() => updateConfig(p => ({ ...p, paperMode: 'receipt' }))}
                      className={segBtn(config.paperMode === 'receipt')}
                    >
                      Continuous Roll
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  <MmInput
                    label="Paper Width"
                    value={config.paperWidth}
                    onChange={val => updateConfig(p => ({ ...p, paperWidth: val }))}
                    min={15}
                    max={300}
                  />
                  <MmInput
                    label="Label Width"
                    value={config.labelWidth}
                    onChange={val => updateConfig(p => ({ ...p, labelWidth: val }))}
                    min={5}
                    max={300}
                  />
                  <MmInput
                    label="Label Height"
                    value={config.labelHeight}
                    onChange={val => updateConfig(p => ({ ...p, labelHeight: val }))}
                    min={8}
                    max={300}
                  />
                </div>

                {config.paperMode === 'sticker' && (
                  <div className="grid grid-cols-2 gap-2.5 pt-1">
                    <MmInput
                      label="Label Gap"
                      value={config.labelGap}
                      onChange={val => updateConfig(p => ({ ...p, labelGap: val }))}
                      min={1}
                      max={10}
                    />
                    <MmInput
                      label="Feed Offset"
                      value={config.feedOffset}
                      onChange={val => updateConfig(p => ({ ...p, feedOffset: val }))}
                      min={-10}
                      max={10}
                    />
                  </div>
                )}

                <div className="pt-1">
                  <div className="p-2.5 bg-slate-50 rounded-xl border border-slate-200/80 text-[11px] font-medium text-slate-600 flex items-center justify-between">
                    <span>Alignment: <strong>Left</strong></span>
                    <span className="font-mono text-slate-400">({effLabelWidth} mm on {effPaperWidth} mm roll)</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: CONTENT */}
          {activeTab === 'content' && (
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4 animate-fade-in">
              <div className="flex items-center space-x-2">
                <FileText className="w-4 h-4 text-slate-900" />
                <h3 className="font-extrabold text-slate-900 text-sm">
                  Label Fields & Text Content
                </h3>
              </div>

              <div className="space-y-3.5">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                    Store / Header Name
                  </label>
                  <input
                    type="text"
                    value={config.storeName}
                    onChange={e => updateConfig(p => ({ ...p, storeName: e.target.value }))}
                    placeholder="Mibayate"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-gray-900"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
                    Active Label Fields
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <label className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200/80 bg-slate-50/70 cursor-pointer">
                      <div className="flex items-center gap-2">
                        <Store className="w-3.5 h-3.5 text-slate-700" />
                        <span className="text-xs font-bold text-slate-800">Store Name</span>
                      </div>
                      <ToggleSwitch checked={config.showStoreName} onChange={val => updateConfig(p => ({ ...p, showStoreName: val }))} />
                    </label>

                    <label className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200/80 bg-slate-50/70 cursor-pointer">
                      <div className="flex items-center gap-2">
                        <Tag className="w-3.5 h-3.5 text-slate-700" />
                        <span className="text-xs font-bold text-slate-800">Product Title</span>
                      </div>
                      <ToggleSwitch checked={config.showProductName} onChange={val => updateConfig(p => ({ ...p, showProductName: val }))} />
                    </label>

                    <label className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200/80 bg-slate-50/70 cursor-pointer">
                      <div className="flex items-center gap-2">
                        <Type className="w-3.5 h-3.5 text-slate-700" />
                        <span className="text-xs font-bold text-slate-800">Barcode Text (HRI)</span>
                      </div>
                      <ToggleSwitch checked={config.showCodeText} onChange={val => updateConfig(p => ({ ...p, showCodeText: val }))} />
                    </label>

                    <label className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200/80 bg-slate-50/70 cursor-pointer">
                      <div className="flex items-center gap-2">
                        <DollarSign className="w-3.5 h-3.5 text-slate-700" />
                        <span className="text-xs font-bold text-slate-800">Selling Price</span>
                      </div>
                      <ToggleSwitch checked={config.showPrice} onChange={val => updateConfig(p => ({ ...p, showPrice: val }))} />
                    </label>
                  </div>
                </div>

                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">Barcode Settings</span>
                      <span className="text-[10px] text-slate-500 font-medium">Standard 1D retail format</span>
                    </div>
                    <span className="font-mono bg-black text-white px-2.5 py-0.5 rounded-lg text-xs font-extrabold">CODE 128</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200/60">
                    <MmInput
                      label="Barcode Width"
                      value={config.barcodeWidth !== undefined ? config.barcodeWidth : effBarcodeWidth.toFixed(1)}
                      onChange={val => updateConfig(p => ({ ...p, barcodeWidth: val, layoutXY: { ...p.layoutXY, barcode: { ...p.layoutXY.barcode, w: val } } }))}
                      min={10}
                      max={effLabelWidth}
                    />
                    <MmInput
                      label="Barcode Height"
                      value={config.barcodeHeight}
                      onChange={val => updateConfig(p => ({ ...p, barcodeHeight: val, layoutXY: { ...p.layoutXY, barcode: { ...p.layoutXY.barcode, h: val } } }))}
                      min={4}
                      max={effLabelHeight}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: APPEARANCE (D. Field Editor Cards) */}
          {activeTab === 'appearance' && (
            <div className="space-y-3 animate-fade-in">
              <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200/80 shadow-2xs flex items-center justify-between">
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm">
                    Element Sizing & Field Positions
                  </h3>
                  <p className="text-[10px] text-slate-500 font-medium">
                    Adjust dimensions, font scale, and coordinates in millimeters
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleResetElementSizes}
                  className="px-2.5 py-1 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                  title="Reset element dimensions to default"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset Elements</span>
                </button>
              </div>

              {/* 1. Store Name Header */}
              <FieldEditorCard
                title="Store Name (Header)"
                icon={Store}
                enabled={config.showStoreName}
                onToggleEnabled={val => updateConfig(p => ({ ...p, showStoreName: val }))}
                subtitle={config.storeName || 'Mibayate'}
                width={config.layoutXY.store.w !== undefined ? config.layoutXY.store.w : effElemW('store').toFixed(1)}
                onWidthChange={val => updateConfig(p => ({ ...p, layoutXY: { ...p.layoutXY, store: { ...p.layoutXY.store, w: val } } }))}
                maxWidth={effLabelWidth}
                height={config.layoutXY.store.h !== undefined ? config.layoutXY.store.h : effElemH('store').toFixed(1)}
                onHeightChange={val => updateConfig(p => ({ ...p, layoutXY: { ...p.layoutXY, store: { ...p.layoutXY.store, h: val } } }))}
                maxHeight={effLabelHeight}
                fontSize={config.fontSize.store ?? 2}
                onFontSizeChange={val => updateConfig(p => ({ ...p, fontSize: { ...p.fontSize, store: val } }))}
                posX={config.layoutXY.store.x ?? '0'}
                onPosXChange={val => updateConfig(p => ({ ...p, layoutXY: { ...p.layoutXY, store: { ...p.layoutXY.store, x: val } } }))}
                posY={config.layoutXY.store.y ?? '1'}
                onPosYChange={val => updateConfig(p => ({ ...p, layoutXY: { ...p.layoutXY, store: { ...p.layoutXY.store, y: val } } }))}
              />

              {/* 2. Product Title */}
              <FieldEditorCard
                title="Product Title"
                icon={Tag}
                enabled={config.showProductName}
                onToggleEnabled={val => updateConfig(p => ({ ...p, showProductName: val }))}
                subtitle="Name & description"
                width={config.layoutXY.product.w !== undefined ? config.layoutXY.product.w : effElemW('product').toFixed(1)}
                onWidthChange={val => updateConfig(p => ({ ...p, layoutXY: { ...p.layoutXY, product: { ...p.layoutXY.product, w: val } } }))}
                maxWidth={effLabelWidth}
                height={config.layoutXY.product.h !== undefined ? config.layoutXY.product.h : effElemH('product').toFixed(1)}
                onHeightChange={val => updateConfig(p => ({ ...p, layoutXY: { ...p.layoutXY, product: { ...p.layoutXY.product, h: val } } }))}
                maxHeight={effLabelHeight}
                fontSize={config.fontSize.product ?? 2}
                onFontSizeChange={val => updateConfig(p => ({ ...p, fontSize: { ...p.fontSize, product: val } }))}
                posX={config.layoutXY.product.x ?? '0'}
                onPosXChange={val => updateConfig(p => ({ ...p, layoutXY: { ...p.layoutXY, product: { ...p.layoutXY.product, x: val } } }))}
                posY={config.layoutXY.product.y ?? '3'}
                onPosYChange={val => updateConfig(p => ({ ...p, layoutXY: { ...p.layoutXY, product: { ...p.layoutXY.product, y: val } } }))}
              />

              {/* 3. Barcode Box */}
              <FieldEditorCard
                title="Barcode Box"
                icon={Type}
                enabled={true}
                subtitle="CODE 128"
                width={config.barcodeWidth !== undefined ? config.barcodeWidth : effBarcodeWidth.toFixed(1)}
                onWidthChange={val => updateConfig(p => ({ ...p, barcodeWidth: val, layoutXY: { ...p.layoutXY, barcode: { ...p.layoutXY.barcode, w: val } } }))}
                maxWidth={effLabelWidth}
                height={config.barcodeHeight}
                onHeightChange={val => updateConfig(p => ({ ...p, barcodeHeight: val, layoutXY: { ...p.layoutXY, barcode: { ...p.layoutXY.barcode, h: val } } }))}
                maxHeight={effLabelHeight}
                posX={config.layoutXY.barcode.x ?? '0'}
                onPosXChange={val => updateConfig(p => ({ ...p, layoutXY: { ...p.layoutXY, barcode: { ...p.layoutXY.barcode, x: val } } }))}
                posY={config.layoutXY.barcode.y ?? '6'}
                onPosYChange={val => updateConfig(p => ({ ...p, layoutXY: { ...p.layoutXY, barcode: { ...p.layoutXY.barcode, y: val } } }))}
                extraContent={
                  <div className="flex items-center justify-between text-xs py-1">
                    <span className="font-semibold text-slate-700">Display Code Text (HRI)</span>
                    <ToggleSwitch checked={config.showCodeText} onChange={val => updateConfig(p => ({ ...p, showCodeText: val }))} />
                  </div>
                }
              />

              {/* 4. Selling Price */}
              <FieldEditorCard
                title="Selling Price"
                icon={DollarSign}
                enabled={config.showPrice}
                onToggleEnabled={val => updateConfig(p => ({ ...p, showPrice: val }))}
                subtitle="Price tag"
                width={config.layoutXY.price.w !== undefined ? config.layoutXY.price.w : effElemW('price').toFixed(1)}
                onWidthChange={val => updateConfig(p => ({ ...p, layoutXY: { ...p.layoutXY, price: { ...p.layoutXY.price, w: val } } }))}
                maxWidth={effLabelWidth}
                height={config.layoutXY.price.h !== undefined ? config.layoutXY.price.h : effElemH('price').toFixed(1)}
                onHeightChange={val => updateConfig(p => ({ ...p, layoutXY: { ...p.layoutXY, price: { ...p.layoutXY.price, h: val } } }))}
                maxHeight={effLabelHeight}
                fontSize={config.fontSize.price ?? 2}
                onFontSizeChange={val => updateConfig(p => ({ ...p, fontSize: { ...p.fontSize, price: val } }))}
                posX={config.layoutXY.price.x ?? '0'}
                onPosXChange={val => updateConfig(p => ({ ...p, layoutXY: { ...p.layoutXY, price: { ...p.layoutXY.price, x: val } } }))}
                posY={config.layoutXY.price.y ?? '16'}
                onPosYChange={val => updateConfig(p => ({ ...p, layoutXY: { ...p.layoutXY, price: { ...p.layoutXY.price, y: val } } }))}
              />
            </div>
          )}

          {/* TAB 4: PRINTER */}
          {activeTab === 'printer' && (
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4 animate-fade-in">
              <div className="flex items-center space-x-2">
                <Printer className="w-4 h-4 text-slate-900" />
                <h3 className="font-extrabold text-slate-900 text-sm">
                  Thermal Printer & Output
                </h3>
              </div>

              <div className="space-y-3.5">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                    Print Resolution (DPI)
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => updateConfig(p => ({ ...p, dpi: 203 }))}
                      className={segBtn((config.dpi ?? 203) === 203)}
                    >
                      203 DPI (8 dots/mm)
                    </button>
                    <button
                      type="button"
                      onClick={() => updateConfig(p => ({ ...p, dpi: 300 }))}
                      className={segBtn(config.dpi === 300)}
                    >
                      300 DPI (12 dots/mm)
                    </button>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Bluetooth className="w-4 h-4 text-slate-800" />
                      <span className="font-bold text-xs text-slate-900">Bluetooth Printer</span>
                    </div>
                    {btConnected && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-black text-white">
                        Connected
                      </span>
                    )}
                  </div>

                  {btAvailable ? (
                    <div className="space-y-2">
                      {isNative && pairedDevices.length > 0 && !btConnected && (
                        <select
                          value={selectedAddress}
                          onChange={(e) => setSelectedAddress(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-gray-900 cursor-pointer"
                        >
                          {pairedDevices.map(d => (
                            <option key={d.address} value={d.address}>{d.name} ({d.address})</option>
                          ))}
                        </select>
                      )}

                      <div className="flex gap-2">
                        {btConnected ? (
                          <button
                            type="button"
                            onClick={handleDisconnectPrinter}
                            className="flex-1 px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 font-bold text-xs rounded-xl transition-colors flex items-center justify-center space-x-1.5 cursor-pointer"
                          >
                            <BluetoothOff className="w-4 h-4" />
                            <span>Disconnect {printerName}</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={handleConnectPrinter}
                            disabled={btConnecting}
                            className="flex-1 px-4 py-2 bg-black hover:bg-gray-800 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center space-x-1.5 disabled:opacity-50 cursor-pointer"
                          >
                            {btConnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bluetooth className="w-4 h-4" />}
                            <span>{btConnecting ? 'Connecting...' : 'Connect Thermal Printer'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 font-medium">
                      Web Bluetooth is not supported on this browser. On Android devices, open the native app to connect Bluetooth thermal printers.
                    </p>
                  )}
                </div>

                {config.paperMode === 'receipt' && (
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                      Paper Cut Mode
                    </label>
                    <div className="flex gap-1.5 text-xs">
                      <button type="button" onClick={() => updateConfig(p => ({ ...p, cutMode: 'off' }))} className={segBtn(config.cutMode === 'off')}>Off</button>
                      <button type="button" onClick={() => updateConfig(p => ({ ...p, cutMode: 'partial' }))} className={segBtn(config.cutMode === 'partial')}>Partial</button>
                      <button type="button" onClick={() => updateConfig(p => ({ ...p, cutMode: 'full' }))} className={segBtn(config.cutMode === 'full')}>Full</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 5: ADVANCED */}
          {activeTab === 'advanced' && (
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-4 animate-fade-in">
              <div className="flex items-center space-x-2">
                <Settings2 className="w-4 h-4 text-slate-900" />
                <h3 className="font-extrabold text-slate-900 text-sm">
                  Advanced Calibration & Nudge
                </h3>
              </div>

              <div className="space-y-3.5">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      Horizontal Nudge Offset
                    </label>
                    <span className="text-[11px] font-mono font-bold text-slate-800">
                      {parseFloat(config.labelOffsetX || '0') > 0 ? `+${config.labelOffsetX}` : config.labelOffsetX} mm
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={-20}
                      max={20}
                      step={0.5}
                      value={config.labelOffsetX}
                      onChange={e => updateConfig(p => ({ ...p, labelOffsetX: e.target.value }))}
                      className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-gray-900"
                    />
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                    Nudge print head position left (negative) or right (positive) in millimeters to align with your sticker margin.
                  </p>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1.5 text-xs text-slate-600 font-mono">
                  <div className="flex justify-between">
                    <span>Active Paper Width:</span>
                    <strong>{effPaperWidth} mm</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Print Offset from Left:</span>
                    <strong>{effLabelOffsetMm.toFixed(1)} mm</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Dot Offset at {config.dpi ?? 203} DPI:</span>
                    <strong>{Math.round(effLabelOffsetMm * (config.dpi === 300 ? 12 : 8))} dots</strong>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 flex gap-2">
                  <button
                    type="button"
                    onClick={handleFeedAlign}
                    disabled={!btConnected || btPrinting}
                    className="flex-1 py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
                  >
                    Feed & Calibrate
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowResetConfirm(true)}
                    className="py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
                  >
                    Reset All Defaults
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* G. Bottom Action Bar */}
          <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200/80 shadow-2xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowResetConfirm(true)}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset to Defaults</span>
              </button>

              <button
                type="button"
                onClick={handleTestPrint}
                disabled={!btConnected || btPrinting}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-40"
              >
                {btPrinting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />}
                <span>Print Test Label</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowBulkPrint(!showBulkPrint)}
                className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors cursor-pointer flex items-center gap-1.5 ${
                  showBulkPrint
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>{showBulkPrint ? 'Hide Bulk Print' : `Bulk Print (${printItemsList.length})`}</span>
              </button>

              <button
                type="button"
                onClick={handleSaveSettings}
                disabled={!isDirty}
                className={`px-5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs ${
                  isDirty
                    ? 'bg-black text-white hover:bg-gray-800 active:scale-95'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                }`}
              >
                <Save className="w-4 h-4" />
                <span>{isDirty ? 'Save Changes' : 'Saved'}</span>
              </button>
            </div>
          </div>

          {/* Bulk Inventory Label Print Drawer / Card */}
          {showBulkPrint && (
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-2xs space-y-3.5 animate-fade-in">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Layers className="w-4 h-4 text-slate-900" />
                  <h3 className="font-extrabold text-slate-900 text-sm">
                    Bulk Inventory Label Print
                  </h3>
                </div>

                <span className="text-xs font-bold text-slate-600">
                  Total Labels: <strong className="text-black font-extrabold">{printItemsList.length}</strong>
                </span>
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center space-x-2 text-xs">
                  <button onClick={selectAll} className="text-gray-900 font-bold hover:underline cursor-pointer">All</button>
                  <span className="text-slate-300">|</span>
                  <button onClick={deselectAll} className="text-slate-500 hover:underline cursor-pointer">None</button>
                  <span className="text-slate-300">|</span>
                  <button onClick={() => setAllQuantities('stock')} className="text-slate-600 font-bold hover:underline cursor-pointer">Qty = Stock</button>
                </div>

                {btAvailable && (
                  <button
                    onClick={handleBtPrintBulk}
                    disabled={printItemsList.length === 0 || !btConnected || btPrinting}
                    className="px-3.5 py-1.5 bg-black hover:bg-gray-800 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    {btPrinting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />}
                    <span>
                      {btPrinting ? `Printing ${btProgress.current}/${btProgress.total}` : `Print ${printItemsList.length} Labels`}
                    </span>
                  </button>
                )}
              </div>

              <div className="relative">
                <Search className="absolute inset-y-0 left-0 pl-3 w-4 h-4 my-auto text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Filter by product name, SKU, or barcode..."
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:border-gray-900"
                />
              </div>

              <div className="space-y-1.5 max-h-[280px] overflow-y-auto pr-1">
                {filteredProducts.length === 0 ? (
                  <p className="text-center py-6 text-xs text-slate-400">No products found.</p>
                ) : (
                  filteredProducts.map(prod => {
                    const isSelected = selectedProducts[prod.id] !== undefined;
                    const qty = selectedProducts[prod.id] || 0;
                    const code = prod.barcode || prod.sku;
                    return (
                      <div
                        key={prod.id}
                        className={`p-2.5 rounded-xl border transition-all flex items-center justify-between text-xs ${
                          isSelected ? 'bg-slate-50 border-gray-300' : 'bg-white border-slate-100 hover:bg-slate-50'
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
                          <div className="flex items-center space-x-1 shrink-0 bg-white border border-slate-200 rounded-lg p-0.5 shadow-2xs">
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
          )}

        </div>

      </div>
    </div>
  );
};

export default LabelGeneratorTab;
