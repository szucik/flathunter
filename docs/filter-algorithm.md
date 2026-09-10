# FlatHunter: algorytm filtrowania ofert

## 1. Pobieranie ofert

Scraper pobiera maksymalnie `MAX_PAGES` stron z OLX. Dla każdej strony:

1. Otwiera stronę wyników.
2. Czeka na karty ogłoszeń `[data-cy="l-card"]`.
3. Odczytuje URL, tytuł, cenę, lokalizację, datę i dane widoczne na karcie.
4. Otwiera stronę szczegółową ogłoszenia.
5. Próbuje odczytać metraż, pokoje, piętro, windę, garaż, miejsce postojowe, balkon, ogród, typ budynku i opis.
6. Usuwa duplikaty po URL-u.

Jeżeli strona szczegółowa nie zostanie poprawnie odczytana, brakujące pola mają wartość `null`.

## 2. Aktualna konfiguracja

Przykładowe wartości z `.env`:

```env
# Puste ALLOWED_DISTRICTS: nie wlacza sie whitelista, odrzucane sa tylko EXCLUDED_DISTRICTS.
ALLOWED_DISTRICTS=
EXCLUDED_DISTRICTS=Ursus,Białołęka,Wawer
EXCLUDED_BUILDING_TYPES=wielka plyta,rama h
MIN_PRICE=700000
MAX_PRICE=1200000
MIN_AREA=55
MAX_AGE_DAYS=7
REQUIRE_ELEVATOR=true
REQUIRE_GARAGE=true
REQUIRE_BALCONY=true
```

## 3. Główny filtr

Oferta musi spełnić wszystkie warunki jednocześnie. Jest to logiczne `AND`:

```text
dozwolona dzielnica
AND cena w zakresie
AND metraż minimum
AND potwierdzona winda
AND garaż lub prywatne przypisane miejsce postojowe
AND balkon, taras albo ogród
```

### 3.1 Wiek oferty

Oferta musi mieścić się w `MAX_AGE_DAYS`. Przy wartości `7` scraper bierze oferty z ostatnich siedmiu dni.

### 3.2 Dzielnica

Dzielnica nie może należeć do `EXCLUDED_DISTRICTS`. Jeżeli `ALLOWED_DISTRICTS` jest ustawione (niepuste), dzielnica musi dodatkowo do niego należeć. Domyślnie `ALLOWED_DISTRICTS` jest puste, więc whitelista jest wyłączona i przechodzi każda dzielnica, która nie jest jawnie wykluczona.

Porównanie ignoruje wielkość liter i polskie znaki, więc `Targówek` i `Targowek` są traktowane jako ta sama wartość.

Oferta z nierozpoznaną dzielnicą jest odrzucana z głównego widoku tylko wtedy, gdy whitelista jest aktywna.

### 3.3 Typ budynku

Oferta odpada, jeżeli parser rozpozna typ budynku znajdujący się w `EXCLUDED_BUILDING_TYPES`, np.:

```text
wielka płyta
rama H
```

Brak rozpoznanego typu budynku nie jest samodzielnie powodem odrzucenia.

### 3.4 Cena

Cena musi spełnić:

```text
700000 <= cena <= 1200000
```

Brak ceny (`null`) oznacza odrzucenie z głównego widoku.

### 3.5 Metraż

Metraż musi spełnić:

```text
area >= 55
```

Brak metrażu (`null`) oznacza odrzucenie z głównego widoku.

To może odrzucać dobre ogłoszenia, jeśli metraż jest tylko w opisie, a parser go nie odczytał.

### 3.6 Winda

Przy `REQUIRE_ELEVATOR=true` wymagane jest dokładnie:

```text
hasElevator === true
```

Wartości `false` i `null` oznaczają odrzucenie.

### 3.7 Garaż lub prywatne miejsce postojowe

Reguła biznesowa jest następująca:

```text
hasGarage === true
OR (budynek młodszy niż 20 lat AND prywatne miejsce postojowe === true)
```

Samo wystąpienie słów `parking` lub `miejsce postojowe` nie wystarcza. Parser traktuje miejsce jako prywatne tylko przy sygnałach takich jak:

```text
miejsce przypisane do lokalu
prywatne miejsce postojowe
własne miejsce postojowe
miejsce na wyłączność
miejsce nr X
N miejsc postojowych w cenie / wliczone w cenę
```

Parking publiczny, ogólnodostępny, uliczny albo miejsce przed budynkiem bez informacji o przypisaniu nie spełnia kryterium.

### 3.8 Balkon, taras albo ogród

Przy `REQUIRE_BALCONY=true` oferta powinna mieć co najmniej jedną z cech:

```text
balkon
loggia
 taras
ogród / ogródek
```

W kodzie ogród jest przechowywany osobno jako `hasGarden`, ale spełnia wymaganie zewnętrznej przestrzeni.

## 4. Zakładka „Niepewne”

Oferta jest niepewna, gdy:

1. ma dozwoloną dzielnicę,
2. nie znajduje się w wykluczonym typie budynku,
3. cena, jeśli jest znana, mieści się w zakresie,
4. metraż, jeśli jest znany, nie jest poniżej minimum,
5. brakuje potwierdzenia któregoś wymagania technicznego.

Przykład:

