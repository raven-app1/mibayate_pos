/**
 * Unified thermal-printer bridge.
 *
 * - Native (Capacitor Android wrapper): uses the @shoerofi/capacitor-bluetooth-serial
 *   SPP plugin to talk directly to an ALREADY-PAIRED ESC/POS printer by its MAC
 *   address — no device chooser, no scanning.
 * - Web (normal browser dev / PWA): falls back to Web Bluetooth (BLE).
 */

import { Capacitor } from '@capacitor/core';
import { BluetoothSerial, BluetoothConnectionState } from '@shoerofi/capacitor-bluetooth-serial';
import * as webBt from './bluetoothPrinter';

export interface PairedPrinter {
  id: string;
  name: string;
  address: string;
}

// ── Native SPP state ─────────────────────────────────────────────────────────
let nativeConnected = false;
let nativeAddress = '';
let nativeName = '';
let disconnectCb: (() => void) | null = null;

function isNativeMode(): boolean {
  try {
    return Capacitor.getPlatform() === 'android';
  } catch {
    return false;
  }
}

/**
 * True when we can talk to a printer at all (native SPP or Web Bluetooth).
 */
export function isBluetoothAvailable(): boolean {
  return isNativeMode() ? true : webBt.isWebBluetoothAvailable();
}

/** True when running inside the Android (Capacitor) shell. */
export function isNativeShell(): boolean {
  return isNativeMode();
}

/** Whether the printer role UI should be shown at all. */
export function isSupported(): boolean {
  return isBluetoothAvailable();
}

/**
 * List printers already paired with the phone (native mode only).
 * Returns [] in the browser — there is no remote discovery here.
 */
export async function getPairedPrinters(): Promise<PairedPrinter[]> {
  if (!isNativeMode()) return [];
  try {
    const res = await BluetoothSerial.getPairedDevices();
    return (res.devices || []).map(d => ({
      id: d.address,
      name: d.name || d.id || d.address,
      address: d.address,
    }));
  } catch (err) {
    console.warn('Failed to read paired Bluetooth devices:', err);
    return [];
  }
}

/**
 * Connect to a printer.
 * Native: connect directly to the given paired device (no chooser).
 * Web: opens the Web Bluetooth device picker.
 * Resolves with the connected device name.
 */
export async function connect(device?: PairedPrinter): Promise<string> {
  if (isNativeMode()) {
    if (!device?.address) {
      throw new Error('Please choose a printer from your paired devices first.');
    }
    try {
      await BluetoothSerial.connectInsecure({ address: device.address });
    } catch {
      await BluetoothSerial.connect({ address: device.address });
    }
    nativeConnected = true;
    nativeAddress = device.address;
    nativeName = device.name;
    saveLastPrinter(device.address, device.name);
    return nativeName;
  }
  const name = await webBt.connect();
  return name;
}

export function isConnected(): boolean {
  return isNativeMode() ? nativeConnected : webBt.isConnected();
}

export function getDeviceName(): string {
  return isNativeMode() ? nativeName : webBt.getPrinterName();
}

/** Register a callback triggered when the printer disconnects. */
export function onDisconnect(cb: () => void): void {
  disconnectCb = cb;
  if (isNativeMode()) {
    void BluetoothSerial.addListener('onConnectionChange', ev => {
      if (ev.state === BluetoothConnectionState.DISCONNECTED || ev.state === BluetoothConnectionState.CONNECTION_FAILED) {
        nativeConnected = false;
        nativeAddress = '';
        disconnectCb?.();
      }
    });
  } else {
    webBt.onDisconnect(cb);
  }
}

export function offDisconnect(): void {
  disconnectCb = null;
  if (!isNativeMode()) {
    webBt.offDisconnect();
  }
}

/** Send raw ESC/POS bytes to the printer. */
export async function send(data: Uint8Array): Promise<void> {
  if (!isConnected()) {
    throw new Error('Not connected to a printer');
  }
  if (isNativeMode()) {
    const chunkSize = 512;
    for (let offset = 0; offset < data.length; offset += chunkSize) {
      await BluetoothSerial.write({
        address: nativeAddress,
        value: bytesToLatin1(data.subarray(offset, offset + chunkSize)),
        charset: 'ISO-8859-1',
      });
      if (offset + chunkSize < data.length) {
        await sleep(15);
      }
    }
    return;
  }
  await webBt.send(data);
}

export async function disconnect(): Promise<void> {
  if (isNativeMode()) {
    if (nativeAddress) {
      try {
        await BluetoothSerial.disconnect({ address: nativeAddress });
      } catch {
        // ignore already-disconnected
      }
    }
    nativeConnected = false;
    nativeAddress = '';
    nativeName = '';
    disconnectCb?.();
    return;
  }
  webBt.disconnect();
}

const LAST_PRINTER_KEY = 'retail_shop_last_printer';

export function saveLastPrinter(address: string, name: string): void {
  try {
    localStorage.setItem(LAST_PRINTER_KEY, JSON.stringify({ address, name }));
  } catch {}
}

export function getLastPrinter(): { address: string; name: string } | null {
  try {
    const raw = localStorage.getItem(LAST_PRINTER_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
}

export async function autoConnectLastPrinter(): Promise<string | null> {
  if (!isNativeMode() || nativeConnected) return null;
  const last = getLastPrinter();
  if (!last || !last.address) return null;
  try {
    const paired = await getPairedPrinters();
    const found = paired.find(p => p.address === last.address);
    if (found) {
      return await connect(found);
    }
  } catch {}
  return null;
}

function bytesToLatin1(bytes: Uint8Array): string {
  let s = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return s;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}