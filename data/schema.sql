-- Схема бази даних інформаційної системи бронювання готелю
-- Відповідає ERD та словнику даних розділу 2.2 пояснювальної записки.
-- Рушій: SQLite (навчальний прототип). INV-01, INV-05 перевіряються на
-- рівні CHECK-обмежень там, де це підтримує SQLite; INV-02 (неподвійне
-- бронювання) забезпечується унікальним індексом + серіалізованою
-- транзакцією в коді сервісу (ADR-02, підрозділ 2.2 «Конкурентні дії»).

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name     TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  phone         TEXT,
  role          TEXT NOT NULL CHECK (role IN ('client','admin','cleaning_staff')),
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS rooms (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  number     TEXT NOT NULL UNIQUE,
  category   TEXT NOT NULL CHECK (category IN ('standard','comfort','lux')),
  base_price REAL NOT NULL CHECK (base_price > 0),
  status     TEXT NOT NULL DEFAULT 'free'
             CHECK (status IN ('free','held','occupied','needs_cleaning','ready'))
);

CREATE TABLE IF NOT EXISTS services (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  price       REAL NOT NULL CHECK (price >= 0),
  description TEXT
);

CREATE TABLE IF NOT EXISTS bookings (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  draft_id        TEXT NOT NULL UNIQUE,
  client_id       INTEGER NOT NULL REFERENCES users(id),
  room_id         INTEGER NOT NULL REFERENCES rooms(id),
  check_in_date   TEXT NOT NULL,
  check_out_date  TEXT NOT NULL CHECK (check_out_date > check_in_date), -- INV-01
  status          TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','paid','confirmed','checked_in','checked_out','cancelled','rejected')),
  total_price     REAL NOT NULL CHECK (total_price >= 0),               -- INV-05
  confirmed_by    INTEGER REFERENCES users(id),
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  checked_in_at   TEXT,
  checked_out_at  TEXT
);

-- INV-02: для одного номера не існує двох активних бронювань (paid/confirmed/checked_in)
-- з датами, що перетинаються. SQLite не підтримує EXCLUDE USING gist (на відміну від
-- PostgreSQL, згаданого в ADR-02 як цільова СУБД), тому в навчальному прототипі межу
-- перетину дат перевіряє сервіс у межах однієї транзакції (server/services/bookingService.js),
-- а цей індекс додатково захищає від буквально ідентичних дублікатів бронювання.
CREATE UNIQUE INDEX IF NOT EXISTS idx_booking_room_dates_active
  ON bookings(room_id, check_in_date, check_out_date)
  WHERE status IN ('paid','confirmed','checked_in');

CREATE TABLE IF NOT EXISTS booking_services (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id        INTEGER NOT NULL REFERENCES bookings(id),
  service_id        INTEGER NOT NULL REFERENCES services(id),
  quantity          INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1),
  price_at_booking  REAL NOT NULL CHECK (price_at_booking >= 0)
);

CREATE TABLE IF NOT EXISTS payments (
  id                       INTEGER PRIMARY KEY AUTOINCREMENT,
  booking_id               INTEGER NOT NULL REFERENCES bookings(id),
  amount                   REAL NOT NULL CHECK (amount > 0),
  currency                 TEXT NOT NULL DEFAULT 'UAH',
  status                   TEXT NOT NULL CHECK (status IN ('success','failed')),
  provider_transaction_id  TEXT NOT NULL,
  created_at               TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id    INTEGER REFERENCES users(id),
  action      TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   INTEGER NOT NULL,
  timestamp   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  details     TEXT
);
