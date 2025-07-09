# Plate Scanner Client

This is a prototype React frontend for scanning license plates using a device camera. It integrates OpenCV.js for basic frame processing and AWS Rekognition for text detection.

## Overview

The app captures a live video feed from the user's device camera and processes selected frames to detect potential license plates. It sends cropped frame data to a backend endpoint that uses AWS Rekognition to detect text, such as plate numbers.

## Features

- Live camera view using `getUserMedia`
- Central guide box for plate alignment
- Plate detection using AWS Rekognition (via API)
- OpenCV.js integration for real-time frame handling
- Cooldown between scans to reduce API calls

## Technologies Used

- React.js
- OpenCV.js
- AWS Rekognition (via backend API)
- HTML5 Canvas API
- MediaDevices API

## Setup Instructions

1. Clone the repo:

   ```bash
   git clone https://github.com/mr-reutcky/plate-scanner-client.git
   cd plate-scanner-client
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the development server:

   ```bash
   npm run dev
   ```

4. Ensure the backend API is running at `/api/detect-plate` and accepts a base64 image string.

## Notes

- The video feed is vertically oriented (9:16) and horizontally cropped to match full-screen mobile devices.
- Boxes will appear green if a plate is detected, red if not, and light blue by default.
- The API expects `image` in base64 format in a POST request to `/api/detect-plate`.

## License

This project is open for educational and prototyping purposes only.
