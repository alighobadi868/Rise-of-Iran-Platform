# Android app

This is the native Android source module for Rise of Iran. It provides a native landing screen, an API health check, and a link to the platform website.

## Build

Open the android/ directory in Android Studio with JDK 17 and Android SDK 35 installed. Gradle will resolve the Android Gradle Plugin and Kotlin plugins.

- Debug builds use http://10.0.2.2:3000, the Android emulator's host alias for a backend running on the development machine.
- Release builds default to a deliberately invalid placeholder URL. Configure a real HTTPS endpoint using a Gradle property before building:

```sh
./gradlew assembleRelease -PplatformBaseUrl=https://your-real-domain.example
```

The Gradle wrapper is not committed yet; use Android Studio's Gradle setup or generate a wrapper from an installed Gradle distribution. Do not ship a release build until the production URL, privacy notice, app icon, signing configuration, accessibility, and device tests have been reviewed.
