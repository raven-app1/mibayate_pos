import React, { useState, useEffect, useCallback } from 'react';
import {
  Printer, Tag, Receipt, Bluetooth, BluetoothOff, Loader2, CheckCircle2,
  AlertCircle, Save, X, RefreshCw, Cable, Radio, Info, Smartphone, ChevronDown
} from 'lucide-react';
import * as printerBridge from '../lib/printerBridge';
import { buildLabel, text, separator, feed, cut, init as escInit, setCodePage } from '../lib/escpos';
import { testPrintTspl } from '../lib/tspl';
import { loadLabelConfig, saveLabelConfig } from '../lib/labelConfig';
import { useToast } from '../utils/toast';

// PRINTER_ROLE keys: role -> immutable localStorage key
const BARCODE_KEY = 'mibayate_barcode_printer';
const SLIP_KEY = 'mibayate_slip_printer';

export type PrinterRole = 'barcode' | 'slip';

interface PrinterSettingsProps {
  storeName: string;
}

function loadAssignedName(key: string): string {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      return typeof parsed?.name === 'string' ? parsed.name : '';
    }
  } catch { /* ignore malformed localStorage */ }
  return '';
}

function saveAssignedName(key: string, name: string): void {
  localStorage.setItem(key, JSON.stringify({ name, updated_at: new Date().toISOString() }));
}

