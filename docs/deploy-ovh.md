# Wdrożenie na VPS OVH

Procedura zakłada, że VPS ma katalog projektu w `/opt/flathunter`, a usługi systemd nazywają się `flathunter-api` i `flathunter-scheduler`.

Zasada projektu: VPS ma używać tego samego kodu i efektywnie tej samej konfiguracji co środowisko lokalne, chyba że świadomie ustawimy wyjątek.

## 1. Połączenie

```bash
ssh ubuntu@57.128.200.116
cd /opt/flathunter
```

Jeżeli logujesz się jako `root`, pomiń `sudo` w dalszych poleceniach albo pozostaw je, jeśli działa w danym systemie.

## 2. Aktualizacja kodu

```bash
cd /opt/flathunter
git fetch origin
git checkout main
git pull --ff-only origin main
npm install
npm run build
```

Jeżeli `git pull --ff-only` zgłosi lokalne zmiany, nie używaj `git reset --hard`. Najpierw sprawdź:

```bash
git status
```

## 3. Konfiguracja `.env`

Plik `.env` nie jest przenoszony przez Git. Otwórz go ręcznie:

```bash
nano /opt/flathunter/.env
```

Efektywna konfiguracja ma odpowiadać lokalnej:

```dotenv
TARGET_URL=https://www.olx.pl/nieruchomosci/mieszkania/sprzedaz/warszawa/?search%5Bfilter_enum_rooms%5D%5B0%5D=three&search%5Bfilter_enum_rooms%5D%5B1%5D=four&search%5Bfilter_float_m%3Afrom%5D=55&search%5Bfilter_float_price%3Ato%5D=1200000&search%5Border%5D=created_at%3Adesc
REQUIRE_ELEVATOR=true
REQUIRE_GARAGE=true
REQUIRE_BALCONY=true
ALLOWED_DISTRICTS=
EXCLUDED_DISTRICTS=Ursus,Białołęka,Wawer
EXCLUDED_BUILDING_TYPES=wielka plyta,rama h
MIN_PRICE=700000
MAX_PRICE=1200000
MIN_AREA=55
HEADLESS=true
MAX_PAGES=5
REQUEST_DELAY=2000
MAX_AGE_DAYS=7
TELEGRAM_TOKEN=
TELEGRAM_CHAT_ID=
```

W Nano: `Ctrl+O`, `Enter`, `Ctrl+X`.

Sprawdź konfigurację bez wyświetlania tokenów:

```bash
grep -E '^(TARGET_URL|ALLOWED_DISTRICTS|EXCLUDED_DISTRICTS|EXCLUDED_BUILDING_TYPES|MIN_PRICE|MAX_PRICE|MIN_AREA|MAX_PAGES|MAX_AGE_DAYS|REQUIRE_)=' /opt/flathunter/.env
```

## 4. Zatrzymanie usług przed czyszczeniem

Jeżeli ręczny scraper działa w innym terminalu, przejdź do niego i naciśnij `Ctrl+C`. Następnie:

```bash
sudo systemctl stop flathunter-scheduler
sudo systemctl stop flathunter-api
pgrep -af 'node dist/index.js'
```

Lista `pgrep` powinna być pusta. Nie usuwaj bazy, gdy ręczny scraper nadal działa.

## 5. Wariant: wyczyść bazę i pobierz od razu

```bash
cd /opt/flathunter
rm -f data/flats.db data/flats.db-wal data/flats.db-shm
mkdir -p data
node dist/index.js
```

Nie przerywaj procesu. Poczekaj na końcowe podsumowanie:

```text
Znaleziono: ...
Zaakceptowanych: ...
Niepewnych: ...
Odrzuconych: ...
Nowych zaakceptowanych: ...
```

Timeout pojedynczej strony szczegółowej nie musi oznaczać błędu całego przebiegu. Jeżeli pojawi się `Target page, context or browser has been closed`, oznacza to zwykle, że scraper został przerwany przez `Ctrl+C`.

## 6. Uruchomienie API i crona

Po zakończeniu ręcznego scrapowania:

```bash
sudo systemctl enable --now flathunter-api
sudo systemctl enable --now flathunter-scheduler
```

Scheduler uruchamia scraper o `00:00`, `08:00` i `16:00`. Samo włączenie schedulera nie uruchamia zadania natychmiast.

## 7. Wariant: tylko wyczyść i czekaj na cron

Jeżeli nie chcesz uruchamiać scrapowania ręcznie:

```bash
cd /opt/flathunter
sudo systemctl stop flathunter-scheduler
sudo systemctl stop flathunter-api
rm -f data/flats.db data/flats.db-wal data/flats.db-shm
mkdir -p data
sudo systemctl enable --now flathunter-api
sudo systemctl enable --now flathunter-scheduler
```

Baza pozostanie pusta do najbliższego terminu schedulera.

## 8. Weryfikacja

```bash
systemctl is-active flathunter-api
systemctl is-active flathunter-scheduler
curl http://127.0.0.1:3000/api/health
curl http://127.0.0.1:3000/api/scrape-status
```

Health check powinien zwrócić:

```json
{"ok":true}
```

Po pierwszym zakończonym przebiegu `/api/scrape-status` powinien zawierać:

```json
{"latestRun":{"status":"completed","listingsFound":122}}
```

Liczba ofert zależy od aktualnych wyników OLX i nie musi wynosić dokładnie `122`.

Publiczna aplikacja:

```text
http://57.128.200.116
```

## 9. Przydatne logi

```bash
sudo journalctl -u flathunter-api -n 50 --no-pager
sudo journalctl -u flathunter-scheduler -n 100 --no-pager
```

Stan bazy:

```bash
node -e "const Database=require('better-sqlite3');const db=new Database('data/flats.db',{readonly:true});console.log(db.prepare('SELECT COUNT(*) AS count FROM flats').get());console.log(db.prepare('SELECT status,started_at,completed_at,listings_found FROM scrape_runs ORDER BY id DESC LIMIT 1').get());db.close()"
```
