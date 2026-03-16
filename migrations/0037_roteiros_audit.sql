-- Migration to update the roteiros table to include audit fields

PRAGMA foreign_keys=off;

BEGIN TRANSACTION;

-- Dropping the old table if it exists
DROP TABLE IF EXISTS roteiros_temp;

-- Creating new table with TEXT columns for audit fields
CREATE TABLE roteiros_temp (
    id integer PRIMARY KEY,
    created_by_user_id TEXT,
    updated_by_user_id TEXT,
    -- other columns...
);

INSERT INTO roteiros_temp (id, created_by_user_id, updated_by_user_id)
SELECT id, created_by_user_id, updated_by_user_id FROM roteiros;

DROP TABLE roteiros;

ALTER TABLE roteiros_temp RENAME TO roteiros;

COMMIT;