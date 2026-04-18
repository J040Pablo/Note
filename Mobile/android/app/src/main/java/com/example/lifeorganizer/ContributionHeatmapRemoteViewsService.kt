package com.example.lifeorganizer

import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import android.widget.RemoteViewsService

class ContributionHeatmapRemoteViewsService : RemoteViewsService() {
    override fun onGetViewFactory(intent: Intent): RemoteViewsFactory {
        return ContributionHeatmapFactory(applicationContext, intent)
    }
}

private class ContributionHeatmapFactory(
    private val context: Context,
    intent: Intent,
) : RemoteViewsService.RemoteViewsFactory {

    private val appWidgetId: Int =
        intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)

    private var config: HeatmapGridConfig = HeatmapGridConfig(
        widthPx = 110,
        heightPx = 110,
        cols = 5,
        rows = 5,
        cellSizePx = 12,
        gapPx = 2,
        paddingPx = 6,
    )

    private var orderedDates: List<String> = emptyList()
    private var values: List<Int> = emptyList()

    override fun onCreate() {
        // no-op
    }

    override fun onDataSetChanged() {
        val manager = AppWidgetManager.getInstance(context)
        config = HeatmapWidgetSizing.load(context, appWidgetId)
            ?: HeatmapWidgetSizing.resolveAndPersist(context, manager, appWidgetId)

        val heatmap = WidgetDataRepository.getHeatmapData(context)
        val totalDays = config.cols * config.rows
        orderedDates = WidgetDataRepository.recentDateKeys(totalDays)
        values = orderedDates.map { key -> heatmap[key] ?: 0 }
    }

    override fun onDestroy() {
        values = emptyList()
        orderedDates = emptyList()
    }

    override fun getCount(): Int = values.size

    override fun getViewAt(position: Int): RemoteViews {
        if (position < 0 || position >= values.size) {
            return RemoteViews(context.packageName, R.layout.widget_heatmap_cell)
        }

        val count = values[position]
        val views = RemoteViews(context.packageName, R.layout.widget_heatmap_cell)

        views.setInt(R.id.cell_root, "setMinimumHeight", config.cellSizePx)
        views.setInt(R.id.cell_root, "setMinimumWidth", config.cellSizePx)
        views.setInt(R.id.cell_dot, "setMinimumHeight", config.cellSizePx)
        views.setInt(R.id.cell_dot, "setMinimumWidth", config.cellSizePx)
        views.setInt(R.id.cell_dot, "setBackgroundResource", backgroundForCount(count))

        val fillInIntent = Intent().apply {
            putExtra("date", orderedDates.getOrNull(position))
            putExtra("count", count)
        }
        views.setOnClickFillInIntent(R.id.cell_root, fillInIntent)

        return views
    }

    override fun getLoadingView(): RemoteViews? = null

    override fun getViewTypeCount(): Int = 1

    override fun getItemId(position: Int): Long = position.toLong()

    override fun hasStableIds(): Boolean = true

    private fun backgroundForCount(count: Int): Int = when {
        count <= 0 -> R.drawable.widget_cell_bg_empty
        count <= 1 -> R.drawable.widget_cell_bg_level1
        count <= 3 -> R.drawable.widget_cell_bg_level2
        count <= 6 -> R.drawable.widget_cell_bg_level3
        else -> R.drawable.widget_cell_bg_level4
    }
}
