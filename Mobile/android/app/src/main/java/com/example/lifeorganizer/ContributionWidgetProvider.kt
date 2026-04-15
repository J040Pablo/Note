package com.example.lifeorganizer

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.SharedPreferences
import android.widget.RemoteViews
import org.json.JSONObject

/**
 * ContributionWidgetProvider
 *
 * Renders a 7-row × 10-column GitHub-style contribution heatmap using RemoteViews.
 * Data source: SharedPreferences (written by WidgetDataModule from the React Native bridge).
 */
class ContributionWidgetProvider : AppWidgetProvider() {

    companion object {
        const val PREFS_NAME = "com.example.lifeorganizer.widget"
        const val KEY_CONTRIBUTION_DATA = "contribution_data"

        private const val COLS = 10
        private const val ROWS = 7
        private const val TOTAL_DAYS = COLS * ROWS

        fun requestUpdate(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(
                ComponentName(context, ContributionWidgetProvider::class.java)
            )
            if (ids.isNotEmpty()) {
                val provider = ContributionWidgetProvider()
                provider.onUpdate(context, manager, ids)
            }
        }

        private fun drawableForCount(count: Int): Int = when {
            count <= 0  -> R.drawable.widget_cell_empty
            count <= 2  -> R.drawable.widget_cell_level1
            count <= 5  -> R.drawable.widget_cell_level2
            count <= 9  -> R.drawable.widget_cell_level3
            else        -> R.drawable.widget_cell_level4
        }

        fun todayKey(): String {
            val cal = java.util.Calendar.getInstance()
            val y = cal.get(java.util.Calendar.YEAR)
            val m = cal.get(java.util.Calendar.MONTH) + 1
            val d = cal.get(java.util.Calendar.DAY_OF_MONTH)
            return "%04d-%02d-%02d".format(y, m, d)
        }

        private fun dateKeyForDaysAgo(daysAgo: Int): String {
            val cal = java.util.Calendar.getInstance()
            cal.add(java.util.Calendar.DAY_OF_YEAR, -daysAgo)
            val y = cal.get(java.util.Calendar.YEAR)
            val m = cal.get(java.util.Calendar.MONTH) + 1
            val d = cal.get(java.util.Calendar.DAY_OF_MONTH)
            return "%04d-%02d-%02d".format(y, m, d)
        }

        fun readContributionData(context: Context): Map<String, Int> {
            val prefs: SharedPreferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val raw = prefs.getString(KEY_CONTRIBUTION_DATA, null)

            val stored = mutableMapOf<String, Int>()
            if (!raw.isNullOrBlank()) {
                try {
                    val json = JSONObject(raw)
                    val keys = json.keys()
                    while (keys.hasNext()) {
                        val k = keys.next()
                        stored[k] = json.optInt(k, 0)
                    }
                } catch (e: Exception) {
                    // Corrupted JSON → treat as empty (fail-safe)
                }
            }

            // Build result for the past TOTAL_DAYS days
            val result = mutableMapOf<String, Int>()
            for (i in 0 until TOTAL_DAYS) {
                val key = dateKeyForDaysAgo(TOTAL_DAYS - 1 - i)
                result[key] = stored[key] ?: 0
            }
            return result
        }
    }

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        for (widgetId in appWidgetIds) {
            updateWidget(context, appWidgetManager, widgetId)
        }
    }

    override fun onEnabled(context: Context) {
        requestUpdate(context)
    }

    private fun updateWidget(
        context: Context,
        manager: AppWidgetManager,
        widgetId: Int
    ) {
        val views = RemoteViews(context.packageName, R.layout.widget_contribution)

        val data = readContributionData(context)
        val sortedKeys = data.keys.sorted()
        var weekTaskCount = 0

        for (colIdx in 0 until COLS) {
            for (rowIdx in 0 until ROWS) {
                val dayIndex = colIdx * ROWS + rowIdx
                val count = if (dayIndex < sortedKeys.size) {
                    data[sortedKeys[dayIndex]] ?: 0
                } else {
                    0
                }

                if (colIdx == COLS - 1) weekTaskCount += count

                val resId = context.resources.getIdentifier(
                    "cell_${colIdx}_${rowIdx}", "id", context.packageName
                )
                if (resId != 0) {
                    views.setImageViewResource(resId, drawableForCount(count))
                }
            }
        }

        val subtitle = context.getString(R.string.contribution_widget_subtitle, weekTaskCount)
        views.setTextViewText(R.id.widget_subtitle, subtitle)

        val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)
        if (intent != null) {
            val pendingIntent = android.app.PendingIntent.getActivity(
                context, 0, intent,
                android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.widget_root, pendingIntent)
        }

        manager.updateAppWidget(widgetId, views)
    }
}
