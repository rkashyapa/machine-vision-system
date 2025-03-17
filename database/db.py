import sqlite3
import os

class Database:
    def __init__(self, db_path='database/vision_system.db'):
        self.db_path = db_path
        self.conn = None
        self.initialize_db()
        
    def initialize_db(self):
        # Create database directory if it doesn't exist
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        
        # Connect to database
        self.conn = sqlite3.connect(self.db_path)
        
        # Initialize schema
        with open('database/schema.sql', 'r') as f:
            self.conn.executescript(f.read())
        
        self.conn.commit()
        
    def close(self):
        if self.conn:
            self.conn.close()
            
    def __enter__(self):
        return self
        
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
