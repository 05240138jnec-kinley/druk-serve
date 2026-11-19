-- =====================================================================
-- Druk Serve - database schema (MySQL 8 / XAMPP MariaDB 10.4+)
-- Follows Chapter 3.6 (ERD) and 3.7 (Normalization - Database Tables) of the project document.
--
-- How it differs from the document tables (on purpose):
--   services             = the "Service" entity of the ERD. The frontend calls it "category".
--   service_providers    uses service_id (a link to services) instead of the text column "category".
--                        Renaming a category then updates every provider and booking by itself.
--   customers / service_providers also have password_hash, is_suspended and a few columns
--                        that the frontend screens need (location, bio, working days and hours...).
--   admins, notifications are extra tables for features named in the document
--                        (Admin module, notification system).
--
-- Two rules keep this file working on MySQL AND on SQLite (the automatic tests use SQLite):
--   no ENUM and no INDEX inside CREATE TABLE. Allowed values are checked with CHECK instead.
-- =====================================================================

-- ---------- Admin (document 3.3.1) ----------
CREATE TABLE IF NOT EXISTS admins (
  admin_id      INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(100) NOT NULL UNIQUE,
  phone_number  VARCHAR(20)  NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Service = category: Plumbing, Electrical ... ----------
CREATE TABLE IF NOT EXISTS services (
  service_id   INT AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(100) NOT NULL UNIQUE,
  icon         VARCHAR(50)  NOT NULL DEFAULT 'bi-tools',
  description  VARCHAR(255) NOT NULL DEFAULT '',
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Customer table (document 3.7) ----------
CREATE TABLE IF NOT EXISTS customers (
  customer_id   INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(100) NOT NULL UNIQUE,
  phone_number  VARCHAR(20)  NOT NULL,
  location      VARCHAR(50)  NOT NULL DEFAULT 'Thimphu',
  address       TEXT         NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  is_suspended  TINYINT(1)   NOT NULL DEFAULT 0,
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Service Provider table (document 3.7) ----------
CREATE TABLE IF NOT EXISTS service_providers (
  provider_id      INT AUTO_INCREMENT PRIMARY KEY,
  name             VARCHAR(100)  NOT NULL,
  email            VARCHAR(100)  NOT NULL UNIQUE,
  phone_number     VARCHAR(20)   NOT NULL,
  service_id       INT           NOT NULL,
  location         VARCHAR(50)   NOT NULL DEFAULT 'Thimphu',
  experience_years INT           NOT NULL DEFAULT 0,
  hourly_rate      DECIMAL(10,2) NOT NULL,
  bio              TEXT          NULL,
  rating           DECIMAL(3,2)  NOT NULL DEFAULT 0.00,
  reviews_count    INT           NOT NULL DEFAULT 0,
  is_verified      TINYINT(1)    NOT NULL DEFAULT 0,
  is_available     TINYINT(1)    NOT NULL DEFAULT 1,
  work_days        VARCHAR(20)   NOT NULL DEFAULT '1,2,3,4,5,6',
  work_from        VARCHAR(5)    NOT NULL DEFAULT '08:00',
  work_to          VARCHAR(5)    NOT NULL DEFAULT '17:00',
  password_hash    VARCHAR(255)  NOT NULL,
  is_suspended     TINYINT(1)    NOT NULL DEFAULT 0,
  created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_provider_service FOREIGN KEY (service_id)
    REFERENCES services(service_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_provider_rate   CHECK (hourly_rate >= 0),
  CONSTRAINT chk_provider_rating CHECK (rating >= 0 AND rating <= 5),
  CONSTRAINT chk_provider_exp    CHECK (experience_years >= 0 AND experience_years <= 50)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Booking table (document 3.7) ----------
CREATE TABLE IF NOT EXISTS bookings (
  booking_id      INT AUTO_INCREMENT PRIMARY KEY,
  customer_id     INT           NOT NULL,
  provider_id     INT           NOT NULL,
  service_id      INT           NOT NULL,
  booking_date    DATETIME      NOT NULL,
  hours           INT           NOT NULL DEFAULT 1,
  service_address TEXT          NOT NULL,
  notes           TEXT          NULL,
  total_amount    DECIMAL(10,2) NOT NULL,
  status          VARCHAR(50)   NOT NULL DEFAULT 'Pending',
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NULL,
  CONSTRAINT fk_booking_customer FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE RESTRICT,
  CONSTRAINT fk_booking_provider FOREIGN KEY (provider_id) REFERENCES service_providers(provider_id) ON DELETE RESTRICT,
  CONSTRAINT fk_booking_service  FOREIGN KEY (service_id)  REFERENCES services(service_id) ON DELETE RESTRICT,
  CONSTRAINT chk_booking_hours   CHECK (hours >= 1 AND hours <= 8),
  CONSTRAINT chk_booking_status  CHECK (status IN ('Pending', 'Confirmed', 'Completed', 'Cancelled'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Payment table (document 3.7). One payment per booking. ----------
CREATE TABLE IF NOT EXISTS payments (
  payment_id      INT AUTO_INCREMENT PRIMARY KEY,
  booking_id      INT           NOT NULL UNIQUE,
  amount          DECIMAL(10,2) NOT NULL,
  payment_date    DATETIME      NOT NULL,
  method          VARCHAR(50)   NOT NULL,
  status          VARCHAR(50)   NOT NULL,
  transaction_ref VARCHAR(40)   NULL UNIQUE,
  CONSTRAINT fk_payment_booking FOREIGN KEY (booking_id) REFERENCES bookings(booking_id) ON DELETE RESTRICT,
  CONSTRAINT chk_payment_method CHECK (method IN ('mPay', 'BNB ePay', 'Card', 'Cash')),
  CONSTRAINT chk_payment_status CHECK (status IN ('Paid', 'Pending', 'Failed'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Feedback table (document 3.7). One review per booking. ----------
CREATE TABLE IF NOT EXISTS feedback (
  feedback_id   INT AUTO_INCREMENT PRIMARY KEY,
  booking_id    INT  NOT NULL UNIQUE,
  customer_id   INT  NOT NULL,
  rating        INT  NOT NULL,
  comment       TEXT NULL,
  feedback_date DATE NOT NULL,
  reply         TEXT NULL,
  reply_date    DATE NULL,
  CONSTRAINT fk_feedback_booking  FOREIGN KEY (booking_id)  REFERENCES bookings(booking_id)   ON DELETE RESTRICT,
  CONSTRAINT fk_feedback_customer FOREIGN KEY (customer_id) REFERENCES customers(customer_id) ON DELETE RESTRICT,
  CONSTRAINT chk_feedback_rating  CHECK (rating >= 1 AND rating <= 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Notifications (document 4.2.8 and 4.3.5). Every row belongs to ONE person. ----------
CREATE TABLE IF NOT EXISTS notifications (
  notification_id INT AUTO_INCREMENT PRIMARY KEY,
  recipient_role  VARCHAR(20)  NOT NULL,
  recipient_id    INT          NOT NULL,
  icon            VARCHAR(50)  NOT NULL,
  title           VARCHAR(100) NOT NULL,
  message         VARCHAR(255) NOT NULL,
  is_read         TINYINT(1)   NOT NULL DEFAULT 0,
  related_type    VARCHAR(20)  NULL,
  related_id      INT          NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_notification_role CHECK (recipient_role IN ('customer', 'provider'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Profile photos: the picture itself is a file in the "uploads" folder; this table keeps its web path ----------
CREATE TABLE IF NOT EXISTS profile_photos (
  role       VARCHAR(20)  NOT NULL,
  account_id INT          NOT NULL,
  photo_url  VARCHAR(255) NOT NULL,
  updated_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (role, account_id),
  CONSTRAINT chk_photo_role CHECK (role IN ('customer', 'provider'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Password reset links: only a fingerprint (hash) of the secret link is stored, never the link itself ----------
CREATE TABLE IF NOT EXISTS password_resets (
  reset_id   INT AUTO_INCREMENT PRIMARY KEY,
  role       VARCHAR(20) NOT NULL,
  account_id INT         NOT NULL,
  token_hash CHAR(64)    NOT NULL UNIQUE,
  expires_at DATETIME    NOT NULL,
  used_at    DATETIME    NULL,
  created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_reset_role CHECK (role IN ('customer', 'provider', 'admin'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------- Indexes: make the common searches fast (document 3.4 Performance and Scalability) ----------
CREATE INDEX idx_providers_search  ON service_providers (is_verified, is_available, service_id, location);
CREATE INDEX idx_bookings_provider ON bookings (provider_id, booking_date);
CREATE INDEX idx_bookings_customer ON bookings (customer_id, booking_date);
CREATE INDEX idx_notifications_user ON notifications (recipient_role, recipient_id, is_read);
