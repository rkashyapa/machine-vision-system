import axios from 'axios';
import Head from 'next/head';
import { useEffect, useRef, useState } from 'react';
import ReactSlider from 'react-slider';
import { io } from 'socket.io-client';
import styles from '../styles/Home.module.css';

// API base URL
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
// WebSocket URL
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000';

// Types
interface LogMessage {
  timestamp: string;
  level: string;
  message: string;
}

interface CaptureResult {
  success: boolean;
  original_image: string;
  processed_image: string;
  result: string;
  confidence: number;
  processed_image_url: string;
  error?: string;
}

export default function Home() {
  // State
  const [isConnected, setIsConnected] = useState(false);
  const [logs, setLogs] = useState<LogMessage[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureResult, setCaptureResult] = useState<CaptureResult | null>(null);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.5);
  const [isSavingThreshold, setIsSavingThreshold] = useState(false);

  // Refs
  const socketRef = useRef<any>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);

  // Connect to WebSocket and set up event listeners
  useEffect(() => {
    // Initialize socket connection
    socketRef.current = io(SOCKET_URL);

    // Connection status
    socketRef.current.on('connect', () => {
      setIsConnected(true);
      console.log('Connected to WebSocket');
    });

    socketRef.current.on('disconnect', () => {
      setIsConnected(false);
      console.log('Disconnected from WebSocket');
    });

    // Log messages
    socketRef.current.on('log_message', (logMessage: LogMessage) => {
      setLogs((prevLogs) => [...prevLogs, logMessage]);
    });

    // Log history on initial connection
    socketRef.current.on('log_history', (data: { logs: LogMessage[] }) => {
      setLogs(data.logs);
    });

    // Capture results
    socketRef.current.on('capture_result', (result: CaptureResult) => {
      setCaptureResult(result);
      setIsCapturing(false);
    });

    // Cleanup on unmount
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await axios.get(`${API_BASE_URL}/api/settings`);
        if (response.data.success && response.data.settings.confidence_threshold !== undefined) {
          setConfidenceThreshold(response.data.settings.confidence_threshold);
        }
      } catch (error) {
        console.error('Error loading settings:', error);
      }
    };

    loadSettings();
  }, []);

  // Scroll logs to bottom when new logs arrive
  useEffect(() => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [logs]);

  // Handle capture button click
  const handleCapture = async () => {
    setIsCapturing(true);

    try {
      const response = await axios.post(`${API_BASE_URL}/api/capture`);
      if (!response.data.success) {
        setIsCapturing(false);
      }
    } catch (error) {
      console.error('Error capturing image:', error);
      setIsCapturing(false);
    }
  };

  // Handle confidence threshold change
  const handleThresholdChange = (value: number) => {
    setConfidenceThreshold(value);
  };

  // Save threshold to server
  const saveThreshold = async () => {
    setIsSavingThreshold(true);

    try {
      const response = await axios.post(`${API_BASE_URL}/api/settings`, {
        confidence_threshold: confidenceThreshold
      });

      if (!response.data.success) {
        console.error('Error saving threshold:', response.data.error);
      }
    } catch (error) {
      console.error('Error saving threshold:', error);
    } finally {
      setIsSavingThreshold(false);
    }
  };

  // Render log entry with appropriate style based on level
  const renderLogEntry = (log: LogMessage, index: number) => {
    let levelClass;
    let moduleType = 'unknown';

    // Determine module type based on message content
    if (log.message.startsWith('Middleware:')) {
      moduleType = 'middleware';
    } else if (log.message.includes('Backend:') || log.message.includes('backend')) {
      moduleType = 'backend';
    } else if (log.message.includes('Frontend:') || log.message.includes('frontend')) {
      moduleType = 'frontend';
    } else if (log.message.includes('Camera:') || log.message.includes('camera') || log.message.includes('frame')) {
      moduleType = 'camera';
    } else if (log.message.includes('Processing:') || log.message.includes('processing') || log.message.includes('processed')) {
      moduleType = 'processing';
    } else if (log.message.includes('inference') || log.message.includes('Inference')) {
      moduleType = 'inference';
    } else if (log.message.includes('WebSocket') || log.message.includes('Socket')) {
      moduleType = 'socket';
    } else if (log.message.includes('Flask')) {
      moduleType = 'server';
    }

    switch (log.level.toUpperCase()) {
      case 'INFO':
        levelClass = styles.logInfo;
        break;
      case 'SUCCESS':
        levelClass = styles.logSuccess;
        break;
      case 'WARNING':
        levelClass = styles.logWarning;
        break;
      case 'ERROR':
        levelClass = styles.logError;
        break;
      case 'DEBUG':
        levelClass = styles.logDebug;
        break;
      default:
        levelClass = '';
    }

    return (
      <tr key={index} className={styles.logEntry}>
        <td className={styles.logTimestamp}>{log.timestamp}</td>
        <td className={`${styles.logLevel} ${levelClass}`}>{log.level}</td>
        <td className={styles.logModule}>{moduleType}</td>
        <td className={styles.logMessage}>{log.message}</td>
      </tr>
    );
  };

  return (
    <div className={styles.container}>
      <Head>
        <title>Machine Vision System</title>
        <meta name="description" content="Machine vision system for image analysis" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className={styles.main}>
        <h1 className={styles.title}>Machine Vision System</h1>

        {/* Control Panel */}
        <div className={styles.controlPanel}>
          <div className={styles.controlRow}>
            <button
              className={styles.triggerButton}
              onClick={handleCapture}
              disabled={isCapturing || !isConnected}
            >
              {isCapturing ? 'Capturing...' : 'Trigger Capture'}
            </button>

            <div>
              Connection Status: {isConnected ?
                <span style={{ color: 'green' }}>Connected</span> :
                <span style={{ color: 'red' }}>Disconnected</span>
              }
            </div>
          </div>

          {/* Settings Panel */}
          <div className={styles.settingsPanel}>
            <div className={styles.sliderContainer}>
              <label className={styles.sliderLabel}>
                Confidence Threshold
                <span className={styles.sliderValue}>{confidenceThreshold.toFixed(2)}</span>
              </label>

              <ReactSlider
                className="horizontal-slider"
                thumbClassName="slider-thumb"
                trackClassName="slider-track"
                min={0}
                max={1}
                step={0.01}
                value={confidenceThreshold}
                onChange={handleThresholdChange}
                onAfterChange={saveThreshold}
                renderThumb={(props, state) => <div {...props}>{state.valueNow.toFixed(2)}</div>}
              />

              <style jsx>{`
                .horizontal-slider {
                  width: 100%;
                  height: 25px;
                }
                .slider-thumb {
                  height: 25px;
                  width: 25px;
                  background-color: #4a69bd;
                  color: white;
                  border-radius: 50%;
                  cursor: grab;
                  display: flex;
                  justify-content: center;
                  align-items: center;
                  font-size: 0.7rem;
                  font-weight: bold;
                }
                .slider-track {
                  top: 8px;
                  height: 8px;
                  background: #dfe6e9;
                  border-radius: 4px;
                }
                .slider-track.slider-track-0 {
                  background: #4a69bd;
                }
              `}</style>
            </div>
          </div>
        </div>

        {/* Images Container */}
        <div className={styles.imagesContainer}>
          {/* Original Image */}
          <div className={styles.imagePanel}>
            <h2 className={styles.imageTitle}>Original Image</h2>
            <div className={styles.imageWrapper}>
              {captureResult && captureResult.original_image ? (
                <img
                  src={`${API_BASE_URL}/api/images/original/${captureResult.original_image}`}
                  alt="Original"
                  className={styles.image}
                />
              ) : (
                <div className={styles.noImage}>No image captured</div>
              )}
            </div>
          </div>

          {/* Processed Image */}
          <div className={styles.imagePanel}>
            <h2 className={styles.imageTitle}>Processed Image</h2>
            <div className={styles.imageWrapper}>
              {captureResult && captureResult.processed_image ? (
                <img
                  src={`${API_BASE_URL}${captureResult.processed_image_url}`}
                  alt="Processed"
                  className={styles.image}
                />
              ) : (
                <div className={styles.noImage}>No processed image</div>
              )}
            </div>

            {captureResult && (
              <div className={styles.metadata}>
                <div className={styles.metadataItem}>
                  Result: <span className={captureResult.result === 'PASS' ? styles.resultPass : styles.resultFail}>
                    {captureResult.result}
                  </span>
                </div>
                <div className={styles.metadataItem}>
                  Confidence: {captureResult.confidence.toFixed(2)}
                </div>
                <div className={styles.metadataItem}>
                  Threshold: {confidenceThreshold.toFixed(2)}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Log Panel */}
        <div className={styles.logPanel}>
          <h2 className={styles.logTitle}>Activity Log</h2>
          <div className={styles.logsContainer} ref={logsContainerRef}>
            {logs.length > 0 ? (
              logs.map((log, index) => renderLogEntry(log, index))
            ) : (
              <div>No logs available</div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
