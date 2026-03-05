
# Lista Ryzyk - Aplikacja ShelfChef


## Ryzyka Funkcjonalności

### 1. Niedokładne skanowanie kodów kreskowych (EAN)
| Parametr | Wartość |
|----------|---------|
| **Prawdopodobieństwo** | (3/5) |
| **Wpływ** | (3/5) |
| **Priorytet** | WYSOKI |

**Opis:** Kamera może błędnie rozpoznać kod EAN.

**Działania łagodzące:**
- Optymalizacja algorytmu rozpoznawania obrazu
- Umożliwienie ręcznego wprowadzenia kodu
- Implementacja wielokrotnego skanowania w celu weryfikacji

---

### 2. Baza danych EAN zawiera błędne lub zastarzsłe informacje
| Parametr | Wartość |
|----------|---------|
| **Prawdopodobieństwo** | (2/5) |
| **Wpływ** | (2/5) |
| **Priorytet** | ŚREDNI |

**Opis:** Zewnętrzny API z kodami EAN może zwracać niepoprawne dane o produkcie.

**Działania łagodzące:**
- Możliwość ręcznej edycji informacji o produkcie przez użytkownika
- Integracja z wieloma źródłami danych (redundancja)

---

### 3. Nieadekwatne propozycje przepisów z AI
| Parametr | Wartość |
|----------|---------|
| **Prawdopodobieństwo** | (4/5) |
| **Wpływ** | (2/5) |
| **Priorytet** | NISKI |

**Opis:** Model AI może zwracać przepisy ze składnikami niedostępnymi lub pomijać ograniczenia kulinarnych użytkownika.

**Działania łagodzące:**
- Testowanie modelu AI na zbiorze testowym 
- Zmienne parametry (ograniczenia dietetyczne, preferencje kulinarne)
- Integracja z popularnymi bazami przepisów (API)
- Testing różnych modeli/promptów AI
- Fallback do przepisów z bazy danych zamiast samych AI

---

### 4. Niedostępność zewnętrznego API (baza EAN)
| Parametr | Wartość |
|----------|---------|
| **Prawdopodobieństwo** | (1/5) |
| **Wpływ** | (3/5) |
| **Priorytet** | NISKI |

**Opis:** Zewnętrzny serwis bazy kodów EAN może być niedostępny z powodu awarii, konserwacji lub problemów sieciowych.

**Działania łagodzące:**
- Implementacja cachowania danych
- Integracja z alternatywnymi bazami (minimum 2 dostawców)

---

### 5. Ograniczona pojemność przechowywania danych
| Parametr | Wartość |
|----------|---------|
| **Prawdopodobieństwo** | (1/5) |
| **Wpływ** | (4/5) |
| **Priorytet** | ŚREDNI |

**Opis:** Aplikacja może wyczerpać dostępną przestrzeń dyskową ze względu na zdjęcia produktów, cachowanie bazy danych.

**Działania łagodzące:**
- Monitoring użycia dysku
- Optymalizacja rozmiaru obrazów (kompresja)
- Usuwanie zbędnych danych 

---


### 6. Kolizja danych między urządzeniami użytkownika
| Parametr | Wartość |
|----------|---------|
| **Prawdopodobieństwo** | (3/5) |
| **Wpływ** | (4/5) |
| **Priorytet** | ŚREDNI |

**Opis:** Użytkownik używa aplikacji na wielu urządzeniach, a synchronizacja może prowadzić do konfliktów

**Działania łagodzące:**
- Zapobieganie konfliktom synchronizacji

---

