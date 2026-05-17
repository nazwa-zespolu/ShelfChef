/**
 * Tylko Jest (Node) — Metro NIE ładuje tego pliku na emulatorze / urządzeniu.
 * Zastępuje natywny moduł SQLite w testach, żeby nie wymagać Androida/iOS.
 */
jest.mock('react-native-quick-sqlite', () => ({
  open: () => ({
    execute: jest.fn(),
  }),
}));
