const { withAndroidManifest, withStringsXml, withPlugins } = require('@expo/config-plugins');
const path = require('path');
const fs = require('fs');

const RECEIVER_NAME = 'com.example.lifeorganizer.AppWidgetProvider';
const RECEIVER_SIMPLE = '.AppWidgetProvider';

function withAppWidgetManifest(config) {
  return withAndroidManifest(config, async (config) => {
    const manifest = config.modResults;

    if (!manifest.manifest.application) {
      manifest.manifest.application = [];
    }

    const app = manifest.manifest.application[0];

    // Ensure receiver array exists
    if (!app.receiver) {
      app.receiver = [];
    } else if (!Array.isArray(app.receiver)) {
      app.receiver = [app.receiver];
    }

    // Check if widget receiver already exists by full name OR simple name
    const receiverExistsFull = app.receiver.some(
      (r) => r.$['android:name'] === RECEIVER_NAME
    );
    
    const receiverExistsSimple = app.receiver.some(
      (r) => r.$['android:name'] === RECEIVER_SIMPLE
    );

    console.log(`[APP-WIDGET-PLUGIN] Receiver exists (full): ${receiverExistsFull}, (simple): ${receiverExistsSimple}`);

    // Remove simple name if it exists (use full name only)
    if (receiverExistsSimple && !receiverExistsFull) {
      console.log(`[APP-WIDGET-PLUGIN] Removing simple receiver name, will add full name`);
      app.receiver = app.receiver.filter(
        (r) => r.$['android:name'] !== RECEIVER_SIMPLE
      );
    }

    // Only add if it doesn't already exist by full name
    if (!receiverExistsFull) {
      console.log(`[APP-WIDGET-PLUGIN] Adding widget receiver: ${RECEIVER_NAME}`);
      
      app.receiver.push({
        $: {
          'android:name': RECEIVER_NAME,
          'android:exported': 'true',
          'android:label': '@string/app_name',
        },
        'intent-filter': [
          {
            action: [
              {
                $: {
                  'android:name': 'android.appwidget.action.APPWIDGET_UPDATE',
                },
              },
            ],
          },
        ],
        'meta-data': [
          {
            $: {
              'android:name': 'android.appwidget.provider',
              'android:resource': '@xml/widget_info',
            },
          },
        ],
      });
      
      console.log(`[APP-WIDGET-PLUGIN] Widget receiver added: ${RECEIVER_NAME}`);
    } else {
      console.log(`[APP-WIDGET-PLUGIN] Widget receiver already present: ${RECEIVER_NAME}`);
    }

    return config;
  });
}

function withAppWidgetStrings(config) {
  return withStringsXml(config, async (config) => {
    const strings = config.modResults;

    if (!strings.resources.string) {
      strings.resources.string = [];
    }

    const existingKeys = strings.resources.string.map((s) => s.$?.name);

    if (!existingKeys.includes('widget_description')) {
      strings.resources.string.push({
        $: { name: 'widget_description' },
        _: 'Quick notes widget',
      });
    }

    if (!existingKeys.includes('widget_content')) {
      strings.resources.string.push({
        $: { name: 'widget_content' },
        _: 'Your notes here',
      });
    }

    if (!existingKeys.includes('widget_button_text')) {
      strings.resources.string.push({
        $: { name: 'widget_button_text' },
        _: 'Open App',
      });
    }

    return config;
  });
}

module.exports = function withAppWidget(config) {
  console.log('[APP-WIDGET-PLUGIN] Initializing widget plugin...');
  
  const result = withPlugins(config, [
    withAppWidgetManifest,
    withAppWidgetStrings
  ]);
  
  console.log('[APP-WIDGET-PLUGIN] Widget plugin initialized successfully');
  return result;
};
