package com.example.lifeorganizer

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.widget.RemoteViews
import org.json.JSONObject

class FolderQuickWidgetProvider : AppWidgetProvider() {

    companion object {
        const val PREFS_NAME = ContributionWidgetProvider.PREFS_NAME
        const val KEY_FOLDER_DATA = "folder_quick_data"

        fun requestUpdate(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(
                ComponentName(context, FolderQuickWidgetProvider::class.java)
            )
            if (ids.isNotEmpty()) {
                val provider = FolderQuickWidgetProvider()
                provider.onUpdate(context, manager, ids)
            }
        }
    }

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        for (widgetId in appWidgetIds) {
            updateWidget(context, appWidgetManager, widgetId)
        }
    }

    private fun updateWidget(context: Context, manager: AppWidgetManager, widgetId: Int) {
        val views = RemoteViews(context.packageName, R.layout.widget_folder_quick)
        val prefs: SharedPreferences = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val raw = prefs.getString(KEY_FOLDER_DATA, "{}")

        var folderName = "Select Folder"
        var folderId: String? = null

        try {
            val json = JSONObject(raw ?: "{}")
            if (json.has("folderName")) {
                folderName = json.getString("folderName")
            }
            if (json.has("folderId")) {
                folderId = json.getString("folderId")
            }
        } catch (e: Exception) {
            // retain defaults
        }

        views.setTextViewText(R.id.folder_name, folderName)

        val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
            if (folderId != null) {
                putExtra("folderId", folderId)
            }
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }

        if (intent != null) {
            val pendingIntent = android.app.PendingIntent.getActivity(
                context, widgetId, intent,
                android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
            )
            views.setOnClickPendingIntent(R.id.widget_root, pendingIntent)
        }

        manager.updateAppWidget(widgetId, views)
    }
}
