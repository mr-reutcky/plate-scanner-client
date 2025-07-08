import React from "react";

function PlateGuideBox(props) {
  return (
    <div
      className="plate-guide"
      style={{
        width: `${props.width}px`,
        height: `${props.height}px`,
      }}
    >
      {/* Top Left */}
      <div className="corner top-left horizontal" />
      <div className="corner top-left vertical" />

      {/* Top Right */}
      <div className="corner top-right horizontal" />
      <div className="corner top-right vertical" />

      {/* Bottom Left */}
      <div className="corner bottom-left horizontal" />
      <div className="corner bottom-left vertical" />

      {/* Bottom Right */}
      <div className="corner bottom-right horizontal" />
      <div className="corner bottom-right vertical" />
    </div>
  );
}

export default PlateGuideBox;
