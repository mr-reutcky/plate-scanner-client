import React from "react";
import PlateScanner from "./components/PlateScanner";
import PlateGuideBox from "./components/PlateGuideBox";
import FlashlightButton from "./components/FlashlightButton";

function App() {
  return (
    <div>
      <h1>License Plate Scanner Demo</h1>
      <PlateGuideBox height={100} width={200} />
      <PlateScanner />
      <FlashlightButton />
    </div>
  );
}

export default App;
