"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { PitchBallState } from "./formationData";

export interface Ball3DProps {
  ball: PitchBallState;
  onRegisterBallRefs?: (
    rootGroup: THREE.Group | null,
    sphereMesh: THREE.Mesh | null
  ) => void;
}

/**
 * Generates a lightweight procedural football panel texture in memory
 * so no external image assets or network requests are required.
 */
function createFootballTexture(): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;

  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Base white match ball leather
  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Subtle seam grid lines
  ctx.strokeStyle = "#94a3b8";
  ctx.lineWidth = 2;
  for (let x = 32; x < canvas.width; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }

  // Classic dark pentagon/panel patches
  const patches = [
    { cx: 36, cy: 36, r: 16 },
    { cx: 100, cy: 84, r: 16 },
    { cx: 164, cy: 38, r: 16 },
    { cx: 224, cy: 86, r: 16 },
    { cx: 68, cy: 108, r: 12 },
    { cx: 196, cy: 18, r: 12 },
  ];

  for (const patch of patches) {
    ctx.beginPath();
    const sides = 5;
    for (let i = 0; i < sides; i++) {
      const angle = (i * 2 * Math.PI) / sides - Math.PI / 2;
      const px = patch.cx + Math.cos(angle) * patch.r;
      const py = patch.cy + Math.sin(angle) * patch.r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = "#0f172a";
    ctx.fill();
    ctx.strokeStyle = "#334155";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export function Ball3D({ ball, onRegisterBallRefs }: Ball3DProps) {
  const rootGroupRef = useRef<THREE.Group | null>(null);
  const sphereMeshRef = useRef<THREE.Mesh | null>(null);
  const ballTexture = useMemo(() => createFootballTexture(), []);

  useEffect(() => {
    if (onRegisterBallRefs) {
      onRegisterBallRefs(rootGroupRef.current, sphereMeshRef.current);
    }
    return () => {
      if (onRegisterBallRefs) {
        onRegisterBallRefs(null, null);
      }
    };
  }, [onRegisterBallRefs]);

  useEffect(() => {
    return () => {
      ballTexture?.dispose();
    };
  }, [ballTexture]);

  const { x, y, z } = ball.position3D;
  const { x: rx, y: ry, z: rz } = ball.rotation3D;

  return (
    <group ref={rootGroupRef} name={ball.id} position={[x, 0, z]}>
      {/* Ground Contact Shadow Disc under the ball */}
      <mesh position={[0, 0.035, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[ball.radius * 1.15, 20]} />
        <meshBasicMaterial color="#020617" transparent opacity={0.55} />
      </mesh>

      {/* Subtle Tactical Highlight Ring around the ball for high-altitude visibility */}
      <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[ball.radius * 1.3, ball.radius * 2.1, 28]} />
        <meshBasicMaterial
          color="#fef08a"
          transparent
          opacity={0.62}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* 3D Spherical Football Mesh */}
      <mesh ref={sphereMeshRef} position={[0, y, 0]} rotation={[rx, ry, rz]}>
        <sphereGeometry args={[ball.radius, 24, 24]} />
        <meshStandardMaterial
          color="#ffffff"
          map={ballTexture}
          roughness={0.35}
          metalness={0.1}
        />
      </mesh>
    </group>
  );
}
