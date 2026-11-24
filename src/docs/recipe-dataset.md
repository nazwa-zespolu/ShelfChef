# Moduł przepisów bez LLM na urządzeniu — poradnik budowy zbioru

Stan na 2026-11-16. Poradnik opisuje, jak zbudować zbiór kilku tysięcy przepisów powiązanych z tagami Open Food Facts, jak zautomatyzować generowanie dużymi modelami w chmurze i jak dołożyć zdjęcia. Zastępuje moduł `features/recipe-generator`, który usuwa PR 1 z [expo-migration.md](expo-migration.md).

Fragmenty kodu to szkice do przepisania, nie były uruchamiane. Fakty o OFF w [sekcji 2](#2-co-zostało-sprawdzone-w-off) sprawdziłem na żywych danych.

## 1. Pomysł w skrócie

Model językowy pracuje raz, na komputerze dewelopera. Aplikacja dostaje gotowy plik z przepisami i dopasowuje je do spiżarni zwykłym kodem, offline.

```
taksonomia OFF ──► słownik składników ──► lista dań ──► przepisy ──► walidacja ──► paczka w aplikacji
   (pobranie)        (~400 pozycji)       (~4000)      (~3000)                    (+ zdjęcia osobno)
```

Spoiwem jest **słownik składników**: zamknięta lista, w której każda pozycja wskazuje tagi kategorii OFF. Przepis odwołuje się wyłącznie do pozycji słownika, a zeskanowany produkt trafia do słownika przez swoje `categories_tags`.

| Decyzja | Wybór | Dlaczego |
| --- | --- | --- |
| Gdzie działa LLM | tylko w potoku budującym dane | brak modelu na telefonie, brak kosztu na użytkownika, offline-first zostaje |
| Identyfikator składnika | tag kategorii OFF (`en:milks`) | ten sam identyfikator przychodzi ze skanu produktu |
| Nazwa wyświetlana | własne pole `namePl` w słowniku | nazwy z taksonomii są w liczbie mnogiej i mają luki (sekcja 2) |
| Dopasowanie | obecność składnika, bez ilości | spiżarnia nie zna gramatury; ilości w przepisie są informacyjne |
| Zdjęcia | poza paczką aplikacji, pobierane i cache'owane | 3000 zdjęć to ponad 100 MB |

## 2. Co zostało sprawdzone w OFF

Dane pobrane 2026-11-16.

**Taksonomia kategorii** — `https://static.openfoodfacts.org/data/taxonomies/categories.json` (ok. 5 MB):

- 14 953 węzły, z czego 9 501 z prefiksem `en:`. Każdy ma `name` (słownik język → nazwa), `parents`, `children`.
- Tagi są w liczbie mnogiej: `en:milks`, `en:onions`, `en:garlics`, `en:basils`, `en:pastas`.
- **Polską nazwę ma tylko 1 238 węzłów.** Popularne zwykle ją mają (`en:milks` → „Mleko”, `en:garlics` → „Czosnek”), ale np. `en:potatoes` i `en:chicken-breasts` nie.
- Nazwy są kategoriami sklepowymi, nie składnikami: „Makarony”, „Masła”, „Kurczaki”. Do listy składników trzeba własnej formy: „makaron”, „masło”, „kurczak”.

**Taksonomia składników** — `.../taxonomies/ingredients.json` (ok. 4 MB):

- 6 849 węzłów w liczbie pojedynczej (`en:onion`, `en:garlic`), 2 534 z polską nazwą.
- Ok. 930 węzłów ma właściwości `vegan` i `vegetarian`, 76 ma `allergens`. Przykład: `en:egg` → vegan `no`, vegetarian `yes`, allergens `en:eggs`.
- Z taksonomią kategorii łączy ją tylko 78 jawnych powiązań (`expected_ingredients`) i 533 wspólne identyfikatory Wikidata. Pełnego mostu nie ma.

**API produktu** — pole `categories_tags`:

- Zawiera tagi kanoniczne **razem z przodkami**, od ogólnych do szczegółowych. Mleko UHT zwróciło: `en:dairies`, `en:milks-liquid-and-powder`, `en:milks`, …, `en:uht-milks`, `en:whole-milk-uht`.
- Zdarzają się śmieci spoza taksonomii (`pt:bebidas cafeína`). Trzeba filtrować do tagów istniejących w `categories.json`.
- `ingredients_analysis_tags` (`en:vegan`, `en:non-vegan`, `en:maybe-vegan`, `en:vegetarian`) i `allergens_tags` (`en:milk`, `en:gluten`) przychodzą w tej samej odpowiedzi.
- Na 6 próbnych EAN-ów: 4 miały dobre tagi, 1 nie miał żadnej kategorii (produkt o nazwie „maslo”), 1 nie istniał w bazie. To anegdota, nie pomiar — właściwy pomiar to krok 0.

**Wniosek dla projektu:** tag kategorii OFF nadaje się na identyfikator, ale nazwy polskie i flagi dietetyczne słownika trzeba uzupełnić samodzielnie. Taksonomia składników jest do tego dobrym źródłem pomocniczym.

## 3. Krok 0 — pomiar pokrycia (zanim cokolwiek zbudujesz)

Cały pomysł stoi na tym, że zeskanowane produkty mają sensowne `categories_tags`. Sprawdź to na własnych zakupach.

1. Zbierz 150–200 EAN-ów z prawdziwych kuchni zespołu (eksport z tabeli `product_definitions` wystarczy).
2. Skrypt pobiera dla każdego `fields=product_name,categories_tags,ingredients_analysis_tags,allergens_tags`. Użyj tego samego `User-Agent` i limitu co [OpenFoodFactsClient.ts](../infrastructure/OpenFoodFactsClient.ts) (15 zapytań na minutę).
3. Policz trzy liczby:
   - % produktów znalezionych w OFF,
   - % z co najmniej jednym tagiem z taksonomii,
   - % trafiających w słownik składników (da się policzyć dopiero po kroku 1; na początek oceń ręcznie na próbce).

| Wynik „trafia w słownik” | Co dalej |
| --- | --- |
| powyżej ~80% | buduj zgodnie z planem |
| 50–80% | buduj, ale dodaj fallback: użytkownik wybiera składnik ze słownika przy skanie, gdy tagów brak |
| poniżej 50% | fallback staje się główną ścieżką; rozważ dopasowanie po nazwie produktu do synonimów |

Progi są moją propozycją, nie normą. Przy większej skali zamiast API można użyć zrzutu bazy z `openfoodfacts.org/data` przefiltrowanego do Polski.

## 4. Krok 1 — słownik składników

Docelowo 300–500 pozycji w `tools/recipes/data/vocabulary.json`:

```json
{
  "id": "en:mozzarella",
  "namePl": "mozzarella",
  "synonymsPl": ["ser mozzarella"],
  "offTags": ["en:mozzarella"],
  "offIngredient": "en:mozzarella",
  "group": "nabiał",
  "staple": false,
  "perishable": true,
  "diet": { "vegetarian": true, "vegan": false, "glutenFree": true, "lactoseFree": false }
}
```

- `id` — tag kategorii OFF, główny klucz.
- `offTags` — tagi kategorii, które spełniają ten składnik. Zwykle jeden, równy `id`. Kilka, gdy taksonomia rozbija składnik na rozłączne gałęzie.
- `staple` — sól, pieprz, olej, woda, cukier, mąka. Nie liczą się jako braki.
- `perishable` — szybko się psuje; ranking premiuje przepisy zużywające takie produkty.
- `diet` — flagi, z których wylicza się dietę całego przepisu.

**Jak go zbudować:**

1. **Kandydaci automatycznie.** Skrypt bierze węzły `en:` z `categories.json` i odrzuca oczywiste nie-składniki: dania gotowe, słodycze, napoje, węzły geograficzne (`en:milks-from-austria`) i marketingowe.
2. **Selekcja modelem.** Jedno lub kilka zapytań do dużego modelu z listą kandydatów pogrupowaną po gałęziach: „wybierz węzły na poziomie składnika kulinarnego używanego w kuchni domowej w Polsce, podaj `namePl` w liczbie pojedynczej, synonimy, grupę, flagi”. To mały koszt, a wymaga osądu, więc bierz najmocniejszy model.
3. **Uzupełnienie flag z OFF.** Gdzie da się połączyć z `ingredients.json` (Wikidata albo nazwa), weź `vegan`/`vegetarian`/`allergens` stamtąd i porównaj z odpowiedzią modelu. Rozbieżności idą do ręcznego przeglądu.
4. **Przegląd ręczny całości.** 400 pozycji to godzina czytania. Słownik jest fundamentem; błąd tutaj powiela się w tysiącach przepisów.

**Walidator słownika** (uruchamiany przy każdej zmianie):

- każdy tag z `offTags` istnieje w `categories.json`;
- brak duplikatów `namePl`;
- dla każdej pozycji wypisz liczbę potomków w taksonomii — bardzo szerokie węzły (setki potomków) to sygnał, że pozycja jest zbyt ogólna;
- żadna pozycja nie jest przodkiem innej bez świadomej decyzji (patrz niżej).

**Granulacja.** Produkt „mozzarella” ma w tagach i `en:mozzarella`, i `en:cheeses`, więc spełnia obie pozycje. Działa to w jedną stronę: przepis wymagający mozzarelli nie zostanie spełniony przez dowolny ser. Trzymaj w słowniku pozycję ogólną („ser żółty”) i szczegółową („mozzarella”) tylko tam, gdzie rozróżnienie zmienia danie.

## 5. Krok 2 — lista dań

Prośba „wygeneruj 3000 przepisów” daje powtórki i losowy dobór. Najpierw powstają same tytuły, sterowane siatką.

**Siatka:** składnik-kotwica × typ posiłku.

- Kotwice to ok. 150 pozycji słownika, które nie są `staple` (mięsa, ryby, warzywa, nabiał, kasze, strączki).
- Typy posiłku: śniadanie, obiad, kolacja, przekąska lub deser. Pomijaj komórki bez sensu.
- Na komórkę 6–10 tytułów. Daje to 4–5 tys. tytułów przed deduplikacją.

**Ograniczenia w prompcie** (to one decydują o użyteczności zbioru):

- mniej więcej połowa dań z kuchni polskiej i domowej, reszta z popularnych kuchni świata;
- najwyżej 8 składników spoza `staple` na danie;
- udział dań wegetariańskich i wegańskich ustalony z góry (np. 30% i 10%);
- dania możliwe w zwykłej kuchni, bez specjalistycznego sprzętu.

**Wynik jednego dania** (`dishes.jsonl`):

```json
{"id": "makaron-pomidory-mozzarella", "titlePl": "Makaron z pomidorami i mozzarellą",
 "titleEn": "Pasta with tomatoes and mozzarella", "anchor": "en:mozzarella",
 "meal": "obiad", "cuisine": "włoska", "classic": false}
```

`titleEn` i `classic` przydają się przy szukaniu zdjęć (krok 5). `id` to ASCII-slug, bo posłuży jako `custom_id` w batchu.

**Deduplikacja:** najpierw po znormalizowanym tytule, potem jedno zapytanie do modelu na każdą kotwicę: „scal dania, które są tym samym pod inną nazwą”.

## 6. Krok 3 — generowanie przepisów

Jedno danie to jedno zapytanie ze structured output. Model dostaje słownik w prompcie systemowym i dane dania w wiadomości.

**Schemat przepisu:**

```ts
const Recipe = z.object({
  title: z.string(),
  servings: z.number(),
  timeMin: z.number(),
  difficulty: z.enum(["łatwe", "średnie", "trudne"]),
  ingredients: z.array(z.object({
    id: z.enum(vocabularyIds),          // tylko pozycje słownika
    qty: z.number().nullable(),
    unit: z.enum(["g", "ml", "szt", "łyżka", "łyżeczka", "szczypta"]).nullable(),
    required: z.boolean(),
    substitutes: z.array(z.enum(vocabularyIds)),
    note: z.string().nullable(),        // „drobno posiekana”
  })),
  steps: z.array(z.string()),
});
```

Enum z identyfikatorami gwarantuje, że model nie wymyśli składnika spoza słownika. Jeśli API odrzuci schemat z kilkuset wartościami jako zbyt złożony, zamień `z.enum` na `z.string()` i sprawdzaj identyfikatory w walidatorze (krok 4), ponawiając nieudane.

**Batch API** (połowa ceny, wynik zwykle w ciągu godziny):

```ts
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

const client = new Anthropic(); // czyta ANTHROPIC_API_KEY

const batch = await client.messages.batches.create({
  requests: dishes.map((dish) => ({
    custom_id: dish.id,
    params: {
      model: "claude-opus-5-5",
      max_tokens: 16000,
      output_config: { effort: "medium", format: zodOutputFormat(Recipe) },
      system: [{ type: "text", text: SYSTEM_PROMPT_WITH_VOCABULARY,
                 cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: JSON.stringify(dish) }],
    },
  })),
});
// zapisz batch.id do pliku; potem: retrieve() aż processing_status === "ended",
// results() → dla "succeeded" weź blok tekstowy, JSON.parse, Recipe.parse
```

Uwagi do tego wywołania:

- Wyniki przychodzą w dowolnej kolejności — łącz po `custom_id`.
- Sprawdzaj `stop_reason`: `max_tokens` oznacza ucięty JSON, `refusal` brak odpowiedzi. Oba przypadki idą do ponowienia.
- Nie ustawiaj `temperature` — aktualne modele Claude odrzucają ten parametr. Różnorodność bierze się z siatki dań, nie z losowości.
- Jeden batch mieści do 100 000 zapytań, więc cały zbiór wchodzi w jeden.

**Treść promptu systemowego** (stała, żeby działał cache):

- rola: autor przepisów dla polskiej kuchni domowej;
- słownik jako lista `id — namePl`;
- zasady: każdy składnik użyty w krokach musi być na liście składników; `staple` też się wpisuje; mięso i jaja z bezpieczną obróbką termiczną; kroki krótkie, po polsku, bez nazw marek;
- `required: false` tylko dla dodatków, bez których danie nadal jest tym daniem.

**Zawsze zacznij od pilota:** 50 dań, przeczytaj wszystkie wyniki, popraw prompt, dopiero potem całość.

## 7. Krok 4 — walidacja

Trzy warstwy, od najtańszej.

**Automatyczna (kod, każdy przepis):**

- schemat się parsuje, wszystkie `id` są w słowniku;
- 3–12 składników, co najmniej 2 kroki, `timeMin` w rozsądnym zakresie;
- kotwica dania jest wśród składników wymaganych;
- nazwy składników spoza listy nie pojawiają się w krokach (szukanie `namePl` i synonimów całego słownika w tekście kroków);
- deduplikacja: indeks Jaccarda na zbiorach wymaganych składników; pary powyżej ~0,8 z tym samym typem posiłku do scalenia.

**Flagi dietetyczne liczone, nie deklarowane:** przepis jest wegański, gdy wszystkie wymagane składniki mają `diet.vegan`. Model nie ustawia tych flag wcale.

**Drugi model jako recenzent:** inny dostawca (masz Gemini) ocenia każdy przepis według rubryki: czy proporcje są sensowne, czy kroki da się wykonać w podanej kolejności, czy czas jest realny, czy obróbka mięsa jest bezpieczna. Inny model popełnia inne błędy, więc wyłapuje to, czego autor nie widzi. Przepisy z negatywną oceną idą do ponownego wygenerowania albo do kosza.

**Człowiek:** losowe 100 przepisów plus wszystkie oflagowane. Kilka warto ugotować.

**Test użyteczności zbioru** (najważniejsza metryka): weź 5–10 prawdziwych spiżarni zespołu i policz, ile przepisów ma pokryte co najmniej 80% wymaganych składników. Jeśli przy 30 produktach w domu wychodzi kilka propozycji, zbiór jest zbyt wymyślny — zaostrz limit składników w kroku 2 i wygeneruj brakujące komórki siatki.

## 8. Krok 5 — zdjęcia

**Scrapowanie zdjęć z serwisów kulinarnych lub wyszukiwarki grafiki odpada**, także jednorazowe. Zdjęcia są chronione prawem autorskim, a rozprowadzanie ich w aplikacji jest naruszeniem niezależnie od tego, ile razy je pobrano. W repozytorium GPL i w sklepach z aplikacjami to realne ryzyko usunięcia.

Legalne źródła:

| Źródło | Licencja | Pokrycie | Uwagi |
| --- | --- | --- | --- |
| Wikimedia Commons | głównie CC BY-SA, część CC0 | dobre dla dań klasycznych, słabe dla wymyślonych | wymaga podania autora i licencji; API zwraca te dane |
| Generowanie modelem obrazu (np. Gemini) | według regulaminu dostawcy | każde danie | spójny styl, zdjęcie odpowiada przepisowi; trzeba przejrzeć wyniki |
| Stocki z API (Pixabay, Pexels, Unsplash) | własne licencje serwisów | średnie | każdy ma warunki API (atrybucja, hotlinking, zakaz budowy konkurencyjnej kolekcji); F-Droid może uznać to za niewolne zasoby |
| Ilustracja zastępcza per typ dania | własna | 100% | potrzebna zawsze jako fallback |

**Rekomendacja:** ilustracje zastępcze od początku, Commons dla dań z `classic: true`, generowanie dla reszty jako drugi etap. Przed użyciem stocków i generatora przeczytaj aktualne warunki — nie weryfikowałem ich na dziś.

**Potok dla Commons** (sprawdzony: zapytanie o „pierogi ruskie” zwróciło trzy zdjęcia CC BY-SA 4.0 z autorem):

```
https://commons.wikimedia.org/w/api.php?action=query&format=json
  &generator=search&gsrsearch=<titlePl lub titleEn>&gsrnamespace=6&gsrlimit=5
  &prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=640
  &iiextmetadatafilter=LicenseShortName|Artist|AttributionRequired|LicenseUrl
```

1. Szukaj po `titlePl`, potem po `titleEn`. Odrzuć licencje spoza listy dozwolonych (CC0, CC BY, CC BY-SA, domena publiczna).
2. **Weryfikacja modelem wizyjnym:** „czy to zdjęcie przedstawia gotowe danie X, na talerzu, nadające się na ilustrację przepisu? tak/nie”. Wyszukiwarka Commons zwraca też zdjęcia restauracji, składników i tablic.
3. Pobierz miniaturę, przekonwertuj do WebP 640 px (ok. 40 KB).
4. Zapisz atrybucję w `images.jsonl`: plik, autor, licencja, adres strony pliku.
5. Ustaw `User-Agent` z kontaktem i rób przerwy między zapytaniami.

Atrybucja musi być widoczna w aplikacji (podpis pod zdjęciem lub ekran „Źródła zdjęć”) i dopisana do [third-party-notices.md](../../docs/third-party-notices.md). Licencja SA dotyczy samego zdjęcia i jego przeróbek, nie kodu aplikacji.

**Dystrybucja.** 3000 zdjęć po 40 KB to ok. 120 MB, więc nie do paczki. Dwa warianty:

- **Pobieranie na żądanie** z własnego statycznego hostingu (np. GitHub Releases lub Pages) z cache na dysku. Serwer widzi wtedy, które zdjęcie pobrano — drobny, ale realny wyjątek od NFR-02.
- **Jednorazowa paczka** „Pobierz zdjęcia przepisów (120 MB)” w ustawieniach. Zgodne z NFR-02 w pełni.

W obu wariantach przepis bez pobranego zdjęcia pokazuje ilustrację zastępczą.

## 9. Krok 6 — integracja w aplikacji

Robić po PR 3 i PR 4 migracji (expo-sqlite i wersjonowany schemat).

**Skan produktu:**

- `OFF_MINIMUM_FIELDS` w [OpenFoodFactsClient.ts](../infrastructure/OpenFoodFactsClient.ts) rozszerzyć o `categories_tags,ingredients_analysis_tags,allergens_tags`.
- Dziś `mapProduct` bierze pierwszy element tekstowego `categories`. Zapisuj zamiast tego pełną listę `categories_tags` (kolumna z JSON-em w `product_definitions`), przefiltrowaną do tagów `en:`.
- Flagi `is_vegan` i `is_vegetarian` da się wypełnić z `ingredients_analysis_tags`, `is_gluten_free` z braku `en:gluten` w `allergens_tags`. `is_lactose_free` nie wynika z alergenu mleka (mleko bez laktozy nadal go ma) — tu potrzebny tag kategorii lub etykiety.

**Produkty generyczne** (bez EAN): przy dodawaniu użytkownik wybiera pozycję ze słownika. `namePl` daje jednocześnie podpowiedzi nazw i nazwę kanoniczną.

**Dane przepisów:** osobny plik tylko do odczytu, podmieniany w całości przy nowej wersji zbioru. Dane użytkownika zostają w głównej bazie, więc aktualizacja przepisów nie wymaga migracji. Sposób dołączenia gotowej bazy w `expo-sqlite` sprawdź w dokumentacji po PR 3; prostszą alternatywą jest JSON w zasobach ładowany do pamięci (kilka MB).

```sql
CREATE TABLE recipes (id TEXT PRIMARY KEY, title TEXT, meal TEXT, time_min INTEGER,
  difficulty TEXT, servings INTEGER, is_vegetarian INTEGER, is_vegan INTEGER,
  is_gluten_free INTEGER, is_lactose_free INTEGER, steps_json TEXT);
CREATE TABLE recipe_ingredients (recipe_id TEXT, ingredient_id TEXT, required INTEGER,
  qty REAL, unit TEXT, note TEXT, substitutes_json TEXT);
CREATE INDEX idx_recipe_ingredients_ingredient ON recipe_ingredients(ingredient_id);
```

**Dopasowanie** jako czysta funkcja w `domain/`, testowana w `tests/` bez bazy:

1. Dla każdego produktu w spiżarni: zbiór pozycji słownika, których `offTags` przecinają się z tagami produktu.
2. Suma tych zbiorów plus wszystkie `staple` to „mam w domu”.
3. Dla każdego przepisu: wymagany składnik jest spełniony, gdy on sam lub któryś z `substitutes` jest w „mam w domu”.
4. Wynik:

```
score = pokrycie_wymaganych
      + 0.3 × udział składników z terminem ≤ 3 dni
      − 0.15 × liczba braków
```

Wagi są punktem startowym do strojenia na prawdziwych spiżarniach. Lista pokazuje przepisy z najwyżej dwoma brakami, a braki mają przycisk „dodaj do listy zakupów”.

## 10. Automatyzacja

**Układ katalogów** (osobny pakiet, żeby zależności potoku nie trafiły do aplikacji):

```
tools/recipes/
  package.json            @anthropic-ai/sdk, zod, sharp, tsx
  src/
    00-coverage.ts        krok 0
    01-fetch-taxonomy.ts
    02-vocabulary.ts      kandydaci + walidator słownika
    03-dishes.ts
    04-recipes.ts         submit / collect batcha
    05-validate.ts
    06-images.ts
    07-build.ts           → src/assets/recipes/
  data/                   commitowane: vocabulary.json, dishes.jsonl, recipes.jsonl, images.jsonl
  .cache/                 w .gitignore: taksonomie, surowe wyniki batchy
```

Zasady, które oszczędzają pieniądze i nerwy:

- **Każdy etap czyta i pisze JSONL z kluczem `id`** i przetwarza tylko brakujące rekordy. Ponowne uruchomienie po błędzie nic nie dubluje.
- **Pliki pośrednie są w repo.** Zmiana promptu to diff w `recipes.jsonl`, który da się przejrzeć w PR.
- **Surowe odpowiedzi modeli zapisuj** w `.cache/` — walidator można wtedy poprawiać bez ponownego płacenia.
- **Prompty jako pliki** obok skryptów, wersjonowane razem z danymi.

**Które narzędzie do czego:**

| Narzędzie | Zastosowanie |
| --- | --- |
| Claude API (Batch) | masowe generowanie przepisów; selekcja słownika; lista dań |
| Claude Code | pisanie skryptów potoku; małe etapy bez klucza API przez `claude -p --output-format json --json-schema '<schemat>'` |
| Gemini | recenzent przepisów (krok 4); weryfikacja i generowanie zdjęć |
| Cursor | praca nad kodem aplikacji: skan, schemat, dopasowanie, ekrany |

Subskrypcja Claude nie obejmuje API — klucz i rozliczenie za tokeny zakłada się osobno w konsoli Anthropic. Bez klucza całość da się przepchnąć przez `claude -p` w pętli (po kilka dań na wywołanie), ale ograniczają to limity subskrypcji i potrwa to dni zamiast godziny. Ten i inne warianty bez płatnego API opisuje [sekcja 11](#11-tańsze-i-darmowe-warianty-generowania).

**Szacunek kosztu** dla 3000 przepisów, jedno danie na zapytanie, ok. 6 tys. tokenów wejścia (słownik) i 1–1,5 tys. wyjścia, ceny z listopada 2026, batch −50%:

| Model | Cena wejście / wyjście za 1 mln | Szacunek w batchu |
| --- | --- | --- |
| `claude-opus-5-5` | 4 USD / 20 USD | 50–80 USD |
| `claude-sonnet-5-5` | 2 USD / 10 USD | 25–40 USD |
| `claude-haiku-5-5` | 0,10 USD / 0,50 USD | 2–4 USD |

To rząd wielkości, nie wycena: zależy od długości słownika i tego, ile model „myśli”. Cache promptu systemowego i grupowanie kilku dań w jednym zapytaniu obniżają koszt wejścia. Zacznij od najmocniejszego modelu na pilocie 50 dań i zejdź niżej tylko wtedy, gdy porównanie jakości na tej samej próbce na to pozwala. Słownik i listę dań rób zawsze najmocniejszym — to kilkadziesiąt zapytań.

## 11. Tańsze i darmowe warianty generowania

Potok jest tak zbudowany, że generator da się podmienić: etap 04 dostaje `dishes.jsonl`, oddaje `recipes.jsonl`, a walidator (krok 4) nie wie, skąd przepis pochodzi. Wystarczy jedna funkcja `generateRecipes(dishes) → Recipe[]` z wymiennym zapleczem.

Dwie rzeczy na start:

- **Najtańsza płatna opcja jest już prawie darmowa.** Haiku 5.5 w batchu to według szacunku z sekcji 10 ok. 2–4 USD za cały zbiór. Warianty darmowe oszczędzają więc głównie zakładanie rozliczeń, a kosztują czas.
- **Słabszy generator wymaga mocniejszej kontroli.** Każdy wariant porównuj na tych samych 50 daniach pilota i przepuść przez ten sam walidator oraz recenzenta.

Limity i cenniki poniżej zmieniają się co kilka miesięcy, a źródła, które znalazłem 2026-11-17, to głównie blogi i wzajemnie sobie przeczą. Przed użyciem sprawdź stronę limitów u dostawcy.

### Porównanie

| Wariant | Koszt | Czas na 3000 przepisów | Wymuszenie schematu | Główne ryzyko |
| --- | --- | --- | --- | --- |
| A. Agent w subskrypcji (Claude Code, Cursor) | 0 ponad abonament | kilka dni w porcjach | przez walidator; `claude -p --json-schema` | limity abonamentu |
| B. Ręczne wklejanie do czatu | 0 ponad abonament | ok. 120 wiadomości | tylko walidator | żmudne, łatwo o pomyłkę przy kopiowaniu |
| C. Darmowy poziom Gemini API | 0 | dni do tygodni, zależnie od limitu dziennego | tak (schemat odpowiedzi) | limit dzienny bywał obcinany |
| D. Chińskie API (GLM, DeepSeek, Qwen) | 0 do kilku USD | godziny | zwykle tryb JSON | jakość polszczyzny niesprawdzona |
| E. Agregatory i inne darmowe poziomy | 0 do 10 USD | dni | zależnie od modelu | niskie limity dzienne |
| F. Model lokalny | prąd | godziny do 1–2 dób, zależnie od sprzętu | tak (gramatyka) | jakość zależy od tego, jak duży model się mieści |

### A. Agent w subskrypcji — rekomendowany wariant bez API

Zamiast wklejać cokolwiek ręcznie, każ agentowi pracować na plikach w repo. Abonament już to pokrywa.

Polecenie dla Claude Code albo agenta w Cursorze, powtarzane aż do wyczerpania listy:

```
Przeczytaj tools/recipes/prompts/recipe.md i tools/recipes/data/vocabulary.json.
Weź 40 kolejnych dań z dishes.jsonl, które nie mają jeszcze wpisu w recipes.jsonl.
Dla każdego dopisz jeden wiersz do recipes.jsonl zgodny ze schematem.
Na koniec uruchom `npm run validate` i popraw wiersze, które nie przechodzą.
```

Wersja bez pilnowania, w pętli powłoki:

```bash
while npx tsx src/has-missing.ts; do
  claude -p "$(cat prompts/agent-batch.md)" --allowedTools "Read,Edit,Bash(npm run validate)"
done
```

- Porcja 30–50 dań na jedno uruchomienie; przy większych jakość końcówki spada.
- Walidator w pętli jest obowiązkowy, bo agent nie ma tu twardo wymuszonego schematu.
- Po trafieniu w limit abonamentu pętla po prostu czeka do odnowienia. Etap jest wznawialny, więc nic nie przepada.
- Słownik i listę dań (kilkadziesiąt zapytań) zrób tą drogą zawsze, niezależnie od tego, czym powstaną przepisy.

### B. Ręczne wklejanie do czatu

Działa w Claude, Gemini i każdym innym czacie, za który już płacisz.

1. Załóż projekt (Claude) albo Gem (Gemini) z instrukcją z `prompts/recipe.md` i załączonym `vocabulary.json`.
2. Skrypt `next-chunk.ts` wypisuje 25 kolejnych dań jako JSONL — wklejasz je jako wiadomość.
3. Odpowiedź (blok JSONL) zapisujesz do `inbox/chunk-017.jsonl`.
4. `npm run ingest` waliduje plik, dopisuje poprawne wiersze do `recipes.jsonl`, a odrzucone wraca do kolejki.

3000 dań to ok. 120 wiadomości. Wykonalne w kilka wieczorów, ale wariant A robi to samo bez kopiowania.

### C. Darmowy poziom Gemini API

- Istnieje i obsługuje odpowiedź według schematu JSON, więc enum identyfikatorów da się wymusić.
- Limit dzienny zależy od modelu i był kilkukrotnie zmieniany: źródła podają od ok. 20 do kilkuset zapytań dziennie, a w grudniu 2025 część modeli Flash obcięto z 250 do 20. Aktualną wartość pokazuje panel limitów w AI Studio.
- Sposób na niski limit: **10–20 dań w jednym zapytaniu**. 3000 dań to wtedy 150–300 zapytań.
- Skrypt powinien obsługiwać błąd 429 przez zakończenie pracy i wznowienie następnego dnia.
- Na darmowym poziomie Google może używać przesłanych treści do ulepszania produktów. Przy przepisach to bez znaczenia; nie wysyłaj tą drogą niczego prywatnego.

Gemini jest w planie recenzentem (krok 4). Jeśli zostanie też generatorem, recenzję powinien robić inny model, np. Claude w subskrypcji.

### D. Chińskie API

- **Zhipu GLM (Z.ai):** modele z serii Flash są według kilku źródeł całkowicie darmowe.
- **DeepSeek:** płatny, ale rzędu 0,3–0,4 USD za milion tokenów, czyli cały zbiór za kilka dolarów.
- **Qwen (Alibaba Model Studio):** darmowa pula tokenów dla nowych kont, według jednego źródła 1 mln tokenów na model przez 90 dni.

Wszystkie trzy wystawiają interfejs zgodny z OpenAI, więc wystarczy jeden klient z wymienianym adresem i kluczem.

Zastrzeżenia: nie sprawdzałem jakości polszczyzny ani znajomości polskiej kuchni w tych modelach — pilot to rozstrzygnie. Rejestracja bywa utrudniona spoza Chin (wybieraj wersje międzynarodowe serwisów). Dane trafiają na serwery w Chinach, co przy przepisach nie jest problemem.

### E. Agregatory i inne darmowe poziomy

- **OpenRouter, modele `:free`:** ok. 50 zapytań dziennie; po jednorazowym doładowaniu konta za 10 USD limit rośnie do 1000 dziennie. Przy 10 daniach na zapytanie to cały zbiór w jeden dzień.
- **Groq, Cerebras, Mistral:** mają darmowe poziomy, ale podawane limity są niespójne między źródłami. Traktuj jako rezerwę.

### F. Model lokalny

O tym, jaki model wejdzie, decyduje pamięć karty graficznej. Orientacyjnie, dla kwantyzacji Q4 (model ma się mieścić w VRAM w całości; zrzucanie warstw na CPU wyraźnie spowalnia):

| VRAM | Wielkość modelu | Czego się spodziewać |
| --- | --- | --- |
| 8 GB | 7–9 mld parametrów | poprawny JSON, częste błędy w proporcjach i kolejności kroków |
| 12–16 GB | 11–14 mld | tu mieści się Bielik 11B; sensowne minimum dla polskiego tekstu |
| 24 GB | 27–32 mld | wyraźnie lepszy osąd kulinarny; realna alternatywa dla tanich modeli w chmurze |
| 48 GB i więcej, lub kilka kart | ok. 70 mld | jakość bliska średnim modelom chmurowym |

Progi są przybliżone: zależą od kwantyzacji i długości kontekstu, a słownik w prompcie zajmuje kilka tysięcy tokenów. Na Macu z pamięcią współdzieloną rolę VRAM pełni RAM.

- **Kandydaci:** Bielik (polski model SpeakLeash, dostępny w Ollama; licencję aktualnej wersji sprawdź na karcie modelu) oraz otwarte modele wielojęzyczne z rodzin Gemma, Qwen i Mistral w największym wariancie, jaki się mieści. Polski model nie musi wygrać z większym wielojęzycznym — rozstrzyga pilot na 50 daniach.
- **Wymuszenie schematu:** Ollama przyjmuje schemat JSON w polu `format` i egzekwuje go gramatyką, więc identyfikatory spoza słownika są niemożliwe także lokalnie. To samo potrafi `llama.cpp` i vLLM.
- **Przepustowość:** jeśli karta ma zapas pamięci, vLLM albo `llama-server` z kilkoma równoległymi slotami przetworzy kilka dań naraz i skróci czas kilkukrotnie.
- **Szacunek czasu:** 3000 przepisów po ok. 900 tokenów to 2,7 mln tokenów. Przy 30 tokenach na sekundę i jednym strumieniu wychodzi ok. 25 godzin. To szacunek, nie pomiar — zmierz prędkość na pilocie.

```bash
ollama pull SpeakLeash/bielik-11b-v3.0-instruct:Q4_K_M
# potem zapytania na http://localhost:11434/api/chat z polem "format": <schemat JSON przepisu>
```

Wariant lokalny ma dwie realne zalety: zerowy koszt krańcowy, więc można generować z nadmiarem i wyrzucać słabe wyniki, oraz potok odtwarzalny bez żadnej usługi zewnętrznej, co pasuje do charakteru projektu. Recenzentem (krok 4) niech mimo to będzie duży model w chmurze, bo to on wyłapuje błędy, których mały model nie widzi u siebie.

Dla porównania: laptop z RTX 4060 (8 GB VRAM, 16 GB RAM) trafia w pierwszy wiersz tabeli i nadaje się co najwyżej do prób.

### Jak to złożyć

Podział pracy, który daje najwięcej za najmniej:

| Etap | Liczba zapytań | Czym |
| --- | --- | --- |
| Słownik, lista dań | dziesiątki | najmocniejszy model w subskrypcji (wariant A) |
| Przepisy | tysiące | wariant A w porcjach albo Haiku 5.5 w batchu za kilka dolarów |
| Recenzja | tysiące krótkich | model innego dostawcy: darmowy poziom Gemini z wieloma przepisami w zapytaniu |
| Przegląd próbki | 100 przepisów | człowiek |

Jakość zbioru zależy głównie od słownika, listy dań i walidacji. Samo pisanie przepisów to najmniej wymagająca część, więc to tam warto oszczędzać.

## 12. Licencje

- **Własne przepisy:** wygenerowany zbiór możecie licencjonować sami. Dla spójności z GPL-3 aplikacji i danymi OFF sensowny wybór to CC BY-SA 4.0 albo ODbL; decyzja należy do wszystkich współautorów.
- **Taksonomia OFF:** baza Open Food Facts jest na licencji ODbL, która wymaga atrybucji i dzielenia się pochodnymi bazami na tych samych warunkach. Słownik zbudowany z taksonomii jest taką pochodną — dopisz atrybucję do [third-party-notices.md](../../docs/third-party-notices.md) i sprawdź warunki przed publikacją.
- **Gotowe zbiory przepisów** (RecipeNLG, zrzuty z serwisów): licencje niekomercyjne lub niejasne, treść po angielsku, brak powiązania z tagami. Nie używać jako podstawy.
- **Zdjęcia:** patrz sekcja 8. Każde zdjęcie ma zapisane źródło, autora i licencję.

## 13. Kolejność prac

| # | Zadanie | Wynik | Zależy od |
| --- | --- | --- | --- |
| 1 | Pomiar pokrycia (krok 0) | trzy liczby, decyzja o fallbacku | — |
| 2 | Słownik składników + walidator | `vocabulary.json` po przeglądzie | 1 |
| 3 | Skan zapisuje `categories_tags`; wybór ze słownika dla generycznych | zmiana w aplikacji | 2, PR 3–4 migracji |
| 4 | Lista dań | `dishes.jsonl` | 2 |
| 5 | Pilot 50 przepisów, poprawki promptu | zatwierdzony prompt | 4 |
| 6 | Pełne generowanie + walidacja | `recipes.jsonl` | 5 |
| 7 | Test użyteczności na prawdziwych spiżarniach | metryka dopasowań | 3, 6 |
| 8 | Dopasowanie, ranking, ekrany | moduł przepisów w aplikacji | 6 |
| 9 | Zdjęcia: fallback → Commons → generowanie | `images.jsonl`, hosting | 6 |

Punkty 3 i 4–6 mogą iść równolegle. Punkt 9 nie blokuje wydania modułu.

## 14. Otwarte pytania

- Czy `expo-sqlite` wygodnie otwiera gotową bazę z zasobów, czy lepiej trzymać przepisy w JSON-ie — do sprawdzenia po PR 3.
- Czy schemat z enumem kilkuset identyfikatorów przechodzi w structured output — wyjdzie na pilocie.
- Jak traktować produkty złożone (pesto, gotowy sos): jako osobne pozycje słownika czy pomijać.
- Skąd brać `is_lactose_free` dla produktów — tag kategorii, etykiety (`labels_tags`) czy ręcznie.
- Licencja zbioru przepisów i hosting zdjęć — decyzja zespołu.
