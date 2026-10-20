/**
 * Web Bluetooth API manager for connecting to ESC/POS thermal printers.
 * Works on Chrome/Edge for Android (HTTPS required).
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface BluetoothPrinterState {
  device: BluetoothDevice | null;
  characteristic: BluetoothRemoteGATTCharacteristic | null;
  server: BluetoothRemoteGATTServer | null;
  connected: boolean;
  printerName: string;
}

export type DisconnectCallback = () => void;

// ── Common service UUIDs for Bluetooth serial printers ───────────────────────

const SERIAL_PORT_SERVICE = '00001101-0000-1000-8000-00805f9b34fb';
const SPP_UUID = '00001101-0000-1000-8000-00805f9b34fb';

// Generic serial / SPP fallback services many cheap printers use
const FALLBACK_SERVICES = [
  SERIAL_PORT_SERVICE,                       // Bluetooth SPP (when exposed over GATT)
  '0000fee7-0000-1000-8000-00805f9b34fb',    // Common Chinese BLE printers
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e',    // Nordic UART
  '0000ff00-0000-1000-8000-00805f9b34fb',    // 0xFF00 (Xprinter / Rongta / 58mm)
  '0000ffe0-0000-1000-8000-00805f9b34fb',    // 0xFFE0
  '0000ffe5-0000-1000-8000-00805f9b34fb',    // 0xFFE5
  '0000fff0-0000-1000-8000-00805f9b34fb',    // 0xFFF0
  '0000ff10-0000-1000-8000-00805f9b34fb',    // 0xFF10
  '0000ff20-0000-1000-8000-00805f9b34fb',    // 0xFF20
  '0000fff5-0000-1000-8000-00805f9b34fb',    // 0xFFF5
  '0000ffe7-0000-1000-8000-00805f9b34fb',    // 0xFFE7
];

// ── Singleton state ──────────────────────────────────────────────────────────

let state: BluetoothPrinterState = {
  device: null,
  characteristic: null,
  server: null,
  connected: false,
  printerName: '',
};

let onDisconnectCb: DisconnectCallback | null = null;

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Check if Web Bluetooth is available in this browser.
 */
export function isWebBluetoothAvailable(): boolean {
  return typeof navigator !== 'undefined' && !!(navigator as any).bluetooth;
}

/**
 * Check if currently connected to a printer.
 */
export function isConnected(): boolean {
  return state.connected && state.characteristic !== null;
}

/**
 * Get the name of the currently connected printer.
 */
export function getPrinterName(): string {
  return state.printerName;
}

/**
 * Register a callback for when the printer disconnects.
 */
export function onDisconnect(cb: DisconnectCallback): void {
  onDisconnectCb = cb;
}

/**
 * Remove the disconnect callback.
 */
export function offDisconnect(): void {
  onDisconnectCb = null;
}

/**
 * Request a Bluetooth device and connect to its serial port.
 * Shows the Android Bluetooth device picker.
 */
