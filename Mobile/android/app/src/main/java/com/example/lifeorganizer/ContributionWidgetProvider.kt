package com.example.lifeorganizer

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.util.Log
import android.widget.RemoteViews

class ContributionWidgetProvider : AppWidgetProvider() {

    companion object {
        private const val TAG = "ContributionWidget"
        private const val COLS = 10
        private const val ROWS = 7
        private const val TOTAL_DAYS = COLS * ROWS
        private val CELL_IDS: Array<IntArray> = arrayOf(
            intArrayOf(R.id.cell_0_0, R.id.cell_0_1, R.id.cell_0_2, R.id.cell_0_3, R.id.cell_0_4, R.id.cell_0_5, R.id.cell_0_6),
            intArrayOf(R.id.cell_1_0, R.id.cell_1_1, R.id.cell_1_2, R.id.cell_1_3, R.id.cell_1_4, R.id.cell_1_5, R.id.cell_1_6),
            intArrayOf(R.id.cell_2_0, R.id.cell_2_1, R.id.cell_2_2, R.id.cell_2_3, R.id.cell_2_4, R.id.cell_2_5, R.id.cell_2_6),
            intArrayOf(R.id.cell_3_0, R.id.cell_3_1, R.id.cell_3_2, R.id.cell_3_3, R.id.cell_3_4, R.id.cell_3_5, R.id.cell_3_6),
            intArrayOf(R.id.cell_4_0, R.id.cell_4_1, R.id.cell_4_2, R.id.cell_4_3, R.id.cell_4_4, R.id.cell_4_5, R.id.cell_4_6),
            intArrayOf(R.id.cell_5_0, R.id.cell_5_1, R.id.cell_5_2, R.id.cell_5_3, R.id.cell_5_4, R.id.cell_5_5, R.id.cell_5_6),
            intArrayOf(R.id.cell_6_0, R.id.cell_6_1, R.id.cell_6_2, R.id.cell_6_3, R.id.cell_6_4, R.id.cell_6_5, R.id.cell_6_6),
            intArrayOf(R.id.cell_7_0, R.id.cell_7_1, R.id.cell_7_2, R.id.cell_7_3, R.id.cell_7_4, R.id.cell_7_5, R.id.cell_7_6),
            intArrayOf(R.id.cell_8_0, R.id.cell_8_1, R.id.cell_8_2, R.id.cell_8_3, R.id.cell_8_4, R.id.cell_8_5, R.id.cell_8_6),
            intArrayOf(R.id.cell_9_0, R.id.cell_9_1, R.id.cell_9_2, R.id.cell_9_3, R.id.cell_9_4, R.id.cell_9_5, R.id.cell_9_6)
        )

        fun updateAllWidgets(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val component = ComponentName(context, ContributionWidgetProvider::class.java)
            val ids = manager.getAppWidgetIds(component)
            Log.i(TAG, "updateAllWidgets: widgetCount=${ids.size}")
            if (ids.isNotEmpty()) {
                ids.forEach { appWidgetId ->
                    val views = buildRemoteViews(context, appWidgetId)
                    manager.updateAppWidget(appWidgetId, views)
                }
            }
        }

        private fun drawableForCount(count: Int): Int = when {
            count <= 0 -> R.drawable.widget_cell_empty
            count <= 1 -> R.drawable.widget_cell_level1
            count <= 3 -> R.drawable.widget_cell_level2
            count <= 6 -> R.drawable.widget_cell_level3
            else -> R.drawable.widget_cell_level4
        }

        private fun buildRemoteViews(context: Context, widgetId: Int): RemoteViews {
            val views = RemoteViews(context.packageName, R.layout.widget_layout)

            val heatmap = WidgetDataRepository.getHeatmapData(context)
            val orderedDates = WidgetDataRepository.recentDateKeys(TOTAL_DAYS)
            Log.d(TAG, "buildRemoteViews: widgetId=$widgetId entries=${heatmap.size} expectedDays=$TOTAL_DAYS")

            // Log warning if heatmap is empty (possible data sync issue)
            if (heatmap.isEmpty()) {
                Log.w(TAG, "buildRemoteViews: WARNING - heatmap is empty! No task data in SharedPreferences.")
            } else {
                val nonZeroDays = heatmap.count { it.value > 0 }
                Log.d(TAG, "buildRemoteViews: days with tasks=$nonZeroDays")
            }

            for (colIdx in 0 until COLS) {
                for (rowIdx in 0 until ROWS) {
                    val dayIndex = colIdx * ROWS + rowIdx
                    val key = orderedDates.getOrNull(dayIndex)
                    val count = if (key == null) 0 else (heatmap[key] ?: 0)
                    val resId = CELL_IDS[colIdx][rowIdx]
                    views.setImageViewResource(resId, drawableForCount(count))
                }
            }

            val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
            if (launchIntent != null) {
                launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                val pendingIntent = PendingIntent.getActivity(
                    context,
                    widgetId,
                    launchIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
                views.setOnClickPendingIntent(R.id.widget_root, pendingIntent)
            }

            return views
        }
    }

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        Log.i(TAG, "onUpdate: ids=${appWidgetIds.joinToString()}")
        appWidgetIds.forEach { appWidgetId ->
            val views = buildRemoteViews(context, appWidgetId)
            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }
}
