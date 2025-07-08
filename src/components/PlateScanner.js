/* global cv */
import React, { useRef, useState } from "react";
import axios from "axios";

function PlateScanner() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [status, setStatus] = useState("Ready to start camera");
  const [detectedText, setDetectedText] = useState("");
  const [cameraStarted, setCameraStarted] = useState(false);
  const boxColorRef = useRef("lightblue");
  const frameCounter = useRef(0);
  const lastApiCallTimeRef = useRef(0);
  const cooldownPeriod = 3000;
  const coolDownFrames = 60;

  const GUIDE_WIDTH = 300;
  const GUIDE_HEIGHT = 150;
  const MARGIN = 20;

  const processFrame = () => {
    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");

      if (!video || video.readyState < 2) {
        requestAnimationFrame(processFrame);
        return;
      }

      const videoWidth = video.videoWidth;
      const videoHeight = video.videoHeight;
      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;

      // Crop center 9:16 region from video
      const targetAspect = 9 / 16;
      const videoAspect = videoWidth / videoHeight;

      let sx, sy, sw, sh;
      if (videoAspect > targetAspect) {
        // Video too wide → crop sides
        sh = videoHeight;
        sw = sh * targetAspect;
        sx = (videoWidth - sw) / 2;
        sy = 0;
      } else {
        // Video too tall → crop top/bottom
        sw = videoWidth;
        sh = sw / targetAspect;
        sx = 0;
        sy = (videoHeight - sh) / 2;
      }

      ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvasWidth, canvasHeight);

      const guideX = Math.floor((canvasWidth - GUIDE_WIDTH) / 2) - MARGIN;
      const guideY = Math.floor((canvasHeight - GUIDE_HEIGHT) / 2) - MARGIN;
      const regionWidth = GUIDE_WIDTH + MARGIN * 2;
      const regionHeight = GUIDE_HEIGHT + MARGIN * 2;

      const croppedImageData = ctx.getImageData(guideX, guideY, regionWidth, regionHeight);
      const croppedMat = cv.matFromImageData(croppedImageData);

      const gray = new cv.Mat();
      const edges = new cv.Mat();
      const contours = new cv.MatVector();
      const hierarchy = new cv.Mat();

      cv.cvtColor(croppedMat, gray, cv.COLOR_RGBA2GRAY, 0);
      cv.Canny(gray, edges, 50, 150, 3, false);
      cv.findContours(edges, contours, hierarchy, cv.RETR_TREE, cv.CHAIN_APPROX_SIMPLE);

      const candidates = [];

      for (let i = 0; i < contours.size(); i++) {
        const contour = contours.get(i);
        const rect = cv.boundingRect(contour);
        const aspect = rect.width / rect.height;

        if (aspect > 1.8 && aspect < 5 && rect.width > 120) {
          candidates.push(rect);
        }

        contour.delete();
      }

      if (candidates.length > 0) {
        candidates.sort((a, b) => b.width * b.height - a.width * a.height);
        const rectToCrop = candidates[0];

        const globalRect = {
          x: rectToCrop.x + guideX,
          y: rectToCrop.y + guideY,
          width: rectToCrop.width,
          height: rectToCrop.height,
        };

        ctx.strokeStyle = boxColorRef.current;
        ctx.lineWidth = 2;
        ctx.strokeRect(globalRect.x, globalRect.y, globalRect.width, globalRect.height);

        setStatus("Possible plate detected");
        frameCounter.current++;

        const now = Date.now();
        if (
          frameCounter.current >= coolDownFrames &&
          now - lastApiCallTimeRef.current > cooldownPeriod
        ) {
          lastApiCallTimeRef.current = now;
          frameCounter.current = 0;

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

          axios
            .post("https://plate-scanner-server.onrender.com/api/detect-plate", { image: dataURL })
            .then((res) => {
              const plate = res.data.plate;
              if (plate) {
                setDetectedText(plate);
                boxColorRef.current = "green";
              } else {
                setDetectedText("No text detected");
                boxColorRef.current = "red";
              }
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
        setStatus("No plate detected");
        frameCounter.current = 0;
      }

      croppedMat.delete();
      gray.delete();
      edges.delete();
      contours.delete();
      hierarchy.delete();
    } catch (error) {
      console.error("processFrame error:", error);
    }

    requestAnimationFrame(processFrame);
  };

  const startCamera = async () => {
    try {
      const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
      const devices = await navigator.mediaDevices.enumerateDevices();
      tempStream.getTracks().forEach((track) => track.stop());

      const rearCamera = devices.find(
        (device) => device.kind === "videoinput" && /back|rear/i.test(device.label)
      );

      let constraints;
      if (rearCamera) {
        constraints = {
          video: {
            deviceId: { exact: rearCamera.deviceId },
            width: { exact: 1080 },
            height: { exact: 1920 },
            frameRate: { ideal: 30, max: 30 }
          }
        };
      } else {
        constraints = {
          video: {
            facingMode: { ideal: "environment" },
            width: { exact: 1080 },
            height: { exact: 1920 },
            frameRate: { ideal: 30, max: 30 }
          }
        };
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      videoRef.current.srcObject = stream;
      videoRef.current.play();
      setTimeout(() => processFrame(), 500);
      setCameraStarted(true);
      setStatus("No plate detected");
    } catch (err) {
      console.error("Error accessing camera", err);
      setStatus("Camera error");
    }
  };

  const checkReady = () => {
    if (window.cv) {
      if (window.cv.Mat) {
        startCamera();
      } else {
        window.cv["onRuntimeInitialized"] = () => {
          startCamera();
        };
      }
    } else {
      setTimeout(checkReady, 100);
    }
  };

  return (
    <div>
      <video ref={videoRef} style={{ display: "none" }} />
      <canvas ref={canvasRef} width={720} height={1280} />
      <div className="status-overlay top">
        <div>Status: {status}</div>
        <div>{detectedText}</div>
      </div>
      {!cameraStarted && (
        <button className="start-button" onClick={checkReady}>
          Start Camera
        </button>
      )}
    </div>
  );
}

export default PlateScanner;
