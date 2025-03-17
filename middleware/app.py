from flask import Flask, jsonify, request, send_file
from flask_cors import CORS
from flask_socketio import SocketIO, emit
import logging
import os
import sys
import json
import requests
import time
import threading
from pathlib import Path

# Add the parent directory to the path so we can import modules from backend
sys.path.append(os.path.abspath('..'))

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")

# Create data directories if they don't exist
os.makedirs("data", exist_ok=True)
os.makedirs("data/images", exist_ok=True)
os.makedirs("data/processed_images", exist_ok=True)

# Settings path
SETTINGS_PATH = "data/settings.json"

# Initialize logs queue
log_messages = []
MAX_LOG_MESSAGES = 100

BACKEND_URL = "http://backend:5001"

def emit_log(level, message):
    """Emit a log message to all connected clients"""
    log_entry = {
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
        "level": level,
        "message": message
    }
    
    # Add to log queue
    log_messages.append(log_entry)
    if len(log_messages) > MAX_LOG_MESSAGES:
        log_messages.pop(0)
        
    # Emit to all connected clients
    socketio.emit('log_message', log_entry)
    
    # Also log to console
    logger.info(f"[{level}] {message}")

@app.route('/api/status', methods=['GET'])
def get_status():
    emit_log("INFO", "Status endpoint called")
    return jsonify({
        'status': 'online',
        'version': '0.1.0',
        'environment': os.environ.get('FLASK_ENV', 'development')
    })

@app.route('/api/health', methods=['GET'])
def health_check():
    emit_log("INFO", "Health check endpoint called")
    # In a real implementation, you would check the health of dependencies
    # like the backend service and database
    return jsonify({
        'status': 'healthy',
        'dependencies': {
            'backend': 'unknown',  # Would be 'healthy' or 'unhealthy' in a real implementation
            'database': 'unknown'  # Would be 'healthy' or 'unhealthy' in a real implementation
        }
    })

@app.route('/api/capture', methods=['POST'])
def capture():
    try:
        emit_log("INFO", "Middleware: Capture endpoint called")
        
        # Make request to backend service
        emit_log("INFO", "Middleware: Forwarding capture request to backend")
        response = requests.post(f"{BACKEND_URL}/capture")
        
        if response.status_code == 200:
            result = response.json()
            
            # Add the processed image URL for the frontend
            if result.get('success'):
                # Add the processed image URL
                if result.get('filename'):
                    result['processed_image_url'] = f"/api/images/processed/{result['filename']}"
                
                # Add original_image field if not present
                if not result.get('original_image') and result.get('original_image_path'):
                    result['original_image'] = os.path.basename(result['original_image_path'])
                
                # Add processed_image field if not present
                if not result.get('processed_image') and result.get('filename'):
                    result['processed_image'] = result['filename']
                
                # Emit the capture result via WebSocket
                socketio.emit('capture_result', result)
                
                # Log detailed information about the capture
                if result.get('result'):
                    emit_log("INFO", f"Backend: Capture completed with result: {result.get('result')} (confidence: {result.get('confidence', 0):.2f})")
                
            logger.info(f"Capture successful: {result}")
            return jsonify(result), 200
        else:
            error_msg = f"Backend service returned error: {response.status_code}"
            emit_log("ERROR", f"Backend: {error_msg}")
            logger.error(error_msg)
            return jsonify({"error": error_msg}), 500
            
    except requests.exceptions.RequestException as e:
        error_msg = f"Error during capture process: {str(e)}"
        emit_log("ERROR", f"Middleware: {error_msg}")
        logger.error(error_msg)
        return jsonify({"error": error_msg}), 500
    except Exception as e:
        error_msg = f"Unexpected error: {str(e)}"
        emit_log("ERROR", f"Middleware: {error_msg}")
        logger.error(error_msg)
        return jsonify({"error": error_msg}), 500

