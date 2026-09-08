"use client";

import React, { useEffect, useRef, useState } from 'react';
import { toast } from 'react-hot-toast';
import {
  loadFaceApiModels,
  extractFaceNeuralDescriptor,
  recognizeFaceNeural,
  listenToEnrolledFaces,
  EnrolledFace,
} from '@/lib/faceIdEngine';

interface FaceIdPunchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVerified: (matchedProfile: EnrolledFace) => Promise<void>;
  targetUserName?: string;
}

export default function FaceIdPunchModal({
  isOpen,
  onClose,
  onVerified,
  targetUserName,
}: FaceIdPunchModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isLoadingModels, setIsLoadingModels] = useState(true);
  const [enrolledFaces, setEnrolledFaces] = useState<EnrolledFace[]>([]);
  const [verificationState, setVerificationState] = useState<'scanning' | 'success' | 'failed'>('scanning');
  const [matchedProfile, setMatchedProfile] = useState<EnrolledFace | null>(null);
  const [confidence, setConfidence] = useState<number>(0);
  const [isProcessingPunch, setIsProcessingPunch] = useState(false);

  // Subscribe to enrolled profiles
  useEffect(() => {
    if (!isOpen) return;
    const unsub = listenToEnrolledFaces((faces) => {
      setEnrolledFaces(faces);
    });
    return () => unsub();
  }, [isOpen]);

  // Load models and start camera when modal opens
  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setVerificationState('scanning');
      setMatchedProfile(null);
      setIsProcessingPunch(false);
      return;
    }

    let isMounted = true;
    const init = async () => {
      setIsLoadingModels(true);
      const ready = await loadFaceApiModels();
      if (isMounted) {
        setIsLoadingModels(!ready);
        if (ready) {
          startCamera();
        } else {
          toast.error("Failed to load neural face models.");
        }
      }
    };

    init();

    return () => {
      isMounted = false;
      stopCamera();
    };
  }, [isOpen]);

  const startCamera = async () => {
    try {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((t) => t.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setIsCameraActive(true);
      }
    } catch (err: any) {
      console.error("Camera access error in Face ID modal:", err);
      toast.error(err?.message || "Could not access camera.");
      setIsCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  };

  // Continuous Neural Recognition Loop
  useEffect(() => {
    if (!isOpen || !isCameraActive || verificationState === 'success' || isProcessingPunch) return;

    let animationId: number;
    let lastScanTime = 0;
    let isBusy = false;

    const scanLoop = async (timestamp: number) => {
      if (videoRef.current && videoRef.current.readyState === 4 && !isBusy) {
        if (timestamp - lastScanTime > 200) {
          lastScanTime = timestamp;
          isBusy = true;

          const extracted = await extractFaceNeuralDescriptor(videoRef.current);

          if (extracted) {
            const res = recognizeFaceNeural(extracted.descriptor, enrolledFaces, 70);

            // Draw overlay landmarks & reticle
            if (canvasRef.current && videoRef.current) {
              const canvas = canvasRef.current;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                const vidW = videoRef.current.videoWidth || 300;
                const vidH = videoRef.current.videoHeight || 300;
                canvas.width = vidW;
                canvas.height = vidH;
                ctx.clearRect(0, 0, vidW, vidH);

                // Landmark mesh
                if (extracted.landmarks) {
                  ctx.fillStyle = res.match ? '#10b981' : '#c9a227';
                  for (const pt of extracted.landmarks) {
                    ctx.beginPath();
                    ctx.arc(pt.x, pt.y, 2, 0, 2 * Math.PI);
                    ctx.fill();
                  }
                }

                // Bounding Box
                if (extracted.boundingBox) {
                  const { x, y, width, height } = extracted.boundingBox;
                  ctx.strokeStyle = res.match ? '#10b981' : '#c9a227';
                  ctx.lineWidth = 3;
                  ctx.strokeRect(x, y, width, height);

                  ctx.fillStyle = res.match ? 'rgba(16, 185, 129, 0.9)' : 'rgba(201, 162, 39, 0.9)';
                  ctx.fillRect(x, Math.max(10, y - 30), width, 26);
                  ctx.fillStyle = '#ffffff';
                  ctx.font = 'bold 12px Inter, sans-serif';
                  ctx.fillText(
                    res.match ? `${res.match.name} (${res.confidenceScore}%)` : `Scanning...`,
                    x + 6,
                    Math.max(26, y - 12)
                  );
                }
              }
            }

            // Target Name Match Check
            if (res.match && res.confidenceScore >= 70) {
              // If targetUserName is provided, ensure matched name aligns or allow general match
              const matchOk = !targetUserName || targetUserName.toLowerCase().includes(res.match.name.toLowerCase()) || res.match.name.toLowerCase().includes(targetUserName.toLowerCase());

              if (matchOk) {
                setVerificationState('success');
                setMatchedProfile(res.match);
                setConfidence(res.confidenceScore);
                setIsProcessingPunch(true);

                toast.success(`Face Recognized! Verified as ${res.match.name} (${res.confidenceScore}% Match)`);

                // Execute Punch In Callback
                setTimeout(async () => {
                  try {
                    await onVerified(res.match!);
                  } catch (e) {
                    console.error("Punch in callback error", e);
                  } finally {
                    stopCamera();
                    onClose();
                  }
                }, 800);
              }
            }
          } else {
            // Clear canvas reticle if no face
            if (canvasRef.current) {
              const ctx = canvasRef.current.getContext('2d');
              if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
            }
          }
          isBusy = false;
        }
      }
      animationId = requestAnimationFrame(scanLoop);
    };

    animationId = requestAnimationFrame(scanLoop);

    return () => {
      if (animationId) cancelAnimationFrame(animationId);
    };
  }, [isOpen, isCameraActive, enrolledFaces, verificationState, isProcessingPunch, targetUserName, onVerified, onClose]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 9999,
        background: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
      }}
    >
      <div
        className="glass-card animate-scale-up"
        style={{
          maxWidth: '460px',
          width: '100%',
          padding: '1.5rem',
          textAlign: 'center',
          position: 'relative',
          border: '1px solid rgba(201, 162, 39, 0.3)',
          boxShadow: '0 0 50px rgba(201, 162, 39, 0.15)',
        }}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '1rem',
            right: '1rem',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '50%',
            color: 'var(--text-secondary)',
            width: '32px',
            height: '32px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          ✕
        </button>

        <h2 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '0.25rem', color: '#fff' }}>
          📷 Face ID Attendance Scanner
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
          Position your face in the camera frame to verify identity and punch in.
        </p>

        {isLoadingModels ? (
          <div style={{ padding: '3rem 1rem' }}>
            <span style={{ fontSize: '2rem', display: 'inline-block' }} className="animate-spin">
              ⏳
            </span>
            <p style={{ marginTop: '0.75rem', fontWeight: 600, color: 'var(--gold)' }}>
              Loading ResNet Neural Models...
            </p>
          </div>
        ) : (
          <div
            style={{
              position: 'relative',
              width: '100%',
              height: '300px',
              background: '#000',
              borderRadius: '12px',
              overflow: 'hidden',
              marginBottom: '1rem',
              border: verificationState === 'success' ? '3px solid #10b981' : '1px solid rgba(255,255,255,0.15)',
            }}
          >
            <video
              ref={videoRef}
              playsInline
              muted
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transform: 'scaleX(-1)',
              }}
            />
            <canvas
              ref={canvasRef}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                transform: 'scaleX(-1)',
              }}
            />

            {verificationState === 'success' && matchedProfile && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'rgba(16, 185, 129, 0.85)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  padding: '1rem',
                }}
              >
                <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>✓</div>
                <h3 style={{ fontSize: '1.4rem', fontWeight: 900 }}>Verified: {matchedProfile.name}</h3>
                <p style={{ fontSize: '0.9rem', opacity: 0.9 }}>{confidence}% Neural Match Confidence</p>
                <p style={{ fontSize: '0.8rem', marginTop: '0.5rem', background: 'rgba(0,0,0,0.2)', padding: '0.3rem 0.8rem', borderRadius: '20px' }}>
                  Punching in attendance...
                </p>
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
          <button onClick={onClose} className="btn btn-secondary" style={{ width: '100%', padding: '0.6rem' }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
