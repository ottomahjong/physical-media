import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { DecodeHintType, BarcodeFormat } from "@zxing/library";

// Camera barcode scanner overlay. Reads 1D product barcodes (UPC-A/E, EAN-13/8)
// entirely on-device — nothing is uploaded. Calls onDetected(code) once, then
// the parent closes it. Works on iOS Safari + Android Chrome over HTTPS.
const hints = new Map();
hints.set(DecodeHintType.POSSIBLE_FORMATS, [
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
]);

export default function BarcodeScanner({ onDetected, onClose }) {
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const reader = new BrowserMultiFormatReader(hints);
    let cancelled = false;

    reader
      .decodeFromConstraints(
        { video: { facingMode: { ideal: "environment" } } },
        videoRef.current,
        (result, err, controls) => {
        if (controls && !controlsRef.current) controlsRef.current = controls;
        if (result && !cancelled) {
          cancelled = true;
          controlsRef.current && controlsRef.current.stop();
          onDetected(result.getText());
        }
      })
      .catch((e) => {
        setError(
          e && e.name === "NotAllowedError"
            ? "Camera access was blocked. Allow camera in your browser, or type the barcode instead."
            : "Couldn't start the camera. Type the barcode instead."
        );
      });

    return () => {
      cancelled = true;
      try {
        controlsRef.current && controlsRef.current.stop();
      } catch {
        /* already stopped */
      }
    };
  }, [onDetected]);

  return (
    <div className="scanoverlay" role="dialog" aria-label="Scan a barcode">
      <div className="scanbox">
        {error ? (
          <p className="err" style={{ margin: 0 }}>{error}</p>
        ) : (
          <>
            <div className="scanstage">
              <video ref={videoRef} className="scanvideo" muted playsInline />
              <div className="scanframe" />
            </div>
            <p className="scanhint">Point your camera at the barcode</p>
          </>
        )}
        <button type="button" className="btn ghost btn--scanclose" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
