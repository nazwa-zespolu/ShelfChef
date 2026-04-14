# ShelfChef - Instrukcja Uruchamiania

## 1. Pierwsze uruchomienie projektu na emulatorze
Tę procedurę wykonaj po raz pierwszy po pobraniu projektu, przy nowym emulatorze lub gdy zmienisz ustawienia natywne w folderze `/android`.

1.  **Instalacja zależności:**
    Otwórz terminal w głównym katalogu projektu i zainstaluj biblioteki:
    ```bash
    npm install
    ```
2.  **Przygotowanie Emulatora:**
    Uruchom **Android Studio**, wejdź w **Device Manager** i włącz swoje wirtualne urządzenie (AVD).
3.  **Budowanie i instalacja aplikacji (Pierwszy Build):**
    Otwórz drugi terminal w VS Code i wpisz:
    ```bash
    npx react-native run-android
    ```
5.  **Jeśli pojawila sie aplikacja ale z błedem "Unable to load script":**
Uruchamiamy recznie Metro bo moze sie wylaczyl.
    ```bash
    npx react-native start
    ```

---

## 2. Każde następne uruchomienie tego samego emulatora
Gdy aplikacja jest już zainstalowana na Twoim emulatorze.

1.  **Uruchom emulator** w Android Studio.
2.  **Uruchom Metro Bundler:**
    W terminalu VS Code wpisz:
    ```bash
    npx react-native start
    ```
    *Zostaw ten terminal otwarty przez cały czas pracy.*
3.  **Otwórz aplikację:**
    Po prostu kliknij ikonę **ShelfChef** na pulpicie emulatora. 
4.  **Szybkie odświeżanie (Fast Refresh):**
    Po każdej zmianie w kodzie i zapisaniu pliku (`Ctrl + S`), aplikacja na emulatorze zaktualizuje się automatycznie.

*Uwaga: Komendy `run-android` nie musisz już powtarzać, chyba że zainstalujesz nową bibliotekę natywną lub zmodyfikujesz folder `/android`.*

---

## 🧪 Testy i Logika

```bash
npm test