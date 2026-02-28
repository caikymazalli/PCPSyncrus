-- Migration 0009: Add deadline column to quotations table
ALTER TABLE quotations ADD COLUMN deadline TEXT DEFAULT '';
