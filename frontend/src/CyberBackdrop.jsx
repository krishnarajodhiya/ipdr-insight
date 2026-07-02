import React from "react";

export function CyberBackdrop() {
  return (
    <>
      <div className="auth-bg-gradient" />
      <div className="auth-bg-grid" />
      <svg className="auth-bg-network" viewBox="0 0 1200 800" preserveAspectRatio="none" aria-hidden>
        <g>
          <line x1="120" y1="140" x2="380" y2="240" />
          <line x1="380" y1="240" x2="620" y2="180" />
          <line x1="620" y1="180" x2="860" y2="280" />
          <line x1="860" y1="280" x2="1040" y2="220" />
          <line x1="260" y1="430" x2="520" y2="360" />
          <line x1="520" y1="360" x2="740" y2="470" />
          <line x1="740" y1="470" x2="980" y2="390" />
          <line x1="210" y1="640" x2="470" y2="560" />
          <line x1="470" y1="560" x2="690" y2="640" />
          <line x1="690" y1="640" x2="930" y2="580" />
          <circle cx="120" cy="140" r="3" />
          <circle cx="380" cy="240" r="3.5" />
          <circle cx="620" cy="180" r="3" />
          <circle cx="860" cy="280" r="3.5" />
          <circle cx="1040" cy="220" r="3" />
          <circle cx="260" cy="430" r="3.2" />
          <circle cx="520" cy="360" r="3.5" />
          <circle cx="740" cy="470" r="3.2" />
          <circle cx="980" cy="390" r="3" />
          <circle cx="210" cy="640" r="3" />
          <circle cx="470" cy="560" r="3.5" />
          <circle cx="690" cy="640" r="3.2" />
          <circle cx="930" cy="580" r="3" />
        </g>
      </svg>
    </>
  );
}