```text
cena: 710000
metraż: null
 dzielnica: Targówek
garaż: Tak
winda: Nieznane
balkon: Nieznane
```

Taka oferta nie trafia do głównego widoku, ale może trafić do `Niepewne`. Każda niepewna oferta zapisuje własny, konkretny powód w polu `uncertaintyReason`, np.:

```text
winda: brak danych w ogłoszeniu
garaż: brak danych w ogłoszeniu; prywatne miejsce: brak danych w ogłoszeniu
```

To pole jest niezależne od `rejectionReason` odrzuconych ofert, więc żadna kategoria nie zawyża ani nie dubluje drugiej.

### Ważna uwaga

Najczytelniejszy podział powinien być następujący:

- **Oferty**: wszystkie kryteria potwierdzone,
- **Niepewne**: cena, metraż i dzielnica są poprawne, ale brakuje danych o windzie, parkingu, balkonie lub ogrodzie,
- **Odrzucone**: zła dzielnica, cena poza zakresem, metraż poniżej minimum albo wykluczony typ budynku.

## 4a. Status ostatniego scrapowania

Każde uruchomienie scrapera (ręczne albo ze schedulera) zapisuje wiersz w tabeli `scrape_runs`: moment startu, moment zakończenia, liczbę znalezionych ofert oraz treść błędu, jeśli wystąpił. Endpoint:

```text
GET /api/scrape-status
```

zwraca ostatni taki wiersz, a strona pokazuje go pod listą ofert jako jeden z trzech stanów: `Scrapowanie w toku`, `Ostatnie scrapowanie: <data>. Pobrano <n> ofert.` albo `Ostatnie scrapowanie zakończyło się błędem`. Data pochodzi z bazy danych, więc nie zależy od zegara przeglądarki ani od tego, czy strona była w danym momencie otwarta.

## 5. Liczniki wyników

Logi:

Logi mają postać:
Znaleziono: 130
Nowych: 0
Znaleziono: 130
Zaakceptowanych: 7
Niepewnych: 2
Odrzuconych: 121
Nowych zaakceptowanych: 0
oznaczają:

- `Znaleziono: 130` - scraper pobrał 130 ofert,
- `Nowych: 0` - nie dodano żadnej zaakceptowanej oferty jako nowej; oferta istniejąca w bazie również nie zwiększa tego licznika,
- `Odfiltrowanych: 130` - wszystkie oferty nie przeszły głównego filtra albo zostały zakwalifikowane jako niepewne.
- `Zaakceptowanych` - ofert spełniających wszystkie twarde kryteria,
- `Niepewnych` - ofert zapisanych do ręcznej weryfikacji z brakującymi danymi,
- `Odrzuconych` - ofert niespełniających twardych kryteriów,
- `Nowych zaakceptowanych` - zaakceptowanych ofert, których nie było wcześniej w bazie.

Odrzucone oferty nie są tracone. Są zapisywane z polem `rejection_reason` i dostępne w API oraz frontendowej zakładce `Odrzucone`.

```text
/api/properties?rejected=true
```

Powód jest konkretny i wskazuje faktyczną wartość z ogłoszenia, a nie ogólnikową nazwę reguły, np.:

```text
dzielnica „Ursus” jest wykluczona (Ursus, Białołęka, Wawer)
wykluczony typ budynku: „wielka plyta”
cena 650000 zł jest niższa niż minimum 700000 zł
metraż 40 m² jest mniejszy niż minimum 55 m²
winda: nie znaleziono
garaż: nie znaleziono; prywatne miejsce: brak danych w ogłoszeniu; rok budowy: 1978
balkon/taras: nie znaleziono; ogród: nie znaleziono
```

Największy problem nie musi być w samych kryteriach, tylko w jakości odczytu danych. Parser może zwrócić:

```text
area: null
hasElevator: null
hasBalcony: null
imageUrl: null
```

mimo że informacja znajduje się w opisie ogłoszenia.

Przykład:

```text
Opis: mieszkanie 62 m², loggia, miejsce parkingowe, winda
```

Jeżeli parser nie odczyta opisu, filtr zobaczy wartości `null` i odrzuci ofertę albo przeniesie ją do `Niepewne`.

## 7. Zasady klasyfikacji budynku z epoki PRL

Rok budowy jest sygnałem do dokładniejszej analizy, ale nie jest dowodem wielkiej płyty. W epoce PRL budowano również budynki ceglane, żelbetowe, z pustaków, w technologii wielkiego bloku i w innych technologiach.

```text
rok budowy -> sygnał pomocniczy
jawna technologia -> sygnał główny
opis konstrukcji + cechy budynku -> potwierdzenie albo Niepewne
```

Wielka płyta i Rama H są wykluczane dopiero po rozpoznaniu technologii jawnie albo przez zestaw mocnych sygnałów. Sam budynek z lat PRL nie jest automatycznie wykluczany.

## 8. Ograniczenia parsera

1. Zapisywać powód odrzucenia, np.:

```text
poza dzielnicą
cena poniżej minimum
metraż poniżej minimum
brak potwierdzonej windy
brak garażu lub miejsca
brak balkonu, tarasu albo ogrodu
```

2. Dodać osobną zakładkę `Odrzucone`, jeśli chcemy móc przejrzeć wszystkie ściągnięte oferty.
