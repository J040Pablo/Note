const { withAndroidManifest, withStringsXml, withPlugins } = require('@expo/config-plugins');

const PROVIDER_NAME = 'com.example.lifeorganizer.ContributionWidgetProvider';
const PROVIDER_SIMPLE = '.ContributionWidgetProvider';
const BOOT_RECEIVER_NAME = 'com.example.lifeorganizer.WidgetUpdateReceiver';
const BOOT_RECEIVER_SIMPLE = '.WidgetUpdateReceiver';
const HEATMAP_SERVICE_NAME = 'com.example.lifeorganizer.ContributionHeatmapRemoteViewsService';
const HEATMAP_SERVICE_SIMPLE = '.ContributionHeatmapRemoteViewsService';

/**
 * Ensures the ContributionWidgetProvider receiver is declared in AndroidManifest.xml.
 * Also registers the WidgetUpdateReceiver for BOOT_COMPLETED / MY_PACKAGE_REPLACED.
 *
 * NOTE: This plugin runs during `expo prebuild`. The manual AndroidManifest.xml
 * already has these entries, so this plugin acts as a CNG guard to re-add them
 * if prebuild regenerates the manifest.
 */
function withContributionWidgetManifest(config) {
  return withAndroidManifest(config, async (config) => {
    const manifest = config.modResults;

    if (!manifest.manifest.application) {
      manifest.manifest.application = [];
    }

    const app = manifest.manifest.application[0];

    if (!app.receiver) {
      app.receiver = [];
    } else if (!Array.isArray(app.receiver)) {
      app.receiver = [app.receiver];
    }

    if (!app.service) {
      app.service = [];
    } else if (!Array.isArray(app.service)) {
      app.service = [app.service];
    }

    // ── Widget provider ──────────────────────────────────────────────
    const hasProvider = app.receiver.some(
      (r) =>
        r.$['android:name'] === PROVIDER_NAME ||
        r.$['android:name'] === PROVIDER_SIMPLE
    );

    if (!hasProvider) {
      console.log('[APP-WIDGET-PLUGIN] Adding ContributionWidgetProvider receiver');
      app.receiver.push({
        $: {
          'android:name': PROVIDER_SIMPLE,
          'android:exported': 'true',
          'android:label': '@string/app_name',
        },
        'intent-filter': [
          {
            action: [
              { $: { 'android:name': 'android.appwidget.action.APPWIDGET_UPDATE' } },
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
    }

    // ── Boot / update receiver ────────────────────────────────────────
    const hasBoot = app.receiver.some(
      (r) =>
        r.$['android:name'] === BOOT_RECEIVER_NAME ||
        r.$['android:name'] === BOOT_RECEIVER_SIMPLE
    );

    if (!hasBoot) {
      console.log('[APP-WIDGET-PLUGIN] Adding WidgetUpdateReceiver (BOOT_COMPLETED)');
      app.receiver.push({
        $: {
          'android:name': BOOT_RECEIVER_SIMPLE,
          'android:exported': 'true',
        },
        'intent-filter': [
          {
            action: [
              { $: { 'android:name': 'android.intent.action.BOOT_COMPLETED' } },
              { $: { 'android:name': 'android.intent.action.MY_PACKAGE_REPLACED' } },
            ],
          },
        ],
      });
    }

    // ── Collection service for GridView widget ───────────────────────
    const hasHeatmapService = app.service.some(
      (s) =>
        s.$['android:name'] === HEATMAP_SERVICE_NAME ||
        s.$['android:name'] === HEATMAP_SERVICE_SIMPLE
    );

    if (!hasHeatmapService) {
      console.log('[APP-WIDGET-PLUGIN] Adding ContributionHeatmapRemoteViewsService');
      app.service.push({
        $: {
          'android:name': HEATMAP_SERVICE_SIMPLE,
          'android:exported': 'false',
          'android:permission': 'android.permission.BIND_REMOTEVIEWS',
        },
      });
    }

    // ── RECEIVE_BOOT_COMPLETED permission ─────────────────────────────
    if (!manifest.manifest['uses-permission']) {
      manifest.manifest['uses-permission'] = [];
    }
    const hasPerm = manifest.manifest['uses-permission'].some(
      (p) => p.$['android:name'] === 'android.permission.RECEIVE_BOOT_COMPLETED'
    );
    if (!hasPerm) {
      manifest.manifest['uses-permission'].push({
        $: { 'android:name': 'android.permission.RECEIVE_BOOT_COMPLETED' },
      });
    }

    return config;
  });
}

function withContributionWidgetStrings(config) {
  return withStringsXml(config, async (config) => {
    const strings = config.modResults;

    if (!strings.resources.string) {
      strings.resources.string = [];
    }

    const existing = strings.resources.string.map((s) => s.$?.name);

    const entries = [
      { name: 'contribution_widget_title', value: 'Life Organizer' },
      { name: 'contribution_widget_description', value: '' },
      { name: 'contribution_widget_subtitle', value: '' },
      { name: 'contribution_widget_no_data', value: '' },
    ];

    for (const entry of entries) {
      if (!existing.includes(entry.name)) {
        strings.resources.string.push({ $: { name: entry.name }, _: entry.value });
      }
    }

    return config;
  });
}

module.exports = function withAppWidget(config) {
  console.log('[APP-WIDGET-PLUGIN] Configuring contribution widget...');
  return withPlugins(config, [
    withContributionWidgetManifest,
    withContributionWidgetStrings,
  ]);
};
