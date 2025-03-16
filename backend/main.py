import os
import logging
import time
from flask import Flask, jsonify
from device.camera import Camera
from inference.model import InferenceModel
from postprocessing.processor import ResultProcessor

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Initialize components
camera = None
model = None
processor = None

@app.route('/capture', methods=['POST'])
def capture():
    """Capture and process an image"""
    try:
        # Capture frame
        frame_data = camera.capture_frame()
        if not frame_data:
            logger.error("No image captured from camera")
            return jsonify({"success": False, "error": "No image captured"})
            
        logger.info(f"Frame captured: {frame_data.get('filename')}")
        
        # Run inference
        inference_result = model.predict(frame_data)
        
        # Process results
        processed_result = processor.process_results(inference_result)
        
        if not processed_result.get("success", False):
            logger.error(f"Error processing results: {processed_result.get('error')}")
            return jsonify({"success": False, "error": processed_result.get("error")})
            
        return jsonify(processed_result)
        
    except Exception as e:
        logger.error(f"Error during capture process: {str(e)}")
        return jsonify({"success": False, "error": str(e)})

def main():
    global camera, model, processor
    
    logger.info("Initializing components...")
    
    # Initialize camera
    camera = Camera(device_id=0, images_dir="data/images")
    camera.connect()
    
    # Initialize model
    model = InferenceModel(settings_path="data/settings.json")
    model.load_model()
    
    # Initialize processor
    processor = ResultProcessor(output_dir="data/processed_images")
    
    # Start the Flask app
    app.run(host='0.0.0.0', port=5001)

if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        logger.info("Shutting down...")
    except Exception as e:
        logger.error(f"Error: {str(e)}")
