# consumer-rules.pro: R8 keep rules for the PruftureZk module. JNA binds UniFFI's Kotlin interfaces
# and structures to libprufture_zk_prover.so by reflection, so a minified release must keep them.
-keep class com.sun.jna.** { *; }
-keep class * implements com.sun.jna.** { *; }
-keep class uniffi.prufture_zk_prover.** { *; }
-dontwarn java.awt.**
