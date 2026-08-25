import React, { useState, useEffect, useCallback } from 'react';
import {
  Printer, X, Search, CheckSquare, Square, Settings2,
  Tag, Bluetooth, BluetoothOff, Loader2, CheckCircle2, AlertCircle,
  Minus, Plus, Ruler, Scissors, RefreshCw, Save, Layers,
  Maximize2, Minimize2, ZoomIn, ZoomOut, RotateCcw,
} from 'lucide-react';
import { Product, LabelConfig } from '../types';
import BarcodeSVG from './BarcodeSVG';
import * as printerBridge from '../lib/printerBridge';
import {
  buildThermalLabel, init as escInit, setCodePage, feedPitch,
  normalizeBarcodeValue, getPrintableMm, testPrint,
} from '../lib/escpos';
import { loadLabelConfig, saveLabelConfig, DEFAULT_LABEL_CONFIG } from '../lib/labelConfig';

interface LabelGeneratorTabProps {
  products: Product[];
  currencySymbol?: string;
  businessName?: string;
}

const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);
const parseMm = (v: string) => {
  const n = parseFloat(v);
  return isFinite(n) && n > 0 ? n : 0;
};

export const LabelGeneratorTab: React.FC<LabelGeneratorTabProps> = ({
  products,
  currencySymbol = 'Ks',
  businessName,
}) => {
  const [config, setConfig] = useState<LabelConfig>(() => loadLabelConfig(businessName));
  const [saveToast, setSaveToast] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [sampleProductId, setSampleProductId] = useState<string>(() => (products[0] ? products[0].id : ''));

  const [selectedProducts, setSelectedProducts] = useState<{ [id: string]: number }>({});

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoomFactor, setZoomFactor] = useState(1);
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

  const updateConfig = (updater: (prev: LabelConfig) => LabelConfig) => {
    setConfig(prev => {
      const next = updater(prev);
      saveLabelConfig(next);
      return next;
    });
  };

  const handleSaveSettings = () => {
    saveLabelConfig(config);
    if (selectedAddress) {
      const dev = pairedDevices.find(d => d.address === selectedAddress);
      printerBridge.saveLastPrinter(selectedAddress, dev?.name || printerName || selectedAddress);
    }
    setSaveToast(true);
    setTimeout(() => setSaveToast(false), 3000);
  };

  const handleResetDefaults = () => {
    const fresh = {
      ...DEFAULT_LABEL_CONFIG,
      storeName: businessName || DEFAULT_LABEL_CONFIG.storeName,
    };
    setConfig(fresh);
    saveLabelConfig(fresh);
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

  const effPaperWidth = clamp(parseMm(config.paperWidth) || 80, 15, 300);
  const printableMm = getPrintableMm(effPaperWidth);
  const effLabelWidth = clamp(parseMm(config.labelWidth) || effPaperWidth, 5, effPaperWidth);
  const effLabelHeight = clamp(parseMm(config.labelHeight) || 30, 8, 300);

  const effElemX = (k: 'store' | 'product' | 'barcode' | 'price') =>
    clamp(parseMm(config.layoutXY[k].x) || 0, 0, Math.max(0, effLabelWidth - 5));

  const effElemY = (k: 'store' | 'product' | 'barcode' | 'price') =>
    clamp(parseMm(config.layoutXY[k].y) || 0, 0, Math.max(0, effLabelHeight - 3));

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
    const defaultH = k === 'barcode' ? (parseMm(config.barcodeHeight) || 10) : (k === 'price' ? 5 : 4);
    return clamp(defaultH, 1, Math.max(1, effLabelHeight - effElemY(k)));
  };

  const effBarcodeWidth = effElemW('barcode');
  const effBarcodeHeight = effElemH('barcode');
  const effBarcodeX = effElemX('barcode');
  const effBarcodeY = effElemY('barcode');

  const effLabelGap = clamp(parseMm(config.labelGap) || 3, 2, 10);
  const effFeedOffset = clamp(parseMm(config.feedOffset) || 0, -10, 10);

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

    updateConfig(prev => {
      const updatedLayout = {
        ...prev.layoutXY,
        [elem]: {
          x: newX.toFixed(1),
          y: newY.toFixed(1),
          w: newW.toFixed(1),
          h: newH.toFixed(1),
        },
      };
      let updatedBCWidth = prev.barcodeWidth;
      let updatedBCHeight = prev.barcodeHeight;
      let updatedFontSize = { ...prev.fontSize };

      if (elem === 'barcode') {
        updatedBCWidth = newW.toFixed(1);
        updatedBCHeight = newH.toFixed(1);
      } else {
        const fontScale = newH >= 8 ? 2 : 1;
        updatedFontSize[elem] = fontScale;
      }

      return {
        ...prev,
        layoutXY: updatedLayout,
        barcodeWidth: updatedBCWidth,
        barcodeHeight: updatedBCHeight,
        fontSize: updatedFontSize,
      };
    });
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
    storeName: config.showStoreName ? { xMm: effElemX('store'), yMm: effElemY('store'), widthMm: effElemW('store'), heightMm: effElemH('store'), size: config.fontSize.store as 1 | 2 } : undefined,
    productName: config.showProductName ? { xMm: effElemX('product'), yMm: effElemY('product'), widthMm: effElemW('product'), heightMm: effElemH('product'), size: config.fontSize.product as 1 | 2 } : undefined,
    barcode: { xMm: effBarcodeX, yMm: effBarcodeY, widthMm: effBarcodeWidth, heightMm: effBarcodeHeight },
    price: config.showPrice ? { xMm: effElemX('price'), yMm: effElemY('price'), widthMm: effElemW('price'), heightMm: effElemH('price'), size: config.fontSize.price as 1 | 2 } : undefined,
  };

  const labelOptionsFor = (productItem: Product) => ({
    storeName: config.storeName || businessName || 'My Retail Store',
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

  const numInputClass = "w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-gray-900";
  const segBtn = (active: boolean) =>
    `flex-1 px-2.5 py-1.5 rounded-xl border font-bold text-xs transition-all text-center cursor-pointer ${
      active
        ? 'bg-black text-white border-black shadow-xs'
        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
    }`;

  const sampleCodeVal = normalizeBarcodeValue(sampleProduct.barcode || sampleProduct.sku || '000000', 'CODE128');

  const renderCanvasCard = () => (
    <div
      className="bg-white border border-slate-400 rounded shadow-md select-none overflow-hidden touch-none relative transition-transform duration-75"
      style={{ width: previewW, height: previewH }}
    >
      {config.showStoreName && (
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
            {config.storeName || businessName || 'My Store'}
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

      {config.showProductName && (
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
            {sampleProduct.name}
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
            value={sampleCodeVal}
            height={Math.max(10, Math.round(effBarcodeHeight * previewScale - (config.showCodeText ? 10 : 0)))}
            showValue={false}
            className="w-full flex-1 min-h-0"
          />
          {config.showCodeText && (
            <div
              className="font-mono font-bold text-slate-900 text-center truncate w-full shrink-0 leading-tight mt-0.5"
              style={{ fontSize: Math.max(6, Math.min(14, effBarcodeHeight * previewScale * 0.22)) }}
            >
              {sampleCodeVal}
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

      {config.showPrice && (
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
            {sampleProduct.price.toLocaleString()} {currencySymbol}
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

  return (
    <div className="space-y-6 pb-12 animate-fade-in">
      {isFullscreen && (
        <div className="fixed inset-0 z-50 bg-slate-950/95 text-white flex flex-col p-2.5 sm:p-6 backdrop-blur-md overflow-hidden animate-fade-in">
          <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-4 pb-2.5 sm:pb-4 border-b border-slate-800 shrink-0">
            <div className="flex items-center space-x-2.5 sm:space-x-3">
              <div className="p-1.5 sm:p-2 bg-white text-black rounded-xl shrink-0">
                <Tag className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-white text-xs sm:text-base">
                  Fullscreen Interactive Label Canvas
                </h3>
                <p className="text-[10px] sm:text-xs text-slate-400 font-medium">
                  {effLabelWidth.toFixed(0)} × {effLabelHeight.toFixed(0)}mm · Drag to move, handles to resize
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <select
                value={sampleProductId}
                onChange={e => setSampleProductId(e.target.value)}
                className="px-2 py-1 bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold text-white focus:outline-none max-w-[120px] sm:max-w-[170px] cursor-pointer"
              >
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>

              <div className="flex items-center space-x-1 bg-slate-800 p-1 rounded-xl border border-slate-700 text-xs">
                <button
                  onClick={handleZoomOut}
                  disabled={zoomFactor <= 0.5}
                  className="p-1 sm:p-1.5 text-slate-300 hover:text-white disabled:opacity-30 cursor-pointer"
                  title="Zoom Out (-25%)"
                >
                  <ZoomOut className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>
                <button
                  onClick={handleResetZoom}
                  className="px-1.5 sm:px-2 py-0.5 sm:py-1 text-[11px] sm:text-xs font-extrabold text-white hover:bg-slate-700 rounded-lg cursor-pointer font-mono"
                  title="Reset Zoom (100%)"
                >
                  {Math.round(zoomFactor * 100)}%
                </button>
                <button
                  onClick={handleZoomIn}
                  disabled={zoomFactor >= 3}
                  className="p-1 sm:p-1.5 text-slate-300 hover:text-white disabled:opacity-30 cursor-pointer"
                  title="Zoom In (+25%)"
                >
                  <ZoomIn className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>
                <button
                  onClick={handleResetZoom}
                  className="p-1 sm:p-1.5 text-slate-400 hover:text-white cursor-pointer"
                  title="Reset Zoom Scale"
                >
                  <RotateCcw className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                </button>
              </div>

              <button
                onClick={() => setIsFullscreen(false)}
                className="px-2.5 sm:px-3.5 py-1.5 bg-white text-black font-extrabold text-xs rounded-xl shadow-xs hover:bg-slate-200 transition-colors flex items-center space-x-1.5 cursor-pointer shrink-0"
              >
                <Minimize2 className="w-4 h-4" />
                <span className="hidden sm:inline">Exit Fullscreen</span>
              </button>
            </div>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center overflow-auto p-2 sm:p-8 my-2 sm:my-4 bg-slate-900/60 rounded-2xl border border-slate-800 shadow-2xl relative select-none touch-none">
            {renderCanvasCard()}
          </div>

          <div className="pt-2 sm:pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[10px] sm:text-xs text-slate-400 shrink-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono">
              <span>Store: {effElemX('store').toFixed(1)},{effElemY('store').toFixed(1)}</span>
              <span>Product: {effElemX('product').toFixed(1)},{effElemY('product').toFixed(1)}</span>
              <span>Barcode: {effBarcodeX.toFixed(1)},{effBarcodeY.toFixed(1)}</span>
              <span>Price: {effElemX('price').toFixed(1)},{effElemY('price').toFixed(1)}</span>
            </div>
            <span className="hidden sm:inline">Press <kbd className="bg-slate-800 px-1.5 py-0.5 rounded text-white font-mono">ESC</kbd> to exit</span>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-3.5">
          <div className="p-3 bg-black text-white rounded-xl shadow-xs shrink-0">
            <Printer className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
              Label Generator & Live Layout Designer
            </h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Set paper size by numbers, drag & resize elements freely on the live canvas (CODE 128 format).
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleResetDefaults}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
            title="Reset layout to standard defaults"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reset Defaults</span>
          </button>
          <button
            onClick={handleSaveSettings}
            className="px-4 py-2 bg-black hover:bg-gray-800 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5 active:scale-95"
            title="Save settings"
          >
            <Save className="w-4 h-4" />
            <span>Save Settings</span>
          </button>
        </div>
      </div>

      {saveToast && (
        <div className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl flex items-center space-x-2 text-xs text-gray-900 font-bold shadow-xs animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-gray-900 shrink-0" />
          <span>Printer and label layout settings saved successfully!</span>
        </div>
      )}

      {btError && (
        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-xl flex items-center space-x-2 text-xs text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{btError}</span>
          <button onClick={() => setBtError(null)} className="text-red-400 hover:text-red-600 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column */}
        <div className="lg:col-span-6 space-y-6">

          {/* Printer Connection */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Bluetooth className="w-5 h-5 text-gray-900" />
                <h3 className="font-extrabold text-slate-900 text-sm">
                  Printer Model & Connection
                </h3>
              </div>

              {btConnected && (
                <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold text-gray-900">
                  <CheckCircle2 className="w-3.5 h-3.5 text-gray-900" />
                  <span className="truncate max-w-[140px]">{printerName}</span>
                </div>
              )}
            </div>

            {btAvailable ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  {isNative && pairedDevices.length > 0 && !btConnected && (
                    <select
                      value={selectedAddress}
                      onChange={(e) => setSelectedAddress(e.target.value)}
                      className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-gray-900 cursor-pointer"
                    >
                      {pairedDevices.map(d => (
                        <option key={d.address} value={d.address}>{d.name} ({d.address})</option>
                      ))}
                    </select>
                  )}

                  {btConnected ? (
                    <button
                      onClick={handleDisconnectPrinter}
                      className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 font-bold text-xs rounded-xl transition-colors flex items-center space-x-1.5 cursor-pointer"
                    >
                      <BluetoothOff className="w-4 h-4" />
                      <span>Disconnect Printer</span>
                    </button>
                  ) : (
                    <button
                      onClick={handleConnectPrinter}
                      disabled={btConnecting}
                      className="flex-1 px-4 py-2 bg-black hover:bg-gray-800 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center space-x-1.5 disabled:opacity-50 cursor-pointer"
                    >
                      {btConnecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bluetooth className="w-4 h-4" />}
                      <span>{btConnecting ? 'Connecting Printer...' : 'Connect Thermal Printer'}</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                  <button
                    onClick={handleTestPrint}
                    disabled={!btConnected || btPrinting}
                    className="flex-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg transition-colors flex items-center justify-center space-x-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5 text-slate-600" />
                    <span>Test Print</span>
                  </button>
                  <button
                    onClick={handleFeedAlign}
                    disabled={!btConnected || btPrinting}
                    className="flex-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-lg transition-colors flex items-center justify-center space-x-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    <Ruler className="w-3.5 h-3.5 text-slate-600" />
                    <span>Feed & Align Sticker</span>
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500 font-medium">
                Web Bluetooth is not supported on this browser. On Android devices, open the native app to connect Bluetooth thermal printers.
              </p>
            )}
          </div>

          {/* Paper Dimensions by Number */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Ruler className="w-5 h-5 text-gray-900" />
                <h3 className="font-extrabold text-slate-900 text-sm">
                  Paper & Label Size (Set by Number)
                </h3>
              </div>
              <span className="text-xs font-semibold text-slate-400">
                ({printableMm}mm printable)
              </span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  Paper Type
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => updateConfig(p => ({ ...p, paperMode: 'sticker' }))}
                    className={segBtn(config.paperMode === 'sticker')}
                  >
                    <span className="inline-flex items-center justify-center gap-1.5"><Tag className="w-3.5 h-3.5" />Sticker Labels</span>
                  </button>
                  <button
                    onClick={() => updateConfig(p => ({ ...p, paperMode: 'receipt' }))}
                    className={segBtn(config.paperMode === 'receipt')}
                  >
                    <span className="inline-flex items-center justify-center gap-1.5"><Printer className="w-3.5 h-3.5" />Continuous Roll</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                    Paper Width (mm)
                  </label>
                  <input
                    type="number" min={15} max={300} value={config.paperWidth}
                    onChange={e => updateConfig(p => ({ ...p, paperWidth: e.target.value }))}
                    className={numInputClass}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                    Label Width (mm)
                  </label>
                  <input
                    type="number" min={5} max={300} value={config.labelWidth}
                    onChange={e => updateConfig(p => ({ ...p, labelWidth: e.target.value }))}
                    className={numInputClass}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                    Label Height (mm)
                  </label>
                  <input
                    type="number" min={8} max={300} value={config.labelHeight}
                    onChange={e => updateConfig(p => ({ ...p, labelHeight: e.target.value }))}
                    className={numInputClass}
                  />
                </div>
              </div>

              {config.paperMode === 'sticker' && (
                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                      Label Gap (mm)
                    </label>
                    <input
                      type="number" min={2} max={10} step={0.5} value={config.labelGap}
                      onChange={e => updateConfig(p => ({ ...p, labelGap: e.target.value }))}
                      className={numInputClass}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                      Feed Offset (mm)
                    </label>
                    <input
                      type="number" min={-10} max={10} step={0.5} value={config.feedOffset}
                      onChange={e => updateConfig(p => ({ ...p, feedOffset: e.target.value }))}
                      className={numInputClass}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Label Elements & Format */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
            <div className="flex items-center space-x-2">
              <Settings2 className="w-5 h-5 text-gray-900" />
              <h3 className="font-extrabold text-slate-900 text-sm">
                Label Fields & Barcode Format
              </h3>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                  Store / Header Name
                </label>
                <input
                  type="text"
                  value={config.storeName}
                  onChange={e => updateConfig(p => ({ ...p, storeName: e.target.value }))}
                  placeholder="Store or Branch Name"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-gray-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-slate-700">
                <label className="flex items-center space-x-2 cursor-pointer bg-slate-50 p-2 rounded-lg border border-slate-200/80">
                  <input
                    type="checkbox"
                    checked={config.showStoreName}
                    onChange={e => updateConfig(p => ({ ...p, showStoreName: e.target.checked }))}
                    className="rounded text-gray-900 focus:ring-black/20"
                  />
                  <span>Store Name</span>
                </label>

                <label className="flex items-center space-x-2 cursor-pointer bg-slate-50 p-2 rounded-lg border border-slate-200/80">
                  <input
                    type="checkbox"
                    checked={config.showProductName}
                    onChange={e => updateConfig(p => ({ ...p, showProductName: e.target.checked }))}
                    className="rounded text-gray-900 focus:ring-black/20"
                  />
                  <span>Product Title</span>
                </label>

                <label className="flex items-center space-x-2 cursor-pointer bg-slate-50 p-2 rounded-lg border border-slate-200/80">
                  <input
                    type="checkbox"
                    checked={config.showPrice}
                    onChange={e => updateConfig(p => ({ ...p, showPrice: e.target.checked }))}
                    className="rounded text-gray-900 focus:ring-black/20"
                  />
                  <span>Selling Price</span>
                </label>

                <label className="flex items-center space-x-2 cursor-pointer bg-slate-50 p-2 rounded-lg border border-slate-200/80">
                  <input
                    type="checkbox"
                    checked={config.showCodeText}
                    onChange={e => updateConfig(p => ({ ...p, showCodeText: e.target.checked }))}
                    className="rounded text-gray-900 focus:ring-black/20"
                  />
                  <span>SKU / BC Text</span>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700">Barcode Format</span>
                  <span className="font-mono bg-black text-white px-2.5 py-0.5 rounded-lg text-xs font-extrabold">CODE 128</span>
                </div>

                {config.paperMode === 'receipt' && (
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                      Paper Cut Mode
                    </label>
                    <div className="flex gap-1 text-xs">
                      <button onClick={() => updateConfig(p => ({ ...p, cutMode: 'off' }))} className={segBtn(config.cutMode === 'off')}>Off</button>
                      <button onClick={() => updateConfig(p => ({ ...p, cutMode: 'partial' }))} className={segBtn(config.cutMode === 'partial')}>Partial</button>
                      <button onClick={() => updateConfig(p => ({ ...p, cutMode: 'full' }))} className={segBtn(config.cutMode === 'full')}>Full</button>
                    </div>
                  </div>
                )}
              </div>

              {/* Precise Coordinates Table */}
              <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/50 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900">Live Element Coordinates (mm)</span>
                  <span className="text-[10px] text-slate-400 font-medium">Auto-syncs with canvas drag</span>
                </div>
                <div className="grid grid-cols-[1fr_52px_52px_52px_52px] gap-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider items-center">
                  <span>Element</span><span>X mm</span><span>Y mm</span><span>W mm</span><span>H mm</span>
                  
                  {/* Store */}
                  <span className="text-slate-800 normal-case font-bold">Store</span>
                  <input type="number" step={0.5} min={0} max={Math.max(0, effLabelWidth - 1)} value={config.layoutXY.store.x ?? ''}
                    onChange={e => updateConfig(p => ({ ...p, layoutXY: { ...p.layoutXY, store: { ...p.layoutXY.store, x: e.target.value } } }))}
                    className="w-full px-1 py-1 bg-white border border-slate-200 rounded text-[10px] font-semibold text-slate-800 focus:outline-none focus:border-gray-900" />
                  <input type="number" step={0.5} min={0} max={Math.max(0, effLabelHeight - 1)} value={config.layoutXY.store.y ?? ''}
                    onChange={e => updateConfig(p => ({ ...p, layoutXY: { ...p.layoutXY, store: { ...p.layoutXY.store, y: e.target.value } } }))}
                    className="w-full px-1 py-1 bg-white border border-slate-200 rounded text-[10px] font-semibold text-slate-800 focus:outline-none focus:border-gray-900" />
                  <input type="number" step={0.5} min={1} max={effLabelWidth} value={config.layoutXY.store.w !== undefined ? config.layoutXY.store.w : effElemW('store').toFixed(1)}
                    onChange={e => updateConfig(p => ({ ...p, layoutXY: { ...p.layoutXY, store: { ...p.layoutXY.store, w: e.target.value } } }))}
                    className="w-full px-1 py-1 bg-white border border-slate-200 rounded text-[10px] font-semibold text-slate-800 focus:outline-none focus:border-gray-900" />
                  <input type="number" step={0.5} min={1} max={effLabelHeight} value={config.layoutXY.store.h !== undefined ? config.layoutXY.store.h : effElemH('store').toFixed(1)}
                    onChange={e => updateConfig(p => ({ ...p, layoutXY: { ...p.layoutXY, store: { ...p.layoutXY.store, h: e.target.value } } }))}
                    className="w-full px-1 py-1 bg-white border border-slate-200 rounded text-[10px] font-semibold text-slate-800 focus:outline-none focus:border-gray-900" />

                  {/* Product */}
                  <span className="text-slate-800 normal-case font-bold">Product</span>
                  <input type="number" step={0.5} min={0} max={Math.max(0, effLabelWidth - 1)} value={config.layoutXY.product.x ?? ''}
                    onChange={e => updateConfig(p => ({ ...p, layoutXY: { ...p.layoutXY, product: { ...p.layoutXY.product, x: e.target.value } } }))}
                    className="w-full px-1 py-1 bg-white border border-slate-200 rounded text-[10px] font-semibold text-slate-800 focus:outline-none focus:border-gray-900" />
                  <input type="number" step={0.5} min={0} max={Math.max(0, effLabelHeight - 1)} value={config.layoutXY.product.y ?? ''}
                    onChange={e => updateConfig(p => ({ ...p, layoutXY: { ...p.layoutXY, product: { ...p.layoutXY.product, y: e.target.value } } }))}
                    className="w-full px-1 py-1 bg-white border border-slate-200 rounded text-[10px] font-semibold text-slate-800 focus:outline-none focus:border-gray-900" />
                  <input type="number" step={0.5} min={1} max={effLabelWidth} value={config.layoutXY.product.w !== undefined ? config.layoutXY.product.w : effElemW('product').toFixed(1)}
                    onChange={e => updateConfig(p => ({ ...p, layoutXY: { ...p.layoutXY, product: { ...p.layoutXY.product, w: e.target.value } } }))}
                    className="w-full px-1 py-1 bg-white border border-slate-200 rounded text-[10px] font-semibold text-slate-800 focus:outline-none focus:border-gray-900" />
                  <input type="number" step={0.5} min={1} max={effLabelHeight} value={config.layoutXY.product.h !== undefined ? config.layoutXY.product.h : effElemH('product').toFixed(1)}
                    onChange={e => updateConfig(p => ({ ...p, layoutXY: { ...p.layoutXY, product: { ...p.layoutXY.product, h: e.target.value } } }))}
                    className="w-full px-1 py-1 bg-white border border-slate-200 rounded text-[10px] font-semibold text-slate-800 focus:outline-none focus:border-gray-900" />

                  {/* Barcode Box */}
                  <span className="text-slate-900 normal-case font-extrabold">Barcode</span>
                  <input type="number" step={0.5} min={0} max={Math.max(0, effLabelWidth - effBarcodeWidth)} value={config.layoutXY.barcode.x ?? ''}
                    onChange={e => updateConfig(p => ({ ...p, layoutXY: { ...p.layoutXY, barcode: { ...p.layoutXY.barcode, x: e.target.value } } }))}
                    className="w-full px-1 py-1 bg-white border border-slate-200 rounded text-[10px] font-semibold text-slate-800 focus:outline-none focus:border-gray-900" />
                  <input type="number" step={0.5} min={0} max={Math.max(0, effLabelHeight - effBarcodeHeight)} value={config.layoutXY.barcode.y ?? ''}
                    onChange={e => updateConfig(p => ({ ...p, layoutXY: { ...p.layoutXY, barcode: { ...p.layoutXY.barcode, y: e.target.value } } }))}
                    className="w-full px-1 py-1 bg-white border border-slate-200 rounded text-[10px] font-semibold text-slate-800 focus:outline-none focus:border-gray-900" />
                  <input type="number" step={0.5} min={1} max={effLabelWidth} value={config.barcodeWidth !== undefined ? config.barcodeWidth : effBarcodeWidth.toFixed(1)}
                    onChange={e => updateConfig(p => ({ ...p, barcodeWidth: e.target.value, layoutXY: { ...p.layoutXY, barcode: { ...p.layoutXY.barcode, w: e.target.value } } }))}
                    className="w-full px-1 py-1 bg-white border border-slate-200 rounded text-[10px] font-semibold text-slate-800 focus:outline-none focus:border-gray-900" />
                  <input type="number" step={0.5} min={1} max={effLabelHeight} value={config.barcodeHeight}
                    onChange={e => updateConfig(p => ({ ...p, barcodeHeight: e.target.value, layoutXY: { ...p.layoutXY, barcode: { ...p.layoutXY.barcode, h: e.target.value } } }))}
                    className="w-full px-1 py-1 bg-white border border-slate-200 rounded text-[10px] font-semibold text-slate-800 focus:outline-none focus:border-gray-900" />

                  {/* Price */}
                  <span className="text-slate-800 normal-case font-bold">Price</span>
                  <input type="number" step={0.5} min={0} max={Math.max(0, effLabelWidth - 1)} value={config.layoutXY.price.x ?? ''}
                    onChange={e => updateConfig(p => ({ ...p, layoutXY: { ...p.layoutXY, price: { ...p.layoutXY.price, x: e.target.value } } }))}
                    className="w-full px-1 py-1 bg-white border border-slate-200 rounded text-[10px] font-semibold text-slate-800 focus:outline-none focus:border-gray-900" />
                  <input type="number" step={0.5} min={0} max={Math.max(0, effLabelHeight - 1)} value={config.layoutXY.price.y ?? ''}
                    onChange={e => updateConfig(p => ({ ...p, layoutXY: { ...p.layoutXY, price: { ...p.layoutXY.price, y: e.target.value } } }))}
                    className="w-full px-1 py-1 bg-white border border-slate-200 rounded text-[10px] font-semibold text-slate-800 focus:outline-none focus:border-gray-900" />
                  <input type="number" step={0.5} min={1} max={effLabelWidth} value={config.layoutXY.price.w !== undefined ? config.layoutXY.price.w : effElemW('price').toFixed(1)}
                    onChange={e => updateConfig(p => ({ ...p, layoutXY: { ...p.layoutXY, price: { ...p.layoutXY.price, w: e.target.value } } }))}
                    className="w-full px-1 py-1 bg-white border border-slate-200 rounded text-[10px] font-semibold text-slate-800 focus:outline-none focus:border-gray-900" />
                  <input type="number" step={0.5} min={1} max={effLabelHeight} value={config.layoutXY.price.h !== undefined ? config.layoutXY.price.h : effElemH('price').toFixed(1)}
                    onChange={e => updateConfig(p => ({ ...p, layoutXY: { ...p.layoutXY, price: { ...p.layoutXY.price, h: e.target.value } } }))}
                    className="w-full px-1 py-1 bg-white border border-slate-200 rounded text-[10px] font-semibold text-slate-800 focus:outline-none focus:border-gray-900" />
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Right Column: Live Interactive Canvas Preview & Bulk Print */}
        <div className="lg:col-span-6 space-y-6">

          {/* Interactive Canvas */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center space-x-2">
                <Tag className="w-5 h-5 text-gray-900" />
                <h3 className="font-extrabold text-slate-900 text-sm">
                  Live Interactive Label Canvas
                </h3>
              </div>

              <div className="flex items-center space-x-2">
                <span className="text-xs font-semibold text-slate-500 hidden sm:inline">Sample Item:</span>
                <select
                  value={sampleProductId}
                  onChange={e => setSampleProductId(e.target.value)}
                  className="px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:border-gray-900 max-w-[130px] cursor-pointer"
                >
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>

                <div className="flex items-center space-x-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
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
                    className="px-1.5 py-0.5 text-[10px] font-extrabold text-slate-800 hover:bg-slate-200 rounded cursor-pointer font-mono"
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
              </div>
            </div>

            {/* Canvas Container */}
            <div className="bg-slate-200/60 p-6 rounded-xl border border-slate-300 flex flex-col items-center justify-center min-h-[280px] shadow-inner relative overflow-hidden">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3">
                {effLabelWidth.toFixed(0)} × {effLabelHeight.toFixed(0)}mm · Drag to move, handles to resize
              </p>

              {renderCanvasCard()}
            </div>
          </div>

          {/* Bulk Print Selection */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Layers className="w-5 h-5 text-gray-900" />
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
                  className="px-4 py-2 bg-black hover:bg-gray-800 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer"
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

        </div>

      </div>

    </div>
  );
};

export default LabelGeneratorTab;
