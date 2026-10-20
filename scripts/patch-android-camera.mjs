import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const manifestPath = fileURLToPath(new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url));
if (!existsSync(manifestPath)) process.exit(0);

let manifest = readFileSync(manifestPath, 'utf8');
let changed = false;

if (!manifest.includes('android.permission.CAMERA')) {
  const permission = '    <uses-permission android:name="android.permission.CAMERA" />';
  const internet = '    <uses-permission android:name="android.permission.INTERNET" />';
  manifest = manifest.includes(internet)
    ? manifest.replace(internet, `${internet}\n${permission}`)
    : manifest.replace('</manifest>', `${permission}\n</manifest>`);
  changed = true;
}

if (!manifest.includes('android.hardware.camera')) {
  const features =
    '    <uses-feature android:name="android.hardware.camera" android:required="false" />\n' +
    '    <uses-feature android:name="android.hardware.camera.autofocus" android:required="false" />';
  manifest = manifest.replace('</manifest>', `${features}\n</manifest>`);
  changed = true;
}

if (changed) {
  writeFileSync(manifestPath, manifest);
  console.log('Android camera permission added.');
} else {
  console.log('Android camera permission already present.');
}
