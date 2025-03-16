import os
import logging
import time
from pathlib import Path

logger = logging.getLogger(__name__)

class Camera:
    def __init__(self, device_id=0, images_dir="data/images"):
        self.device_id = device_id
        self.is_connected = False
        self.images_dir = images_dir
        self.image_files = []
        self.current_image_index = 0
        
    def connect(self):
        """Connect to the simulated camera (load images from directory)"""
        logger.info(f"Connecting to camera with device_id: {self.device_id}")
        
        # Create images directory if it doesn't exist
        os.makedirs(self.images_dir, exist_ok=True)
        
        # Get all image files (jpg, png, etc.)
        self.image_files = [
            f for f in os.listdir(self.images_dir) 
            if os.path.isfile(os.path.join(self.images_dir, f)) and 
            f.lower().endswith(('.jpg', '.jpeg', '.png', '.bmp', '.tiff'))
        ]
        
        # Sort files to ensure consistent ordering
        self.image_files.sort()
        
        if not self.image_files:
            logger.warning(f"No image files found in {self.images_dir}")
        else:
            logger.info(f"Found {len(self.image_files)} images in {self.images_dir}")
            
        self.is_connected = True
        return self.is_connected
        
    def disconnect(self):
        """Disconnect from the simulated camera"""
        logger.info(f"Disconnecting from camera with device_id: {self.device_id}")
        self.is_connected = False
        
    def capture_frame(self):
        """Capture next frame from the simulated camera"""
        if not self.is_connected:
            raise Exception("Camera not connected")
            
        if not self.image_files:
            logger.warning("No images available for capture")
            return None
            
        # Get the next image in the sequence
        image_file = self.image_files[self.current_image_index]
        image_path = os.path.join(self.images_dir, image_file)
        
        # Increment the index for next time, wrapping around if necessary
        self.current_image_index = (self.current_image_index + 1) % len(self.image_files)
        
        logger.info(f"Captured frame: {image_file} (index: {self.current_image_index-1})")
        
        return {
            "success": True,
            "image_path": image_path,
            "filename": image_file,
            "timestamp": time.time()
        }
