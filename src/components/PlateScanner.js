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

  const processFrame = () => {
    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");

      if (!video || video.readyState < 2) {
        requestAnimationFrame(processFrame);
        return;
      }

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const src = cv.imread(canvas);
      const gray = new cv.Mat();
      const edges = new cv.Mat();
      const contours = new cv.MatVector();
      const hierarchy = new cv.Mat();

      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
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

        ctx.strokeStyle = boxColorRef.current;
        ctx.lineWidth = 2;
        ctx.strokeRect(rectToCrop.x, rectToCrop.y, rectToCrop.width, rectToCrop.height);

        setStatus("Possible plate detected");
        frameCounter.current++;

        const now = Date.now();
        if (
          frameCounter.current >= coolDownFrames &&
          now - lastApiCallTimeRef.current > cooldownPeriod
        ) {
          console.log("Making API call after 30 detections and cooldown...");
          lastApiCallTimeRef.current = now;
          frameCounter.current = 0;

          const cropCanvas = document.createElement("canvas");
          cropCanvas.width = rectToCrop.width;
          cropCanvas.height = rectToCrop.height;
          const cropCtx = cropCanvas.getContext("2d");
          cropCtx.drawImage(
            canvas,
            rectToCrop.x,
            rectToCrop.y,
            rectToCrop.width,
            rectToCrop.height,
            0,
            0,
            rectToCrop.width,
            rectToCrop.height
          );
          const dataURL = cropCanvas.toDataURL("image/jpeg");

          axios
            .post("https://plate-scanner-server.onrender.com/api/detect-plate", { image: dataURL })
            .then((res) => {
              console.log("API response:", res.data);
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

      src.delete();
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
        (device) =>
          device.kind === "videoinput" && /back|rear/i.test(device.label)
      );

      let constraints;

      if (rearCamera) {
        constraints = {
          video: {
            deviceId: { exact: rearCamera.deviceId },
            frameRate: { ideal: 30, max: 30 }
          }
        };
      } else {
        constraints = {
          video: {
            facingMode: { ideal: "environment" },
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
      <canvas ref={canvasRef} width={640} height={480} />
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
