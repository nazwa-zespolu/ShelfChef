
# Lista Ryzyk - Aplikacja ShelfChef


### R1. Niedokładne skanowanie kodów kreskowych (EAN)
| Parametr | Wartość |
|----------|---------|
| **Prawdopodobieństwo** | (3/5) |
| **Wpływ** | (4/5) |
| **Priorytet** | WYSOKI |

**Opis:** Kamera może błędnie rozpoznać kod EAN.

**Działania łagodzące:**
- Optymalizacja algorytmu rozpoznawania obrazu
- Umożliwienie ręcznego wprowadzenia kodu
- Implementacja wielokrotnego skanowania w celu weryfikacji

---

### R2. Baza danych EAN zawiera błędne lub przestarzałe informacje
| Parametr | Wartość |
|----------|---------|
| **Prawdopodobieństwo** | (3/5) |
| **Wpływ** | (2/5) |
| **Priorytet** | ŚREDNI |

**Opis:** Zewnętrzne API z kodami EAN może zwracać niepoprawne dane o produkcie.

**Działania łagodzące:**
- Możliwość ręcznej edycji informacji o produkcie przez użytkownika
- Integracja z wieloma źródłami danych (redundancja)

---

### R3. Nieadekwatne propozycje przepisów z AI
| Parametr | Wartość |
|----------|---------|
| **Prawdopodobieństwo** | (4/5) |
| **Wpływ** | (2/5) |
| **Priorytet** | ŚREDNI |

**Opis:** Model AI może zwracać przepisy ze składnikami niedostępnymi lub pomijać ograniczenia kulinarne użytkownika.

**Działania łagodzące:**
- Testowanie modelu AI na zbiorze testowym 
- Zmienne parametry (ograniczenia dietetyczne, preferencje kulinarne)
- Integracja z popularnymi bazami przepisów (API)
- Testowanie różnych modeli/promptów AI
- Fallback do przepisów z bazy danych zamiast samych AI

---

### R4. Niedostępność zewnętrznego API (baza EAN)
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

### R5. Ograniczona pojemność przechowywania danych
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


### R6. Kolizja danych między urządzeniami użytkownika
| Parametr | Wartość |
|----------|---------|
| **Prawdopodobieństwo** | (3/5) |
| **Wpływ** | (4/5) |
| **Priorytet** | WYSOKI |

**Opis:** Użytkownik używa aplikacji na wielu urządzeniach, a synchronizacja może prowadzić do konfliktów.

**Działania łagodzące:**
- Zapobieganie konfliktom synchronizacji

---

