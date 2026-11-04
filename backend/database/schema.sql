-- =====================================================================
-- Druk Serve - database tables
-- Works on MySQL 8 and MariaDB (XAMPP).
-- You do NOT run this file by hand: "npm run db:setup" creates the
-- database and then runs this file for you.
--
-- Tables from your documentation (Chapter 3.7):
--   customer, service_provider, booking, payment, feedback
-- Added because the website needs them:
--   admin, service (the "Service" in your ER diagram), notification
-- Extra columns are marked "-- added".
-- =====================================================================

-- ---------------------------------------------------------------------
-- Admin (your ER diagram has an Admin entity)
-- ---------------------------------------------------------------------
CREATE TABLE admin (
  admin_id      INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Customer
-- ---------------------------------------------------------------------
CREATE TABLE customer (
  customer_id   INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(100) NOT NULL UNIQUE,
  phone_number  VARCHAR(20)  NOT NULL,
  location      VARCHAR(50)  NOT NULL DEFAULT 'Thimphu',   -- added
  address       TEXT         NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  is_suspended  BOOLEAN      NOT NULL DEFAULT FALSE,        -- added (admin can suspend)
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Service (the categories the admin manages: Plumbing, Electrical, ...)
-- ---------------------------------------------------------------------
CREATE TABLE service (
  service_id  INT AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(100) NOT NULL UNIQUE,
  description VARCHAR(255) NOT NULL,
  icon        VARCHAR(50)  NOT NULL DEFAULT 'bi-tools'
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Service Provider
-- "category" is kept exactly as in your documentation (VARCHAR 100).
-- It points at service.name:
--   * renaming a service renames it for every provider (ON UPDATE CASCADE)
--   * a service that providers use cannot be deleted (ON DELETE RESTRICT)
-- ---------------------------------------------------------------------
CREATE TABLE service_provider (
  provider_id      INT AUTO_INCREMENT PRIMARY KEY,
  name             VARCHAR(100)  NOT NULL,
  email            VARCHAR(100)  NOT NULL UNIQUE,
  phone_number     VARCHAR(20)   NOT NULL,
  password_hash    VARCHAR(255)  NOT NULL,                      -- added (providers log in)
  category         VARCHAR(100)  NOT NULL,
  rating           DECIMAL(3,2)  NOT NULL DEFAULT 0.00,
  review_count     INT           NOT NULL DEFAULT 0,            -- added
  is_verified      BOOLEAN       NOT NULL DEFAULT FALSE,
  location         VARCHAR(50)   NOT NULL DEFAULT 'Thimphu',    -- added
  experience_years INT           NOT NULL DEFAULT 0,            -- added
  rate_per_hour    DECIMAL(10,2) NOT NULL,                      -- added
  bio              TEXT          NULL,                          -- added
  is_available     BOOLEAN       NOT NULL DEFAULT TRUE,         -- added: "accepting new bookings"
  working_days     VARCHAR(20)   NOT NULL DEFAULT '1,2,3,4,5,6',-- added: 0=Sun ... 6=Sat
  work_start       TIME          NOT NULL DEFAULT '08:00:00',   -- added
  work_end         TIME          NOT NULL DEFAULT '17:00:00',   -- added
  is_suspended     BOOLEAN       NOT NULL DEFAULT FALSE,        -- added (admin can suspend)
  created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_provider_category FOREIGN KEY (category) REFERENCES service (name)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT chk_provider_rating CHECK (rating BETWEEN 0 AND 5),
  INDEX idx_provider_category (category),
  INDEX idx_provider_verified (is_verified)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Booking
-- booking_date holds the date AND the time of the appointment.
-- ---------------------------------------------------------------------
CREATE TABLE booking (
  booking_id      INT AUTO_INCREMENT PRIMARY KEY,
  customer_id     INT           NOT NULL,
  provider_id     INT           NOT NULL,
  service_id      INT           NOT NULL,
  booking_date    DATETIME      NOT NULL,
  status          VARCHAR(50)   NOT NULL DEFAULT 'Pending',
  service_address TEXT          NOT NULL,
  hours           INT           NOT NULL DEFAULT 1,             -- added
  notes           TEXT          NULL,                           -- added
  amount          DECIMAL(10,2) NOT NULL,                       -- added (rate x hours)
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_booking_customer FOREIGN KEY (customer_id) REFERENCES customer (customer_id),
  CONSTRAINT fk_booking_provider FOREIGN KEY (provider_id) REFERENCES service_provider (provider_id),
  CONSTRAINT fk_booking_service  FOREIGN KEY (service_id)  REFERENCES service (service_id),
  CONSTRAINT chk_booking_status CHECK (status IN ('Pending','Confirmed','Completed','Cancelled')),
  CONSTRAINT chk_booking_hours  CHECK (hours BETWEEN 1 AND 24),
  INDEX idx_booking_status (status),
  INDEX idx_booking_date (booking_date)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Payment (one payment record per booking)
-- ---------------------------------------------------------------------
CREATE TABLE payment (
  payment_id      INT AUTO_INCREMENT PRIMARY KEY,
  booking_id      INT           NOT NULL UNIQUE,
  amount          DECIMAL(10,2) NOT NULL,
  payment_date    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  method          VARCHAR(50)   NOT NULL,
  status          VARCHAR(50)   NOT NULL DEFAULT 'Pending',
  transaction_ref VARCHAR(50)   NULL,                           -- added
  CONSTRAINT fk_payment_booking FOREIGN KEY (booking_id) REFERENCES booking (booking_id),
  CONSTRAINT chk_payment_method CHECK (method IN ('mPay','BNB ePay','Card','Cash')),
  CONSTRAINT chk_payment_status CHECK (status IN ('Paid','Pending','Failed'))
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Feedback (one rating per booking)
-- ---------------------------------------------------------------------
CREATE TABLE feedback (
  feedback_id INT AUTO_INCREMENT PRIMARY KEY,
  booking_id  INT  NOT NULL UNIQUE,
  customer_id INT  NOT NULL,
  rating      INT  NOT NULL,
  comment     TEXT NULL,
  `date`      DATE NOT NULL,
  reply       TEXT NULL,                                        -- added: provider's reply
  reply_date  DATE NULL,                                        -- added
  CONSTRAINT fk_feedback_booking  FOREIGN KEY (booking_id)  REFERENCES booking (booking_id),
  CONSTRAINT fk_feedback_customer FOREIGN KEY (customer_id) REFERENCES customer (customer_id),
  CONSTRAINT chk_feedback_rating CHECK (rating BETWEEN 1 AND 5)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Notification (belongs to ONE customer OR ONE provider)
-- The API makes sure exactly one of the two ids is filled in.
-- ---------------------------------------------------------------------
CREATE TABLE notification (
  notification_id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id     INT          NULL,
  provider_id     INT          NULL,
  title           VARCHAR(100) NOT NULL,
  message         TEXT         NOT NULL,
  icon            VARCHAR(50)  NOT NULL DEFAULT 'bi-bell',
  is_read         BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notification_customer FOREIGN KEY (customer_id) REFERENCES customer (customer_id) ON DELETE CASCADE,
  CONSTRAINT fk_notification_provider FOREIGN KEY (provider_id) REFERENCES service_provider (provider_id) ON DELETE CASCADE,
  INDEX idx_notification_customer (customer_id, is_read),
  INDEX idx_notification_provider (provider_id, is_read)
) ENGINE=InnoDB;
