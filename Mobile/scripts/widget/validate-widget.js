#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const checks = [
  {
    name: 'AndroidManifest.xml widget receiver',
    path: '../../android/app/src/main/AndroidManifest.xml',
    validate: (content) => {
      const receiverRegex = /<receiver[^>]*android:name="(\.ContributionWidgetProvider|com\.example\.lifeorganizer\.ContributionWidgetProvider)"[^>]*android:exported="true"[^>]*>/s;
      const actionRegex = /<action[^>]*android:name="android\.appwidget\.action\.APPWIDGET_UPDATE"\s*\/>/s;
      const metadataRegex = /<meta-data[^>]*android:name="android\.appwidget\.provider"[^>]*android:resource="@xml\/widget_info"\s*\/>/s;
      return receiverRegex.test(content) && actionRegex.test(content) && metadataRegex.test(content);
    }
  },
  {
    name: 'widget_info.xml',
    path: '../../android/app/src/main/res/xml/widget_info.xml',
    validate: (content) => {
      return content.includes('@layout/widget_layout') &&
             content.includes('android:minWidth') &&
             content.includes('android:minHeight') &&
             content.includes('android:targetCellWidth');
    }
  },
  {
    name: 'widget_layout.xml',
    path: '../../android/app/src/main/res/layout/widget_layout.xml',
    validate: (content) => {
      return content.includes('widget_root') &&
             content.includes('widget_grid') &&
             content.includes('cell_0_0') &&
             content.includes('cell_9_6');
    }
  },
  {
    name: 'ContributionWidgetProvider.kt',
    path: '../../android/app/src/main/java/com/example/lifeorganizer/ContributionWidgetProvider.kt',
    validate: (content) => {
      return content.includes('class ContributionWidgetProvider') &&
             content.includes('updateAllWidgets') &&
             content.includes('R.layout.widget_layout') &&
             content.includes('WidgetDataRepository.getHeatmapData');
    }
  },
  {
    name: 'WidgetDataRepository.kt',
    path: '../../android/app/src/main/java/com/example/lifeorganizer/WidgetDataRepository.kt',
    validate: (content) => {
      return content.includes('saveHeatmapData') &&
             content.includes('getHeatmapData') &&
             content.includes('contribution_data');
    }
  },
  {
    name: 'WidgetBridgeModule.kt',
    path: '../../android/app/src/main/java/com/example/lifeorganizer/WidgetBridgeModule.kt',
    validate: (content) => {
      return content.includes('class WidgetBridgeModule') &&
             content.includes('updateWidgetData') &&
             content.includes('ContributionWidgetProvider.updateAllWidgets');
    }
  },
  {
    name: 'strings.xml',
    path: '../../android/app/src/main/res/values/strings.xml',
    validate: (content) => {
      return content.includes('contribution_widget_title') &&
             content.includes('contribution_widget_description');
    }
  }
];

let allValid = true;

console.log('Validating widget configuration...\n');

checks.forEach(check => {
  const filePath = path.join(__dirname, check.path);
  
  if (!fs.existsSync(filePath)) {
    console.log(`❌ ${check.name}: FILE NOT FOUND (${check.path})`);
    allValid = false;
    return;
  }
  
  const content = fs.readFileSync(filePath, 'utf-8');
  
  if (check.validate(content)) {
    console.log(`✅ ${check.name}: OK`);
  } else {
    console.log(`❌ ${check.name}: VALIDATION FAILED`);
    allValid = false;
  }
});

console.log('');

if (allValid) {
  console.log('✅ All widget configuration checks passed!');
  process.exit(0);
} else {
  console.log('❌ Some checks failed. Please review the configuration.');
  process.exit(1);
}
