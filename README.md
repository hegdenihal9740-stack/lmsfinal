# Learning Hub

https://github.com/hegdenihal9740-stack/learning-hub-741f1a74 run this

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Serve with XAMPP

Build the app with `npm run build`, then add a dedicated port and virtual host to XAMPP Apache. Add `Listen 8082` to `httpd.conf` and add this to `conf/extra/httpd-vhosts.conf`. Point `DocumentRoot` at the generated public build directory (the directory containing `index.html` and `assets`):

```apache
<VirtualHost *:8082>
    ServerName localhost:8082
    DocumentRoot "C:/path/to/project/.output/public"
    <Directory "C:/path/to/project/.output/public">
        Options FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>
</VirtualHost>
```

Replace the example path with this project's path. Ensure `httpd.conf` includes `conf/extra/httpd-vhosts.conf` and has `mod_rewrite` enabled. Start/restart Apache in the XAMPP Control Panel, then open `http://localhost:8082`. The included `.htaccess` serves built assets directly and routes app pages such as `/reset-password` to the client-side app. XAMPP hosts the frontend; authentication and data still use the configured Supabase project.

## Build an Android APK

The Android app packages the current web build with Capacitor. Install Android Studio with its Android SDK and JDK, then from the project root run:

```sh
npm run android:apk
```

The debug APK is written to `android/app/build/outputs/apk/debug/SkillAI-Student-Portal.apk`. To open the generated Android project in Android Studio, run `npm run android:sync` first, then `npm run android:open`. A release APK needs a signing key and release signing configuration.