export const PrinterSettings: React.FC<PrinterSettingsProps> = ({ storeName }) => {
  const { toast } = useToast();

  // ── Configuration (which physical printer serves each role) ───────────────
  const [barcodeName, setBarcodeName] = useState(() => loadAssignedName(BARCODE_KEY));
  const [slipName, setSlipName] = useState(() => loadAssignedName(SLIP_KEY));
  const [labelProtocol, setLabelProtocol] = useState<'escpos' | 'tspl'>(() => loadLabelConfig().protocol);

  // ── Unified bridge (native SPP in the Android shell, Web BT in browser) ───
  const isNative = printerBridge.isNativeShell();
  const [btAvailable] = useState(() => printerBridge.isBluetoothAvailable());
  const [btConnected, setBtConnected] = useState(() => printerBridge.isConnected());
  const [printerName, setPrinterName] = useState(() => printerBridge.getDeviceName());
  const [connectingRole, setConnectingRole] = useState<PrinterRole | null>(null);
  const [testingRole, setTestingRole] = useState<PrinterRole | null>(null);
  const [btError, setBtError] = useState<string | null>(null);

  // Native: list the phone's already-paired Bluetooth devices (no scanning).
  const [pairedDevices, setPairedDevices] = useState<printerBridge.PairedPrinter[]>([]);
  const [selectedAddress, setSelectedAddress] = useState('');
  const [loadingDevices, setLoadingDevices] = useState(isNative);

  useEffect(() => {
    printerBridge.onDisconnect(() => {
      setBtConnected(false);
      setPrinterName('');
    });
    return () => printerBridge.offDisconnect();
  }, []);

  const refreshPairedDevices = useCallback(async () => {
    if (!isNative) return;
    setLoadingDevices(true);
    try {
      const devs = await printerBridge.getPairedPrinters();
      setPairedDevices(devs);
      if (devs.length > 0 && !selectedAddress) {
        setSelectedAddress(devs[0].address);
      }
    } catch {
      setBtError('Could not read paired devices. Check Bluetooth permissions.');
    } finally {
      setLoadingDevices(false);
    }
  }, [isNative, selectedAddress]);

  useEffect(() => {
    void refreshPairedDevices();
  }, [refreshPairedDevices]);

  const handleConnect = async (role: PrinterRole) => {
    if (connectingRole) return;
    setBtError(null);
    setConnectingRole(role);
    try {
      const device = pairedDevices.find(d => d.address === selectedAddress);
      const name = await printerBridge.connect(device);
      setBtConnected(true);
      setPrinterName(name);
      setBtError(null);
    } catch (err: any) {
      if (err?.name !== 'NotFoundError') {
        setBtError(err?.message || 'Failed to connect to printer');
        setBtConnected(false);
      }
    } finally {
      setConnectingRole(null);
    }
  };

  const handleDisconnect = async () => {
    await printerBridge.disconnect();
    setBtConnected(false);
    setPrinterName('');
  };

  const handleAssign = (role: PrinterRole) => {
    if (!btConnected || !printerName) return;
    if (role === 'barcode') {
      setBarcodeName(printerName);
      saveAssignedName(BARCODE_KEY, printerName);
    } else {
      setSlipName(printerName);
      saveAssignedName(SLIP_KEY, printerName);
    }
    toast(`"${printerName}" set as ${role === 'barcode' ? 'Barcode' : 'Slip'} printer.`, 'success');
  };

  const handleSetLabelProtocol = (protocol: 'escpos' | 'tspl') => {
    const config = loadLabelConfig(storeName);
    saveLabelConfig({ ...config, protocol });
    setLabelProtocol(protocol);
    toast(`Barcode label language set to ${protocol === 'tspl' ? 'TSPL' : 'ESC/POS'}.`, 'success');
  };

  const handleTestPrint = useCallback(async (role: PrinterRole) => {
    if (!printerBridge.isConnected() || testingRole) return;
    setTestingRole(role);
    setBtError(null);
    try {
      if (role === 'barcode' && labelProtocol === 'tspl') {
        const cfg = loadLabelConfig(storeName);
        await printerBridge.send(testPrintTspl(
          storeName || cfg.storeName || 'My Store',
          parseFloat(cfg.labelWidth) || 50,
          parseFloat(cfg.labelHeight) || 30,
          parseFloat(cfg.labelGap) || 3,
        ));
      } else {
        await printerBridge.send(escInit());
        await printerBridge.send(setCodePage('CP437'));

        if (role === 'barcode') {
          await printerBridge.send(buildLabel({
            storeName: storeName || 'My Store',
            productName: 'Test Product',
            barcodeValue: '0123456789012',
            price: 25,
            currencySymbol: 'Ks',
          }));
        } else {
          const rows = [
            text(storeName || 'My Store', { align: 'center', bold: true, width: 2, height: 2 }),
            separator('-', 32),
            text('TEST RECEIPT', { align: 'center', bold: true }),
            separator('-', 32),
            text('1 x Test Product     25.00'),
            text('Total              25.00'),
            text('Change               0.00'),
            separator('=', 32),
            text('Thank you for shopping!', { align: 'center' }),
            feed(4),
            cut(),
          ];
          for (const r of rows) {
            await printerBridge.send(r);
            await new Promise(res => setTimeout(res, 60));
          }
        }
      }

      toast(`${role === 'barcode' ? 'Barcode' : 'Slip'} test printed.`, 'success');
    } catch (err: any) {
      setBtError(err?.message || 'Test print failed. Check printer connection.');
      if (!printerBridge.isConnected()) {
        setBtConnected(false);
        setPrinterName('');
      }
    } finally {
      setTestingRole(null);
    }
  }, [storeName, testingRole, labelProtocol]);

  const roleSpecs: Array<{
    role: PrinterRole;
    label: string;
    tagline: string;
    accent: 'indigo' | 'emerald';
    icon: typeof Tag;
    assignedName: string;
    example: string;
  }> = [
    {
      role: 'barcode',
      label: 'Barcode Label Printer',
      tagline: 'Prints product price tags & barcode stickers',
      accent: 'indigo',
      icon: Tag,
      assignedName: barcodeName,
      example: 'e.g. Rongta BT80 / Gprinter LW-500'
    },
    {
      role: 'slip',
      label: 'Slip / Receipt Printer',
      tagline: 'Prints thermal sales receipts at the POS',
      accent: 'emerald',
      icon: Receipt,
      assignedName: slipName,
      example: 'e.g. Epson TM-T20 / Xprinter 58mm'
    },
  ];

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header Banner */}
      <div className="bg-gradient-to-br from-slate-900 via-gray-950 to-slate-900 text-white p-6 sm:p-7 rounded-2xl shadow-lg border border-slate-800 relative overflow-hidden">
        {/* Decorative mesh / glow accents */}
        <div className="pointer-events-none absolute -top-20 -right-16 w-64 h-64 rounded-full bg-black/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-10 w-72 h-72 rounded-full bg-black/10 blur-3xl" />

        <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-black/20 text-gray-300 text-xs font-bold border border-gray-400/30">
              <Printer className="w-3.5 h-3.5" />
              <span>Devices & Peripherals</span>
            </div>
            <h3 className="text-lg sm:text-xl font-extrabold tracking-tight">Barcode & Slip Printer Setup</h3>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              Pair your thermal printers over Bluetooth and assign each device to its role —
              barcode label printing or receipt (slip) printing. Assignments are saved on this device.
            </p>
          </div>

          {/* Live connection status cluster */}
          <div className="flex flex-wrap items-center gap-2">
            {!btAvailable ? (
              <span className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-black/15 border border-gray-400/40 text-gray-300 text-xs font-bold">
                <Radio className="w-4 h-4" />
                {isNative ? 'Bluetooth unavailable' : 'Web Bluetooth unavailable'}
              </span>
            ) : btConnected ? (
              <span className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-black/15 border border-gray-400/40 text-gray-300 text-xs font-bold max-w-[220px]">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span className="truncate">{printerName}</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 text-xs font-bold">
                <BluetoothOff className="w-4 h-4" />
                Not connected
              </span>
            )}
          </div>
        </div>
      </div>

      {btError && (
        <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-semibold flex items-start gap-2 shadow-xs animate-fade-in">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="flex-1">{btError}</span>
          <button onClick={() => setBtError(null)} className="text-red-400 hover:text-red-600 cursor-pointer shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {btAvailable && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 px-1">
          <div className="flex items-center gap-2 text-[11px] text-slate-500 font-semibold">
            <Cable className="w-3.5 h-3.5" />
            {isNative
              ? 'This is a native Android build — connect straight to your already-paired printer. No chooser needed.'
              : 'Current live connection is shared across both printers. Connect a device, then assign it below.'}
          </div>
          {btConnected && (
            <button
              onClick={handleDisconnect}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-red-50 text-red-600 border border-slate-200 rounded-xl font-bold text-[11px] transition-all cursor-pointer active:scale-95 shrink-0"
            >
              <BluetoothOff className="w-3.5 h-3.5" />
              Disconnect
            </button>
          )}
        </div>
      )}

      {/* Native: picker of the phone's already-paired Bluetooth printers */}
      {isNative && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Smartphone className="w-5 h-5 text-gray-900" />
            <div>
              <h4 className="font-extrabold text-slate-900 text-sm">Your paired printers</h4>
              <p className="text-[11px] text-slate-400">Devices already paired with this phone via Android Bluetooth</p>
            </div>
            <button
              onClick={() => void refreshPairedDevices()}
              disabled={loadingDevices}
              className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl font-bold text-[11px] text-slate-600 transition-all cursor-pointer disabled:opacity-50 active:scale-95"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingDevices ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {loadingDevices ? (
            <div className="flex items-center justify-center gap-2 py-6 text-xs text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" />
              Reading paired devices…
            </div>
          ) : pairedDevices.length === 0 ? (
            <div className="py-6 text-center">
              <BluetoothOff className="w-8 h-8 mx-auto mb-2 text-slate-300" />
              <p className="text-xs font-semibold text-slate-600">No paired printers found.</p>
              <p className="text-[11px] text-slate-400 mt-1">
                Pair your printer first in Android Settings → Bluetooth, then tap Refresh.
              </p>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <select
                  value={selectedAddress}
                  onChange={(e) => setSelectedAddress(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:border-gray-900 appearance-none pr-9 cursor-pointer"
                >
                  {pairedDevices.map(d => (
                    <option key={d.address} value={d.address}>
                      {d.name} · {d.address}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
              {!btConnected ? (
                <button
                  onClick={() => handleConnect('slip')}
                  disabled={!!connectingRole}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-black hover:bg-gray-800 text-white text-xs font-bold rounded-xl shadow-md transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  {connectingRole ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Bluetooth className="w-3.5 h-3.5" />
                  )}
                  Connect
                </button>
              ) : (
                <button
                  onClick={handleDisconnect}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-white border border-red-200 text-red-600 text-xs font-bold rounded-xl transition-all active:scale-95 cursor-pointer"
                >
                  <BluetoothOff className="w-3.5 h-3.5" />
                  Disconnect
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Printer Role Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {roleSpecs.map((spec) => {
          const accentText = spec.accent === 'indigo' ? 'text-gray-900' : 'text-gray-900';
          const accentBg = spec.accent === 'indigo' ? 'bg-black' : 'bg-black';
          const accentSoft = spec.accent === 'indigo' ? 'bg-gray-50 border-gray-200 text-gray-900' : 'bg-gray-50 border-gray-200 text-gray-900';
          const accentRing = spec.accent === 'indigo' ? 'focus:border-gray-900' : 'focus:border-gray-900';
          const hasAssigned = !!spec.assignedName;
          const connectedMatches = btConnected && printerName === spec.assignedName;

          return (
            <div
              key={spec.role}
              className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden flex flex-col"
            >
              {/* Card header */}
              <div className="flex items-center gap-3 p-5 border-b border-slate-100 bg-slate-50/60">
                <div className={`p-2.5 rounded-xl text-white shadow-md ${accentBg}`}>
                  <spec.icon className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="font-extrabold text-slate-900 text-sm">{spec.label}</h4>
                  <p className="text-[11px] text-slate-500">{spec.tagline}</p>
                </div>
                {hasAssigned ? (
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold border ${accentSoft}`}>
                    <CheckCircle2 className="w-3 h-3" />
                    {connectedMatches ? 'ACTIVE' : 'Configured'}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                    Not set
                  </span>
                )}
              </div>

              <div className="p-5 space-y-4 flex-1">
                {/* Assigned device */}
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Assigned Device</span>
                    {hasAssigned && (
                      <button
                        onClick={() => {
                          if (spec.role === 'barcode') { setBarcodeName(''); localStorage.removeItem(BARCODE_KEY); }
                          else { setSlipName(''); localStorage.removeItem(SLIP_KEY); }
                          toast(`${spec.label} assignment cleared.`, 'success');
                        }}
                        className="text-[10px] font-bold text-slate-400 hover:text-red-500 transition-colors cursor-pointer"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <p className={`font-mono text-sm font-bold break-all ${accentText}`}>
                    {spec.assignedName || '— no device assigned yet —'}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1.5">{spec.example}</p>
                </div>

                {/* Live connected device */}
                <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    {btConnected ? (
                      <span className={`w-2 h-2 rounded-full bg-black animate-pulse-soft shrink-0`} />
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-slate-300 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Live connection</p>
                      <p className="text-xs font-semibold text-slate-800 truncate">
                        {btConnected ? printerName : 'No printer connected'}
                      </p>
                    </div>
                  </div>
                  <Bluetooth className="w-4 h-4 text-slate-300 shrink-0" />
                </div>

                {connectedMatches ? (
                  <p className="text-[11px] text-gray-900 flex items-center gap-1.5 font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    This printer is using the {spec.label}.
                  </p>
                ) : hasAssigned && btConnected ? (
                  <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5" />
                    Connected "{printerName}" differs from the assigned device.
                  </p>
                ) : null}
              </div>

              {/* Actions */}
              <div className="p-4 pt-0 flex flex-wrap gap-2">
                {!btConnected ? (
                  <button
                    onClick={() => handleConnect(spec.role)}
                    disabled={!!connectingRole || !btAvailable}
                    className={`flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-white text-xs font-bold rounded-xl shadow-md transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${accentBg}`}
                  >
                    {connectingRole === spec.role ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      <>
                        <Bluetooth className="w-3.5 h-3.5" />
                        Connect Printer
                      </>
                    )}
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => handleAssign(spec.role)}
                      className={`flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 text-white text-xs font-bold rounded-xl shadow-md transition-all active:scale-95 ${accentBg}`}
                    >
                      <Save className="w-3.5 h-3.5" />
                      Assign to {spec.label.split(' ')[0]}
                    </button>
                    <button
                      onClick={() => handleTestPrint(spec.role)}
                      disabled={!!testingRole}
                      className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all active:scale-95 disabled:opacity-50 cursor-pointer`}
                    >
                      {testingRole === spec.role ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Printer className="w-3.5 h-3.5" />
                      )}
                      Test
                    </button>
                  </>
                )}
              </div>

              {spec.role === 'barcode' && (
                <div className="px-4 pb-4 -mt-1 space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                    Label Print Language
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSetLabelProtocol('escpos')}
                      className={`flex-1 px-3 py-2 rounded-xl text-[11px] font-bold border transition-colors cursor-pointer ${labelProtocol === 'escpos' ? 'bg-black text-white border-black' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                    >
                      ESC/POS
                    </button>
                    <button
                      onClick={() => handleSetLabelProtocol('tspl')}
                      className={`flex-1 px-3 py-2 rounded-xl text-[11px] font-bold border transition-colors cursor-pointer ${labelProtocol === 'tspl' ? 'bg-black text-white border-black' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                    >
                      TSPL Label
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    Set the printer to its matching Label (TSPL) or Receipt (ESC/POS) mode. Blank paper means the printer mode and this setting do not match.
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Tips card */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5">
        <div className="flex items-center gap-2 mb-3">
          <RefreshCw className="w-4 h-4 text-gray-500" />
          <h5 className="font-extrabold text-slate-900 text-sm">Pairing & usage tips</h5>
        </div>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-[11px] text-slate-600 leading-relaxed list-disc list-inside">
          {isNative ? (
            <>
              <li>Pair your printer in Android Settings → Bluetooth before using this app.</li>
              <li>"Refresh" reloads the phone's paired devices — no device chooser needed.</li>
              <li>Only one printer stays actively connected at a time on this device.</li>
              <li>Assignments persist locally, so you always know which printer is which.</li>
              <li>Use <strong>Test</strong> to confirm spacing before a real print run.</li>
            </>
          ) : (
            <>
              <li>Web Bluetooth needs Chrome/Edge on Android with an HTTPS connection.</li>
              <li>Choose the matching device from the system picker when it appears.</li>
              <li>Only one printer stays actively connected at a time on this device.</li>
              <li>Assignments persist locally, so you always know which printer is which.</li>
              <li>Use <strong>Test</strong> to confirm spacing before a real print run.</li>
            </>
          )}
          <li>Most label printers use TSPL in Label mode and ESC/POS in Receipt mode. The language above must match the printer's mode.</li>
        </ul>
      </div>
    </div>
  );
};

export default PrinterSettings;