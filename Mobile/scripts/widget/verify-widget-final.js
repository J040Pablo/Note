#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('\n=== WIDGET PRESENCE VERIFICATION ===\n');

const checks = {
  'AppWidgetProvider.kt': {
    path: '../../android/app/src/main/java/com/example/lifeorganizer/AppWidgetProvider.kt',
    verify: (content) => content.includes('class AppWidgetProvider') && content.includes('override fun onUpdate')
  },
  'widget_info.xml': {
    path: '../../android/app/src/main/res/xml/widget_info.xml',
    verify: (content) => content.includes('appwidget-provider') && content.includes('@layout/widget_layout')
  },
  'widget_layout.xml': {
    path: '../../android/app/src/main/res/layout/widget_layout.xml',
    verify: (content) => content.includes('widget_title') && content.includes('widget_content')
  },
  'ProGuard Rules': {
    path: '../../android/app/proguard-rules.pro',
    verify: (content) => content.includes('com.example.lifeorganizer.AppWidgetProvider')
  },
  'Build Gradle': {
    path: '../../android/app/build.gradle',
    verify: (content) => content.includes('validateWidgetProvider')
  },
  'Plugin Index': {
    path: '../../expo-plugins/app-widget/index.js',
    verify: (content) => content.includes('RECEIVER_NAME') && content.includes('android:exported')
  }
};

let allPassed = true;

for (const [name, check] of Object.entries(checks)) {
  const fullPath = path.join(__dirname, check.path);
  
  if (!fs.existsSync(fullPath)) {
    console.log(`❌ ${name}: FILE NOT FOUND`);
    allPassed = false;
    continue;
  }
  
  const content = fs.readFileSync(fullPath, 'utf-8');
  
  if (check.verify(content)) {
    console.log(`✅ ${name}: OK`);
  } else {
    console.log(`❌ ${name}: VERIFICATION FAILED`);
    allPassed = false;
  }
}

console.log('\n=== POST-BUILD CHECKS ===\n');

const manifestPath = '../../android/app/src/main/AndroidManifest.xml';
const manifestFullPath = path.join(__dirname, manifestPath);

if (fs.existsSync(manifestFullPath)) {
  const manifestContent = fs.readFileSync(manifestFullPath, 'utf-8');
  const hasReceiver = manifestContent.includes('com.example.lifeorganizer.AppWidgetProvider');
  
  if (!hasReceiver) {
    console.log('ℹ️  AndroidManifest.xml: Receiver will be added by plugin during prebuild');
    console.log('    (this is expected - source manifest should not contain hardcoded receiver)');
  } else {
    console.log('✅ AndroidManifest.xml: Receiver present in source');
  }
}

console.log('\n=== SUMMARY ===\n');

if (allPassed) {
  console.log('✅ All widget source files verified');
  console.log('\nNext: eas build -p android --profile preview');
  console.log('\nPlugin will inject receiver during prebuild.');
  console.log('Monitor build output for: "[APP-WIDGET-PLUGIN]" messages\n');
} else {
  console.log('❌ Some checks failed - review above\n');
  process.exit(1);
}
