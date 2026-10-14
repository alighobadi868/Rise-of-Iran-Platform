plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

val configuredBaseUrl = providers.gradleProperty("platformBaseUrl").orElse("https://example.invalid").get()

android {
    namespace = "org.riseofiran.platform"
    compileSdk = 35

    defaultConfig {
        applicationId = "org.riseofiran.platform"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0"
        buildConfigField("String", "PLATFORM_BASE_URL", "\"$configuredBaseUrl\"")
    }

    buildFeatures { buildConfig = true; compose = true }

    buildTypes {
        debug {
            manifestPlaceholders["allowCleartext"] = "true"
            buildConfigField("String", "PLATFORM_BASE_URL", "\"http://10.0.2.2:3000\"")
        }
        release {
            manifestPlaceholders["allowCleartext"] = "false"
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation(platform("androidx.compose:compose-bom:2024.12.01"))
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
}
