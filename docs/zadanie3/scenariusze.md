## UC-01: Dodanie produktu przez skanowanie kodu kreskowego
**Opis:** Standardowe skanowanie i dodawanie większości produktów

**Aktorzy:** Użytkownik, API Open Food Facts

**Warunki początkowe:** Skanowany produkt istnieje bazie danych API 

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
