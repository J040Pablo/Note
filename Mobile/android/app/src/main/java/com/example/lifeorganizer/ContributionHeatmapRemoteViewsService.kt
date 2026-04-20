package com.example.lifeorganizer

import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.util.Log
import android.widget.RemoteViews
import android.widget.RemoteViewsService

private const val DEBUG_TAG = "HEATMAP_WIDGET"

class ContributionHeatmapRemoteViewsService : RemoteViewsService() {
    override fun onGetViewFactory(intent: Intent): RemoteViewsFactory {
        Log.e(DEBUG_TAG, "🔴🔴🔴 onGetViewFactory CHAMADO! 🔴🔴🔴")
        Log.e(DEBUG_TAG, "  widgetId=${intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, -1)}")
        Log.e(DEBUG_TAG, "  uri=${intent.data}")
        return ContributionHeatmapFactory(applicationContext, intent)
    }
}

private class ContributionHeatmapFactory(
    private val context: Context,
    intent: Intent,
) : RemoteViewsService.RemoteViewsFactory {

    private val appWidgetId: Int =
        intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)

    init {
        Log.e(DEBUG_TAG, "🟠🟠🟠 ContributionHeatmapFactory CONSTRUCTOR: appWidgetId=$appWidgetId 🟠🟠🟠")
    }

    private var config: HeatmapGridConfig = HeatmapGridConfig(
        bucket = HeatmapBucket.SMALL,
        cols = 5,
        rows = 5,
        layoutId = 0,
        cellSizeDp = 8f
    )

    private var orderedDates: List<String> = emptyList()
    private var values: List<Int> = emptyList()

    override fun onCreate() {
        Log.e(DEBUG_TAG, "🟡 Factory.onCreate: appWidgetId=$appWidgetId")
    }

    override fun onDataSetChanged() {
        Log.e(DEBUG_TAG, "🟢 onDataSetChanged CALLED: appWidgetId=$appWidgetId")
        val manager = AppWidgetManager.getInstance(context)
        
        // Carregar bucket persistido ou resolver novo
        val savedBucket = HeatmapWidgetSizing.load(context, appWidgetId)
        config = if (savedBucket != null) {
            // Usar bucket persistido e converter para config
            val bucket = savedBucket
            Log.e(DEBUG_TAG, "  ✓ Bucket persistido: $bucket")
            val tempConfig = HeatmapWidgetSizing.resolve(context, manager, appWidgetId)
            tempConfig
        } else {
            // Resolver e persistir novo
            Log.e(DEBUG_TAG, "  ✗ Bucket NOT found, resolvendo novo...")
            HeatmapWidgetSizing.resolveAndPersist(context, manager, appWidgetId)
        }

        val heatmap = WidgetDataRepository.getHeatmapData(context)
        Log.e(DEBUG_TAG, "  Heatmap keys: ${heatmap.size}")
        val totalDays = config.cols * config.rows
        orderedDates = WidgetDataRepository.recentDateKeys(totalDays)
        values = orderedDates.map { key -> heatmap[key] ?: 0 }
        Log.e(DEBUG_TAG, "  ✓ onDataSetChanged END: values.size=${values.size} config.cols=${config.cols}")
    }

    override fun onDestroy() {
        values = emptyList()
        orderedDates = emptyList()
    }

    override fun getCount(): Int {
        Log.e(DEBUG_TAG, "🔵 getCount CALLED: returning ${values.size}")
        return values.size
    }

    override fun getViewAt(position: Int): RemoteViews {
        if (position < 0 || position >= values.size) {
            Log.e(DEBUG_TAG, "🟠 getViewAt INVALID position=$position size=${values.size}")
            return RemoteViews(context.packageName, config.layoutId)
        }

        Log.e(DEBUG_TAG, "🟣 getViewAt position=$position/${values.size} layoutId=${config.layoutId}")
        val count = values[position]
        val views = RemoteViews(context.packageName, config.layoutId)

        // Aplicar apenas backgroundColor - NÃO usar setMinimumHeight/Width
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
