import React from "react";
import PlateScanner from "./components/PlateScanner";
import PlateGuideBox from "./components/PlateGuideBox";

function App() {
  return (
    <div>
      <h1>License Plate Scanner Demo</h1>
      <PlateGuideBox height={150} width={300} />
      <PlateScanner />
    </div>
  );
}

export default App;
