#!/usr/bin/env bash
# ساخت APK روی کامپیوتر خودتان (نیاز: Node 20+، JDK 17، Android SDK)
set -euo pipefail
npm install
npm install --no-save @capacitor/core@6 @capacitor/cli@6 @capacitor/android@6
npm run build
[ -d android ] || npx cap add android
npx cap sync android
for d in mdpi hdpi xhdpi xxhdpi xxxhdpi; do
  for f in ic_launcher ic_launcher_round ic_launcher_foreground; do
    cp public/icons/icon-192.png android/app/src/main/res/mipmap-$d/$f.png
  done
done
rm -rf android/app/src/main/res/mipmap-anydpi-v26
(cd android && ./gradlew assembleDebug)
echo "APK: android/app/build/outputs/apk/debug/app-debug.apk"
