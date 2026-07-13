# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

# ── Capacitor ────────────────────────────────────────────────────────────
# Capacitor's WebView<->JS bridge uses reflection to find plugin classes and
# their @PluginMethod-annotated methods. Without these keep rules, R8 will
# strip or rename them and every native call (camera, push, etc.) silently
# breaks in release builds while working fine in debug.
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keepclassmembers class * extends com.getcapacitor.Plugin {
    @com.getcapacitor.annotation.PluginMethod <methods>;
}
-keep class com.getcapacitor.plugin.** { *; }

# Installed Capacitor plugins (app, camera, push-notifications)
-keep class com.capacitorjs.plugins.** { *; }

# ── Firebase Cloud Messaging (push notifications) ──────────────────────────
-keep class com.google.firebase.messaging.** { *; }
-keep class com.google.firebase.** { *; }
-dontwarn com.google.firebase.**

# ── WebView JS interface (Capacitor's bridge object) ────────────────────────
-keepclassmembers class com.getcapacitor.Bridge {
    public *;
}
-keepattributes JavascriptInterface
-keepattributes *Annotation*
