/* global cv */
import React, { useEffect, useRef, useState } from "react";
import axios from "axios";

function PlateScanner() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [status, setStatus] = useState("Loading OpenCV...");
  const [detectedText, setDetectedText] = useState("");
  const frameCounter = useRef(0);

  useEffect(() => {
    const processFrame = () => {
      try {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");

        if (!videoRef.current || videoRef.current.readyState < 2) {
          requestAnimationFrame(processFrame);
          return;
        }

        ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

        let src = cv.imread(canvas);
        let gray = new cv.Mat();
        let edges = new cv.Mat();
        let contours = new cv.MatVector();
        let hierarchy = new cv.Mat();

        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
        cv.Canny(gray, edges, 50, 150, 3, false);
        cv.findContours(
          edges,
          contours,
          hierarchy,
          cv.RETR_TREE,
          cv.CHAIN_APPROX_SIMPLE
        );

        const candidates = [];
        for (let i = 0; i < contours.size(); i++) {
          let rect = cv.boundingRect(contours.get(i));
          let aspect = rect.width / rect.height;
          if (aspect > 1.8 && aspect < 5 && rect.width > 120) {
            candidates.push(rect);
          }
        }

        if (candidates.length > 0) {
          candidates.sort((a, b) => b.width * b.height - a.width * a.height);
          const rectToCrop = candidates[0];

          ctx.strokeStyle = "red";
          ctx.lineWidth = 2;
          ctx.strokeRect(rectToCrop.x, rectToCrop.y, rectToCrop.width, rectToCrop.height);

          setStatus("Possible plate detected");
          frameCounter.current++;

          if (frameCounter.current % 300 === 0) {
            console.log("Detected plate for 300 frames, making API call.");
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
                console.log("Backend response:", res.data);
                setDetectedText(res.data.plate || "No text detected");
              })
              .catch((err) => {
                console.error("API error:", err);
                setDetectedText("API error");
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
            device.kind === "videoinput" &&
            /back|rear/i.test(device.label)
        );

        let constraints;

        if (rearCamera) {
          console.log("Found rear camera:", rearCamera.label);
          constraints = {
            video: { deviceId: { exact: rearCamera.deviceId } }
          };
        } else {
          console.warn("Rear camera not found, using default.");
          constraints = { video: true };
        }

        const stream = await navigator.mediaDevices.getUserMedia(constraints);

        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setTimeout(() => processFrame(), 500);
      } catch (err) {
        console.error("Error accessing camera", err);
        setStatus("Camera error");
      }
    };

    const checkReady = () => {
      if (window.cv) {
        if (window.cv.Mat) {
          console.log("OpenCV.js is ready (Mat exists).");
          setStatus("No plate detected");
          startCamera();
        } else {
          console.log("Waiting for OpenCV to initialize...");
          window.cv["onRuntimeInitialized"] = () => {
            console.log("OpenCV.js onRuntimeInitialized fired.");
            setStatus("No plate detected");
            startCamera();
          };
        }
      } else {
        console.log("Waiting for OpenCV script to load...");
        setTimeout(checkReady, 100);
      }
    };

    checkReady();
  }, []);

  return (
    <div>
      <video ref={videoRef} style={{ display: "none" }} />
      <canvas
        ref={canvasRef}
        width={640}
        height={480}
        style={{ border: "1px solid black" }}
      />
      <div>Status: {status}</div>
      <div>Detected Plate: {detectedText}</div>
    </div>
  );
}

export default PlateScanner;
