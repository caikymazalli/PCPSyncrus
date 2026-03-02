-- Migration 0019: Add updated_at and quotation_reason columns to quotations table
-- Fixes 500 errors in approve/reject/negotiate APIs that reference these columns

ALTER TABLE quotations ADD COLUMN updated_at DATETIME;
ALTER TABLE quotations ADD COLUMN quotation_reason TEXT;
