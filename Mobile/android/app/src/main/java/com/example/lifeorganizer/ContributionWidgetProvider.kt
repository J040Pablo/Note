package com.example.lifeorganizer

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.util.Log
import android.widget.GridView
import android.widget.RemoteViews
import android.net.Uri

class ContributionWidgetProvider : AppWidgetProvider() {

    companion object {
        private const val TAG = "ContributionWidget"

        fun updateAllWidgets(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val component = ComponentName(context, ContributionWidgetProvider::class.java)
            val ids = manager.getAppWidgetIds(component)
            Log.i(TAG, "updateAllWidgets: widgetCount=${ids.size}")
            if (ids.isNotEmpty()) {
                ids.forEach { appWidgetId ->
                    updateWidget(context, manager, appWidgetId)
                }
            }
        }
        private fun buildRemoteViews(
            context: Context,
            appWidgetManager: AppWidgetManager,
            widgetId: Int,
        ): RemoteViews {
            val config = HeatmapWidgetSizing.resolveAndPersist(context, appWidgetManager, widgetId)
            val views = RemoteViews(context.packageName, R.layout.widget_layout)

            views.setInt(R.id.widget_grid, "setNumColumns", config.cols)
            views.setInt(R.id.widget_grid, "setHorizontalSpacing", config.gapPx)
            views.setInt(R.id.widget_grid, "setVerticalSpacing", config.gapPx)
            views.setInt(R.id.widget_grid, "setStretchMode", GridView.STRETCH_COLUMN_WIDTH)
            views.setViewPadding(
                R.id.widget_grid,
                config.paddingPx,
                config.paddingPx,
                config.paddingPx,
                config.paddingPx
            )

            val serviceIntent = Intent(context, ContributionHeatmapRemoteViewsService::class.java).apply {
                putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
                data = Uri.parse(toUri(Intent.URI_INTENT_SCHEME))
            }
            views.setRemoteAdapter(R.id.widget_grid, serviceIntent)
            views.setEmptyView(R.id.widget_grid, R.id.widget_empty)

            val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
            if (launchIntent != null) {
                launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                val pendingIntent = PendingIntent.getActivity(
                    context,
                    widgetId,
                    launchIntent,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                )
                views.setPendingIntentTemplate(R.id.widget_grid, pendingIntent)
                views.setOnClickPendingIntent(R.id.widget_root, pendingIntent)
            }

            Log.e(
                "WIDGET_DEBUG",
                "widthPx=${config.widthPx} heightPx=${config.heightPx} cols=${config.cols} rows=${config.rows} cellSize=${config.cellSizePx}"
            )

            return views
        }

        private fun updateWidget(
            context: Context,
            appWidgetManager: AppWidgetManager,
            appWidgetId: Int,
        ) {
            val views = buildRemoteViews(context, appWidgetManager, appWidgetId)
            appWidgetManager.notifyAppWidgetViewDataChanged(appWidgetId, R.id.widget_grid)
            appWidgetManager.updateAppWidget(appWidgetId, views)
        }
    }

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        Log.i(TAG, "onUpdate: ids=${appWidgetIds.joinToString()}")
        appWidgetIds.forEach { appWidgetId ->
            updateWidget(context, appWidgetManager, appWidgetId)
        }
    }

    override fun onAppWidgetOptionsChanged(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetId: Int,
        newOptions: android.os.Bundle
    ) {
        super.onAppWidgetOptionsChanged(context, appWidgetManager, appWidgetId, newOptions)
        Log.i(TAG, "onAppWidgetOptionsChanged: id=$appWidgetId")
        updateWidget(context, appWidgetManager, appWidgetId)
    }

    override fun onDeleted(context: Context, appWidgetIds: IntArray) {
        super.onDeleted(context, appWidgetIds)
        appWidgetIds.forEach { widgetId -> HeatmapWidgetSizing.clear(context, widgetId) }
    }
}
