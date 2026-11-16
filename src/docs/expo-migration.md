# Migracja z bare React Native do Expo

Stan na 2026-11-16. Dokument ma dwie części: [plan realizacji podzielony na PR-y](#3-plan-realizacji-pr-y) oraz [gotowe opisy issue](#6-opisy-issue-na-githuba) do wklejenia na GitHuba (po angielsku, jak dotychczasowe issue w repo).

## 1. Stan obecny i cel

Aplikacja to projekt `@react-native-community/cli` w katalogu `src/` (RN 0.85.1, React 19.2.3, New Architecture, Hermes). Kod natywny w `src/android` i `src/ios` jest szablonowy: jedyne własne zmiany to uprawnienia w manifeście / `Info.plist`, blokada orientacji i flaga `VisionCamera_enableCodeScanner`. Dzięki temu projekt nadaje się do **CNG** (Continuous Native Generation): katalogi natywne znikają z repo i są generowane przez `expo prebuild` z konfiguracji.

| Obszar | Teraz | Po migracji |
| --- | --- | --- |
| Narzędzia | RN CLI, ręczne `android/` i `ios/` | Expo CLI, CNG, konfiguracja w `app.json` |
| SQLite | `react-native-quick-sqlite` (**deprecated**, nieutrzymywany) | `expo-sqlite` |
| Schemat DB | `CREATE TABLE IF NOT EXISTS`, ręczny reset po zmianie | wersjonowane migracje (`PRAGMA user_version`) |
| Moduł przepisów | `react-native-executorch` + Qwen 2.5 3B, zdjęcia z Pixabay | usunięty w całości (nowy moduł powstanie osobno) |
| Skaner | `react-native-vision-camera` 4 (aktualna linia to 5.x) | `expo-camera` |
| Pliki / zdjęcia | `@dr.pogodin/react-native-fs`, `react-native-image-picker` | `expo-file-system`, `expo-image-picker` |
| Zmienne środowiskowe | `react-native-dotenv` + alias `@env` (tylko klucz Pixabay) | usunięte — brak zmiennych |
| iOS | projekt Xcode w repo, nikt nie buduje | Expo Go + EAS Build (bez macOS) |
| Testy UI | `@react-native/jest-preset` | `jest-expo` |
| RN | 0.85.1 | 0.88.x (Expo SDK 58) |

Bez zmian zostają: `react-native-safe-area-context`, `react-native-svg`, `lucide-react-native`, własna nawigacja na stanie w `App.tsx`, podział na dwa pakiety (`/` — testy logiki na `node:sqlite`, `src/` — aplikacja i testy UI).

### Wersje Expo

| Expo SDK | React Native | Rola w planie |
| --- | --- | --- |
| 56 | 0.85.3 | wersja docelowa adopcji — ten sam minor RN co dziś |
| 57 | 0.86.3 | krok pośredni upgrade'u |
| 58 (latest) | 0.88.1 | wersja końcowa |

Adopcja na SDK 56 oddziela „przejście na Expo” od „upgrade'u RN”: jeśli coś się zepsuje w PR 2, winne jest Expo, a nie trzy wersje RN naraz. Upgrade do 58 jest osobnym, ostatnim PR-em.

## 2. Decyzje

### Przyjęte w planie

1. **CNG zamiast trzymania `android/` i `ios/` w repo.** Nie mamy własnego kodu natywnego, więc nic nie tracimy, a upgrade'y SDK sprowadzają się do `npx expo install --fix`.
2. **Bez `expo-router`.** Nawigacja zostaje jak jest. Uwaga: istnieje katalog `src/app/` (`ScanToAdd.ts`, `ShoppingList.ts`, `services.ts`) — `expo-router` potraktowałby go jako katalog tras. Dopóki routera nie instalujemy, konfliktu nie ma; przy ewentualnym wdrożeniu trzeba ten katalog najpierw przemianować.
3. **`expo-sqlite` zamiast następców quick-sqlite (NitroSQLite, op-sqlite).** Ma synchroniczne API, więc ~100 wywołań `db.execute(...)` w repozytoriach zostaje bez zmian za cienkim adapterem. Jest wydawany razem z SDK i działa w Expo Go.
4. **`expo-camera` zamiast upgrade'u vision-camera 4 → 5.** Używamy wyłącznie skanera kodów kreskowych; `expo-camera` to pokrywa i usuwa ostatnią zależność spoza SDK. To warunek uruchamiania aplikacji w Expo Go, czyli darmowej ścieżki na iPhone'a (patrz [iOS bez macOS](#4-ios-bez-macos)).
5. **Executorch usuwamy przed adopcją Expo**, jeszcze na bare RN. To najcięższa zależność natywna; bez niej PR adopcyjny jest znacznie prostszy.
6. **OTA (`expo-updates`) — nie teraz.** Uzasadnienie w [sekcji 5](#5-ota-updates--odroczone).

### Ustalone z zespołem (2026-11-16)

| # | Pytanie | Decyzja |
| --- | --- | --- |
| A | Co zostaje z modułu przepisów po usunięciu LLM? | Nic. Nowy moduł będzie oparty na czymś zupełnie innym, więc usuwamy cały `features/recipe-generator` razem z ekranami, Pixabay, `.env` i zakładką „Przepisy AI”. |
| B | Czy przenosimy dane z obecnych instalacji deweloperskich? | Nie. `expo-sqlite` trzyma plik bazy w innym katalogu niż quick-sqlite, więc po PR 3 aplikacja startuje z pustą bazą. To ostatni wymuszony reset; kolejne zmiany schematu obsłużą migracje. |
| C | Jak budujemy Androida? | Lokalnie (`expo run:android`), jak dziś. |
| D | iOS? | Wspieramy. Nikt nie ma macOS, więc: Expo Go do codziennej pracy, EAS Build do właściwych buildów. Szczegóły w [sekcji 4](#4-ios-bez-macos). |

## 3. Plan realizacji (PR-y)

```
PR 1  usunięcie executorch (bare RN)
  └─ PR 2  adopcja Expo SDK 56 + CNG
       ├─ PR 3  expo-sqlite ── PR 4  wersjonowanie schematu
       ├─ PR 5  expo-file-system + expo-image-picker
       └─ PR 6  expo-camera
            └─ PR 7  upgrade do SDK 58 + porządki   (po PR 3–6)
                 └─ PR 8  iOS: Expo Go + EAS Build
```

PR 3, 5 i 6 są od siebie niezależne i można je robić równolegle (konflikty tylko w `package.json` / lockfile). Po każdym PR aplikacja ma działać i `npm test` z katalogu głównego ma przechodzić.

Wspólna checklista ręczna dla każdego PR (Android, build deweloperski; od PR 7 także iPhone):

- start aplikacji, ekran spiżarni z danymi;
- skan kodu EAN → dodanie produktu; ręczne dodanie produktu;
- zdjęcie produktu z aparatu i z galerii, podgląd, usunięcie;
- lista zakupów: utworzenie, dodanie pozycji, finalizacja zakupów;
- klawiatura w formularzach nie zasłania pól; dolna nawigacja nie nachodzi na pasek systemowy.

---

### PR 1 — Usunięcie modułu przepisów i lokalnego LLM

Gałąź: `refactor/remove-recipe-generator`. Baza: bare RN, bez Expo.

**Zakres**

- Usunąć zależności: `react-native-executorch`, `react-native-executorch-bare-resource-fetcher`, `@kesha-antonov/react-native-background-downloader` (nie ma własnych importów — to zależność fetchera), `react-native-dotenv`.
- Usunąć w całości `src/features/recipe-generator/`, `src/RecipeGeneratorView.tsx` i `tests/features/recipe-generator/`.
- `src/App.tsx`: usunąć `initExecutorch(...)`, panel zakładki przepisów i importy.
- `src/components/BottomNav.tsx`: usunąć zakładkę `recipes` („Przepisy AI”) z `AppTab` i listy zakładek. Nowy moduł doda ją z powrotem.
- `src/__tests__/App.test.tsx`: usunąć mock `RecipeGeneratorView` i asercje dotyczące tej zakładki.
- `ProductRepository`:
  - usunąć import typów z `features/recipe-generator/domain/dietaryCategorizationTypes`;
  - usunąć `countItemsPendingDietaryCategorization`, `getItemsPendingDietaryCategorization`, `batchUpdateDietaryCategorization`, `resetAllDietaryCategorization`, zapytanie o zapasy filtrowane dietą (okolice linii 610–650, używa `matchesDietPreference`) oraz `getRecipeModelConsent*`, `setRecipeModelConsent`, `RECIPE_MODEL_CONSENT_KEY`;
  - zostaje `DietaryFlags` z `domain/types.ts` oraz odczyt i zapis flag w definicji produktu.
- Zmienne środowiskowe — klucz Pixabay był jedyną zmienną, więc znika cała obsługa: plugin `react-native-dotenv` w `babel.config.js`, alias `@env` w `metro.config.js`, `src/env/`, `src/types/env.d.ts`, `src/__mocks__/env.ts`, `src/.env.example`, mapowanie `^@env$` w głównym `jest.config.js`.
- Testy bazy odwołujące się do usuniętych metod repozytorium — usunąć odpowiednie przypadki.

**Świadomie bez zmian**

- Kolumny `is_vegetarian`, `is_vegan`, `is_gluten_free`, `is_lactose_free` oraz tabela `app_settings` zostają w schemacie, żeby nie mieszać zmiany schematu z usuwaniem kodu. `NULL` nadal znaczy „brak klasyfikacji”. Nowy moduł przepisów zdecyduje, czy i czym je wypełniać (naturalny kandydat: tagi `ingredients_analysis` i alergeny z OFF), albo usunie je migracją.

**Weryfikacja**

- `npm test`, build Androida, dolna nawigacja ma trzy zakładki.
- `grep -rn "executorch\|recipe-generator\|RecipeGenerator\|@env\|PIXABAY" src tests` nic nie zwraca (poza `node_modules`).

**Uwagi**

- Pobrany model Qwen (kilka GB) zostaje w danych aplikacji na urządzeniach deweloperskich. Najprościej odinstalować aplikację; i tak czeka nas reset bazy w PR 3.

---

### PR 2 — Adopcja Expo SDK 56 i CNG

Gałąź: `feat/expo-adoption`. Największy PR konfiguracyjny; kod aplikacji prawie się nie zmienia. Biblioteki natywne (quick-sqlite, vision-camera, rn-fs, image-picker) **zostają** i działają przez autolinking w buildzie deweloperskim.

**Zakres**

1. Zależności (w `src/`):
   - `npm install expo@^56` → `npx expo install --fix` (wyrówna `react`, `react-native` 0.85.3, `react-native-svg`, `react-native-safe-area-context`, TypeScript).
   - dodać `expo-dev-client`, `jest-expo`;
   - usunąć `@react-native-community/cli*`, `@react-native/metro-config`, `@react-native/babel-preset`, `@react-native/jest-preset`, `@react-native/typescript-config`, `@react-native/new-app-screen`, `@babel/preset-env`.
2. Wejście: `src/index.js` → `registerRootComponent(App)` z `expo`; `"main": "index.js"` w `src/package.json`.
3. Skrypty: `start` → `expo start`, `android` → `expo run:android`, `ios` → `expo run:ios`.
4. `src/app.json` w formacie Expo. Szkic:

   ```json
   {
     "expo": {
       "name": "ShelfChef",
       "slug": "shelfchef",
       "version": "1.0.0",
       "orientation": "portrait",
       "userInterfaceStyle": "light",
       "newArchEnabled": true,
       "android": {
         "package": "com.shelfchef",
         "allowBackup": false,
         "permissions": ["CAMERA", "READ_MEDIA_IMAGES", "READ_MEDIA_VISUAL_USER_SELECTED"]
       },
       "ios": {
         "bundleIdentifier": "com.shelfchef",
         "infoPlist": {
           "NSCameraUsageDescription": "Aplikacja używa aparatu do skanowania kodów i dodawania zdjęć produktów.",
           "NSPhotoLibraryUsageDescription": "Aplikacja używa biblioteki zdjęć, aby dodać zdjęcie produktu do katalogu."
         }
       },
       "plugins": [
         ["react-native-vision-camera", {"enableCodeScanner": true}]
       ]
     }
   }
   ```

   Nazwy pól zweryfikować z dokumentacją SDK 56 (`npx expo config --type prebuild` pokaże wynik). `READ_EXTERNAL_STORAGE` z `maxSdkVersion=32` wymaga osobnego wpisu lub pluginu — sprawdzić, czy `react-native-image-picker` w ogóle go potrzebuje.
5. CNG: `git rm -r src/android src/ios src/Gemfile src/.bundle`; do `src/.gitignore` dodać `/android`, `/ios`, `.expo/`; z głównego `.gitignore` usunąć wyjątek `!src/android/gradle/wrapper/gradle-wrapper.jar`.
6. `babel.config.js` → `babel-preset-expo`. `metro.config.js` → `getDefaultConfig` z `expo/metro-config`. `tsconfig.json` → `extends: "expo/tsconfig.base"`.
7. Jest w `src/`: `preset: 'jest-expo'`. Dotychczasowe mocki bibliotek natywnych zostają.
8. README (główny i `src/README.md`): nowa instrukcja uruchamiania (`npm --prefix src ci`, `npx expo run:android`, potem `npx expo start`).

**Weryfikacja**

- `npx expo-doctor` i `npx expo install --check` bez błędów.
- `npx expo prebuild --clean` + `npx expo run:android` na czystym klonie.
- `npm test` (oba zestawy) + checklista ręczna.

**Ryzyka**

- **Edge-to-edge.** Dziś `edgeToEdgeEnabled=false`; w Expo edge-to-edge na Androidzie jest włączone zawsze. Sprawdzić na Androidzie < 16: `BottomNav`, bottom sheety, `FormScrollView`, `useKeyboardVisible` (zachowanie `adjustResize` się zmienia). Poprawki insetów mieszczą się w tym PR.
- **Podpis debug.** Jeśli instalacja na urządzeniu z poprzednią wersją kończy się `INSTALL_FAILED_UPDATE_INCOMPATIBLE`, odinstalować starą aplikację.
- **iOS** w tym PR jest tylko konfigurowany (`bundleIdentifier`, opisy uprawnień), nie weryfikowany — pierwsze uruchomienie na iPhonie następuje w PR 8.
- **Ikona aplikacji** (issue #25) staje się jednym wpisem w `app.json` — można dorzucić tu albo zostawić osobno.

---

### PR 3 — `react-native-quick-sqlite` → `expo-sqlite`

Gałąź: `refactor/expo-sqlite`. Zależy od PR 2.

**Zakres**

1. `npx expo install expo-sqlite`; usunąć `react-native-quick-sqlite`.
2. Nowy moduł `src/infrastructure/db/client.ts` — jedyne miejsce importujące `expo-sqlite`. Zachowuje dotychczasowy kształt `db.execute(sql, params) → {rows: {length, item(i)}}`, żeby repozytoria (`ProductRepository` ~49 wywołań, `ShoppingListRepository` ~44, `productPhotoFiles`) nie wymagały zmian. Szkic:

   ```ts
   import {openDatabaseSync, type SQLiteBindValue} from 'expo-sqlite';

   const database = openDatabaseSync('shelfchef.db');
   database.execSync('PRAGMA foreign_keys = OFF'); // jawnie: tak jak dotąd

   export const db = {
     execute(sql: string, params: SQLiteBindValue[] = []) {
       const rows = database.getAllSync<any>(sql, params);
       return {rows: {length: rows.length, item: (index: number) => rows[index]}};
     },
   };
   ```

   `init.ts` reeksportuje `db` i `runInTransaction` z nowego modułu, importy w reszcie kodu zostają.
3. Testy logiki (`tests/`): 18 plików ma własny `jest.mock('react-native-quick-sqlite', ...)`. Zastąpić je jednym mapowaniem w głównym `jest.config.js`: `'^expo-sqlite$' → tests/helpers/expo-sqlite.ts`, gdzie `openDatabaseSync` zwraca obiekt z `getAllSync` / `execSync` oparty o istniejący `tests/helpers/sqlite.ts` (`node:sqlite`). Kolejna zmiana sterownika nie dotknie już plików testowych.
4. Testy UI: w `src/jest.setup.js` mock `expo-sqlite` zamiast quick-sqlite.
5. `docs/db/schema.md`: zaktualizować wzmianki o QuickSQLite.

**Do sprawdzenia na urządzeniu** (testy logiki biegną na `node:sqlite`, nie na `expo-sqlite`):

- czy `getAllSync` poprawnie wykonuje `INSERT` / `UPDATE` / `DELETE` oraz `BEGIN` / `COMMIT` / `ROLLBACK`. Jeśli nie — adapter kieruje zapytania niebędące `SELECT` / `PRAGMA` do `runSync`. Nigdzie nie używamy `rowsAffected` ani `insertId`, więc wynik zapisu nie jest potrzebny;
- wiązanie parametrów `boolean` i `undefined` (helper testowy zamienia je na `0/1` i `null` — adapter powinien robić to samo);
- wycofanie transakcji po błędzie w `addToInventoryBatch` i finalizacji zakupów.

**Skutek uboczny**: nowa lokalizacja pliku bazy = pusta baza po aktualizacji (decyzja B). Opisać w PR.

---

### PR 4 — Wersjonowanie schematu bazy

Gałąź: `feat/db-migrations`. Zależy od PR 3 (technicznie niezależny od sterownika, ale bazuje na `client.ts`).

**Projekt**

- Wersja schematu w `PRAGMA user_version` (liczba w nagłówku pliku bazy, bez dodatkowej tabeli).
- `src/infrastructure/db/migrations/` — jeden plik na migrację (`001_baseline.ts`, `002_...`) i `index.ts` z uporządkowaną listą. Numer migracji = docelowe `user_version`.
- `migrate(db)`:
  1. odczytuje `user_version`;
  2. jeśli jest **większe** niż liczba znanych migracji (starsza aplikacja na nowszej bazie) — rzuca błąd; `App.tsx` ma już ekran błędu bazy;
  3. dla każdej brakującej migracji: `BEGIN` → migracja → `PRAGMA user_version = n` → `COMMIT`; przy błędzie `ROLLBACK` i przerwanie. Zmiana `user_version` jest częścią transakcji, więc baza nigdy nie zostaje w stanie pośrednim.
- `001_baseline` = obecny schemat z `init.ts` przeniesiony 1:1.
- Uzupełnianie `product_catalog` z `product_definitions` przy starcie (dziś w `setupShoppingListsSchema`) **nie** jest migracją — zostaje jako osobny, idempotentny krok po `migrate()`. Zniknie przy okazji issue #38.
- `setupDatabase()` = `migrate()` + powyższy krok; sygnatura bez zmian, więc `App.tsx` i testy wołają to samo.

**Zasady dla zespołu** (dopisać do `docs/db/schema.md`, zastępując akapit „bez migracji … ręcznie wyczyścić dane”):

- scalonej migracji nie edytujemy — każda zmiana schematu to nowy plik;
- migracja zawiera zarówno DDL, jak i przeniesienie danych;
- SQLite nie zmieni `CHECK` ani typu kolumny przez `ALTER TABLE` — stosujemy przebudowę tabeli (nowa tabela → `INSERT ... SELECT` → `DROP` → `RENAME`);
- `docs/db/schema.md` opisuje stan po ostatniej migracji.

**Testy** (`tests/database/migrations.test.ts`)

- pusta baza → najnowsza wersja, komplet tabel i indeksów;
- ponowne uruchomienie nic nie zmienia;
- błąd w migracji wycofuje jej zmiany i zostawia poprzednie `user_version`;
- `user_version` z przyszłości → błąd;
- od drugiej migracji: test „baza w wersji n−1 z danymi → wersja n zachowuje dane”.

---

### PR 5 — `expo-file-system` + `expo-image-picker`

Gałąź: `refactor/expo-photos`. Zależy od PR 2.

**Zakres**

- `npx expo install expo-file-system expo-image-picker`; usunąć `@dr.pogodin/react-native-fs`, `react-native-image-picker`. Dodać plugin `expo-image-picker` w `app.json` (teksty uprawnień) i usunąć ręcznie wpisane uprawnienia, które plugin dodaje sam.
- `src/infrastructure/productPhotos.ts`:
  - `launchCamera` / `launchImageLibrary` → `launchCameraAsync` / `launchImageLibraryAsync` (`result.canceled`, `assets[0].uri`, `fileName`, `mimeType`);
  - `PermissionsAndroid` → `requestCameraPermissionsAsync()`; `granted === false && canAskAgain === false` mapuje się na obecne `ProductPhotoPermissionError('blocked')`, zwykła odmowa na `'denied'`;
  - `mkdir` + `copyFile` → API `expo-file-system`.
- `src/infrastructure/productPhotoFiles.ts`: `exists` / `unlink` → `expo-file-system`. Logika `retained` / `pending` / `deleting` bez zmian.
- Usunąć `require(...)` w `try/catch` — w `jest-expo` moduły są mockowane standardowo.
- Testy: `src/__tests__/productPhotos.test.ts`, `ProductCatalogView.test.tsx`, `ProductScannerView.test.tsx`, `tests/database/product-photo-*.test.ts` — podmiana mocków.

**Na co uważać**

- `managedPhotoPath` rozpoznaje własne pliki po prefiksie `file://${DocumentDirectoryPath}/product-photos/`. Katalog dokumentów w Expo jest podawany jako URI z `file://` i końcowym ukośnikiem — łatwo o podwójny ukośnik lub brakujący prefiks. To zabezpieczenie decyduje, które pliki wolno usuwać, więc potrzebny jest test z realnym formatem URI.
- Fizyczna lokalizacja katalogu się nie zmienia, więc URI zapisane w bazie pozostają poprawne (o ile baza przetrwała — patrz decyzja B).
- `expo-file-system` ma nowe API obiektowe (`File`, `Directory`, `Paths`) i starsze pod `expo-file-system/legacy`. Używamy nowego; nazwy metod sprawdzić w dokumentacji SDK 56.

---

### PR 6 — `react-native-vision-camera` → `expo-camera`

Gałąź: `refactor/expo-camera`. Zależy od PR 2.

**Zakres**

- `npx expo install expo-camera`; usunąć `react-native-vision-camera` i jego plugin z `app.json`; dodać plugin `expo-camera` z tekstem uprawnienia.
- `src/ProductScannerView.tsx`:
  - usunąć dynamiczne `require('react-native-vision-camera')`, typ `VisionCameraModule` i walidację modułu (okolice linii 34, 123, 1273);
  - `<Camera device codeScanner isActive />` → `<CameraView facing="back" barcodeScannerSettings={{barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128']}} onBarcodeScanned={...} />`;
  - `useCameraPermission` → `useCameraPermissions`;
  - obecne `isActive` → warunkowe renderowanie albo `onBarcodeScanned={undefined}` na czas przetwarzania.
- `src/__tests__/ProductScannerView.test.tsx`: mock `expo-camera` zamiast vision-camera.

**Ryzyka**

- `onBarcodeScanned` odpala się wielokrotnie dla tego samego kodu — sprawdzić, czy obecna blokada duplikatów wystarcza.
- Na iOS kody UPC-A bywają zgłaszane jako EAN-13 z wiodącym zerem — zweryfikować normalizację EAN przed zapytaniem do OFF.
- Porównać szybkość i skuteczność skanowania ze stanem sprzed PR na 2–3 realnych opakowaniach. Powrót do vision-camera jest możliwy technicznie, ale odcina Expo Go — iOS wymagałby wtedy płatnego konta Apple od pierwszego dnia. Przy regresji najpierw szukać poprawki w ustawieniach `expo-camera`.

Po tym PR wszystkie moduły natywne pochodzą z Expo SDK, więc aplikację da się uruchomić w **Expo Go** — pod warunkiem, że projekt jest na SDK wspieranym przez aktualne Expo Go (czyli po PR 7).

---

### PR 7 — Upgrade do SDK 58 i porządki

Gałąź: `chore/expo-sdk-58`. Po PR 3–6.

**Zakres**

- Upgrade po jednej wersji: `npm install expo@^57 && npx expo install --fix`, test, potem to samo dla `^58`. Przed każdym krokiem przeczytać changelog SDK (breaking changes w `expo-sqlite`, `expo-camera`, `expo-file-system`).
- `npx expo-doctor`, `npx expo prebuild --clean`, pełna checklista ręczna.
- Wymagania Node dla SDK 58: `^22.13.0 || ^24.3.0` — zaktualizować `engines` w `src/package.json`.
- Opcjonalnie: ESLint 8 + `@react-native/eslint-config` → `eslint-config-expo` (`npx expo lint`).
- Opcjonalnie: wyrównać Jest (29 w `src/`, 30 w katalogu głównym) i TypeScript (5.8 vs 6) między pakietami.
- Dokumentacja: `docs/third-party-notices.md`, `docs/zadanie4/opis_projektu.md` (jeśli wymienia stos technologiczny), README.
- Przegląd pozostałości: `grep -rn "react-native-quick-sqlite\|vision-camera\|react-native-fs\|react-native-image-picker\|executorch\|@env" src tests docs`.

---

### PR 8 — iOS: Expo Go i EAS Build

Gałąź: `feat/ios-builds`. Po PR 7. Tło i koszty w [sekcji 4](#4-ios-bez-macos).

**Etap 1 — Expo Go (bez kosztów, bez konta Apple)**

- Uruchomić `npx expo start` na Linuksie i otworzyć projekt w Expo Go na iPhonie (ta sama sieć Wi-Fi albo `--tunnel`).
- Przejść checklistę ręczną na iOS i naprawić różnice platformowe. Spodziewane miejsca: uprawnienia aparatu i galerii, format kodów UPC-A w skanerze, bezpieczne obszary (notch, pasek gestów), zachowanie klawiatury w formularzach, `BackHandler` (na iOS nie działa — sprawdzić, czy każdy ekran ma widoczny sposób powrotu).
- Dopisać do README instrukcję uruchamiania na iPhonie.

**Etap 2 — EAS Build (wymaga płatnego konta Apple Developer)**

- `eas.json` z profilami `development` (dev client) i `preview` (dystrybucja wewnętrzna); `eas build:configure`.
- Rejestracja iPhone'ów zespołu: `eas device:create`; podpisywaniem i profilami zarządza EAS.
- `eas build --platform ios --profile development`, instalacja z linku / kodu QR.
- Bez sekretów w repo: dane logowania Apple zostają w EAS.

Etap 2 można odłożyć do momentu, gdy Expo Go przestanie wystarczać (np. dojdzie moduł natywny spoza Expo Go) albo gdy będziemy chcieli dać komuś zainstalowaną aplikację.

## 4. iOS bez macOS

Do zbudowania aplikacji iOS potrzebny jest Xcode, czyli macOS — ale nie musi to być nasz komputer. Są dwie ścieżki i plan wykorzystuje obie:

| | Expo Go | EAS Build |
| --- | --- | --- |
| Co to jest | gotowa aplikacja z App Store, która ładuje nasz JS z serwera deweloperskiego | build w chmurze Expo na maszynach z macOS |
| Koszt | 0 | konto Apple Developer (99 USD/rok); EAS ma darmowy plan z miesięcznym limitem buildów — sprawdzić aktualny limit |
| Konto Apple | niepotrzebne | wymagane płatne — bez niego nie da się podpisać buildu na fizyczne urządzenie |
| Ograniczenia | tylko moduły natywne wbudowane w Expo Go; tylko najnowszy SDK; to nie jest „nasza” aplikacja (brak ikony, nazwy, własnych uprawnień) | czas kolejki i limit buildów; każda zmiana zależności natywnej = nowy build |
| Do czego | codzienna praca i testy na iPhonie | instalowalna aplikacja, testerzy, TestFlight, sklep |

Wnioski dla planu:

- **Expo Go wystarcza do rozwoju**, bo po PR 6 wszystkie nasze moduły natywne (`expo-sqlite`, `expo-camera`, `expo-file-system`, `expo-image-picker`, `react-native-svg`, `react-native-safe-area-context`) są w nim dostępne. To główny powód, dla którego warto doprowadzić PR 6 do końca zamiast zostawać przy vision-camera.
- **Trzeba trzymać się najnowszego SDK.** Expo Go z App Store obsługuje tylko bieżącą wersję SDK; po każdym nowym wydaniu (kilka razy w roku) iPhone przestanie otwierać projekt, dopóki nie zrobimy upgrade'u. Na Androidzie ten problem nie występuje, bo tam używamy własnego buildu.
- **Każda nowa zależność natywna spoza Expo SDK kończy darmową ścieżkę** na iOS — warto o tym pamiętać przy wyborze bibliotek (np. do nowego modułu przepisów).
- Bez macOS nie ma symulatora iOS ani debugowania natywnego w Xcode. Błędy natywne na iOS diagnozujemy z logów EAS i z urządzenia.
- Do czasu PR 8 iOS jest niezweryfikowany. Jeśli ktoś ma iPhone'a pod ręką, szybki test w Expo Go po PR 7 jest wart 10 minut.

## 5. OTA updates — odroczone

Rekomendacja: **nie wdrażać teraz.**

- Nie ma użytkowników, do których trzeba by szybko dostarczyć poprawkę; każdy w zespole i tak buduje lokalnie.
- OTA wymaga konta EAS (lub własnego serwera aktualizacji), kanałów i pilnowania `runtimeVersion` — to stały koszt procesu, nie jednorazowa konfiguracja.
- OTA dostarcza tylko JS i zasoby. Zmiana zależności natywnej nadal wymaga nowego buildu.
- Dzięki CNG późniejsze włączenie to `npx expo install expo-updates` + kilka linii w `app.json`.

Jedno ograniczenie, o którym trzeba pamiętać: **build wydany bez `expo-updates` nie odbierze OTA.** Dlatego właściwy moment na wdrożenie to chwila *przed* przekazaniem pierwszego buildu osobom spoza zespołu (testerzy, sklep) — naturalnie razem z etapem 2 PR 8. Issue 10 poniżej trzyma ten warunek w backlogu.

## 6. Opisy issue na GitHuba

Kolejność tworzenia: najpierw epic, potem zadania (w treści epica podmienić `#TBD` na numery).

### Issue 1 (epic)

**Tytuł:** `Migrate from bare React Native to Expo`

````markdown
The app is a bare React Native CLI project. Several native dependencies are outdated or unmaintained (`react-native-quick-sqlite` is deprecated), the native projects are maintained by hand, and every RN upgrade is manual. Moving to Expo with Continuous Native Generation removes the `android/` and `ios/` folders from the repo and lets us replace third-party native modules with maintained Expo SDK modules.

Full plan: `src/docs/expo-migration.md`

## Tasks

- [ ] #TBD Remove the recipe generator and the local LLM
- [ ] #TBD Adopt Expo SDK 56 with CNG
- [ ] #TBD Replace react-native-quick-sqlite with expo-sqlite
- [ ] #TBD Add versioned database migrations
- [ ] #TBD Replace react-native-fs and react-native-image-picker with Expo modules
- [ ] #TBD Replace react-native-vision-camera with expo-camera
- [ ] #TBD Upgrade to Expo SDK 58 and clean up
- [ ] #TBD Run and build the app on iOS without a Mac

## Out of scope

- Rebuilding the recipes module (tracked separately)
- OTA updates (tracked separately, deferred)
- Navigation changes / expo-router

## Done when

- `android/` and `ios/` are no longer in the repo and the app builds with `npx expo run:android` from a clean clone
- No native dependency outside the Expo SDK remains, except `react-native-svg` and `react-native-safe-area-context`
- Schema changes no longer require wiping app data
- The app runs on an iPhone through Expo Go
- `npm test` passes
````

### Issue 2

**Tytuł:** `Remove the recipe generator and the local LLM`

````markdown
We are dropping on-device recipe generation. The recipes module will be rebuilt from scratch on a different basis (separate issue), so nothing from the current one is worth keeping. Removing it first also makes the Expo migration much simpler: ExecuTorch is our heaviest native dependency.

## Scope

- Remove `react-native-executorch`, `react-native-executorch-bare-resource-fetcher`, `@kesha-antonov/react-native-background-downloader` and `react-native-dotenv`
- Delete `src/features/recipe-generator/`, `RecipeGeneratorView.tsx` and their tests
- Remove `initExecutorch` and the recipes panel from `App.tsx`; remove the "Przepisy AI" tab from `BottomNav`
- Remove dietary categorization and model-consent methods from `ProductRepository`
- Remove the `@env` setup (Babel plugin, Metro alias, type declaration, Jest mapping, `.env.example`): the Pixabay key was its only user

## Keep

- Dietary flag columns and `app_settings` (no schema change in this task)
- `DietaryFlags` in `domain/types.ts`

## Acceptance criteria

- No reference to ExecuTorch, the recipe generator, Pixabay or `@env` remains
- The app builds and starts with three tabs
- `npm test` passes
````

### Issue 3

**Tytuł:** `Adopt Expo SDK 56 with Continuous Native Generation`

````markdown
Switch the project in `src/` from the React Native CLI to Expo. SDK 56 ships React Native 0.85, the version we already use, so this step changes tooling only. Existing native libraries stay and keep working through autolinking in a development build.

Depends on: #TBD (Remove the recipe generator)

## Scope

- Install `expo` (SDK 56), `expo-dev-client`, `jest-expo`; align versions with `npx expo install --fix`
- Entry point via `registerRootComponent`; scripts use `expo start` / `expo run:android` / `expo run:ios`
- Move native configuration to `app.json`: Android package and iOS bundle identifier `com.shelfchef`, portrait orientation, light UI style, permissions and usage descriptions, vision-camera config plugin with the code scanner enabled
- Delete `src/android`, `src/ios`, `Gemfile`, `.bundle`; ignore generated native folders and `.expo/`
- Switch Babel, Metro and TypeScript configs to the Expo presets
- Switch UI tests to the `jest-expo` preset
- Update run instructions in the README

## Notes

- Do not add `expo-router`: `src/app/` already exists and would be treated as the routes directory
- Edge-to-edge is always enabled on Android under Expo; check the bottom navigation, bottom sheets and keyboard behaviour in forms
- iOS is configured here but verified in a later task

## Acceptance criteria

- `npx expo-doctor` reports no issues
- A clean clone builds and runs with `npx expo run:android`
- Scanning, manual add, product photos and shopping lists work as before
- `npm test` passes
````

### Issue 4

**Tytuł:** `Replace react-native-quick-sqlite with expo-sqlite`

````markdown
`react-native-quick-sqlite` is deprecated and unmaintained. `expo-sqlite` offers an equivalent synchronous API and is released with the Expo SDK.

Depends on: #TBD (Adopt Expo)

## Scope

- Add `src/infrastructure/db/client.ts` as the only module importing the SQLite driver; keep the current `db.execute(sql, params)` result shape so repositories do not change
- Remove `react-native-quick-sqlite`
- Replace the per-file `jest.mock('react-native-quick-sqlite')` blocks in `tests/` with a single `moduleNameMapper` entry backed by the existing `node:sqlite` helper
- Update the SQLite mock in `src/jest.setup.js`
- Keep `foreign_keys` off explicitly (unchanged behaviour)

## Notes

- `expo-sqlite` stores the database file in a different directory, so existing development installs start with an empty database. No data transfer is planned.
- Verify on a device: write statements and manual `BEGIN`/`COMMIT`/`ROLLBACK` through the adapter, boolean parameters, rollback on a failed batch insert

## Acceptance criteria

- Only `db/client.ts` imports `expo-sqlite`
- No test file mocks the SQLite driver directly
- `npm test` passes; inventory, catalog and shopping list flows work on a device
````

### Issue 5

**Tytuł:** `Add versioned database migrations`

````markdown
The schema is created with `CREATE TABLE IF NOT EXISTS`, so any schema change requires wiping app data. Add versioned migrations so existing installs upgrade in place.

Depends on: #TBD (expo-sqlite)

## Scope

- Track the schema version in `PRAGMA user_version`
- Add `src/infrastructure/db/migrations/` with an ordered list of migrations; migration 1 is the current schema, moved unchanged
- Run each pending migration and its version bump in one transaction; roll back and stop on failure
- Fail with a clear error when the database version is newer than the app knows (the app already has a database error screen)
- Keep the startup backfill of `product_catalog` from `product_definitions` as a separate idempotent step after migrations
- Document the rules in `docs/db/schema.md`: never edit a merged migration, one file per change, table rebuild for changes `ALTER TABLE` cannot express

## Acceptance criteria

- An empty database reaches the latest version with all tables and indexes
- Running migrations twice changes nothing
- A failing migration leaves both the schema and `user_version` untouched
- Tests cover the cases above
- `docs/db/schema.md` no longer tells developers to wipe data after schema changes
````

### Issue 6

**Tytuł:** `Replace react-native-fs and react-native-image-picker with Expo modules`

````markdown
Move product photo handling to `expo-file-system` and `expo-image-picker`.

Depends on: #TBD (Adopt Expo)

## Scope

- `productPhotos.ts`: pick photos with `expo-image-picker`, request camera permission through its API (keep the existing `denied` / `blocked` distinction), copy files with `expo-file-system`
- `productPhotoFiles.ts`: existence checks and deletion with `expo-file-system`; retain/pending/deleting logic stays unchanged
- Add the `expo-image-picker` config plugin; drop permissions it already declares
- Remove both old packages and the `try { require(...) }` guards
- Update mocks in UI and database tests

## Notes

- `managedPhotoPath` decides which files may be deleted by matching the app's `product-photos` directory. Expo reports the document directory as a `file://` URI with a trailing slash; add a test using the real URI format.

## Acceptance criteria

- Taking a photo, choosing from the gallery, replacing, clearing and cancelling a draft behave as before
- Unused photo copies are still cleaned up; referenced and foreign files are never deleted
- `npm test` passes
````

### Issue 7

**Tytuł:** `Replace react-native-vision-camera with expo-camera`

````markdown
We only use vision-camera for barcode scanning, and we are on the 4.x line while 5.x is current. `expo-camera` covers barcode scanning and removes the last native dependency outside the Expo SDK, which is what lets the app run in Expo Go on an iPhone.

Depends on: #TBD (Adopt Expo)

## Scope

- `ProductScannerView.tsx`: use `CameraView` with `barcodeScannerSettings` (EAN-13, EAN-8, UPC-A, UPC-E, Code 128) and `useCameraPermissions`
- Remove the dynamic `require` of vision-camera and the module shape checks
- Replace the vision-camera config plugin with the `expo-camera` one
- Update the camera mock in `ProductScannerView.test.tsx`

## Risks to check

- `onBarcodeScanned` fires repeatedly for the same code; the existing duplicate guard must hold
- On iOS, UPC-A may be reported as EAN-13 with a leading zero
- Compare scan speed and reliability with the current build on a few real products. Falling back to vision-camera would rule out Expo Go, so try tuning `expo-camera` first

## Acceptance criteria

- Scanning the supported formats adds products as before
- The permission denied and no-camera states still render
- `npm test` passes
````

### Issue 8

**Tytuł:** `Upgrade to Expo SDK 58 and clean up after the migration`

````markdown
After the migration the project is on Expo SDK 56 (React Native 0.85). Upgrade to the current SDK 58 (React Native 0.88) and remove leftovers.

Depends on: the SQLite, migrations, photos and camera tasks

## Scope

- Upgrade one SDK at a time (56 → 57 → 58) with `npx expo install --fix`, reading each changelog
- Update `engines.node` to match SDK 58 requirements
- Update `docs/third-party-notices.md`, the README and any documentation listing the tech stack
- Remove remaining references to the replaced libraries
- Optional: move ESLint to `eslint-config-expo`; align Jest and TypeScript versions between the root and `src/` packages

## Acceptance criteria

- `npx expo-doctor` reports no issues on SDK 58
- The app builds from a clean clone and passes the manual checklist in `src/docs/expo-migration.md`
- `npm test` passes
````

### Issue 9

**Tytuł:** `Run and build the app on iOS without a Mac`

````markdown
We want to support iOS, but nobody on the team has macOS. After the migration every native module we use ships with Expo Go, so we can develop on an iPhone for free, and use EAS Build when we need an installable app.

Depends on: #TBD (Upgrade to Expo SDK 58) — Expo Go only supports the latest SDK

## Stage 1: Expo Go

- Open the project in Expo Go on an iPhone from `npx expo start` running on Linux
- Run the manual checklist on iOS and fix platform differences: camera and photo permissions, UPC-A barcodes, safe areas, keyboard behaviour in forms, screens that rely on the Android back button
- Document the iPhone workflow in the README

## Stage 2: EAS Build (needs a paid Apple Developer account)

- Add `eas.json` with `development` and `preview` profiles
- Register team devices and let EAS manage signing
- Produce an installable development build

Stage 2 can wait until Expo Go is no longer enough or we want to hand the app to someone.

## Notes

- Expo Go follows the latest SDK, so SDK upgrades become a recurring task
- Adding a native dependency that is not part of Expo Go ends the free path and makes Stage 2 mandatory

## Acceptance criteria

- Every flow in the manual checklist works on an iPhone in Expo Go
- Every screen can be left without a hardware back button
- The README explains how to run the app on an iPhone
````

### Issue 10 (backlog)

**Tytuł:** `Consider OTA updates with expo-updates`

````markdown
Deferred. With no external users there is nothing to deliver over the air, and OTA adds ongoing process cost (EAS account or own update server, channels, runtime version discipline).

Revisit **before** the first build is handed to anyone outside the team (for example together with the first EAS builds): builds released without `expo-updates` cannot receive OTA updates later.

When picked up:

- Decide between EAS Update and a self-hosted update server
- Choose a `runtimeVersion` policy
- Define channels (e.g. preview / production) and who may publish
````

### Issue 11 (następny krok, poza migracją)

**Tytuł:** `Rebuild recipes on a prebuilt, curated recipe set`

````markdown
Follow-up to removing the old recipe generator. Build a new recipes module on a single prebuilt recipe set generated offline by large cloud models, so recipe quality is known in advance and selection is deterministic. Nothing from the old module is reused.

## Idea

- Recipes reference ingredients by canonical names taken from Open Food Facts categories
- Pantry products map to the same canonical names, so matching recipes to the pantry is a deterministic lookup rather than model output
- The recipe set ships with the app (or is downloaded as a versioned data file)

## Open questions

- Which OFF taxonomy level gives usable canonical ingredient names, and how products without an EAN (generic catalog products) get one
- Recipe set format, size, versioning and how it is updated
- Ranking: expiring products first, number of missing ingredients, dietary filters
- Whether dietary flags can come from OFF data (`ingredients_analysis`, allergens) instead of a model
- Where dish images come from (fixed per recipe, or none)
- Whether the unused dietary flag columns are filled or dropped
- New native dependencies must be available in Expo Go, or iOS development needs paid EAS builds

Depends on: the Expo migration (database migrations in particular, since this needs schema changes)
````
