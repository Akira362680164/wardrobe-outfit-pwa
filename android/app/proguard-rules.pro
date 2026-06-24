# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# 当前 release { minifyEnabled false }, 下方保留规则作为"未来开启 R8 时"的占位
# 注释,避免 minifyEnabled 切到 true 后反射 ClassNotFoundException。
# v0.9.15 加: Capacitor 反射 + 本项目 Native 插件需要保留的类。

# Capacitor 核心: 反射加载 BridgeActivity / Bridge / WebView 接口
-keep class com.getcapacitor.** { *; }
-keep class com.getcapacitor.plugin.** { *; }
-dontwarn com.getcapacitor.**

# 本项目自管 Native 插件: 通过 registerPlugin("NativeMiniMax") 反射实例化
-keep class com.wardrobe.outfit.plugins.** { *; }
-keep class com.wardrobe.outfit.NativeMiniMaxPlugin { *; }
-keep class com.wardrobe.outfit.NativeMiniMaxForegroundService { *; }
-keep class com.wardrobe.outfit.NativeProgressNotificationPlugin { *; }
-keep class com.wardrobe.outfit.NativeHeicConverterPlugin { *; }
-keep class com.wardrobe.outfit.LongTermBackupPlugin { *; }

# AndroidX / Java 反射常见保留
-keepattributes Signature, *Annotation*, InnerClasses, EnclosingMethod
-keepattributes SourceFile,LineNumberTable

# WebView JavaScript Interface (Capacitor Bridge 使用 @JavascriptInterface 反射)
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile
