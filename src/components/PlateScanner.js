/* global cv */
import React, { useRef, useState } from "react";
import axios from "axios";

function PlateScanner() {
  // Refs to access video and canvas DOM elements
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  // State for status messages and detected license plate text
  const [status, setStatus] = useState("Ready to start camera");
  const [detectedText, setDetectedText] = useState("");
  const [cameraStarted, setCameraStarted] = useState(false);

  // Ref to store box color state (used for drawing rectangle)
  const boxColorRef = useRef("lightblue");

  // Frame counter for cooldown control
  const frameCounter = useRef(0);
  const lastApiCallTimeRef = useRef(0);

  // Cooldown settings for limiting API calls
  const cooldownPeriod = 3000; // ms
  const coolDownFrames = 60;

  // Constants for guide box size and margins
  const GUIDE_WIDTH = 300;
  const GUIDE_HEIGHT = 150;
  const MARGIN = 20;

  // Core function to process each video frame
  const processFrame = () => {
    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");

      // Wait until video is ready before processing
      if (!video || video.readyState < 2) {
        requestAnimationFrame(processFrame);
        return;
      }

      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;
      const videoWidth = video.videoWidth;
      const videoHeight = video.videoHeight;

      const targetAspect = canvasWidth / canvasHeight;
      const videoAspect = videoWidth / videoHeight;

      let sx, sy, sw, sh;

      // Adjust source cropping to preserve aspect ratio when drawing video
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

      // Draw cropped video frame onto canvas
      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvasWidth, canvasHeight);

      // Define region of interest around the guide box
      const guideX = Math.floor((canvasWidth - GUIDE_WIDTH) / 2) - MARGIN;
      const guideY = Math.floor((canvasHeight - GUIDE_HEIGHT) / 2) - MARGIN;
      const regionWidth = GUIDE_WIDTH + MARGIN * 2;
      const regionHeight = GUIDE_HEIGHT + MARGIN * 2;

      // Extract the image data from the guide region
      const croppedImageData = ctx.getImageData(guideX, guideY, regionWidth, regionHeight);
      const croppedMat = cv.matFromImageData(croppedImageData);

      // Prepare OpenCV matrices for edge detection and contour analysis
      const gray = new cv.Mat();
      const edges = new cv.Mat();
      const contours = new cv.MatVector();
      const hierarchy = new cv.Mat();

      // Convert to grayscale and detect edges using Canny
      cv.cvtColor(croppedMat, gray, cv.COLOR_RGBA2GRAY, 0);
      cv.Canny(gray, edges, 50, 150, 3, false);

      // Find contours in the edge image
      cv.findContours(edges, contours, hierarchy, cv.RETR_TREE, cv.CHAIN_APPROX_SIMPLE);

      const candidates = [];

      // Loop through contours to find rectangular regions that match license plate dimensions
      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i);
        const rect = cv.boundingRect(contour);
        const aspect = rect.width / rect.height;

        // Filter rectangles with a plausible license plate aspect ratio and width
        if (aspect > 1.8 && aspect < 5 && rect.width > 120) {
          candidates.push(rect);
        }

        contour.delete(); // Clean up memory
      }

      if (candidates.length > 0) {
        // Use the largest candidate (most likely the actual plate)
        candidates.sort((a, b) => b.width * b.height - a.width * a.height);
        const rectToCrop = candidates[0];

        // Convert local region coordinates to global canvas coordinates
        const globalRect = {
          x: rectToCrop.x + guideX,
          y: rectToCrop.y + guideY,
          width: rectToCrop.width,
          height: rectToCrop.height,
        };

        // Draw rectangle around detected candidate
        ctx.strokeStyle = boxColorRef.current;
        ctx.lineWidth = 2;
        ctx.strokeRect(globalRect.x, globalRect.y, globalRect.width, globalRect.height);

        setStatus("Possible plate detected");
        frameCounter.current++;

        const now = Date.now();

        // Check if it's time to call the API (based on frame count and time cooldown)
        if (
          frameCounter.current >= coolDownFrames &&
          now - lastApiCallTimeRef.current > cooldownPeriod
        ) {
          lastApiCallTimeRef.current = now;
          frameCounter.current = 0;

          // Crop the detected plate area into a new canvas and convert to image
          const cropCanvas = document.createElement("canvas");
          cropCanvas.width = globalRect.width;
          cropCanvas.height = globalRect.height;
          const cropCtx = cropCanvas.getContext("2d");
          cropCtx.drawImage(
            canvas,
            globalRect.x,
            globalRect.y,
            globalRect.width,
            globalRect.height,
            0,
            0,
            globalRect.width,
            globalRect.height
          );
          const dataURL = cropCanvas.toDataURL("image/jpeg");

          // Send cropped image to server for OCR text recognition
          axios
            .post("https://plate-scanner-server.onrender.com/api/detect-plate", { image: dataURL })
            .then((res) => {
              const plate = res.data.plate;
              if (plate) {
                setDetectedText(plate);
                boxColorRef.current = "green"; // Green if text found
              } else {
                setDetectedText("No text detected");
                boxColorRef.current = "red"; // Red if no text
              }

              // Reset box color to default after 3 seconds
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
        // No valid plate candidates found
        setStatus("No plate detected");
        frameCounter.current = 0;
      }

      // Cleanup OpenCV matrices to avoid memory leaks
      croppedMat.delete();
      gray.delete();
      edges.delete();
      contours.delete();
      hierarchy.delete();
    } catch (error) {
      console.error("processFrame error:", error);
    }

    // Repeat the process for the next frame
    requestAnimationFrame(processFrame);
  };

  // Start the camera stream and begin processing
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" }, // Prefer back-facing camera
          width: { ideal: 1280 },
          height: { ideal: 1920 },
          frameRate: { ideal: 30, max: 30 },
        }
      });

      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      // Delay slightly before starting frame processing
      setTimeout(() => processFrame(), 500);
      setCameraStarted(true);
      setStatus("No plate detected");
    } catch (err) {
      console.error("Error accessing camera", err);
      setStatus("Camera error");
    }
  };

  // Wait for OpenCV to load before starting camera
  const checkReady = () => {
    if (window.cv) {
      if (window.cv.Mat) {
        startCamera(); // Already loaded
      } else {
        // Wait for OpenCV to finish initializing
        window.cv["onRuntimeInitialized"] = () => {
          startCamera();
        };
      }
    } else {
      // Retry until cv is available
      setTimeout(checkReady, 100);
    }
  };

  return (
    <div>
      {/* Hidden video element as input source */}
      <video ref={videoRef} style={{ display: "none" }} />

      {/* Canvas to display video and processing results */}
      <canvas ref={canvasRef} width={720} height={1280} />

      {/* Status and detected text display */}
      <div className="status-overlay top">
        <div>Status: {status}</div>
        <div>{detectedText}</div>
      </div>

      {/* Show start button if camera hasn't started yet */}
      {!cameraStarted && (
        <button className="start-button" onClick={checkReady}>
          Start Camera
        </button>
      )}
    </div>
  );
}

export default PlateScanner;