export async function connect(): Promise<string> {
  let device: BluetoothDevice;

  // Single requestDevice call. Calling requestDevice twice in the same gesture
  // consumes user activation, which Chrome rejects with a "user gesture" error.
  // acceptAllDevices + optionalServices is both reliable for printers that don't
  // advertise the serial service and keeps this as one user-gesture request.
  device = await (navigator as any).bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: [
      SERIAL_PORT_SERVICE,
      ...FALLBACK_SERVICES,
    ],
  });

  if (!device.gatt) {
    throw new Error('Device does not support GATT');
  }

  // Listen for disconnect
  device.addEventListener('gattserverdisconnected', handleDisconnect);

  // Connect to GATT server
  const server = await device.gatt.connect();

  // Find a writable characteristic. Prefer scanning every accessible service so
  // printers that expose their data pipe on a non-standard service still work.
  let characteristic: BluetoothRemoteGATTCharacteristic | null = null;

  const findWritable = (chars: BluetoothRemoteGATTCharacteristic[]) => {
    for (const c of chars) {
      if (c.properties.write || c.properties.writeWithoutResponse) {
        return c;
      }
    }
    return null;
  };

  // Diagnostics: collect the services/characteristics we actually see so a
  // failure is actionable (the exact service UUID can be added above).
  const seen: string[] = [];

  try {
    const services = await server.getPrimaryServices();
    for (const service of services) {
      try {
        const chars = await service.getCharacteristics();
        for (const c of chars) {
          seen.push(`${service.uuid}:${c.uuid}${c.properties.write ? '(w)' : c.properties.writeWithoutResponse ? '(wnr)' : ''}`);
        }
        characteristic = findWritable(chars);
      } catch {
        // Skip services that error out — e.g. unreadable/unsupported.
        continue;
      }
      if (characteristic) break;
    }
  } catch {
    // getPrimaryServices() unsupported on this platform — fall back to known UUIDs.
  }

  // Fallback: probe the known ESC/POS serial services directly.
  if (!characteristic) {
    for (const serviceUuid of [SERIAL_PORT_SERVICE, ...FALLBACK_SERVICES]) {
      try {
        const service = await server.getPrimaryService(serviceUuid);
        const chars = await service.getCharacteristics();
        characteristic = findWritable(chars);
        if (!characteristic) {
          for (const c of chars) {
            seen.push(`${service.uuid}:${c.uuid}${c.properties.write ? '(w)' : c.properties.writeWithoutResponse ? '(wnr)' : ''}`);
          }
        }
      } catch {
        // Service not found, try next
        continue;
      }
      if (characteristic) break;
    }
  }

  if (!characteristic) {
    server.disconnect();
    const detail = seen.length
      ? ` Seen: ${[...new Set(seen)].join(', ')}.`
      : ' No services were accessible.';
    console.warn('Web Bluetooth: no writable characteristic found.', detail);
    throw new Error(
      'Could not find a writable characteristic on "' + (device.name || 'printer') + '".' +
      detail +
      ' Please share this message so we can add the exact service UUID for your printer.'
    );
  }

  state = {
    device,
    server,
    characteristic,
    connected: true,
    printerName: device.name || 'Unknown Printer',
  };

  return state.printerName;
}

/**
 * Send raw bytes to the connected printer.
 * Handles chunking for printers with small MTU.
 */
export async function send(data: Uint8Array): Promise<void> {
  if (!state.characteristic) {
    throw new Error('Not connected to a printer');
  }

  const characteristic = state.characteristic;

  // Prefer acknowledged writes so the printer can apply backpressure. Falls
  // back to unacknowledged writes for characteristics that only support those.
  const useWithResponse = characteristic.properties.write;
  const maxChunkSize = 20;

  let offset = 0;
  while (offset < data.length) {
    const chunk = data.slice(offset, offset + maxChunkSize);

    if (useWithResponse) {
      await characteristic.writeValueWithResponse(chunk);
    } else {
      await characteristic.writeValueWithoutResponse(chunk);
    }

    offset += maxChunkSize;

    if (offset < data.length) {
      await sleep(useWithResponse ? 5 : 25);
    }
  }
}

/**
 * Send a Uint8Array with a progress callback.
 */
export async function sendWithProgress(
  data: Uint8Array,
  onProgress?: (sent: number, total: number) => void,
): Promise<void> {
  if (!state.characteristic) {
    throw new Error('Not connected to a printer');
  }

  const characteristic = state.characteristic;
  const useWithResponse = characteristic.properties.write;
  const maxChunkSize = 20;

  let offset = 0;
  while (offset < data.length) {
    const chunk = data.slice(offset, offset + maxChunkSize);

    if (useWithResponse) {
      await characteristic.writeValueWithResponse(chunk);
    } else {
      await characteristic.writeValueWithoutResponse(chunk);
    }

    offset += maxChunkSize;
    onProgress?.(Math.min(offset, data.length), data.length);

    if (offset < data.length) {
      await sleep(useWithResponse ? 5 : 25);
    }
  }
}

/**
 * Disconnect from the printer.
 */
export function disconnect(): void {
  if (state.device?.gatt?.connected) {
    state.device.gatt.disconnect();
  }
  handleDisconnect();
}

// ── Internal helpers ─────────────────────────────────────────────────────────

function handleDisconnect(): void {
  state = {
    device: null,
    characteristic: null,
    server: null,
    connected: false,
    printerName: '',
  };
  onDisconnectCb?.();
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
