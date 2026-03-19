```mermaid
flowchart LR
    User([Użytkownik])
    OFF_API([Open Food Facts API])
    AI_API([AI API])

    subgraph ShelfChef
        UC1((UC-01: Dodanie przez skanowanie))
        UC2((UC-02: Dodanie ręczne))
        UC3((UC-03: Zużycie / Usunięcie zapasu))
        UC4((UC-04: Przegląd kończących się terminów))
        UC5((UC-05: Propozycja przepisu AI))
        UC6((UC-06: Generowanie listy zakupów))
    end

    User --- UC1
    User --- UC2
    User --- UC3
    User --- UC4
    User --- UC5
    User --- UC6

    UC1 <-.-> |Zapytanie o kod EAN| OFF_API
    UC2 <-.- |Nie znaleziono kodu EAN| OFF_API
    UC5 <-.-> |Zapytanie o przepis| AI_API
 

```