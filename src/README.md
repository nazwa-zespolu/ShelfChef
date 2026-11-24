# ShelfChef — mobile app

The app is an [Expo](https://docs.expo.dev) (SDK 56, React Native 0.85) project using
[Continuous Native Generation](https://docs.expo.dev/workflow/continuous-native-generation/).
The `android/` and `ios/` folders are **not** committed: they are generated from `app.json`
and the config plugins in `plugins/` whenever you build. Change native settings
(identifiers, permissions, icons, orientation, …) in `app.json`, never in generated files.

The app uses native libraries that are not part of Expo Go, so it runs in a
**development build** (`expo-dev-client`), not in Expo Go.

## Prerequisites

- Node.js 22.11 or newer
- Android: Android Studio with an SDK, an emulator or a device with USB debugging, and JDK 17
- iOS (macOS only): Xcode and CocoaPods

## Install

From the repository root:

```sh
npm ci
npm --prefix src ci
```

## Run on Android

```sh
cd src
npm run android        # npx expo run:android
```

The first run generates `android/`, builds and installs the development build, and starts
Metro. Later, when only JavaScript changed, it is enough to start Metro and open the
installed app:

```sh
npm start              # npx expo start --dev-client
```

Rebuild with `npm run android` after adding or updating a library with native code or after
changing `app.json` / `plugins/`. To regenerate the native project from scratch:

```sh
npx expo prebuild --clean
```

## Run on iOS

```sh
cd src
npm run ios            # npx expo run:ios
```

iOS is configured in `app.json` but has not been verified yet.

## Tests and checks

From the repository root:

```sh
npm test               # logic tests (tests/) and UI tests (src/__tests__, jest-expo preset)
```

From `src/`:

```sh
npm run lint
npx tsc --noEmit
npx expo-doctor
npx expo install --check   # dependency versions match the Expo SDK
```

Add libraries with `npx expo install <package>` so that versions match the SDK.
