## UC-01: Dodanie produktu przez skanowanie kodu kreskowego
**Opis:** Standardowe skanowanie i dodawanie większości produktów

**Aktorzy:** Użytkownik, API Open Food Facts

**Warunki początkowe:** Skanowany produkt istnieje w bazie danych API 

**Warunki końcowe:** Nowy produkt ze zdefiniowaną datą ważności lub bez i ilością zostaje zapisany w lokalnej bazie danych użytkownika.

### Scenariusz:

Użytkownik wybiera z menu głównego opcję "Skanuj produkty".

System uruchamia podgląd z tylnego aparatu urządzenia.

Użytkownik nakierowuje obiektyw na kod kreskowy opakowania.

System odczytuje kod i wysyła zapytanie do bazy Open Food Facts w celu pobrania nazwy i szczegółów produktu.

System wyświetla rozpoznane dane na ekranie i prosi użytkownika o podanie daty ważności oraz określenie ilości sztuk.

Użytkownik wprowadza dane i klika przycisk "Zapisz".

System rejestruje nowy obiekt w lokalnej bazie i wraca do ekranu skanowania.

## UC-02: Ręczne dodanie produktu
**Opis:** Dodawanie produktu nierozpoznanego przez API lub produktu bez kodu EAN

**Aktorzy:** Użytkownik

**Warunki początkowe:** Aparat fotograficzny nie musi być sprawny, urządzenie nie musi mieć dostępu do internetu, produkt nie istnieje w bazie danych lub nie posiada kodu EAN.

**Warunki końcowe:** Nowy produkt spożywczy zdefiniowany przez użytkownika jest dodany do lokalnej bazy danych jako posiadany produkt oraz szablon dla dodawania tego produktu w przyszłości.

### Scenariusz:

Użytkownik wybiera z menu głównego opcję "Dodaj produkt ręcznie"

Otwiera się ekran dodawania ręcznego produktu.

Użytkownik wprowadza nazwę produktu, datę ważności oraz określa ilości sztuk i klika przycisk "zapisz".

System rejestruje nowy obiekt w lokalnej bazie i szablon produktu.

## UC-03: Usunięcie produktu
**Opis:** Po spożyciu produktu należy usunąć go z aplikacji. 

**Aktorzy:** Użytkownik

**Warunki początkowe:** Produkt został spożyty, ale nadal widnieje w aplikacji jako dostępny

**Warunki końcowe:** Produkt został usunięty z aplikacji.

### Scenariusz:

Użytkownik wybiera z menu głównego opcję "Usuń produkty"

Otwiera się ekran posiadanych produktów z paskiem wyszukiwania, filtrowaniem alfabetycznym listy oraz możliwością zeskanowania kodu EAN w celu szybkiego znalezienia produktu. 

Użytkownik wybiera produkt z listy lub skanuje kod EAN 

Od dołu wysuwa się zasobnik opcji do wyboru.

Użytkownik wybiera z opcji zmniejszenie liczby lub ilości produktu, usunięcie produktu.  

## UC-04: Przegląd kończących się terminów
**Opis:** Wyświetlanie produktów zbliżających się do daty ważności do szybkiego zużycia

**Aktorzy:** Użytkownik

**Warunki początkowe:** W lokalnej bazie znajdują się produkty z ustawioną datą ważności, w tym produkty kończące się w najbliższym czasie

**Warunki końcowe:** Lista produktów kończących się jest wyświetlona w kolejności daty ważności, a użytkownik może przejść do szczegółów produktu

### Scenariusz:

Użytkownik wybiera z menu głównego opcję "Kończące się terminy"

System pobiera z lokalnej bazy produkty, dla których do końca daty ważności pozostały 2 dni lub mniej

System sortuje listę według daty ważności od najbliższej

System wyświetla nazwę produktu, datę ważności oraz pozostałą ilość

Użytkownik wybiera produkt w celu podglądu szczegółów

System wyświetla szczegóły wybranego produktu

## UC-05: Propozycja przepisu AI
**Opis:** Generowanie propozycji przepisu na podstawie produktów posiadanych w aplikacji oraz preferencji użytkownika

**Aktorzy:** Użytkownik, AI API

**Warunki początkowe:** Użytkownik wybiera opcję propozycji przepisu AI, wpisuje własne preferencje dotyczące przepisu oraz aplikacja ma możliwość wysłania zapytania do AI API na podstawie produktów posiadanych w lokalnej bazie

**Warunki końcowe:** System prezentuje wygenerowany przepis wraz z listą sugerowanych składników i instrukcjami

### Scenariusz:

Użytkownik wybiera z menu głównego opcję "Propozycja przepisu AI"

Użytkownik wpisuje własne preferencje dotyczące przepisu

Użytkownik klika przycisk "Generuj przepis"

System wysyła do AI API zapytanie o przepis na podstawie posiadanych produktów i preferencji użytkownika

AI API generuje propozycję przepisu na podstawie dostarczonych danych

System wyświetla wygenerowany przepis na ekranie

Użytkownik może ponownie uruchomić generację przepisu (np. dla innego wariantu)

## UC-06: Generowanie listy zakupów
**Opis:** Generowanie listy zakupów z automatyczną sugestią brakujących produktów.

**Aktorzy:** Użytkownik

**Warunki początkowe:** Użytkownik ma w aplikacji wybrany cel listy zakupów (np. wygenerowany przepis lub zestaw składników docelowych), a w lokalnej bazie znajdują się jego aktualne zapasy produktów

**Warunki końcowe:** System prezentuje wygenerowaną listę zakupów składającą się z produktów wybranych przez użytkownika oraz zatwierdzonych sugestii brakujących produktów

### Scenariusz:

Użytkownik wybiera z menu głównego aplikacji opcję "Stwórz listę zakupów"

Użytkownik potwierdza lub odrzuca produkty zasugerowane przez aplikację

Użytkownik dodaje swoje produkty

Użytkownik potwierdza listę zakupów

Po skończonych zakupach system automatycznie dodaje przedmioty do lokalnej bazy danych
