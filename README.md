# ShelfChef - Instrukcja Uruchamiania

Aplikacja (`src/`) to projekt **Expo SDK 56** (React Native 0.85) z _Continuous Native Generation_:
foldery `src/android` i `src/ios` nie są w repozytorium — generuje je Expo na podstawie `src/app.json`
i pluginów z `src/plugins/`. Ustawienia natywne (identyfikatory, uprawnienia, ikona, orientacja)
zmieniaj w `src/app.json`, nie w wygenerowanych plikach.

Aplikacja korzysta z bibliotek natywnych spoza Expo Go, dlatego działa w **development buildzie**
(`expo-dev-client`), a nie w aplikacji Expo Go. Szczegóły: [`src/README.md`](src/README.md).

## 1. Pierwsze uruchomienie projektu na emulatorze

Tę procedurę wykonaj po raz pierwszy po pobraniu projektu, przy nowym emulatorze lub po instalacji
biblioteki natywnej.

Wymagany Node.js: **22.13 lub nowszy** z linii 22.x albo 24.3+ (wymaga tego Metro).

1.  **Instalacja zależności** (z głównego katalogu repozytorium):
    ```bash
    npm ci
    npm --prefix src ci
    ```
2.  **Przygotowanie Emulatora:**
    Uruchom **Android Studio**, wejdź w **Device Manager** i włącz swoje wirtualne urządzenie (AVD).
3.  **Budowanie i instalacja aplikacji (Pierwszy Build):**
    ```bash
    cd src
    npm run android   # npx expo run:android
    ```
    Komenda generuje folder `android/`, buduje i instaluje development build oraz uruchamia Metro.
4.  **Po zmianie `src/app.json` lub `src/plugins/`:** istniejący folder `src/android` nie
    zawsze uwzględnia te zmiany, więc przed przebudową wygeneruj go od nowa:
    ```bash
    cd src
    npx expo prebuild --clean --platform android
    npm run android
    ```

---

## 2. Każde następne uruchomienie tego samego emulatora

Gdy aplikacja jest już zainstalowana na Twoim emulatorze.

1.  **Uruchom emulator** w Android Studio.
2.  **Uruchom Metro Bundler:**
    ```bash
    cd src
    npm start         # npx expo start --dev-client
    ```
    _Zostaw ten terminal otwarty przez cały czas pracy._
3.  **Otwórz aplikację:**
    Kliknij ikonę **ShelfChef** na emulatorze albo naciśnij `a` w terminalu z Metro.
4.  **Szybkie odświeżanie (Fast Refresh):**
    Po każdej zmianie w kodzie i zapisaniu pliku (`Ctrl + S`), aplikacja na emulatorze zaktualizuje się automatycznie.

_Uwaga: `npm run android` nie musisz już powtarzać, chyba że zainstalujesz nową bibliotekę natywną. Po zmianie `src/app.json` / `src/plugins/` najpierw uruchom `npx expo prebuild --clean --platform android` (patrz punkt 4 wyżej)._

---

## 🧪 Testy i Logika

Wszystkie poniższe komendy uruchamiaj z głównego katalogu repozytorium.
Przed pierwszym uruchomieniem zainstaluj zależności obu pakietów:

```bash
npm ci
npm --prefix src ci
```

Uruchomienie wszystkich testów:

```bash
npm test
```

Poszczególne zestawy można uruchomić osobno:

```bash
npm run test:logic
npm run test:ui
```

Raporty pokrycia dla obu zestawów generuje:

```bash
npm run test:coverage
```

Raporty HTML znajdują się w `src/coverage/logic/lcov-report/index.html` oraz
`src/coverage/ui/lcov-report/index.html`.
