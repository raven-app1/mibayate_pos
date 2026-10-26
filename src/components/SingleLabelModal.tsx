import React, { useState, useEffect, useCallback } from 'react';
import {
  Printer, X, Bluetooth, BluetoothOff, Loader2, CheckCircle2, AlertCircle,
  Minus, Plus, Settings, Ruler, Tag,
} from 'lucide-react';
import { Product, LabelConfig } from '../types';
import BarcodeSVG from './BarcodeSVG';
import * as printerBridge from '../lib/printerBridge';
import { normalizeBarcodeValue, getPrintableMm } from '../lib/escpos';
import { buildTsplLabel, testPrintTspl, feedTspl } from '../lib/tspl';
import { ensureLabelFont } from '../lib/labelRaster';
import { loadLabelConfig, computeLabelOffsetMm } from '../lib/labelConfig';
import { useBackDismiss } from '../lib/backNavigation';

interface SingleLabelModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
  currencySymbol?: string;
  businessName?: string;
  onOpenDesigner?: () => void;
}

const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max);
const parseMm = (v: string) => {
  const n = parseFloat(v);
  return isFinite(n) && n > 0 ? n : 0;
};

export const SingleLabelModal: React.FC<SingleLabelModalProps> = ({
  product,
  isOpen,
  onClose,
  currencySymbol = 'Ks',
  businessName,
  onOpenDesigner,
}) => {
  useBackDismiss(isOpen, onClose);

  const [quantity, setQuantity] = useState(1);
  const [config, setConfig] = useState<LabelConfig>(() => loadLabelConfig(businessName));

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
    if (!isOpen) return;
    setConfig(loadLabelConfig(businessName));
    setQuantity(1);

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
  }, [isOpen, isNative, businessName]);

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

  if (!isOpen || !product) return null;

  const effPaperWidth = clamp(parseMm(config.paperWidth) || 80, 15, 300);
  const printableMm = getPrintableMm(effPaperWidth);
  const effLabelWidth = clamp(parseMm(config.labelWidth) || effPaperWidth, 5, effPaperWidth);
  const effLabelHeight = clamp(parseMm(config.labelHeight) || 30, 8, 300);

  const effElemX = (k: 'store' | 'product' | 'barcode' | 'price') =>
    clamp(parseMm(config.layoutXY[k].x) || 0, 0, Math.max(0, effLabelWidth - 5));

  const effElemY = (k: 'store' | 'product' | 'barcode' | 'price') =>
    clamp(parseMm(config.layoutXY[k].y) || 0, 0, Math.max(0, effLabelHeight - 3));

  const effElemW = (k: 'store' | 'product' | 'barcode' | 'price') => {
    const raw = parseMm(config.layoutXY[k].w);
    const defaultW = k === 'barcode' ? (parseMm(config.barcodeWidth) || Math.max(10, effLabelWidth - 4)) : Math.max(5, effLabelWidth - effElemX(k));
    return clamp(raw || defaultW, 5, Math.max(5, effLabelWidth - effElemX(k)));
  };

  const effElemH = (k: 'store' | 'product' | 'barcode' | 'price') => {
    const raw = parseMm(config.layoutXY[k].h);
    const defaultH = k === 'barcode' ? (parseMm(config.barcodeHeight) || 10) : (k === 'price' ? 5 : 4);
    return clamp(raw || defaultH, 2, Math.max(2, effLabelHeight - effElemY(k)));
  };

  const effBarcodeWidth = effElemW('barcode');
  const effBarcodeHeight = effElemH('barcode');
  const effBarcodeX = effElemX('barcode');
  const effBarcodeY = effElemY('barcode');

  const effLabelGap = clamp(parseMm(config.labelGap) || 3, 2, 10);
  const effFeedOffset = clamp(parseMm(config.feedOffset) || 0, -10, 10);
  const effLabelOffsetMm = computeLabelOffsetMm(config);

  const layoutForPrint = {
    storeName: config.showStoreName ? { xMm: effElemX('store'), yMm: effElemY('store'), widthMm: effElemW('store'), heightMm: effElemH('store'), size: config.fontSize.store as 1 | 2 } : undefined,
    productName: config.showProductName ? { xMm: effElemX('product'), yMm: effElemY('product'), widthMm: effElemW('product'), heightMm: effElemH('product'), size: config.fontSize.product as 1 | 2 } : undefined,
    barcode: { xMm: effBarcodeX, yMm: effBarcodeY, widthMm: effBarcodeWidth, heightMm: effBarcodeHeight },
    price: config.showPrice ? { xMm: effElemX('price'), yMm: effElemY('price'), widthMm: effElemW('price'), heightMm: effElemH('price'), size: config.fontSize.price as 1 | 2 } : undefined,
  };

  const labelOptions = {
    storeName: config.storeName || businessName || 'My Retail Store',
    productName: product.name,
    barcodeValue: product.barcode || product.sku || '000000',
    price: product.price,
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
    layout: layoutForPrint,
  };

  const handlePrint = async () => {
    if (!printerBridge.isConnected() || quantity <= 0 || btPrinting) return;

    setBtPrinting(true);
    setBtError(null);
    setBtProgress({ current: 0, total: quantity });

    try {
      await ensureLabelFont();
      await new Promise(r => setTimeout(r, 300));

      await printerBridge.send(buildTsplLabel({ ...labelOptions, copies: quantity }));
      setBtProgress({ current: quantity, total: quantity });
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
  };

  const handleTestPrint = async () => {
    if (!printerBridge.isConnected() || btPrinting) return;
    setBtError(null);
    try {
      await ensureLabelFont();
      await printerBridge.send(
        testPrintTspl(config.storeName || businessName || 'My Store', effLabelWidth, effLabelHeight, effLabelGap)
      );
    } catch (err: any) {
      setBtError(err?.message || 'Test print failed');
    }
  };

  const handleFeedAlign = async () => {
    if (!printerBridge.isConnected() || btPrinting) return;
    setBtError(null);
    try {
      await printerBridge.send(feedTspl());
    } catch (err: any) {
      setBtError(err?.message || 'Feed failed');
    }
  };

  const previewScale = Math.min(280 / effLabelWidth, 6);
  const previewW = Math.round(effLabelWidth * previewScale);
  const previewH = Math.round(effLabelHeight * previewScale);
  const codeVal = normalizeBarcodeValue(product.barcode || product.sku || '000000', 'CODE128');

  return (
    <div className="fixed inset-0 bg-slate-900/70 z-50 flex items-center justify-center p-3 sm:p-4 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
          <div className="flex items-center space-x-2.5 min-w-0 pr-2">
            <div className="p-2 bg-black text-white rounded-xl shrink-0">
              <Tag className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="font-extrabold text-slate-900 text-sm truncate">
                Item Label Preview
              </h3>
              <p className="text-[11px] text-slate-500 font-semibold truncate">
                {product.name}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Printer Bar */}
        <div className="px-4 py-2 bg-slate-100/80 border-b border-slate-200 flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2 min-w-0">
            {btConnected ? (
              <div className="flex items-center space-x-1.5 px-2 py-1 bg-gray-50 border border-gray-200 rounded-lg font-bold text-gray-900 text-[11px]">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span className="truncate max-w-[140px]">{printerName}</span>
              </div>
            ) : (
              <span className="text-slate-500 font-medium text-[11px]">Printer: Not Connected</span>
            )}
          </div>

          {btAvailable && (
            <div className="flex items-center space-x-1.5">
              {btConnected ? (
                <button
                  onClick={handleDisconnectPrinter}
                  className="px-2 py-1 text-[11px] font-bold text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                >
                  Disconnect
                </button>
              ) : (
                <>
                  {isNative && pairedDevices.length > 0 && (
                    <select
                      value={selectedAddress}
                      onChange={(e) => setSelectedAddress(e.target.value)}
                      className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-800 focus:outline-none focus:border-gray-900 max-w-[120px] cursor-pointer"
                    >
                      {pairedDevices.map(d => (
                        <option key={d.address} value={d.address}>{d.name}</option>
                      ))}
                    </select>
                  )}
                  <button
                    onClick={handleConnectPrinter}
                    disabled={btConnecting}
                    className="px-2.5 py-1 bg-black hover:bg-gray-800 text-white font-bold text-[11px] rounded-lg transition-all flex items-center space-x-1 disabled:opacity-50 cursor-pointer"
                  >
                    {btConnecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Bluetooth className="w-3 h-3" />}
                    <span>{btConnecting ? 'Connecting...' : 'Connect'}</span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {btError && (
          <div className="mx-4 mt-3 px-3 py-2 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-2 text-xs text-red-700">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span className="flex-1">{btError}</span>
            <button onClick={() => setBtError(null)} className="text-red-400 hover:text-red-600 cursor-pointer">
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Modal Body: Live Preview & Quantity */}
        <div className="p-4 space-y-4 flex-1 overflow-y-auto">
          
          {/* Label Preview Card */}
          <div className="bg-slate-200/60 p-4 rounded-xl border border-slate-300 flex flex-col items-center justify-center min-h-[160px]">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
              Configured Label Preview ({effLabelWidth.toFixed(0)} × {effLabelHeight.toFixed(0)}mm)
            </p>

            <div
              className="bg-white border border-slate-400 rounded shadow-xs select-none overflow-hidden relative"
              style={{ width: previewW, height: previewH }}
            >
              {/* Store Name Element */}
              {config.showStoreName && (
                <div
                  className="absolute flex items-center justify-center p-0.5"
                  style={{
                    left: effElemX('store') * previewScale,
                    top: effElemY('store') * previewScale,
                    width: effElemW('store') * previewScale,
                    height: effElemH('store') * previewScale,
                  }}
                >
                  <span
                    className="font-extrabold uppercase text-slate-800 truncate w-full text-center pointer-events-none"
                    style={{ fontSize: Math.max(6, Math.min(26, effElemH('store') * previewScale * 0.75)) }}
                  >
                    {config.storeName || businessName || 'My Store'}
                  </span>
                </div>
              )}

              {/* Product Title Element */}
              {config.showProductName && (
                <div
                  className="absolute flex items-center justify-center p-0.5"
                  style={{
                    left: effElemX('product') * previewScale,
                    top: effElemY('product') * previewScale,
                    width: effElemW('product') * previewScale,
                    height: effElemH('product') * previewScale,
                  }}
                >
                  <p
                    className="font-extrabold text-slate-900 leading-tight line-clamp-2 w-full text-center pointer-events-none"
                    style={{ fontSize: Math.max(6, Math.min(24, effElemH('product') * previewScale * 0.6)) }}
                  >
                    {product.name}
                  </p>
                </div>
              )}

              {/* Barcode Box Element */}
              <div
                className="absolute flex flex-col items-center justify-between p-0.5 overflow-hidden"
                style={{
                  left: effBarcodeX * previewScale,
                  top: effBarcodeY * previewScale,
                  width: effBarcodeWidth * previewScale,
                  height: effBarcodeHeight * previewScale,
                }}
              >
                <div className="w-full h-full flex flex-col items-center justify-between overflow-hidden pointer-events-none min-h-0">
                  <BarcodeSVG
                    value={codeVal}
                    height={Math.max(10, Math.round(effBarcodeHeight * previewScale - (config.showCodeText ? 10 : 0)))}
                    showValue={false}
                    className="w-full flex-1 min-h-0"
                  />
                  {config.showCodeText && (
                    <div
                      className="font-mono font-bold text-slate-900 text-center truncate w-full shrink-0 leading-tight mt-0.5"
                      style={{ fontSize: Math.max(6, Math.min(14, effBarcodeHeight * previewScale * 0.22)) }}
                    >
                      {codeVal}
                    </div>
                  )}
                </div>
              </div>

              {/* Price Box Element */}
              {config.showPrice && (
                <div
                  className="absolute flex items-center justify-center"
                  style={{
                    left: effElemX('price') * previewScale,
                    top: effElemY('price') * previewScale,
                    width: effElemW('price') * previewScale,
                    height: effElemH('price') * previewScale,
                  }}
                >
                  <span
                    className="font-extrabold font-mono text-slate-900 truncate pointer-events-none"
                    style={{ fontSize: Math.max(6, Math.min(26, effElemH('price') * previewScale * 0.75)) }}
                  >
                    {product.price.toLocaleString()} {currencySymbol}
                  </span>
                </div>
              )}
            </div>

            <div className="mt-3 flex items-center justify-between w-full text-[11px] text-slate-500 font-medium">
              <span>SKU / Barcode: <strong className="font-mono text-slate-800">{codeVal}</strong></span>
              <span>Format: <strong className="font-mono text-slate-800">CODE 128</strong></span>
            </div>
          </div>

          {/* Label Quantity Selector */}
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center justify-between">
            <div>
              <label className="text-xs font-extrabold text-slate-800 block">
                Number of Copies
              </label>
              <p className="text-[10px] text-slate-500 font-medium">
                Stock: {product.stock} units
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => setQuantity(Math.max(1, product.stock))}
                className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-[10px] font-bold rounded-lg cursor-pointer transition-colors"
                title="Set label count equal to inventory stock"
              >
                Set = Stock ({product.stock})
              </button>

              <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 shadow-2xs">
                <button
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                  className="w-7 h-7 flex items-center justify-center text-slate-700 hover:bg-slate-100 rounded font-bold cursor-pointer"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <input
                  type="number"
                  min={1}
                  max={999}
                  value={quantity}
                  onChange={e => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-10 text-center font-bold text-xs font-mono focus:outline-none"
                />
                <button
                  onClick={() => setQuantity(quantity + 1)}
                  className="w-7 h-7 flex items-center justify-center text-slate-700 hover:bg-slate-100 rounded font-bold cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Quick link to layout designer */}
          {onOpenDesigner && (
            <div className="flex justify-end">
              <button
                onClick={() => {
                  onClose();
                  onOpenDesigner();
                }}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-900 hover:underline cursor-pointer"
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Configure Paper & Layout in Settings</span>
              </button>
            </div>
          )}

        </div>

        {/* Footer Actions */}
        <div className="p-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            {btAvailable && (
              <>
                <button
                  onClick={handleTestPrint}
                  disabled={!btConnected || btPrinting}
                  className="px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs rounded-xl transition-colors disabled:opacity-50 cursor-pointer"
                  title="Print test label"
                >
                  Test
                </button>
                <button
                  onClick={handleFeedAlign}
                  disabled={!btConnected || btPrinting}
                  className="px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs rounded-xl transition-colors disabled:opacity-50 cursor-pointer"
                  title="Advance paper"
                >
                  Feed
                </button>
              </>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              className="px-3.5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>

            {btAvailable && (
              <button
                onClick={handlePrint}
                disabled={!btConnected || btPrinting || quantity <= 0}
                className="px-5 py-2 bg-black hover:bg-gray-800 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer"
              >
                {btPrinting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                <span>
                  {btPrinting ? `Printing ${btProgress.current}/${btProgress.total}` : `Print ${quantity} ${quantity === 1 ? 'Label' : 'Labels'}`}
                </span>
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default SingleLabelModal;
