package com.example.lifeorganizer

import android.util.Log

object Logger {
    private val ENABLED = BuildConfig.DEBUG

    fun d(tag: String, msg: String) {
        if (ENABLED) Log.d(tag, msg)
    }

    fun i(tag: String, msg: String) {
        if (ENABLED) Log.i(tag, msg)
    }

    fun w(tag: String, msg: String) {
        if (ENABLED) Log.w(tag, msg)
    }

    fun e(tag: String, msg: String, throwable: Throwable? = null) {
        if (throwable != null) {
            Log.e(tag, msg, throwable)
        } else {
            Log.e(tag, msg)
        }
    }
}
