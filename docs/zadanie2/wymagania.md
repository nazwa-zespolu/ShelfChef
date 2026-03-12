# Wymagania
## Constraints
1. **Zależność od zewnętrznego API:** Aplikacja korzysta z darmowego API bazy Open Food Facts w celu pobierania nazw produktów na podstawie kodów kreskowych. 
    - Baza ta jest tworzona przez społeczność, co oznacza, że system nie gwarantuje 100% kompletności danych ani ich absolutnej poprawności. 
    - Ograniczona liczba zapytań na klucz do API
2. **Ograniczenia sprzętowe:** Aplikacja musi działać na urządzeniach z różnymi specyfikacjami: 
    - Różna jakość kamer (wpływ na dokładność skanowania kodów) 
    - Różna przepustowość internetu
    - Pojemność dysku
3. **Ograniczenia API AI:** Funkcjonalność generowania przepisów zależy od wybranego dostawcy AI (np. OpenAI, Google Gemini). Może to wiązać się z kosztami API, limitami wywołań oraz koniecznością obsługi błędów (timeout, niedostępność serwisu).

## Wymagania systemowe
1. **Ilość danych:** System jest projektowany dla pojedynczego gospodarstwa domowego. Oczekiwana maksymalna pojemność lokalnej bazy danych to około 1000 aktywnych rekordów (produktów), co zajmie ułamek megabajta pamięci masowej i nie obciąży urządzenia.
2. **Wymagania sieciowe** Aplikacja jest architektonicznie aplikacją typu "offline-first". Połączenie z internetem jest nawiązywane wyłącznie na ułamek sekundy podczas operacji skanowania nowego kodu kreskowego.
3. **Kamera:** Wbudowana kamera o dostatecznej rozdzielczości i automatycznym ostrzeniu.
4. **Moc obliczeniowa** Dostateczna moc obliczeniowa dla analizy obrazu z kamery

## Wymagania funkcjonalne
### Must have (Krytyczne):

FR-01: Jako użytkownik, chcę zeskanować kod kreskowy produktu spożywczego, aby system automatycznie pobrał jego nazwę z bazy danych bez konieczności ręcznego pisania na klawiaturze.

FR-02: Jako użytkownik, chcę móc ręcznie dodać produkt (podając jego nazwę i datę ważności), aby móc ewidencjonować produkty nieposiadające kodów kreskowych (np. świeże warzywa z targu lub domowe przetwory).

FR-03: Jako użytkownik, chcę widzieć główną listę moich zapasów posortowaną rosnąco według daty ważności, aby w pierwszej kolejności zużywać produkty, które psują się najszybciej.

FR-04: Jako użytkownik, chcę móc usunąć dany produkt z listy jednym kliknięciem (np. przyciskiem "Zjedzone"), aby utrzymać aktualność mojej wirtualnej spiżarni.

### Should have (Ważne):

FR-05: Jako użytkownik, chcę przypisać produkt do konkretnej, samodzielnie utworzonej kategorii (np. "Lodówka", "Zamrażarka", "Szafka z suchymi"), aby łatwiej odnaleźć go w kuchni.

FR-06: Jako Zapracowany Rodzic (Persona 1), chcę móc zdefiniować wielkość partii (np. 5 kartonów mleka) przy jednym skanowaniu, aby nie musieć skanować każdego opakowania osobno.

FR-07: Jako Student chcę oznaczyć produkt jako otworzony i śledzić czas od jego otworzenia

### Could have (Opcjonalne):

FR-08: Jako Świadomy Student (Persona 2), chcę móc wpisywać daty ważności produktów i otrzymać systemowe powiadomienie na urządzeniu na 2 dni przed upływem daty przydatności produktu, aby zapobiec wyrzuceniu jedzenia.

FR-09: Jako Student chcę dostawać wygenerowane przez AI proponowane przepisy na podstawie produktów które posiadam w mieszkaniu.

FR-10: Aplikacja nie będzie posiadała funkcji synchronizacji w czasie rzeczywistym w chmurze pomiędzy kontami różnych użytkowników (skupienie się na architekturze lokalnej i pełnej prywatności stosownej dla repozytorium F-Droid).

### Won't have:

FR-11: Skanowanie paragonów - ze względu na skrótowe i mało zrozumiałe nazwy produktów.

FR-12: Funkcje społecznościowe (oceny przepisów, komentarze)
Społecznościowa platforma z oceną przepisów, komentarzami użytkowników, udostępnianiem własnych przepisów

## Wymagania niefunkcjonalne

NFR-01 (Wydajność i responsywność): Zapytanie sieciowe wysyłane do zewnętrznego API w celu rozszyfrowania kodu kreskowego nie może blokować głównego wątku aplikacji (UI). W przypadku braku dostępu do internetu lub braku odpowiedzi od serwera przez 5 sekund, system musi rzucić wyłapywany błąd i płynnie przełączyć użytkownika do formularza wprowadzania ręcznego.

NFR-02 (Bezpieczeństwo i Prywatność): Baza danych inwentarza użytkownika musi być przetrzymywana wyłącznie lokalnie na pamięci masowej urządzenia. Aplikacja nie ma prawa implementować modułów śledzących zachowanie (tzw. trackerów analitycznych) ani wysyłać stanu spiżarni na serwery dewelopera.

NFR-03 (Niezawodność Offline): Poza samą funkcją odpytania API o kod kreskowy, 100% funkcji aplikacji (w tym przeglądanie, sortowanie, usuwanie i dodawanie ręczne) musi działać przy całkowicie wyłączonym interfejsie sieciowym (w trybie samolotowym).