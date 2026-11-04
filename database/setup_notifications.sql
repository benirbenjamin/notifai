-- Database setup for notifications
-- Run this script to ensure notification tables exist

-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  data JSON,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  read_at TIMESTAMP NULL,
  INDEX idx_user_id (user_id),
  INDEX idx_is_read (is_read),
  INDEX idx_created_at (created_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create push_subscriptions table
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh VARCHAR(255) NOT NULL,
  auth VARCHAR(255) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_user_id (user_id),
  INDEX idx_is_active (is_active),
  UNIQUE KEY unique_user_endpoint (user_id, endpoint(255)),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Add notification preference columns to users table if they don't exist
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS email_notifications BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS push_notifications BOOLEAN DEFAULT FALSE;

-- Add push notification feature to plans if column doesn't exist
ALTER TABLE plans 
ADD COLUMN IF NOT EXISTS has_push_notifications BOOLEAN DEFAULT FALSE;

-- Update plans to enable push notifications for premium plans
UPDATE plans 
SET has_push_notifications = TRUE 
WHERE name IN ('Professional', 'Enterprise', 'Premium') 
OR price > 0;

-- Sample data for testing (optional)
-- You can uncomment these if you want to test notifications
/*
INSERT INTO notifications (user_id, type, title, message, data) VALUES 
(1, 'test', 'Welcome to Managinga Space!', 'Thank you for joining us. Start managing your activities now!', '{"url": "/dashboard"}'),
(1, 'activity_due', 'Activity Due Soon', 'Your activity "Complete Project" is due in 2 hours.', '{"activityId": 1}');
*/

-- Verify tables were created
SELECT 'Notifications table exists' AS status, COUNT(*) AS row_count FROM notifications;
SELECT 'Push subscriptions table exists' AS status, COUNT(*) AS row_count FROM push_subscriptions;
SELECT 'Users have notification preferences' AS status, COUNT(*) AS users_with_prefs FROM users WHERE email_notifications IS NOT NULL;
SELECT 'Plans have push notification feature' AS status, COUNT(*) AS plans_with_push FROM plans WHERE has_push_notifications IS NOT NULL;
