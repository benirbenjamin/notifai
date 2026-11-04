-- Add timed activity support to the activities table
ALTER TABLE activities 
ADD COLUMN start_time DATETIME NULL,
ADD COLUMN end_time DATETIME NULL;
