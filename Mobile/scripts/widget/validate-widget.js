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
      return content.includes('@layout/widget_contribution') &&
             content.includes('android:minWidth') &&
             content.includes('android:minHeight') &&
             content.includes('android:targetCellWidth');
    }
  },
  {
    name: 'widget_contribution.xml',
    path: '../../android/app/src/main/res/layout/widget_contribution.xml',
    validate: (content) => {
      return content.includes('widget_root') &&
             content.includes('cell_0_0') &&
             content.includes('cell_3_6') &&
             !content.includes('widget_subtitle');
    }
  },
  {
    name: 'ContributionWidgetProvider.kt',
    path: '../../android/app/src/main/java/com/example/lifeorganizer/ContributionWidgetProvider.kt',
    validate: (content) => {
      return content.includes('class ContributionWidgetProvider') &&
             content.includes('requestUpdate') &&
             content.includes('R.layout.widget_contribution') &&
             content.includes('manager.updateAppWidget');
    }
  },
  {
    name: 'WidgetDataModule.kt',
    path: '../../android/app/src/main/java/com/example/lifeorganizer/WidgetDataModule.kt',
    validate: (content) => {
      return content.includes('class WidgetDataModule') &&
             content.includes('updateWidgetData') &&
             content.includes('override fun getName(): String = "WidgetBridge"');
    }
  },
  {
    name: 'strings.xml',
    path: '../../android/app/src/main/res/values/strings.xml',
    validate: (content) => {
      return content.includes('contribution_widget_description') &&
             !content.includes('contribution_widget_title') &&
             !content.includes('contribution_widget_subtitle');
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
