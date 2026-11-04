# Аркада — пять классических игр

Небольшая русскоязычная мини-игротека: PAC-MAN, Змейка, пасьянс «Клондайк», Сапёр и Block Blast. Сайт адаптирован для телефона и компьютера, а после первого открытия работает без интернета. Рекорды сохраняются локально на устройстве.

## Ссылки

- **Сайт для компьютера и телефона:** https://dimasik1325.github.io/3787752557885325677854522577/
- **Скачать APK для Android:** https://github.com/dimasik1325/3787752557885325677854522577/releases/download/android-latest/pixel-arcade-android.apk
- **Страница последней APK-сборки:** https://github.com/dimasik1325/3787752557885325677854522577/releases/tag/android-latest

APK собирается GitHub Actions при обновлении `main` или рабочей ветки. Это debug-сборка для прямой установки: Android может попросить разрешить установку приложений из браузера/файлового менеджера. Сайт можно добавить на главный экран телефона отдельно — без APK.

## Запуск локально

Сайт — статические файлы в `www/`.

```bash
python3 -m http.server 8080 --directory www
```

Для Android-проекта используется Capacitor:

```bash
npm ci
npm run android:sync
npm run android:build
```

Нужны Node.js 22, JDK 21 и Android SDK. Публикация сайта и APK настроена в `.github/workflows/publish.yml`.
