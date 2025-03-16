import os
import logging
import PIL
from PIL import Image, ImageDraw, ImageFont
import piexif
import json
import io
from datetime import datetime

logger = logging.getLogger(__name__)

class ResultProcessor:
    def __init__(self, output_dir="data/processed_images"):
        self.output_dir = output_dir
        # Create output directory if it doesn't exist
        os.makedirs(self.output_dir, exist_ok=True)
        logger.info(f"Post-processing output directory: {self.output_dir}")
        
    def process_results(self, inference_results):
        """Process inference results and create annotated images"""
        if not inference_results or not inference_results.get("success", False):
            logger.error("Invalid inference results")
            return {"success": False, "error": "Invalid inference results"}
            
        # Extract data from inference results
        image_path = inference_results.get("image_path")
        filename = inference_results.get("filename")
        confidence = inference_results.get("confidence", 0)
        result = inference_results.get("result", "UNKNOWN")
        
        logger.info(f"Processing inference results for image: {filename}")
        
        try:
            # Open the original image
            image = Image.open(image_path)
            
            # Create annotated image
            annotated_image = self._annotate_image(image, result, confidence)
            
            # Generate output filename
            base_name, ext = os.path.splitext(os.path.basename(filename))
            output_filename = f"{base_name}_processed_{datetime.now().strftime('%Y%m%d%H%M%S')}{ext}"
            output_path = os.path.join(self.output_dir, output_filename)
            
            # Add EXIF metadata
            metadata = {
                "confidence": confidence,
                "result": result,
                "processed_at": datetime.now().isoformat(),
                "original_image": filename
            }
            
            # Save the annotated image with metadata
            self._save_image_with_metadata(annotated_image, output_path, metadata)
            
            logger.info(f"Saved processed image to {output_path}")
            
            # Return the results including the path to the processed image
            processed_results = {
                "success": True,
                "original_image_path": image_path,
                "processed_image_path": output_path,
                "confidence": confidence,
                "result": result,
                "filename": output_filename,
                "metadata": metadata
            }
            
            # Update database with processed results
            self._update_database(inference_results, processed_results)
            
            return processed_results
            
        except Exception as e:
            logger.error(f"Error processing results: {str(e)}")
            return {"success": False, "error": str(e)}
            
    def _annotate_image(self, image, result, confidence):
        """Annotate the image with pass/fail result and confidence score"""
        # Create a copy of the image
        annotated = image.copy()
        draw = ImageDraw.Draw(annotated)
        
        # Define colors based on result
        if result == "PASS":
            color = (0, 255, 0)  # Green for pass
        else:
            color = (255, 0, 0)  # Red for fail
            
        # Get image dimensions
        width, height = annotated.size
        
        # Try to load a font, use default if not available
        try:
            # Try to find a system font
            font_path = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"  # Linux
            if not os.path.exists(font_path):
                font_path = "C:\\Windows\\Fonts\\Arial.ttf"  # Windows
            font = ImageFont.truetype(font_path, size=int(height/10))
        except IOError:
            # Use default font if custom font not available
            font = ImageFont.load_default()
        
        # Draw the result text at the top
        result_text = f"{result}: {confidence:.2f}"
        text_width, text_height = draw.textsize(result_text, font=font) if hasattr(draw, 'textsize') else (width/4, height/10)
        
        # Draw a semi-transparent background for the text
        draw.rectangle([(0, 0), (width, text_height+20)], fill=(0, 0, 0, 128))
        
        # Draw the text
        try:
            draw.text((10, 10), result_text, fill=color, font=font)
        except TypeError:
            # Fallback if the font doesn't work
            draw.text((10, 10), result_text, fill=color)
            
        return annotated
        
    def _save_image_with_metadata(self, image, output_path, metadata):
        """Save image with metadata embedded as EXIF"""
        try:
            # Convert metadata to JSON string
            metadata_json = json.dumps(metadata)
            
            # Create EXIF data structure
            exif_dict = {"0th": {}, "Exif": {}, "GPS": {}, "1st": {}}
            
            # Add metadata to UserComment field
            exif_dict["Exif"][piexif.ExifIFD.UserComment] = metadata_json.encode('utf-8')
            
            # Convert EXIF dict to bytes
            exif_bytes = piexif.dump(exif_dict)
            
            # Save the image with EXIF data
            image.save(output_path, exif=exif_bytes)
            
        except Exception as e:
            logger.warning(f"Could not save EXIF metadata: {str(e)}, saving image without metadata")
            # Save without metadata if there's an error
            image.save(output_path)
            
    def _update_database(self, inference_results, processed_results):
        """Update the database with processed results"""
        try:
            import sqlite3
            
            # Connect to database
            db_path = os.path.join("database", "vision_system.db")
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()
            
            # Get the original image path
            image_path = inference_results.get("image_path", "unknown")
            
            # Update the latest record for this image
            cursor.execute(
                '''UPDATE results SET processed_results = ? 
                   WHERE image_path = ? ORDER BY id DESC LIMIT 1''',
                (json.dumps(processed_results), image_path)
            )
            
            conn.commit()
            conn.close()
            
            logger.info(f"Updated database with processed results for {image_path}")
        except Exception as e:
            logger.error(f"Error updating database: {str(e)}")
