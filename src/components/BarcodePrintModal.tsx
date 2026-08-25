import React, { useState, useEffect, useCallback } from 'react';
import {
  Printer, X, Search, CheckSquare, Square, Settings2,
  Tag, Bluetooth, BluetoothOff, Loader2, CheckCircle2, AlertCircle,
  Minus, Plus, Ruler, Scissors, Maximize2, Minimize2, ZoomIn, ZoomOut, RotateCcw,
} from 'lucide-react';
import { Product } from '../types';
import BarcodeSVG from './BarcodeSVG';
import * as printerBridge from '../lib/printerBridge';
import {
  buildThermalLabel, init as escInit, setCodePage, feedPitch,
  normalizeBarcodeValue, getPrintableMm, testPrint,
} from '../lib/escpos';
import { loadLabelConfig, saveLabelConfig } from '../lib/labelConfig';

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

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoomFactor, setZoomFactor] = useState(1);

  const [layoutXY, setLayoutXY] = useState<{
    store: { x: string; y: string; w?: string; h?: string };
    product: { x: string; y: string; w?: string; h?: string };
    barcode: { x: string; y: string; w?: string; h?: string };
    price: { x: string; y: string; w?: string; h?: string };
  }>(initialConfig.layoutXY);

  const [fontSize, setFontSize] = useState<{ store: number; product: number; price: number }>(initialConfig.fontSize);

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
    setLayoutXY(next.layoutXY);
    setFontSize(next.fontSize);
    saveLabelConfig(next);
  }, [paperMode, paperWidth, labelWidth, labelHeight, barcodeWidth, barcodeHeight, cutMode, labelGap, feedOffset, showStoreName, showProductName, showPrice, showCodeText, storeName, layoutXY, fontSize, businessName]);

  const [dragState, setDragState] = useState<{
    elem: 'store' | 'product' | 'barcode' | 'price';
    action: 'move' | 'resize-e' | 'resize-s' | 'resize-se';
    startX: number;
    startY: number;
    initialX: number;
    initialY: number;
    initialW: number;
    initialH: number;
  } | null>(null);

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

  const effPaperWidth = clamp(parseMm(paperWidth) || 80, 15, 300);
  const printableMm = getPrintableMm(effPaperWidth);
  const effLabelWidth = clamp(parseMm(labelWidth) || effPaperWidth, 5, effPaperWidth);
  const effLabelHeight = clamp(parseMm(labelHeight) || 30, 8, 300);

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

  const handlePointerDown = (
    e: React.PointerEvent,
    elem: 'store' | 'product' | 'barcode' | 'price',
    action: 'move' | 'resize-e' | 'resize-s' | 'resize-se'
  ) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}

    const initialX = effElemX(elem);
    const initialY = effElemY(elem);
    const initialW = effElemW(elem);
    const initialH = effElemH(elem);

    setDragState({
      elem,
      action,
      startX: e.clientX,
      startY: e.clientY,
      initialX,
      initialY,
      initialW,
      initialH,
    });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragState) return;
    const dxMm = (e.clientX - dragState.startX) / previewScale;
    const dyMm = (e.clientY - dragState.startY) / previewScale;
    const elem = dragState.elem;

    let newX = dragState.initialX;
    let newY = dragState.initialY;
    let newW = dragState.initialW;
    let newH = dragState.initialH;

    if (dragState.action === 'move') {
      newX = clamp(dragState.initialX + dxMm, 0, Math.max(0, effLabelWidth - dragState.initialW));
      newY = clamp(dragState.initialY + dyMm, 0, Math.max(0, effLabelHeight - dragState.initialH));
    } else {
      if (dragState.action === 'resize-e' || dragState.action === 'resize-se') {
        const minW = 1;
        const maxW = Math.max(minW, effLabelWidth - dragState.initialX);
        newW = clamp(dragState.initialW + dxMm, minW, maxW);
      }
      if (dragState.action === 'resize-s' || dragState.action === 'resize-se') {
        const minH = 1;
        const maxH = Math.max(minH, effLabelHeight - dragState.initialY);
        newH = clamp(dragState.initialH + dyMm, minH, maxH);
      }
    }

    setLayoutXY(prev => ({
      ...prev,
      [elem]: {
        x: newX.toFixed(1),
        y: newY.toFixed(1),
        w: newW.toFixed(1),
        h: newH.toFixed(1),
      },
    }));

    if (elem === 'barcode') {
      setBarcodeWidth(newW.toFixed(1));
      setBarcodeHeight(newH.toFixed(1));
    } else {
      const fontScale = newH >= 8 ? 2 : 1;
      setFontSize(prev => ({ ...prev, [elem]: fontScale }));
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (dragState) {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
      setDragState(null);
    }
  };

  const layoutForPrint = {
    storeName: showStoreName ? { xMm: effElemX('store'), yMm: effElemY('store'), widthMm: effElemW('store'), heightMm: effElemH('store'), size: fontSize.store as 1 | 2 } : undefined,
    productName: showProductName ? { xMm: effElemX('product'), yMm: effElemY('product'), widthMm: effElemW('product'), heightMm: effElemH('product'), size: fontSize.product as 1 | 2 } : undefined,
    barcode: { xMm: effBarcodeX, yMm: effBarcodeY, widthMm: effBarcodeWidth, heightMm: effBarcodeHeight },
    price: showPrice ? { xMm: effElemX('price'), yMm: effElemY('price'), widthMm: effElemW('price'), heightMm: effElemH('price'), size: fontSize.price as 1 | 2 } : undefined,
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
    layout: layoutForPrint,
  });

  const handleBtPrint = useCallback(async () => {
    if (!printerBridge.isConnected() || printItemsList.length === 0 || btPrinting) return;

    setBtPrinting(true);
    setBtError(null);
    setBtProgress({ current: 0, total: printItemsList.length });

    try {
      await new Promise(r => setTimeout(r, 400));
      await printerBridge.send(escInit());
      await printerBridge.send(setCodePage('CP437'));

      for (let i = 0; i < printItemsList.length; i++) {
        const item = printItemsList[i];
        await printerBridge.send(buildThermalLabel(labelOptionsFor(item.product)));
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
      await printerBridge.send(testPrint());
    } catch (err: any) {
      setBtError(err?.message || 'Test print failed');
    }
  }, [btPrinting]);

  const handleFeedAlign = useCallback(async () => {
    if (!printerBridge.isConnected() || btPrinting) return;
    setBtError(null);
    try {
      await printerBridge.send(feedPitch(effLabelHeight, effLabelGap, effFeedOffset));
    } catch (err: any) {
      setBtError(err?.message || 'Feed failed');
    }
  }, [btPrinting, effLabelHeight, effLabelGap, effFeedOffset]);

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

  const renderSingleLabelCard = (productItem: Product) => {
    const codeVal = normalizeBarcodeValue(productItem.barcode || productItem.sku || '000000', 'CODE128');
    return (
      <div
        className="bg-white border border-slate-400 rounded shadow-xs select-none overflow-hidden touch-none relative transition-transform duration-75"
        style={{ width: previewW, height: previewH }}
      >
        {/* Store Name Element */}
        {showStoreName && (
          <div
            className="absolute border border-dashed border-slate-400/80 hover:border-black bg-slate-900/5 rounded group flex items-center justify-center select-none cursor-move p-0.5"
            style={{
              left: effElemX('store') * previewScale,
              top: effElemY('store') * previewScale,
              width: effElemW('store') * previewScale,
              height: effElemH('store') * previewScale,
            }}
            onPointerDown={(e) => handlePointerDown(e, 'store', 'move')}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            title={`Store Name (${effElemW('store').toFixed(1)}×${effElemH('store').toFixed(1)}mm)`}
          >
            <span
              className="font-extrabold uppercase text-slate-800 truncate w-full text-center pointer-events-none"
              style={{ fontSize: Math.max(6, Math.min(28, effElemH('store') * previewScale * 0.75)) }}
            >
              {storeName || businessName || 'My Store'}
            </span>
            <div
              className="absolute -right-1 top-1/2 -translate-y-1/2 w-3 h-5 bg-slate-900 border border-white rounded-2xs cursor-ew-resize opacity-90 sm:opacity-0 sm:group-hover:opacity-100 z-10 touch-none"
              onPointerDown={(e) => handlePointerDown(e, 'store', 'resize-e')}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              title="Resize Width"
            />
            <div
              className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-5 h-3 bg-slate-900 border border-white rounded-2xs cursor-ns-resize opacity-90 sm:opacity-0 sm:group-hover:opacity-100 z-10 touch-none"
              onPointerDown={(e) => handlePointerDown(e, 'store', 'resize-s')}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              title="Resize Height"
            />
            <div
              className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-black border border-white rounded-2xs cursor-nwse-resize opacity-90 sm:opacity-0 sm:group-hover:opacity-100 z-10 touch-none"
              onPointerDown={(e) => handlePointerDown(e, 'store', 'resize-se')}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              title="Resize Size"
            />
          </div>
        )}

        {/* Product Title Element */}
        {showProductName && (
          <div
            className="absolute border border-dashed border-slate-400/80 hover:border-black bg-slate-900/5 rounded group flex items-center justify-center select-none cursor-move p-0.5"
            style={{
              left: effElemX('product') * previewScale,
              top: effElemY('product') * previewScale,
              width: effElemW('product') * previewScale,
              height: effElemH('product') * previewScale,
            }}
            onPointerDown={(e) => handlePointerDown(e, 'product', 'move')}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            title={`Product Title (${effElemW('product').toFixed(1)}×${effElemH('product').toFixed(1)}mm)`}
          >
            <p
              className="font-extrabold text-slate-900 leading-tight line-clamp-2 w-full text-center pointer-events-none"
              style={{ fontSize: Math.max(6, Math.min(24, effElemH('product') * previewScale * 0.6)) }}
            >
              {productItem.name}
            </p>
            <div
              className="absolute -right-1 top-1/2 -translate-y-1/2 w-3 h-5 bg-slate-900 border border-white rounded-2xs cursor-ew-resize opacity-90 sm:opacity-0 sm:group-hover:opacity-100 z-10 touch-none"
              onPointerDown={(e) => handlePointerDown(e, 'product', 'resize-e')}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              title="Resize Width"
            />
            <div
              className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-5 h-3 bg-slate-900 border border-white rounded-2xs cursor-ns-resize opacity-90 sm:opacity-0 sm:group-hover:opacity-100 z-10 touch-none"
              onPointerDown={(e) => handlePointerDown(e, 'product', 'resize-s')}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              title="Resize Height"
            />
            <div
              className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-black border border-white rounded-2xs cursor-nwse-resize opacity-90 sm:opacity-0 sm:group-hover:opacity-100 z-10 touch-none"
              onPointerDown={(e) => handlePointerDown(e, 'product', 'resize-se')}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              title="Resize Size"
            />
          </div>
        )}

        {/* Barcode Box Element */}
        <div
          className="absolute border border-dashed border-slate-900 bg-slate-900/5 group flex flex-col items-center justify-between rounded cursor-move select-none p-0.5"
          style={{
            left: effBarcodeX * previewScale,
            top: effBarcodeY * previewScale,
            width: effBarcodeWidth * previewScale,
            height: effBarcodeHeight * previewScale,
          }}
          onPointerDown={(e) => handlePointerDown(e, 'barcode', 'move')}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          title={`Barcode CODE128 (${effBarcodeWidth.toFixed(1)}×${effBarcodeHeight.toFixed(1)}mm)`}
        >
          <div className="w-full h-full flex flex-col items-center justify-between overflow-hidden pointer-events-none min-h-0">
            <BarcodeSVG
              value={codeVal}
              height={Math.max(10, Math.round(effBarcodeHeight * previewScale - (showCodeText ? 10 : 0)))}
              showValue={false}
              className="w-full flex-1 min-h-0"
            />
            {showCodeText && (
              <div
                className="font-mono font-bold text-slate-900 text-center truncate w-full shrink-0 leading-tight mt-0.5"
                style={{ fontSize: Math.max(6, Math.min(14, effBarcodeHeight * previewScale * 0.22)) }}
              >
                {codeVal}
              </div>
            )}
          </div>

          <div
            className="absolute -right-1 top-1/2 -translate-y-1/2 w-3 h-5 bg-slate-900 border border-white rounded-2xs cursor-ew-resize opacity-90 hover:opacity-100 z-10 touch-none"
            onPointerDown={(e) => handlePointerDown(e, 'barcode', 'resize-e')}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            title="Resize Barcode Width"
          />
          <div
            className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-5 h-3 bg-slate-900 border border-white rounded-2xs cursor-ns-resize opacity-90 hover:opacity-100 z-10 touch-none"
            onPointerDown={(e) => handlePointerDown(e, 'barcode', 'resize-s')}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            title="Resize Barcode Height"
          />
          <div
            className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-black border border-white rounded-2xs cursor-nwse-resize opacity-95 hover:opacity-100 z-10 touch-none"
            onPointerDown={(e) => handlePointerDown(e, 'barcode', 'resize-se')}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            title="Resize Barcode Box"
          />
        </div>

        {/* Price Box Element */}
        {showPrice && (
          <div
            className="absolute border border-dashed border-slate-400/80 hover:border-black bg-slate-900/5 rounded group flex items-center justify-center cursor-move p-0.5"
            style={{
              left: effElemX('price') * previewScale,
              top: effElemY('price') * previewScale,
              width: effElemW('price') * previewScale,
              height: effElemH('price') * previewScale,
            }}
            onPointerDown={(e) => handlePointerDown(e, 'price', 'move')}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            title={`Price Tag (${effElemW('price').toFixed(1)}×${effElemH('price').toFixed(1)}mm)`}
          >
            <span
              className="font-extrabold font-mono text-slate-900 px-1 truncate pointer-events-none"
              style={{ fontSize: Math.max(6, Math.min(26, effElemH('price') * previewScale * 0.75)) }}
            >
              {productItem.price.toLocaleString()} {currencySymbol}
            </span>
            <div
              className="absolute -right-1 top-1/2 -translate-y-1/2 w-3 h-5 bg-slate-900 border border-white rounded-2xs cursor-ew-resize opacity-90 sm:opacity-0 sm:group-hover:opacity-100 z-10 touch-none"
              onPointerDown={(e) => handlePointerDown(e, 'price', 'resize-e')}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              title="Resize Width"
            />
            <div
              className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-5 h-3 bg-slate-900 border border-white rounded-2xs cursor-ns-resize opacity-90 sm:opacity-0 sm:group-hover:opacity-100 z-10 touch-none"
              onPointerDown={(e) => handlePointerDown(e, 'price', 'resize-s')}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              title="Resize Height"
            />
            <div
              className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-black border border-white rounded-2xs cursor-nwse-resize opacity-90 sm:opacity-0 sm:group-hover:opacity-100 z-10 touch-none"
              onPointerDown={(e) => handlePointerDown(e, 'price', 'resize-se')}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              title="Resize Size"
            />
          </div>
        )}
      </div>
    );
  };

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
                  Fullscreen Interactive Label Canvas
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

               {/* Coordinates table */}
               <div className="border border-slate-200 rounded-lg p-2.5 space-y-2">
                 <span className="text-[11px] font-bold text-slate-800 block">Live Element Coordinates (mm)</span>
                 <div className="grid grid-cols-[1fr_48px_48px_48px_48px] gap-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider items-center">
                   <span>Element</span><span>X mm</span><span>Y mm</span><span>W mm</span><span>H mm</span>
                   
                   {/* Store */}
                   <span className="text-slate-700 normal-case font-semibold">Store</span>
                   <input type="number" step={0.5} min={0} max={Math.max(0, effLabelWidth - 1)} value={layoutXY.store.x ?? ''}
                     onChange={e => setLayoutXY(prev => ({ ...prev, store: { ...prev.store, x: e.target.value } }))}
                     className="w-full px-1 py-1 bg-slate-50 border border-slate-200 rounded text-[10px] font-semibold text-slate-800 focus:outline-none focus:border-gray-900" />
                   <input type="number" step={0.5} min={0} max={Math.max(0, effLabelHeight - 1)} value={layoutXY.store.y ?? ''}
                     onChange={e => setLayoutXY(prev => ({ ...prev, store: { ...prev.store, y: e.target.value } }))}
                     className="w-full px-1 py-1 bg-slate-50 border border-slate-200 rounded text-[10px] font-semibold text-slate-800 focus:outline-none focus:border-gray-900" />
                   <input type="number" step={0.5} min={1} max={effLabelWidth} value={layoutXY.store.w !== undefined ? layoutXY.store.w : effElemW('store').toFixed(1)}
                     onChange={e => setLayoutXY(prev => ({ ...prev, store: { ...prev.store, w: e.target.value } }))}
                     className="w-full px-1 py-1 bg-slate-50 border border-slate-200 rounded text-[10px] font-semibold text-slate-800 focus:outline-none focus:border-gray-900" />
                   <input type="number" step={0.5} min={1} max={effLabelHeight} value={layoutXY.store.h !== undefined ? layoutXY.store.h : effElemH('store').toFixed(1)}
                     onChange={e => setLayoutXY(prev => ({ ...prev, store: { ...prev.store, h: e.target.value } }))}
                     className="w-full px-1 py-1 bg-slate-50 border border-slate-200 rounded text-[10px] font-semibold text-slate-800 focus:outline-none focus:border-gray-900" />

                   {/* Product */}
                   <span className="text-slate-700 normal-case font-semibold">Product</span>
                   <input type="number" step={0.5} min={0} max={Math.max(0, effLabelWidth - 1)} value={layoutXY.product.x ?? ''}
                     onChange={e => setLayoutXY(prev => ({ ...prev, product: { ...prev.product, x: e.target.value } }))}
                     className="w-full px-1 py-1 bg-slate-50 border border-slate-200 rounded text-[10px] font-semibold text-slate-800 focus:outline-none focus:border-gray-900" />
                   <input type="number" step={0.5} min={0} max={Math.max(0, effLabelHeight - 1)} value={layoutXY.product.y ?? ''}
                     onChange={e => setLayoutXY(prev => ({ ...prev, product: { ...prev.product, y: e.target.value } }))}
                     className="w-full px-1 py-1 bg-slate-50 border border-slate-200 rounded text-[10px] font-semibold text-slate-800 focus:outline-none focus:border-gray-900" />
                   <input type="number" step={0.5} min={1} max={effLabelWidth} value={layoutXY.product.w !== undefined ? layoutXY.product.w : effElemW('product').toFixed(1)}
                     onChange={e => setLayoutXY(prev => ({ ...prev, product: { ...prev.product, w: e.target.value } }))}
                     className="w-full px-1 py-1 bg-slate-50 border border-slate-200 rounded text-[10px] font-semibold text-slate-800 focus:outline-none focus:border-gray-900" />
                   <input type="number" step={0.5} min={1} max={effLabelHeight} value={layoutXY.product.h !== undefined ? layoutXY.product.h : effElemH('product').toFixed(1)}
                     onChange={e => setLayoutXY(prev => ({ ...prev, product: { ...prev.product, h: e.target.value } }))}
                     className="w-full px-1 py-1 bg-slate-50 border border-slate-200 rounded text-[10px] font-semibold text-slate-800 focus:outline-none focus:border-gray-900" />

                   {/* Barcode Box */}
                   <span className="text-slate-900 normal-case font-extrabold">Barcode</span>
                   <input type="number" step={0.5} min={0} max={Math.max(0, effLabelWidth - effBarcodeWidth)} value={layoutXY.barcode.x ?? ''}
                     onChange={e => setLayoutXY(prev => ({ ...prev, barcode: { ...prev.barcode, x: e.target.value } }))}
                     className="w-full px-1 py-1 bg-slate-50 border border-slate-200 rounded text-[10px] font-semibold text-slate-800 focus:outline-none focus:border-gray-900" />
                   <input type="number" step={0.5} min={0} max={Math.max(0, effLabelHeight - effBarcodeHeight)} value={layoutXY.barcode.y ?? ''}
                     onChange={e => setLayoutXY(prev => ({ ...prev, barcode: { ...prev.barcode, y: e.target.value } }))}
                     className="w-full px-1 py-1 bg-slate-50 border border-slate-200 rounded text-[10px] font-semibold text-slate-800 focus:outline-none focus:border-gray-900" />
                   <input type="number" step={0.5} min={1} max={effLabelWidth} value={barcodeWidth !== undefined ? barcodeWidth : effBarcodeWidth.toFixed(1)}
                     onChange={e => { setBarcodeWidth(e.target.value); setLayoutXY(prev => ({ ...prev, barcode: { ...prev.barcode, w: e.target.value } })); }}
                     className="w-full px-1 py-1 bg-slate-50 border border-slate-200 rounded text-[10px] font-semibold text-slate-800 focus:outline-none focus:border-gray-900" />
                   <input type="number" step={0.5} min={1} max={effLabelHeight} value={barcodeHeight}
                     onChange={e => { setBarcodeHeight(e.target.value); setLayoutXY(prev => ({ ...prev, barcode: { ...prev.barcode, h: e.target.value } })); }}
                     className="w-full px-1 py-1 bg-slate-50 border border-slate-200 rounded text-[10px] font-semibold text-slate-800 focus:outline-none focus:border-gray-900" />

                   {/* Price */}
                   <span className="text-slate-900 border-b border-dashed border-slate-400 normal-case font-bold">Price</span>
                   <input type="number" step={0.5} min={0} max={Math.max(0, effLabelWidth - 1)} value={layoutXY.price.x ?? ''}
                     onChange={e => setLayoutXY(prev => ({ ...prev, price: { ...prev.price, x: e.target.value } }))}
                     className="w-full px-1 py-1 bg-slate-50 border border-slate-200 rounded text-[10px] font-semibold text-slate-800 focus:outline-none focus:border-gray-900" />
                   <input type="number" step={0.5} min={0} max={Math.max(0, effLabelHeight - 1)} value={layoutXY.price.y ?? ''}
                     onChange={e => setLayoutXY(prev => ({ ...prev, price: { ...prev.price, y: e.target.value } }))}
                     className="w-full px-1 py-1 bg-slate-50 border border-slate-200 rounded text-[10px] font-semibold text-slate-800 focus:outline-none focus:border-gray-900" />
                   <input type="number" step={0.5} min={1} max={effLabelWidth} value={layoutXY.price.w !== undefined ? layoutXY.price.w : effElemW('price').toFixed(1)}
                     onChange={e => setLayoutXY(prev => ({ ...prev, price: { ...prev.price, w: e.target.value } }))}
                     className="w-full px-1 py-1 bg-slate-50 border border-slate-200 rounded text-[10px] font-semibold text-slate-800 focus:outline-none focus:border-gray-900" />
                   <input type="number" step={0.5} min={1} max={effLabelHeight} value={layoutXY.price.h !== undefined ? layoutXY.price.h : effElemH('price').toFixed(1)}
                     onChange={e => setLayoutXY(prev => ({ ...prev, price: { ...prev.price, h: e.target.value } }))}
                     className="w-full px-1 py-1 bg-slate-50 border border-slate-200 rounded text-[10px] font-semibold text-slate-800 focus:outline-none focus:border-gray-900" />
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
                  Interactive Preview ({totalLabels} labels · {effLabelWidth.toFixed(0)}×{effLabelHeight.toFixed(0)}mm)
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
