/* global cv */
import React, { useRef, useState } from "react";
import axios from "axios";

function PlateScanner() {
  // References for video and canvas elements
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  // UI and detection state
  const [status, setStatus] = useState("Ready to start camera");
  const [detectedText, setDetectedText] = useState("");
  const [cameraStarted, setCameraStarted] = useState(false);

  // Color of the bounding box (for visual feedback)
  const boxColorRef = useRef("lightblue");

  // Frame and timing counters for API call throttling
  const frameCounter = useRef(0);
  const lastApiCallTimeRef = useRef(0);

  // API throttling configuration
  const cooldownPeriod = 3000; // 3 seconds cooldown between API calls
  const coolDownFrames = 15;   // Require 15 detection frames before API call

  // Guide box dimensions (centered rectangle on screen)
  const GUIDE_WIDTH = 300;
  const GUIDE_HEIGHT = 150;
  const MARGIN = 20;

  // Main function to process each video frame
  const processFrame = () => {
    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");

      // Skip frame if video isn't ready
      if (!video || video.readyState < 2) {
        requestAnimationFrame(processFrame);
        return;
      }

      // Handle aspect ratio cropping to center the camera feed
      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;
      const videoWidth = video.videoWidth;
      const videoHeight = video.videoHeight;

      const targetAspect = canvasWidth / canvasHeight;
      const videoAspect = videoWidth / videoHeight;

      let sx, sy, sw, sh;

      if (videoAspect > targetAspect) {
        sh = videoHeight;
        sw = sh * targetAspect;
        sx = (videoWidth - sw) / 2;
        sy = 0;
      } else {
        sw = videoWidth;
        sh = sw / targetAspect;
        sx = 0;
        sy = (videoHeight - sh) / 2;
      }

      // Draw the cropped camera frame to the canvas
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvasWidth, canvasHeight);

      // Calculate detection region inside the guide box
      const guideX = Math.floor((canvasWidth - GUIDE_WIDTH) / 2) - MARGIN;
      const guideY = Math.floor((canvasHeight - GUIDE_HEIGHT) / 2) - MARGIN;
      const regionWidth = GUIDE_WIDTH + MARGIN * 2;
      const regionHeight = GUIDE_HEIGHT + MARGIN * 2;

      // Extract image data from the defined guide region
      const croppedImageData = ctx.getImageData(guideX, guideY, regionWidth, regionHeight);
      const croppedMat = cv.matFromImageData(croppedImageData);

      // Convert to grayscale and detect edges
      const gray = new cv.Mat();
      const edges = new cv.Mat();
      const contours = new cv.MatVector();
      const hierarchy = new cv.Mat();

      cv.cvtColor(croppedMat, gray, cv.COLOR_RGBA2GRAY, 0);
      cv.Canny(gray, edges, 50, 150, 3, false);

      // Find contours (possible rectangles) from edges
      cv.findContours(edges, contours, hierarchy, cv.RETR_TREE, cv.CHAIN_APPROX_SIMPLE);

      const candidates = [];

      // Filter contours to find rectangular regions likely to be license plates
      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i);
        const rect = cv.boundingRect(contour);
        const aspect = rect.width / rect.height;

        if (aspect > 1.8 && aspect < 5 && rect.width > 120) {
          candidates.push(rect);
        }

        contour.delete(); // Clean up memory
      }

      // If candidates found, draw bounding box and prepare API call
      if (candidates.length > 0) {
        candidates.sort((a, b) => b.width * b.height - a.width * a.height);
        const rectToCrop = candidates[0]; // Pick largest

        // Translate cropped rect coordinates to global canvas coordinates
        const globalRect = {
          x: rectToCrop.x + guideX,
          y: rectToCrop.y + guideY,
          width: rectToCrop.width,
          height: rectToCrop.height,
        };

        // Draw bounding box around detected region
        ctx.strokeStyle = boxColorRef.current;
        ctx.lineWidth = 4;
        ctx.strokeRect(globalRect.x, globalRect.y, globalRect.width, globalRect.height);

        setStatus("Possible plate detected");
        frameCounter.current++;

        const now = Date.now();

        // If enough frames passed and cooldown is over, send image to API
        if (
          frameCounter.current >= coolDownFrames &&
          now - lastApiCallTimeRef.current > cooldownPeriod
        ) {
          lastApiCallTimeRef.current = now;
          frameCounter.current = 0;

          // Trim top/bottom of the crop to reduce background noise
          const trimTopBottom = 10;
          const adjustedHeight = Math.max(globalRect.height - trimTopBottom * 2, 1);
          const adjustedY = globalRect.y + trimTopBottom;

          // Create a canvas to crop the detected license plate area
          const cropCanvas = document.createElement("canvas");
          cropCanvas.width = globalRect.width;
          cropCanvas.height = adjustedHeight;
          const cropCtx = cropCanvas.getContext("2d");

          // Draw cropped area into new canvas
          cropCtx.drawImage(
            canvas,
            globalRect.x,
            adjustedY,
            globalRect.width,
            adjustedHeight,
            0,
            0,
            globalRect.width,
            adjustedHeight
          );

          // Convert to JPEG base64 for API
          const dataURL = cropCanvas.toDataURL("image/jpeg");

          // Send image to backend API for OCR
          axios
            .post("https://plate-scanner-server.onrender.com/api/detect-plate", { image: dataURL })
            .then((res) => {
              const plate = res.data.plate;

              if (plate) {
                setDetectedText(plate);         // Show result
                boxColorRef.current = "green";  // Green box = successful read
              } else {
                setDetectedText("No text detected");
                boxColorRef.current = "red";    // Red box = OCR failed
              }

              // Reset color after 3 seconds
              setTimeout(() => {
                boxColorRef.current = "lightblue";
              }, 3000);
            })
            .catch((err) => {
              console.error("API error:", err);
              setDetectedText("API error");
              boxColorRef.current = "red";
              setTimeout(() => {
                boxColorRef.current = "lightblue";
              }, 3000);
            });
        }
      } else {
        // No valid candidates found this frame
        setStatus("No plate detected");
        frameCounter.current = 0;
      }

      // Free memory to avoid leaks
      croppedMat.delete();
      gray.delete();
      edges.delete();
      contours.delete();
      hierarchy.delete();
    } catch (error) {
      console.error("processFrame error:", error);
    }

    // Request next frame to process
    requestAnimationFrame(processFrame);
  };

  // Function to start the user's camera
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" }, // Use rear camera
          width: { ideal: 1280 },
          height: { ideal: 1920 },
          frameRate: { ideal: 30, max: 30 },
        }
      });

      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      // Start processing frames after slight delay
      setTimeout(() => processFrame(), 500);
      setCameraStarted(true);
      setStatus("No plate detected");
    } catch (err) {
      console.error("Error accessing camera", err);
      setStatus("Camera error");
    }
  };

  // Checks if OpenCV.js has loaded before starting
  const checkReady = () => {
    if (window.cv) {
      if (window.cv.Mat) {
        startCamera(); // Already initialized
      } else {
        // Wait for OpenCV to finish loading
        window.cv["onRuntimeInitialized"] = () => {
          startCamera();
        };
      }
    } else {
      // Retry if cv is still undefined
      setTimeout(checkReady, 100);
    }
  };

  // UI elements for camera and output
  return (
    <div>
      {/* Hidden video feed for canvas processing */}
      <video ref={videoRef} style={{ display: "none" }} />

      {/* Canvas displaying the cropped and annotated video */}
      <canvas ref={canvasRef} width={720} height={1280} />

      {/* Status overlay with detection results */}
      <div className="status-overlay top">
        <div>Status: {status}</div>
        <div>{detectedText}</div>
      </div>

      {/* Button to start camera if not already running */}
      {!cameraStarted && (
        <button className="start-button" onClick={checkReady}>
          Start Camera
        </button>
      )}
    </div>
  );
}

export default PlateScanner;
