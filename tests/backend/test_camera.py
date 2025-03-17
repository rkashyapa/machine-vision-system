import unittest
from backend.device.camera import Camera

class TestCamera(unittest.TestCase):
    def setUp(self):
        self.camera = Camera(device_id=0)
        
    def test_connect(self):
        result = self.camera.connect()
        self.assertTrue(result)
        self.assertTrue(self.camera.is_connected)
        
    def test_disconnect(self):
        self.camera.connect()
        self.camera.disconnect()
        self.assertFalse(self.camera.is_connected)
        
if __name__ == '__main__':
    unittest.main()
