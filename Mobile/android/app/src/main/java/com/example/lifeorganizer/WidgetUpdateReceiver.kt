package com.example.lifeorganizer

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class WidgetUpdateReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent?) {
        val action = intent?.action ?: return
        
        when (action) {
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_MY_PACKAGE_REPLACED -> {
                ContributionWidgetProvider.requestUpdate(context)
                TodayTasksWidgetProvider.requestUpdate(context)
                FolderQuickWidgetProvider.requestUpdate(context)
            }
        }
    }
}
