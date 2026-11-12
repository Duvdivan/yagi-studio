import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// The key that signs a release lives outside the repository. Without it, a release is signed with the debug key.
val keyFile = File(System.getProperty("user.home"), ".duvyagi/keystore.properties")
val keyProps = Properties().apply { if (keyFile.exists()) keyFile.inputStream().use { load(it) } }

android {
    namespace = "com.duvdivan.duvyagistudio"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.duvdivan.duvyagistudio"
        minSdk = 26             // Android 8: a WebView that updates, and adaptive icons
        targetSdk = 35
        versionCode = 6
        versionName = "1.5"
    }

    signingConfigs {
        if (keyFile.exists()) {
            create("release") {
                storeFile = File(keyProps.getProperty("storeFile"))
                storePassword = keyProps.getProperty("storePassword")
                keyAlias = keyProps.getProperty("keyAlias")
                keyPassword = keyProps.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
        }
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.webkit:webkit:1.12.1")
}

// The page comes from studio/src through build.py. Stop with a plain message if it hasn't been built.
tasks.named("preBuild") {
    doFirst {
        check(file("src/main/assets/index.html").exists()) { "Run python studio/build.py first: it writes the app's page." }
    }
}
