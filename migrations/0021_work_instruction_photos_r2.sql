-- Add R2 storage columns to work_instruction_photos
ALTER TABLE work_instruction_photos ADD COLUMN object_key TEXT;
ALTER TABLE work_instruction_photos ADD COLUMN content_type TEXT;
