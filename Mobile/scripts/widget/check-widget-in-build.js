#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('Checking widget presence in build artifacts...\n');

const buildPaths = [
  '../../android/app/build/outputs/apk/release/app-release.apk',
  '../../android/app/build/outputs/apk/debug/app-debug.apk',
  '../../android/app/build/intermediates/merged_manifests/release/AndroidManifest.xml',
  '../../android/app/build/intermediates/merged_manifests/debug/AndroidManifest.xml',
];

let found = false;

buildPaths.forEach(buildPath => {
  const fullPath = path.join(__dirname, buildPath);
  if (fs.existsSync(fullPath)) {
    console.log(`Found: ${buildPath}`);
    
    if (buildPath.includes('AndroidManifest')) {
      const content = fs.readFileSync(fullPath, 'utf-8');
      if (content.includes('com.example.lifeorganizer.AppWidgetProvider')) {
        console.log('  ✅ Widget receiver found in manifest');
        found = true;
      } else {
        console.log('  ❌ Widget receiver NOT found in manifest');
      }
    }
  }
});

if (!found) {
  console.log('\n⚠️  Build artifacts not yet generated. Run: eas build -p android --profile preview');
  console.log('Then run this script again to verify the APK.\n');
}
