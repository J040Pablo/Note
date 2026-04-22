package com.example.lifeorganizer

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.SharedPreferences
import android.os.Bundle
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject
import kotlin.math.max

class ContributionWidgetProvider : AppWidgetProvider() {

    companion object {
        const val PREFS_NAME = "com.example.lifeorganizer.widget"
        const val KEY_CONTRIBUTION_DATA = "contribution_data"

        private const val ROWS = 7
        private const val MIN_VISIBLE_COLS = 2
        private const val DEFAULT_VISIBLE_COLS = 4
        private const val MAX_VISIBLE_COLS = 10
        private const val APPROX_LAUNCHER_CELL_DP = 74

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
            count <= 0 -> R.drawable.widget_cell_empty
            count <= 2 -> R.drawable.widget_cell_level1
            count <= 5 -> R.drawable.widget_cell_level2
            count <= 9 -> R.drawable.widget_cell_level3
            else -> R.drawable.widget_cell_level4
        }

        private fun dateKeyForDaysAgo(daysAgo: Int): String {
            val cal = java.util.Calendar.getInstance()
            cal.add(java.util.Calendar.DAY_OF_YEAR, -daysAgo)
            val y = cal.get(java.util.Calendar.YEAR)
            val m = cal.get(java.util.Calendar.MONTH) + 1
            val d = cal.get(java.util.Calendar.DAY_OF_MONTH)
            return "%04d-%02d-%02d".format(y, m, d)
        }

        private fun resolveVisibleColumns(options: Bundle?): Int {
            val minWidthDp = options?.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0) ?: 0
            if (minWidthDp <= 0) {
                return DEFAULT_VISIBLE_COLS
            }

            val launcherColumns = max(1, (minWidthDp + 30) / APPROX_LAUNCHER_CELL_DP)
            val visibleCols = launcherColumns * 2
            return visibleCols.coerceIn(MIN_VISIBLE_COLS, MAX_VISIBLE_COLS)
        }

        private fun readContributionData(context: Context, visibleCols: Int): List<Int> {
            val prefs: SharedPreferences =
                context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            val raw = prefs.getString(KEY_CONTRIBUTION_DATA, null)

            val stored = mutableMapOf<String, Int>()
            if (!raw.isNullOrBlank()) {
                try {
                    val json = JSONObject(raw)
                    val keys = json.keys()
                    while (keys.hasNext()) {
                        val key = keys.next()
                        stored[key] = json.optInt(key, 0)
                    }
                } catch (_: Exception) {
                }
            }

            val totalDays = visibleCols * ROWS
            return (0 until totalDays).map { index ->
                val key = dateKeyForDaysAgo(totalDays - 1 - index)
                stored[key] ?: 0
            }
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

    override fun onAppWidgetOptionsChanged(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetId: Int,
        newOptions: Bundle
    ) {
        super.onAppWidgetOptionsChanged(context, appWidgetManager, appWidgetId, newOptions)
        updateWidget(context, appWidgetManager, appWidgetId)
    }

    private fun updateWidget(
        context: Context,
        manager: AppWidgetManager,
        widgetId: Int
    ) {
        val views = RemoteViews(context.packageName, R.layout.widget_contribution)
        val options = manager.getAppWidgetOptions(widgetId)
        val visibleCols = resolveVisibleColumns(options)
        val orderedCounts = readContributionData(context, visibleCols)

        for (colIdx in 0 until MAX_VISIBLE_COLS) {
            val visibility = if (colIdx < visibleCols) View.VISIBLE else View.GONE

            for (rowIdx in 0 until ROWS) {
                val resId = context.resources.getIdentifier(
                    "cell_${colIdx}_${rowIdx}",
                    "id",
                    context.packageName
                )

                if (resId == 0) {
                    continue
                }

                views.setViewVisibility(resId, visibility)

                if (colIdx < visibleCols) {
                    val dayIndex = colIdx * ROWS + rowIdx
                    val count = orderedCounts.getOrElse(dayIndex) { 0 }
                    views.setImageViewResource(resId, drawableForCount(count))
                }
            }
        }

        val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
        if (launchIntent != null) {
            val pendingIntent = PendingIntent.getActivity(
                context,
                widgetId,
                launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.widget_root, pendingIntent)
        }

        manager.updateAppWidget(widgetId, views)
    }
}
