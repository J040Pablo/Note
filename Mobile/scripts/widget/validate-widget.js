#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const checks = [
  {
    name: 'widget_info.xml',
    path: '../../android/app/src/main/res/xml/widget_info.xml',
    validate: (content) => {
      return content.includes('@layout/widget_layout') &&
             content.includes('android:minWidth') &&
             content.includes('android:minHeight') &&
             content.includes('android:description');
    }
  },
  {
    name: 'widget_layout.xml',
    path: '../../android/app/src/main/res/layout/widget_layout.xml',
    validate: (content) => {
      return content.includes('widget_title') &&
             content.includes('widget_content') &&
             content.includes('widget_button');
    }
  },
  {
    name: 'AppWidgetProvider.kt',
    path: '../../android/app/src/main/java/com/example/lifeorganizer/AppWidgetProvider.kt',
    validate: (content) => {
      return content.includes('class AppWidgetProvider') &&
             content.includes('AppWidgetManager.ACTION_APPWIDGET_UPDATE') &&
             content.includes('R.layout.widget_layout');
    }
  },
  {
    name: 'strings.xml',
    path: '../../android/app/src/main/res/values/strings.xml',
    validate: (content) => {
      return content.includes('widget_description') &&
             content.includes('widget_content') &&
             content.includes('widget_button_text');
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
