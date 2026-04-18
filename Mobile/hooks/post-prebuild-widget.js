#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(PROJECT_ROOT, 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
const RECEIVER_SIMPLE = '.ContributionWidgetProvider';
const RECEIVER_FULL = 'com.example.lifeorganizer.ContributionWidgetProvider';
const ACTION = 'android.appwidget.action.APPWIDGET_UPDATE';
const META_NAME = 'android.appwidget.provider';
const META_RESOURCE = '@xml/widget_info';

function verifyAndInjectReceiver() {
  console.log('[POST-PREBUILD-HOOK] Verifying widget receiver in final manifest...');
  console.log(`[POST-PREBUILD-HOOK] Target manifest: ${MANIFEST_PATH}`);

  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error('[POST-PREBUILD-HOOK] ❌ Manifest not found. Aborting.');
    process.exit(1);
  }

  const manifestContent = fs.readFileSync(MANIFEST_PATH, 'utf-8');

  const hasReceiver =
    manifestContent.includes(`android:name="${RECEIVER_SIMPLE}"`) ||
    manifestContent.includes(`android:name="${RECEIVER_FULL}"`);
  const hasAction = manifestContent.includes(`android:name="${ACTION}"`);
  const hasMeta =
    manifestContent.includes(`android:name="${META_NAME}"`) &&
    manifestContent.includes(`android:resource="${META_RESOURCE}"`);

  if (hasReceiver && hasAction && hasMeta) {
    console.log('[POST-PREBUILD-HOOK] ✅ Widget receiver already present. No changes needed.');
    return;
  }

  const receiverBlock = `\n    <receiver android:name="${RECEIVER_SIMPLE}" android:exported="true">\n      <intent-filter>\n        <action android:name="${ACTION}"/>\n      </intent-filter>\n      <meta-data android:name="${META_NAME}" android:resource="${META_RESOURCE}"/>\n    </receiver>`;

  if (!manifestContent.includes('</application>')) {
    console.error('[POST-PREBUILD-HOOK] ❌ Invalid manifest: missing </application> tag.');
    process.exit(1);
  }

  const updated = manifestContent.replace('</application>', `${receiverBlock}\n  </application>`);
  fs.writeFileSync(MANIFEST_PATH, updated, 'utf-8');
  console.log('[POST-PREBUILD-HOOK] ✅ Receiver injected successfully.');
}

try {
  verifyAndInjectReceiver();
} catch (error) {
  console.error('[POST-PREBUILD-HOOK] Error:', error);
  process.exit(1);
}
