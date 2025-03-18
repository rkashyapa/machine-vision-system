import axios from 'axios';
import Head from 'next/head';
import { useCallback, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import styles from '../styles/Home.module.css';

// API base URL - use localhost since we're not containerizing
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';
// WebSocket URL - use localhost since we're not containerizing
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000';

// For testing - point to sample images
const SAMPLE_ORIGINAL_IMAGE = '/sample-original.jpg';
const SAMPLE_PROCESSED_IMAGE = '/sample-processed.jpg';

// Types
interface LogMessage {
  timestamp: string;
  level: string;
  message: string;
  module?: string;
}

interface CaptureResult {
  success: boolean;
  original_image: string;
  processed_image: string;
  result: string;
  confidence: number;
  processed_image_url?: string;
  error?: string;
}

interface BackendStatus {
  camera_connected: boolean;
  model_loaded: boolean;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

interface SettingsData {
  settings: {
    confidence_threshold: number;
  }
}

export default function Home() {
  // State
  const [isConnected, setIsConnected] = useState(false);
  const [logs, setLogs] = useState<LogMessage[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureResult, setCaptureResult] = useState<CaptureResult | null>(null);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.5);
  const [backendStatus, setBackendStatus] = useState<BackendStatus>({
    camera_connected: false,
    model_loaded: false
  });
  const [processingTime, setProcessingTime] = useState<number | null>(null);
  const [copySuccess, setCopySuccess] = useState('');
  const [selectedTab, setSelectedTab] = useState('original'); // 'original' or 'processed'
  const [isTestMode, setIsTestMode] = useState(false);

  // Refs
  const socketRef = useRef<Socket | null>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);
  const captureStartTime = useRef<number | null>(null);

  // Connect to WebSocket and set up event listeners
  useEffect(() => {
    // Initialize socket connection with reconnection options
    console.log(`Connecting to WebSocket at ${SOCKET_URL}`);
    socketRef.current = io(SOCKET_URL, {
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 5000,
      transports: ['websocket', 'polling'] // Try WebSocket first, fall back to polling
    });

    // Connection status
    socketRef.current.on('connect', () => {
      setIsConnected(true);
      console.log('Connected to WebSocket');
      addLog({
        timestamp: new Date().toISOString(),
        level: 'INFO',
        message: 'Connected to server',
        module: 'frontend'
      });
      
      // Request initial status and logs
      socketRef.current?.emit('get_status');
      socketRef.current?.emit('get_logs');
    });

    socketRef.current.on('disconnect', () => {
      setIsConnected(false);
      console.log('Disconnected from WebSocket');
      addLog({
        timestamp: new Date().toISOString(),
        level: 'WARNING',
        message: 'Disconnected from server',
        module: 'frontend'
      });
    });

    // Add connection error handling
    socketRef.current.on('connect_error', (error) => {
      console.error('WebSocket connection error:', error);
      setIsConnected(false);
      setIsTestMode(true);
      addLog({
        timestamp: new Date().toISOString(),
        level: 'ERROR',
        message: `WebSocket connection error: ${error.message}. Switched to test mode.`,
        module: 'frontend'
      });
      
      // Simulate backend status for testing
      setTimeout(() => {
        setBackendStatus({
          camera_connected: true,
          model_loaded: true
        });
      }, 1000);
    });

    // Backend status updates
    socketRef.current.on('status_update', (status: BackendStatus) => {
      setBackendStatus(status);
      console.log('Backend status updated:', status);
    });

    // Log messages
    socketRef.current.on('log_message', (logMessage: LogMessage) => {
      addLog(logMessage);
    });

    // Log history on initial connection
    socketRef.current.on('log_history', (data: { logs: LogMessage[] }) => {
      setLogs(data.logs);
    });

    // Capture process started
    socketRef.current.on('capture_started', () => {
      captureStartTime.current = Date.now();
      console.log('Capture process started');
    });

    // Capture results
    socketRef.current.on('capture_result', (result: CaptureResult) => {
      console.log('Received capture result:', result);
      
      if (captureStartTime.current) {
        setProcessingTime(Date.now() - captureStartTime.current);
        captureStartTime.current = null;
      }
      
      setCaptureResult(result);
      setIsCapturing(false);
      
      // Log the result
      addLog({
        timestamp: new Date().toISOString(),
        level: result.success ? 'SUCCESS' : 'ERROR',
        message: result.success 
          ? `Capture completed successfully. Result: ${result.result} (Confidence: ${(result.confidence * 100).toFixed(2)}%)`
          : `Capture failed: ${result.error || 'Unknown error'}`,
        module: 'capture'
      });
    });

    // Cleanup on unmount
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  // Helper to add logs
  const addLog = useCallback((logMessage: LogMessage) => {
    setLogs(prevLogs => [...prevLogs, logMessage]);
  }, []);

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await axios.get<ApiResponse<SettingsData>>(`${API_BASE_URL}/api/settings`);
        if (response.data.success && response.data.data?.settings.confidence_threshold !== undefined) {
          setConfidenceThreshold(response.data.data.settings.confidence_threshold);
          console.log('Loaded confidence threshold:', response.data.data.settings.confidence_threshold);
        }
      } catch (error) {
        console.error('Error loading settings:', error);
        setIsTestMode(true);
        addLog({
          timestamp: new Date().toISOString(),
          level: 'ERROR',
          message: 'Failed to load settings. Switched to test mode.',
          module: 'frontend'
        });
      }
    };

    loadSettings();
  }, [addLog]);

  // Scroll logs to bottom when new logs arrive
  useEffect(() => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [logs]);

  // Handle copying logs to clipboard
  const copyLogsToClipboard = () => {
    const logText = logs.map(log => 
      `[${log.timestamp}] [${log.level}] [${log.module || 'unknown'}] ${log.message}`
    ).join('\n');
    
    navigator.clipboard.writeText(logText)
      .then(() => {
        setCopySuccess('Copied!');
        setTimeout(() => setCopySuccess(''), 2000);
      })
      .catch(err => {
        console.error('Failed to copy logs:', err);
      });
  };

  // Handle clearing logs
  const clearLogs = () => {
    setLogs([]);
    addLog({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      message: 'Logs cleared',
      module: 'frontend'
    });
  };

  // Handle capture button click - triggers the full processing flow
  const handleCapture = async () => {
    if (isCapturing) return;
    
    setIsCapturing(true);
    captureStartTime.current = Date.now();
    
    addLog({
      timestamp: new Date().toISOString(),
      level: 'INFO',
      message: 'Initiating image capture and processing',
      module: 'frontend'
    });

    try {
      if (isTestMode) {
        // Simulate backend processing in test mode
        setTimeout(() => {
          const mockResult: CaptureResult = {
            success: true,
            original_image: 'iVBORw0KGgoAAAANSUhEUgAAASwAAACoCAMAAABt9SM9AAAAA1BMVEX///+nxBvIAAAAR0lEQVR4nO3BAQEAAACCIP+vbkhAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAO8GxYgAAb0jQ/cAAAAASUVORK5CYII=', // Simple placeholder
            processed_image: 'iVBORw0KGgoAAAANSUhEUgAAASwAAACoCAMAAABt9SM9AAAAA1BMVEX///+nxBvIAAAAR0lEQVR4nO3BAQEAAACCIP+vbkhAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAO8GxYgAAb0jQ/cAAAAASUVORK5CYII=', // Simple placeholder
            result: 'PASS',
            confidence: 0.85,
            error: undefined
          };
          
          setProcessingTime(1500);
          setCaptureResult(mockResult);
          setIsCapturing(false);
          
          addLog({
            timestamp: new Date().toISOString(),
            level: 'SUCCESS',
            message: `Test Mode: Simulated capture completed. Result: ${mockResult.result} (Confidence: ${(mockResult.confidence * 100).toFixed(2)}%)`,
            module: 'capture'
          });
        }, 1500);
      } else {
        // Real API call to middleware
        const response = await axios.post<ApiResponse<CaptureResult>>(`${API_BASE_URL}/api/capture`, {
          confidence_threshold: confidenceThreshold
        });
        
        // If the response comes back (not via WebSocket), handle it here
        if (response.data && !response.data.success) {
          setIsCapturing(false);
          captureStartTime.current = null;
          
          addLog({
            timestamp: new Date().toISOString(),
            level: 'ERROR',
            message: `Capture request failed: ${response.data.error || 'Unknown error'}`,
            module: 'frontend'
          });
        }
      }
    } catch (error) {
      console.error('Error capturing image:', error);
      setIsCapturing(false);
      captureStartTime.current = null;
      setIsTestMode(true);
      
      addLog({
        timestamp: new Date().toISOString(),
        level: 'ERROR',
        message: `Capture request error: ${(error as Error).message || 'Network error'}. Switched to test mode.`,
        module: 'frontend'
      });
    }
  };

  // Save threshold to server
  const saveThreshold = async (value: number) => {
    try {
      if (isTestMode) {
        // In test mode, just update locally
        setConfidenceThreshold(value);
        addLog({
          timestamp: new Date().toISOString(),
          level: 'SUCCESS',
          message: `Test Mode: Confidence threshold updated to ${value.toFixed(2)}`,
          module: 'settings'
        });
        return;
      }
      
      const response = await axios.post<ApiResponse<{}>>(`${API_BASE_URL}/api/settings`, {
        confidence_threshold: value
      });

      if (response.data.success) {
        addLog({
          timestamp: new Date().toISOString(),
          level: 'SUCCESS',
          message: `Confidence threshold updated to ${value.toFixed(2)}`,
          module: 'settings'
        });
      } else {
        console.error('Error saving threshold:', response.data.error);
        addLog({
          timestamp: new Date().toISOString(),
          level: 'ERROR',
          message: `Failed to update threshold: ${response.data.error || 'Unknown error'}`,
          module: 'settings'
        });
      }
    } catch (error) {
      console.error('Error saving threshold:', error);
      setIsTestMode(true);
      addLog({
        timestamp: new Date().toISOString(),
        level: 'ERROR',
        message: `Failed to update threshold: ${(error as Error).message || 'Network error'}. Switched to test mode.`,
        module: 'settings'
      });
    }
  };

  // Format the processing time
  const formatProcessingTime = () => {
    if (processingTime === null) return 'N/A';
    return `${processingTime.toFixed(0)} ms`;
  };

  // Get log level class
  const getLogLevelClass = (level: string) => {
    switch (level.toUpperCase()) {
      case 'INFO':
        return styles.logInfo;
      case 'SUCCESS':
        return styles.logSuccess;
      case 'WARNING':
        return styles.logWarning;
      case 'ERROR':
        return styles.logError;
      default:
        return '';
    }
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
        
        {isTestMode && (
          <div className={styles.testModeMessage}>
            <p>Running in Test Mode - Not connected to backend</p>
          </div>
        )}

        {/* Status Panel */}
        <div className={styles.statusPanel}>
          <div className={styles.statusItem}>
            <span>Connection:</span>
            <span className={isConnected ? styles.statusSuccess : styles.statusError}>
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          <div className={styles.statusItem}>
            <span>Camera:</span>
            <span className={backendStatus.camera_connected ? styles.statusSuccess : styles.statusError}>
              {backendStatus.camera_connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          <div className={styles.statusItem}>
            <span>Model:</span>
            <span className={backendStatus.model_loaded ? styles.statusSuccess : styles.statusError}>
              {backendStatus.model_loaded ? 'Loaded' : 'Not Loaded'}
            </span>
          </div>
          {processingTime !== null && (
            <div className={styles.statusItem}>
              <span>Last Processing Time:</span>
              <span>{formatProcessingTime()}</span>
            </div>
          )}
        </div>

        {/* Dashboard Cards */}
        <div className={styles.dashboardCards}>
          <div className={styles.dashboardCard}>
            <div className={styles.cardHeader}>
              <div className={styles.cardLabel}>Total Images</div>
              <div className={styles.cardIcon}>📊</div>
            </div>
            <div className={styles.cardValue}>1,240</div>
            <div className={styles.cardSubtext}>+128 from yesterday</div>
          </div>
          
          <div className={styles.dashboardCard}>
            <div className={styles.cardHeader}>
              <div className={styles.cardLabel}>Pass Rate</div>
              <div className={styles.cardBadge + ' ' + styles.successBadge}>75%</div>
            </div>
            <div className={styles.cardValue}>930</div>
            <div className={styles.cardSubtext}>Passing inspection</div>
          </div>
          
          <div className={styles.dashboardCard}>
            <div className={styles.cardHeader}>
              <div className={styles.cardLabel}>Fail Rate</div>
              <div className={styles.cardBadge + ' ' + styles.errorBadge}>25%</div>
            </div>
            <div className={styles.cardValue}>310</div>
            <div className={styles.cardSubtext}>Failing inspection</div>
          </div>
          
          <div className={styles.dashboardCard}>
            <div className={styles.cardHeader}>
              <div className={styles.cardLabel}>Pending Review</div>
              <div className={styles.cardIcon}>⏳</div>
            </div>
            <div className={styles.cardValue}>84</div>
            <div className={styles.cardSubtext}>Awaiting grading</div>
          </div>
        </div>

        {/* Image Processing Section */}
        <div className={styles.imageProcessingSection}>
          <div className={styles.controlPanel}>
            <div className={styles.controlRow}>
              <button
                className={styles.triggerButton}
                onClick={handleCapture}
                disabled={isCapturing}
              >
                {isCapturing ? 'Processing...' : 'Trigger Capture'}
              </button>

              <div className={styles.settingsPanel}>
                <div className={styles.sliderContainer}>
                  <label className={styles.sliderLabel}>
                    Confidence Threshold: {confidenceThreshold.toFixed(2)}
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={confidenceThreshold}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value);
                      setConfidenceThreshold(value);
                    }}
                    onMouseUp={(e) => {
                      saveThreshold(confidenceThreshold);
                    }}
                    style={{ width: '100%' }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Image Tabs */}
          <div className={styles.resultsContainer}>
            <div className={styles.tabsContainer}>
              <div 
                className={`${styles.tab} ${selectedTab === 'original' ? styles.activeTab : ''}`}
                onClick={() => setSelectedTab('original')}
              >
                Original Image
              </div>
              <div 
                className={`${styles.tab} ${selectedTab === 'processed' ? styles.activeTab : ''}`}
                onClick={() => setSelectedTab('processed')}
              >
                Processed Image
              </div>
            </div>
            
            <div className={styles.tabContent}>
              {captureResult ? (
                selectedTab === 'original' ? (
                  <div className={styles.imageWrapper}>
                    <img
                      src={`data:image/jpeg;base64,${captureResult.original_image}`}
                      alt="Original"
                      className={styles.resultImage}
                    />
                  </div>
                ) : (
                  <div className={styles.imageWrapper}>
                    <img
                      src={`data:image/jpeg;base64,${captureResult.processed_image}`}
                      alt="Processed"
                      className={styles.resultImage}
                    />
                  </div>
                )
              ) : (
                <div className={styles.mockImage}>
                  <p>No {selectedTab} image available</p>
                </div>
              )}
            </div>
            
            <div className={styles.resultInfo}>
              <h3>Result: {captureResult ? captureResult.result : 'None'}</h3>
              <p>Confidence: {captureResult ? (captureResult.confidence * 100).toFixed(2) : '0.00'}%</p>
              {processingTime !== null && (
                <p>Processing Time: {formatProcessingTime()}</p>
              )}
            </div>
          </div>
        </div>

        {/* Logs Display as Table with Action Buttons */}
        <div className={styles.logsContainer} ref={logsContainerRef}>
          <div className={styles.logsHeader}>
            <h2>System Logs</h2>
            <div className={styles.logsActions}>
              <button 
                className={styles.iconButton} 
                onClick={copyLogsToClipboard}
                title="Copy to clipboard"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
                {copySuccess && <span className={styles.copySuccess}>{copySuccess}</span>}
              </button>
              <button 
                className={styles.iconButton} 
                onClick={clearLogs}
                title="Clear logs"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          </div>
          <div className={styles.tableContainer}>
            <table className={styles.logsTable}>
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Level</th>
                  <th>Module</th>
                  <th>Message</th>
                </tr>
              </thead>
              <tbody>
                {logs.length > 0 ? (
                  logs.map((log, index) => (
                    <tr key={index}>
                      <td className={styles.logTimestamp}>{log.timestamp}</td>
                      <td className={getLogLevelClass(log.level)}>{log.level}</td>
                      <td className={styles.logModule}>{log.module || 'unknown'}</td>
                      <td className={styles.logMessage}>{log.message}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className={styles.noLogs}>No logs available</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
} 