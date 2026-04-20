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
            Log.e("WIDGET_DEBUG", "🟢🟢🟢 buildRemoteViews START: widgetId=$widgetId 🟢🟢🟢")
            val config = HeatmapWidgetSizing.resolveAndPersist(context, appWidgetManager, widgetId)
            val views = RemoteViews(context.packageName, R.layout.widget_layout)

            views.setInt(R.id.widget_grid, "setNumColumns", config.cols)
            views.setInt(R.id.widget_grid, "setHorizontalSpacing", 2)  // 2dp fixo
            views.setInt(R.id.widget_grid, "setVerticalSpacing", 2)    // 2dp fixo
            views.setInt(R.id.widget_grid, "setStretchMode", GridView.STRETCH_COLUMN_WIDTH)
            views.setViewPadding(
                R.id.widget_grid,
                6,  // 6dp fixo para padding
                6,
                6,
                6
            )

            // 🔴 CRÍTICO: setEmptyView DEVE VIR ANTES de setRemoteAdapter
            views.setEmptyView(R.id.widget_grid, R.id.widget_empty)
            
            // 🔴 CRÍTICO: URI única por widgetId para evitar cache do launcher
            val serviceIntent = Intent(context, ContributionHeatmapRemoteViewsService::class.java).apply {
                putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId)
                // Cada widget precisa de uma URI única para forçar recriação do Factory
                data = Uri.parse("content://com.example.lifeorganizer/widget/$widgetId")
            }
            Log.e("WIDGET_DEBUG", "🔵 setRemoteAdapter: widgetId=$widgetId uri=${serviceIntent.data} className=${serviceIntent.component}")
            views.setRemoteAdapter(R.id.widget_grid, serviceIntent)

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

            Log.i(
                TAG,
                "buildRemoteViews: bucket=${config.bucket} cols=${config.cols} rows=${config.rows} cellSize=${config.cellSizeDp}dp"
            )

            return views
        }

        private fun updateWidget(
            context: Context,
            appWidgetManager: AppWidgetManager,
            appWidgetId: Int,
        ) {
            Log.d(TAG, "updateWidget START: widgetId=$appWidgetId")
            val views = buildRemoteViews(context, appWidgetManager, appWidgetId)
            
            // 🔴 ORDEM CRÍTICA:
            // 1. updateAppWidget() = envia RemoteViews + Intent do RemoteAdapter
            // 2. notifyAppWidgetViewDataChanged() = força recriação do Factory
            Log.d(TAG, "updateAppWidget: widgetId=$appWidgetId")
            appWidgetManager.updateAppWidget(appWidgetId, views)
            
            Log.d(TAG, "notifyAppWidgetViewDataChanged: widgetId=$appWidgetId")
            appWidgetManager.notifyAppWidgetViewDataChanged(appWidgetId, R.id.widget_grid)
            
            Log.d(TAG, "updateWidget END: widgetId=$appWidgetId")
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
        
        // Limpar bucket persistido para forçar re-resolução
        HeatmapWidgetSizing.clear(context, appWidgetId)
        
        // Atualizar widget com nova resolução
        updateWidget(context, appWidgetManager, appWidgetId)
    }

    override fun onDeleted(context: Context, appWidgetIds: IntArray) {
        super.onDeleted(context, appWidgetIds)
        appWidgetIds.forEach { widgetId -> HeatmapWidgetSizing.clear(context, widgetId) }
    }
}
