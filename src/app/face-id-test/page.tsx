"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { toast } from "react-hot-toast";
import {
  extractFaceEmbedding,
  extractFaceEmbeddingAsync,
  recognizeFace,
  getEnrolledFaces,
  saveEnrolledFace,
  deleteEnrolledFace,
  clearAllEnrolledFaces,
  isWebAuthnSupported,
  registerWebAuthnBiometrics,
  verifyWebAuthnBiometrics,
  EnrolledFace,
  FaceDetectionResult,
} from "@/lib/faceIdEngine";

export default function FaceIdTestPage() {
  const [activeTab, setActiveTab] = useState<"scanner" | "enrollment" | "biometrics" | "database">("scanner");

  // Camera & Detection States
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");

  // Recognition States
  const [enrolledFaces, setEnrolledFaces] = useState<EnrolledFace[]>([]);
  const [matchResult, setMatchResult] = useState<FaceDetectionResult | null>(null);
  const [threshold, setThreshold] = useState<number>(80);
  const [autoClockIn, setAutoClockIn] = useState<boolean>(true);
  const [lastClockInUser, setLastClockInUser] = useState<string | null>(null);

  // Enrollment States
  const [enrollName, setEnrollName] = useState("");
  const [enrollRole, setEnrollRole] = useState("Worker");
  const [enrollEmployeeId, setEnrollEmployeeId] = useState("");
  const [capturedPreview, setCapturedPreview] = useState<string | null>(null);
  const [capturedEmbedding, setCapturedEmbedding] = useState<number[] | null>(null);

  // WebAuthn States
  const [webAuthnSupported, setWebAuthnSupported] = useState<boolean>(false);
  const [webAuthnUser, setWebAuthnUser] = useState("");

  // Load Enrolled Faces on Mount
  useEffect(() => {
    const faces = getEnrolledFaces();
    setEnrolledFaces(faces);
    isWebAuthnSupported().then(setWebAuthnSupported);

    // Get camera devices
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices().then((devs) => {
        const videoInputs = devs.filter((d) => d.kind === "videoinput");
        setDevices(videoInputs);
        if (videoInputs.length > 0 && !selectedDeviceId) {
          setSelectedDeviceId(videoInputs[0].deviceId);
        }
      });
    }
  }, []);

  // Handle Camera Start / Stop
  const startCamera = async () => {
    setCameraError(null);
    try {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
      }

      const constraints: MediaStreamConstraints = {
        video: selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : { facingMode: "user" },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        setIsCameraActive(true);
      }
    } catch (err: any) {
      console.error("Camera access error:", err);
      setCameraError(err?.message || "Could not access camera. Please allow camera permissions.");
      setIsCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  };

  // Switch tabs & manage camera lifecycle
  const handleTabChange = (tab: "scanner" | "enrollment" | "biometrics" | "database") => {
    setActiveTab(tab);
    if (tab === "scanner" || tab === "enrollment") {
      startCamera();
    } else {
      stopCamera();
    }
  };

  // Continuous Detection Loop for Scanner
  useEffect(() => {
    let animationFrameId: number;
    let lastScanTime = 0;

    const detectLoop = async (timestamp: number) => {
      if (activeTab === "scanner" && isCameraActive && videoRef.current && videoRef.current.readyState === 4) {
        if (timestamp - lastScanTime > 250) {
          // Scan every 250ms
          lastScanTime = timestamp;
          const extracted = await extractFaceEmbeddingAsync(videoRef.current);

          if (extracted) {
            const res = recognizeFace(extracted.embedding, enrolledFaces, threshold);
            res.boundingBox = extracted.boundingBox;
            setMatchResult(res);

            // Draw bounding box on overlay canvas
            if (canvasRef.current && videoRef.current) {
              const canvas = canvasRef.current;
              const ctx = canvas.getContext("2d");
              if (ctx) {
                canvas.width = videoRef.current.videoWidth || 300;
                canvas.height = videoRef.current.videoHeight || 300;
                ctx.clearRect(0, 0, canvas.width, canvas.height);

                if (extracted.boundingBox) {
                  const scaleX = canvas.width / 300;
                  const scaleY = canvas.height / 300;
                  const bx = extracted.boundingBox.x * scaleX;
                  const by = extracted.boundingBox.y * scaleY;
                  const bw = extracted.boundingBox.width * scaleX;
                  const bh = extracted.boundingBox.height * scaleY;

                  // Bounding Box Reticle
                  ctx.strokeStyle = res.match ? "#10b981" : "#c9a227";
                  ctx.lineWidth = 3;
                  ctx.strokeRect(bx, by, bw, bh);

                  // Reticle Corners
                  ctx.fillStyle = res.match ? "#10b981" : "#c9a227";
                  ctx.fillRect(bx - 4, by - 4, 12, 12);
                  ctx.fillRect(bx + bw - 8, by - 4, 12, 12);
                  ctx.fillRect(bx - 4, by + bh - 8, 12, 12);
                  ctx.fillRect(bx + bw - 8, by + bh - 8, 12, 12);

                  // Badge Label above face box
                  ctx.fillStyle = res.match ? "rgba(16, 185, 129, 0.85)" : "rgba(201, 162, 39, 0.85)";
                  ctx.fillRect(bx, Math.max(10, by - 32), bw, 28);
                  ctx.fillStyle = "#ffffff";
                  ctx.font = "bold 13px Inter, sans-serif";
                  const labelText = res.match ? `${res.match.name} (${res.confidenceScore}%)` : `Face Detected (${res.confidenceScore}% match)`;
                  ctx.fillText(labelText, bx + 8, Math.max(28, by - 12));
                }
              }
            }

            if (res.match && autoClockIn && res.match.name !== lastClockInUser) {
              setLastClockInUser(res.match.name);
              toast.success(`Face Recognized! Verified as ${res.match.name} (${res.confidenceScore}% Match)`);
            }
          } else {
            // NO face in camera view: clear match result & canvas reticle
            setMatchResult(null);
            if (canvasRef.current) {
              const ctx = canvasRef.current.getContext("2d");
              if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
            }
          }
        }
      }
      animationFrameId = requestAnimationFrame(detectLoop);
    };

    if (activeTab === "scanner" && isCameraActive) {
      animationFrameId = requestAnimationFrame(detectLoop);
    }

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    };
  }, [activeTab, isCameraActive, enrolledFaces, threshold, autoClockIn, lastClockInUser]);

  // Capture face photo for enrollment
  const captureEnrollmentFace = async () => {
    if (!videoRef.current || videoRef.current.readyState !== 4) {
      toast.error("Camera feed not ready yet.");
      return;
    }
    const extracted = await extractFaceEmbeddingAsync(videoRef.current);
    if (!extracted) {
      toast.error("No clear face detected in frame. Please position your face clearly in front of the camera.");
      return;
    }

    setCapturedPreview(extracted.previewUrl);
    setCapturedEmbedding(extracted.embedding);
    toast.success("Face pattern captured cleanly!");
  };

  // Submit enrollment
  const handleSaveEnrollment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!enrollName.trim()) {
      toast.error("Please enter a person's name.");
      return;
    }
    if (!capturedEmbedding || !capturedPreview) {
      toast.error("Please capture face pattern first.");
      return;
    }

    const saved = saveEnrolledFace({
      name: enrollName.trim(),
      role: enrollRole,
      employeeId: enrollEmployeeId.trim() || undefined,
      embedding: capturedEmbedding,
      photoDataUrl: capturedPreview,
    });

    setEnrolledFaces(getEnrolledFaces());
    setEnrollName("");
    setEnrollEmployeeId("");
    setCapturedPreview(null);
    setCapturedEmbedding(null);
    toast.success(`Successfully enrolled ${saved.name}!`);
    setActiveTab("scanner");
  };

  // Delete Enrolled Profile
  const handleDeleteFace = (id: string, name: string) => {
    if (confirm(`Remove enrolled profile for ${name}?`)) {
      deleteEnrolledFace(id);
      setEnrolledFaces(getEnrolledFaces());
      toast.success(`Removed ${name}`);
    }
  };

  // Clear Database
  const handleClearAll = () => {
    if (confirm("Are you sure you want to clear ALL enrolled face profiles?")) {
      clearAllEnrolledFaces();
      setEnrolledFaces([]);
      setMatchResult(null);
      toast.success("Face database reset.");
    }
  };

  // WebAuthn Register
  const handleWebAuthnRegister = async () => {
    if (!webAuthnUser.trim()) {
      toast.error("Please enter your name or user ID.");
      return;
    }
    try {
      const ok = await registerWebAuthnBiometrics(webAuthnUser.trim());
      if (ok) toast.success("Device Face ID / Touch ID registered successfully!");
    } catch (err: any) {
      toast.error(err?.message || "Biometrics enrollment failed.");
    }
  };

  // WebAuthn Verify
  const handleWebAuthnVerify = async () => {
    try {
      const ok = await verifyWebAuthnBiometrics();
      if (ok) {
        toast.success("Hardware Face ID verification PASSED!");
      }
    } catch (err: any) {
      toast.error(err?.message || "Biometrics verification cancelled or failed.");
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-color)", color: "var(--text-primary)", padding: "1.5rem" }}>
      <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
        {/* Header Bar */}
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "1.5rem",
            paddingBottom: "1rem",
            borderBottom: "1px solid var(--border)",
          }}
        >
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <span
                style={{
                  background: "rgba(201, 162, 39, 0.15)",
                  color: "var(--gold)",
                  border: "1px solid rgba(201, 162, 39, 0.3)",
                  padding: "0.25rem 0.6rem",
                  borderRadius: "6px",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                }}
              >
                Beta Testing Mode
              </span>
              <span
                style={{
                  background: "rgba(16, 185, 129, 0.15)",
                  color: "#10b981",
                  border: "1px solid rgba(16, 185, 129, 0.3)",
                  padding: "0.25rem 0.6rem",
                  borderRadius: "6px",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                }}
              >
                100% Free / $0 Cloud Cost
              </span>
            </div>
            <h1 style={{ fontSize: "1.75rem", fontWeight: 800, marginTop: "0.5rem", background: "linear-gradient(135deg, #fff 0%, var(--gold-light) 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              Face ID Recognition Beta
            </h1>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginTop: "0.25rem" }}>
              Client-side spatial feature recognition & browser biometrics suite.
            </p>
          </div>

          <Link
            href="/admin"
            className="btn btn-secondary"
            style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem", padding: "0.5rem 1rem" }}
          >
            ← Back to Admin
          </Link>
        </header>

        {/* Tab Navigation */}
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem", borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: "0.5rem" }}>
          {[
            { id: "scanner", label: "📷 Live Face Scanner", badge: `${enrolledFaces.length} Enrolled` },
            { id: "enrollment", label: "➕ Register New Face", badge: null },
            { id: "biometrics", label: "🔐 Hardware Face ID (WebAuthn)", badge: webAuthnSupported ? "Supported" : "N/A" },
            { id: "database", label: "⚙️ Face DB & Settings", badge: null },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id as any)}
              style={{
                padding: "0.6rem 1.2rem",
                borderRadius: "8px",
                fontSize: "0.875rem",
                fontWeight: 600,
                cursor: "pointer",
                border: "none",
                background: activeTab === tab.id ? "var(--gold)" : "rgba(255,255,255,0.04)",
                color: activeTab === tab.id ? "#000" : "var(--text-secondary)",
                transition: "all 0.2s ease",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              {tab.label}
              {tab.badge && (
                <span
                  style={{
                    background: activeTab === tab.id ? "rgba(0,0,0,0.2)" : "rgba(255,255,255,0.1)",
                    padding: "0.15rem 0.4rem",
                    borderRadius: "4px",
                    fontSize: "0.7rem",
                  }}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ================= TAB 1: SCANNER ================= */}
        {activeTab === "scanner" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "1.5rem" }}>
            <div className="glass-card" style={{ padding: "1.5rem", position: "relative" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                <h2 style={{ fontSize: "1.1rem", fontWeight: 700, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: isCameraActive ? "#10b981" : "#ef4444" }} />
                  Live Camera Scanner Feed
                </h2>

                <div style={{ display: "flex", gap: "0.5rem" }}>
                  {devices.length > 1 && (
                    <select
                      value={selectedDeviceId}
                      onChange={(e) => {
                        setSelectedDeviceId(e.target.value);
                        startCamera();
                      }}
                      style={{ background: "var(--bg-surface)", color: "var(--text-primary)", border: "1px solid var(--border)", borderRadius: "6px", padding: "0.3rem 0.6rem", fontSize: "0.8rem" }}
                    >
                      {devices.map((d, idx) => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.label || `Camera ${idx + 1}`}
                        </option>
                      ))}
                    </select>
                  )}

                  {!isCameraActive ? (
                    <button onClick={startCamera} className="btn btn-primary" style={{ padding: "0.4rem 0.8rem", fontSize: "0.8rem" }}>
                      Start Camera
                    </button>
                  ) : (
                    <button onClick={stopCamera} className="btn btn-danger" style={{ padding: "0.4rem 0.8rem", fontSize: "0.8rem" }}>
                      Stop Camera
                    </button>
                  )}
                </div>
              </div>

              {/* Camera Video Viewport */}
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  height: "440px",
                  background: "#000",
                  borderRadius: "12px",
                  overflow: "hidden",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "1px solid rgba(255,255,255,0.1)",
                }}
              >
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    transform: "scaleX(-1)", // Mirror video for natural preview
                  }}
                />
                <canvas
                  ref={canvasRef}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    pointerEvents: "none",
                    transform: "scaleX(-1)",
                  }}
                />

                {!isCameraActive && (
                  <div style={{ textAlign: "center", color: "var(--text-secondary)" }}>
                    <p style={{ fontSize: "1.1rem", marginBottom: "0.5rem" }}>📷 Camera Inactive</p>
                    <button onClick={startCamera} className="btn btn-primary" style={{ marginTop: "0.5rem" }}>
                      Turn On Camera
                    </button>
                  </div>
                )}

                {cameraError && (
                  <div style={{ position: "absolute", bottom: "1rem", left: "1rem", right: "1rem", background: "rgba(239,68,68,0.9)", color: "#fff", padding: "0.75rem", borderRadius: "8px", fontSize: "0.85rem" }}>
                    ⚠️ {cameraError}
                  </div>
                )}
              </div>
            </div>

            {/* Match Output Panel */}
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div className="glass-card" style={{ padding: "1.5rem" }}>
                <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "1rem" }}>Face Match Result</h3>

                {matchResult?.match ? (
                  <div style={{ textAlign: "center", padding: "1rem", background: "rgba(16, 185, 129, 0.1)", border: "1px solid rgba(16, 185, 129, 0.3)", borderRadius: "10px" }}>
                    {matchResult.match.photoDataUrl && (
                      <img
                        src={matchResult.match.photoDataUrl}
                        alt="Enrolled match"
                        style={{ width: "80px", height: "80px", borderRadius: "50%", objectFit: "cover", margin: "0 auto 0.75rem", border: "2px solid #10b981" }}
                      />
                    )}
                    <h4 style={{ fontSize: "1.25rem", fontWeight: 800, color: "#10b981" }}>{matchResult.match.name}</h4>
                    <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>
                      Role: {matchResult.match.role || "Worker"} {matchResult.match.employeeId ? `(ID: ${matchResult.match.employeeId})` : ""}
                    </p>

                    <div style={{ marginTop: "1rem", background: "rgba(0,0,0,0.3)", borderRadius: "8px", padding: "0.5rem" }}>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Match Confidence</div>
                      <div style={{ fontSize: "1.5rem", fontWeight: 900, color: "#10b981" }}>{matchResult.confidenceScore}%</div>
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: "center", padding: "1.5rem", background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.1)", borderRadius: "10px" }}>
                    <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>👤</div>
                    <h4 style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text-secondary)" }}>
                      {enrolledFaces.length === 0 ? "No Faces Enrolled Yet" : "Searching / Unrecognized Face"}
                    </h4>
                    {matchResult && matchResult.confidenceScore > 0 && (
                      <p style={{ fontSize: "0.8rem", color: "var(--gold)", marginTop: "0.5rem" }}>
                        Closest Match: {matchResult.confidenceScore}% (Below {threshold}% threshold)
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Quick Settings */}
              <div className="glass-card" style={{ padding: "1.25rem" }}>
                <h3 style={{ fontSize: "0.9rem", fontWeight: 700, marginBottom: "0.75rem" }}>Scanner Quick Controls</h3>
                <div style={{ marginBottom: "1rem" }}>
                  <label style={{ fontSize: "0.8rem", color: "var(--text-secondary)", display: "block", marginBottom: "0.25rem" }}>
                    Match Sensitivity Threshold: <strong>{threshold}%</strong>
                  </label>
                  <input
                    type="range"
                    min="60"
                    max="98"
                    value={threshold}
                    onChange={(e) => setThreshold(Number(e.target.value))}
                    style={{ width: "100%", accentColor: "var(--gold)" }}
                  />
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: "0.8rem" }}>Auto Toast Notification</span>
                  <input type="checkbox" checked={autoClockIn} onChange={(e) => setAutoClockIn(e.target.checked)} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================= TAB 2: ENROLLMENT ================= */}
        {activeTab === "enrollment" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem" }}>
            {/* Camera Frame */}
            <div className="glass-card" style={{ padding: "1.5rem" }}>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "1rem" }}>Step 1: Capture Face Pattern</h2>
              <div style={{ position: "relative", width: "100%", height: "320px", background: "#000", borderRadius: "10px", overflow: "hidden", marginBottom: "1rem" }}>
                <video ref={videoRef} playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)" }} />
              </div>
              <button onClick={captureEnrollmentFace} className="btn btn-primary" style={{ width: "100%", padding: "0.75rem", fontWeight: 700 }}>
                📸 Capture Face Snapshot
              </button>
            </div>

            {/* Details Form */}
            <div className="glass-card" style={{ padding: "1.5rem" }}>
              <h2 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "1rem" }}>Step 2: Profile Information</h2>
              <form onSubmit={handleSaveEnrollment}>
                {capturedPreview && (
                  <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.25rem", padding: "0.75rem", background: "rgba(16, 185, 129, 0.1)", borderRadius: "8px" }}>
                    <img src={capturedPreview} alt="Captured preview" style={{ width: "60px", height: "60px", borderRadius: "50%", objectFit: "cover", border: "2px solid #10b981" }} />
                    <div>
                      <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#10b981" }}>✓ Face Signature Captured</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>64-Vector Embedding Generated</div>
                    </div>
                  </div>
                )}

                <div style={{ marginBottom: "1rem" }}>
                  <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.4rem" }}>Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. John Doe"
                    value={enrollName}
                    onChange={(e) => setEnrollName(e.target.value)}
                    style={{ width: "100%", padding: "0.6rem 0.8rem", borderRadius: "6px", background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                  />
                </div>

                <div style={{ marginBottom: "1rem" }}>
                  <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.4rem" }}>Role</label>
                  <select
                    value={enrollRole}
                    onChange={(e) => setEnrollRole(e.target.value)}
                    style={{ width: "100%", padding: "0.6rem 0.8rem", borderRadius: "6px", background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                  >
                    <option value="Worker">Worker</option>
                    <option value="Admin">Admin</option>
                    <option value="Manager">Manager</option>
                  </select>
                </div>

                <div style={{ marginBottom: "1.5rem" }}>
                  <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.4rem" }}>Employee / Staff ID (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. EMP-104"
                    value={enrollEmployeeId}
                    onChange={(e) => setEnrollEmployeeId(e.target.value)}
                    style={{ width: "100%", padding: "0.6rem 0.8rem", borderRadius: "6px", background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                  />
                </div>

                <button type="submit" disabled={!capturedEmbedding} className="btn btn-primary" style={{ width: "100%", padding: "0.75rem", fontWeight: 700, opacity: capturedEmbedding ? 1 : 0.5 }}>
                  Save & Enroll Profile
                </button>
              </form>
            </div>
          </div>
        )}

        {/* ================= TAB 3: HARDWARE WEBAUTHN ================= */}
        {activeTab === "biometrics" && (
          <div style={{ maxWidth: "600px", margin: "0 auto" }}>
            <div className="glass-card" style={{ padding: "2rem", textAlign: "center" }}>
              <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🔐</div>
              <h2 style={{ fontSize: "1.4rem", fontWeight: 800, marginBottom: "0.5rem" }}>Native Device Biometrics (WebAuthn)</h2>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginBottom: "1.5rem" }}>
                Leverage Apple Face ID, Touch ID, Windows Hello, or Android Fingerprint directly built into your device operating system with zero external cost.
              </p>

              <div style={{ marginBottom: "1.5rem", padding: "1rem", background: webAuthnSupported ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)", borderRadius: "8px" }}>
                Status: <strong>{webAuthnSupported ? "✓ Biometric Hardware Available on this Browser" : "❌ Biometric Authenticator Not Detected"}</strong>
              </div>

              {webAuthnSupported && (
                <div style={{ textAlign: "left", display: "flex", flexDirection: "column", gap: "1rem" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.4rem" }}>User Name / ID</label>
                    <input
                      type="text"
                      placeholder="e.g. Admin User"
                      value={webAuthnUser}
                      onChange={(e) => setWebAuthnUser(e.target.value)}
                      style={{ width: "100%", padding: "0.6rem 0.8rem", borderRadius: "6px", background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
                    />
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                    <button onClick={handleWebAuthnRegister} className="btn btn-primary" style={{ padding: "0.75rem" }}>
                      Register Hardware Biometrics
                    </button>
                    <button onClick={handleWebAuthnVerify} className="btn btn-secondary" style={{ padding: "0.75rem" }}>
                      Test 1-Click Biometric Verification
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= TAB 4: DATABASE & SETTINGS ================= */}
        {activeTab === "database" && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h2 style={{ fontSize: "1.2rem", fontWeight: 700 }}>Enrolled Face Database ({enrolledFaces.length})</h2>
              {enrolledFaces.length > 0 && (
                <button onClick={handleClearAll} className="btn btn-danger" style={{ padding: "0.4rem 0.8rem", fontSize: "0.8rem" }}>
                  Clear All Profiles
                </button>
              )}
            </div>

            {enrolledFaces.length === 0 ? (
              <div className="glass-card" style={{ padding: "3rem", textAlign: "center" }}>
                <p style={{ color: "var(--text-secondary)" }}>No profiles enrolled yet. Click "Register New Face" tab to add one.</p>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "1rem" }}>
                {enrolledFaces.map((face) => (
                  <div key={face.id} className="glass-card" style={{ padding: "1rem", position: "relative" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      <img src={face.photoDataUrl} alt={face.name} style={{ width: "50px", height: "50px", borderRadius: "50%", objectFit: "cover", border: "2px solid var(--gold)" }} />
                      <div>
                        <h3 style={{ fontSize: "1rem", fontWeight: 700 }}>{face.name}</h3>
                        <p style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{face.role || "Worker"}</p>
                      </div>
                    </div>

                    <div style={{ marginTop: "0.75rem", paddingTop: "0.5rem", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>{new Date(face.createdAt).toLocaleDateString()}</span>
                      <button onClick={() => handleDeleteFace(face.id, face.name)} style={{ background: "transparent", border: "none", color: "#ef4444", cursor: "pointer", fontSize: "0.8rem" }}>
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