@app.route('/api/images/processed/<filename>', methods=['GET'])
def get_processed_image(filename):
    """Get a processed image by filename"""
    try:
        image_path = os.path.join("data/processed_images", filename)
        return send_file(image_path, mimetype='image/jpeg')
    except Exception as e:
        emit_log("ERROR", f"Error retrieving image {filename}: {str(e)}")
        return jsonify({"error": str(e)}), 404

@app.route('/api/images/original/<filename>', methods=['GET'])
def get_original_image(filename):
    """Get an original image by filename"""
    try:
        image_path = os.path.join("data/images", filename)
        return send_file(image_path, mimetype='image/jpeg')
    except Exception as e:
        emit_log("ERROR", f"Error retrieving image {filename}: {str(e)}")
        return jsonify({"error": str(e)}), 404

@app.route('/api/settings', methods=['GET'])
def get_settings():
    """Get the current settings"""
    try:
        if os.path.exists(SETTINGS_PATH):
            with open(SETTINGS_PATH, 'r') as f:
                settings = json.load(f)
        else:
            # Default settings
            settings = {"confidence_threshold": 0.5}
            # Save default settings
            with open(SETTINGS_PATH, 'w') as f:
                json.dump(settings, f, indent=4)
                
        return jsonify({"success": True, "settings": settings})
    except Exception as e:
        emit_log("ERROR", f"Error getting settings: {str(e)}")
        return jsonify({"success": False, "error": str(e)})

@app.route('/api/settings', methods=['POST'])
def update_settings():
    """Update the settings"""
    try:
        data = request.json
        
        if not data:
            return jsonify({"success": False, "error": "No data provided"})
            
        # Get existing settings
        if os.path.exists(SETTINGS_PATH):
            with open(SETTINGS_PATH, 'r') as f:
                settings = json.load(f)
        else:
            settings = {}
            
        # Update settings
        if 'confidence_threshold' in data:
            try:
                confidence_threshold = float(data['confidence_threshold'])
                if 0 <= confidence_threshold <= 1:
                    settings['confidence_threshold'] = confidence_threshold
                    emit_log("INFO", f"Updated confidence threshold to {confidence_threshold}")
                else:
                    return jsonify({"success": False, "error": "Confidence threshold must be between 0 and 1"})
            except ValueError:
                return jsonify({"success": False, "error": "Invalid confidence threshold format"})
                
        # Save updated settings
        with open(SETTINGS_PATH, 'w') as f:
            json.dump(settings, f, indent=4)
            
        # Update the model's threshold if applicable
        try:
            from backend.inference.model import InferenceModel
            model = InferenceModel(settings_path=SETTINGS_PATH)
            model.load_settings()
        except Exception as e:
            emit_log("WARNING", f"Could not update model settings: {str(e)}")
            
        emit_log("INFO", "Settings updated successfully")
        return jsonify({"success": True, "settings": settings})
    except Exception as e:
        emit_log("ERROR", f"Error updating settings: {str(e)}")
        return jsonify({"success": False, "error": str(e)})

@app.route('/api/logs', methods=['GET'])
def get_logs():
    """Get recent log messages"""
    return jsonify({"success": True, "logs": log_messages})

@socketio.on('connect')
def handle_connect():
    """Handle WebSocket connection"""
    emit_log("INFO", "Client connected to WebSocket")
    
    # Send all existing logs to the new client
    emit('log_history', {"logs": log_messages})

@app.errorhandler(404)
def not_found(e):
    return jsonify({"error": "Not found", "message": "The requested resource was not found"}), 404

@app.errorhandler(500)
def server_error(e):
    error_message = f"Server error: {str(e)}"
    emit_log("ERROR", error_message)
    return jsonify({"error": "Server error", "message": "An internal server error occurred"}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    host = os.environ.get('HOST', '0.0.0.0')
    debug = os.environ.get('FLASK_DEBUG', 'true').lower() == 'true'
    
    emit_log("INFO", f"Starting Flask app on {host}:{port} (debug={debug})")
    
    # Start the SocketIO app
    socketio.run(app, host=host, port=port, debug=debug)
