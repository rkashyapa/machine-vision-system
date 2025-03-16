-- Database schema for Machine Vision System

-- Results table to store inference results
CREATE TABLE IF NOT EXISTS results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    image_path TEXT,
    inference_results TEXT,
    processed_results TEXT,
    confidence REAL
);

-- Settings table to store system configuration
CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE,
    value TEXT,
    description TEXT
);

-- Insert default settings
INSERT OR IGNORE INTO settings (key, value, description)
VALUES 
    ('camera_device_id', '0', 'ID of the camera device to use'),
    ('model_path', 'models/default.pt', 'Path to the inference model'),
    ('confidence_threshold', '0.5', 'Minimum confidence threshold for detections');
