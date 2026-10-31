"use client";

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { PitchPlayerPlacement } from "./formationData";

/**
 * Creates a crisp procedural CanvasTexture for the back-of-shirt number plate.
 */
function createJerseyNumberTexture(
  shirtNumber: number,
  bgColor: string,
  textColor: string
): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;

  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = textColor;
  ctx.font = "900 82px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(String(shirtNumber), canvas.width / 2, canvas.height / 2 + 4);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Creates a crisp billboarded tactical number badge texture so every player's
 * shirt number (and GK indicator) is clearly readable from the tactical camera.
 */
function createOverheadBadgeTexture(
  shirtNumber: number,
  isGoalkeeper: boolean,
  bgHex: string,
  borderHex: string
): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;

  const canvas = document.createElement("canvas");
  canvas.width = 160;
  canvas.height = 160;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const radius = 58;

  // Outer glow / shadow for contrast over grass
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 6, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(2, 6, 23, 0.78)";
  ctx.fill();

  // Main badge disc
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = bgHex;
  ctx.fill();
  ctx.lineWidth = isGoalkeeper ? 9 : 6;
  ctx.strokeStyle = borderHex;
  ctx.stroke();

  // Shirt number text
  ctx.fillStyle = "#ffffff";
  ctx.font = isGoalkeeper
    ? "900 54px ui-monospace, SFMono-Regular, Menlo, monospace"
    : "900 62px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(
    String(shirtNumber),
    cx,
    isGoalkeeper ? cy - 10 : cy + 3
  );

  // Explicit "GK" pill on goalkeeper badges
  if (isGoalkeeper) {
    ctx.fillStyle = borderHex;
    ctx.font = "900 22px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText("GK", cx, cy + 32);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export interface PlayerModel3DProps {
  player: PitchPlayerPlacement;
  onRegisterPlayerGroup?: (
    playerId: string,
    group: THREE.Group | null
  ) => void;
}

/**
 * Stylized procedural 3D football player built entirely with lightweight
 * Three.js primitives. Local +Z is the player's forward facing direction.
 * Movement logic is kept completely external in movementSystem.ts.
 */
export function PlayerModel3D({
  player,
  onRegisterPlayerGroup,
}: PlayerModel3DProps) {
  const groupRef = useRef<THREE.Group | null>(null);
  const { position3D, rotationY, kit, shirtNumber, isGoalkeeper } = player;

  const backNumberTexture = useMemo(
    () =>
      createJerseyNumberTexture(
        shirtNumber,
        kit.shirtPrimary,
        kit.numberText
      ),
    [shirtNumber, kit.shirtPrimary, kit.numberText]
  );

  const badgeTexture = useMemo(
    () =>
      createOverheadBadgeTexture(
        shirtNumber,
        isGoalkeeper,
        kit.badgeBackground,
        kit.badgeBorder
      ),
    [shirtNumber, isGoalkeeper, kit.badgeBackground, kit.badgeBorder]
  );

  useEffect(() => {
    if (onRegisterPlayerGroup) {
      onRegisterPlayerGroup(player.id, groupRef.current);
    }
    return () => {
      if (onRegisterPlayerGroup) {
        onRegisterPlayerGroup(player.id, null);
      }
    };
  }, [player.id, onRegisterPlayerGroup]);

  useEffect(() => {
    return () => {
      backNumberTexture?.dispose();
      badgeTexture?.dispose();
    };
  }, [backNumberTexture, badgeTexture]);

  const armAngleZ = isGoalkeeper ? 0.42 : 0.18;

  return (
    <group
      ref={groupRef}
      name={`player-${player.id}`}
      position={[position3D.x, position3D.y, position3D.z]}
      rotation={[0, rotationY, 0]}
    >
      {/* Ground Contact Shadow */}
      <mesh position={[0, 0.035, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.82, 20]} />
        <meshBasicMaterial color="#020617" transparent opacity={0.48} />
      </mesh>

      {/* Team Tactical Base Ring */}
      <mesh position={[0, 0.045, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.78, 0.98, 24]} />
        <meshBasicMaterial
          color={kit.ringColor}
          side={THREE.DoubleSide}
          transparent
          opacity={0.9}
        />
      </mesh>

      {/* Extra Outer Ring for Goalkeepers so GKs stand out immediately */}
      {isGoalkeeper && (
        <mesh position={[0, 0.048, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.08, 1.22, 24]} />
          <meshBasicMaterial
            color={kit.gloveColor ?? "#fde047"}
            side={THREE.DoubleSide}
          />
        </mesh>
      )}

      {/* Forward Facing Direction Indicator Triangle (points toward +Z in local space) */}
      <mesh position={[0, 0.05, 1.12]} rotation={[-Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.26, 0.42, 3]} />
        <meshBasicMaterial color={kit.badgeBorder} />
      </mesh>

      {/* Left & Right Boots (Oriented toward +Z) */}
      <mesh position={[-0.19, 0.08, 0.06]}>
        <boxGeometry args={[0.16, 0.14, 0.34]} />
        <meshStandardMaterial color="#0f172a" roughness={0.6} />
      </mesh>
      <mesh position={[0.19, 0.08, 0.06]}>
        <boxGeometry args={[0.16, 0.14, 0.34]} />
        <meshStandardMaterial color="#0f172a" roughness={0.6} />
      </mesh>

      {/* Left & Right Socks */}
      <mesh position={[-0.19, 0.32, 0]}>
        <cylinderGeometry args={[0.095, 0.08, 0.38, 10]} />
        <meshStandardMaterial color={kit.socks} roughness={0.65} />
      </mesh>
      <mesh position={[0.19, 0.32, 0]}>
        <cylinderGeometry args={[0.095, 0.08, 0.38, 10]} />
        <meshStandardMaterial color={kit.socks} roughness={0.65} />
      </mesh>

      {/* Left & Right Upper Legs */}
      <mesh position={[-0.19, 0.58, 0]}>
        <cylinderGeometry args={[0.11, 0.095, 0.22, 10]} />
        <meshStandardMaterial color="#d6a57c" roughness={0.7} />
      </mesh>
      <mesh position={[0.19, 0.58, 0]}>
        <cylinderGeometry args={[0.11, 0.095, 0.22, 10]} />
        <meshStandardMaterial color="#d6a57c" roughness={0.7} />
      </mesh>

      {/* Shorts */}
      <mesh position={[0, 0.8, 0]}>
        <boxGeometry args={[0.56, 0.32, 0.36]} />
        <meshStandardMaterial color={kit.shorts} roughness={0.7} />
      </mesh>

      {/* Torso / Jersey */}
      <mesh position={[0, 1.24, 0]}>
        <boxGeometry args={[0.64, 0.62, 0.38]} />
        <meshStandardMaterial color={kit.shirtPrimary} roughness={0.55} />
      </mesh>

      {/* Collar / Chest Trim Accent on Front (+Z face) */}
      <mesh position={[0, 1.48, 0.195]}>
        <boxGeometry args={[0.36, 0.1, 0.03]} />
        <meshStandardMaterial color={kit.shirtTrim} roughness={0.5} />
      </mesh>

      {/* Back-of-Shirt Number Plate (-Z face) */}
      {backNumberTexture && (
        <mesh position={[0, 1.25, -0.196]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[0.44, 0.44]} />
          <meshBasicMaterial map={backNumberTexture} />
        </mesh>
      )}

      {/* Front-of-Shirt Small Number Plate (+Z face) */}
      {backNumberTexture && (
        <mesh position={[0.14, 1.32, 0.196]}>
          <planeGeometry args={[0.22, 0.22]} />
          <meshBasicMaterial map={backNumberTexture} />
        </mesh>
      )}

      {/* Left Arm & Sleeve */}
      <group position={[-0.4, 1.46, 0]} rotation={[0, 0, -armAngleZ]}>
        <mesh position={[0, -0.12, 0]}>
          <cylinderGeometry args={[0.1, 0.09, 0.26, 10]} />
          <meshStandardMaterial color={kit.shirtPrimary} roughness={0.55} />
        </mesh>
        <mesh position={[0, -0.34, 0.03]}>
          <cylinderGeometry args={[0.08, 0.07, 0.26, 10]} />
          <meshStandardMaterial
            color={isGoalkeeper ? kit.shirtPrimary : "#d6a57c"}
            roughness={0.65}
          />
        </mesh>
        {/* Hand or Oversized Goalkeeper Glove */}
        <mesh position={[0, -0.5, 0.05]}>
          <sphereGeometry args={[isGoalkeeper ? 0.145 : 0.08, 10, 10]} />
          <meshStandardMaterial
            color={isGoalkeeper ? (kit.gloveColor ?? "#fde047") : "#d6a57c"}
            roughness={0.4}
          />
        </mesh>
      </group>

      {/* Right Arm & Sleeve */}
      <group position={[0.4, 1.46, 0]} rotation={[0, 0, armAngleZ]}>
        <mesh position={[0, -0.12, 0]}>
          <cylinderGeometry args={[0.1, 0.09, 0.26, 10]} />
          <meshStandardMaterial color={kit.shirtPrimary} roughness={0.55} />
        </mesh>
        <mesh position={[0, -0.34, 0.03]}>
          <cylinderGeometry args={[0.08, 0.07, 0.26, 10]} />
          <meshStandardMaterial
            color={isGoalkeeper ? kit.shirtPrimary : "#d6a57c"}
            roughness={0.65}
          />
        </mesh>
        {/* Hand or Oversized Goalkeeper Glove */}
        <mesh position={[0, -0.5, 0.05]}>
          <sphereGeometry args={[isGoalkeeper ? 0.145 : 0.08, 10, 10]} />
          <meshStandardMaterial
            color={isGoalkeeper ? (kit.gloveColor ?? "#fde047") : "#d6a57c"}
            roughness={0.4}
          />
        </mesh>
      </group>

      {/* Neck & Head */}
      <mesh position={[0, 1.62, 0]}>
        <cylinderGeometry args={[0.09, 0.1, 0.14, 10]} />
        <meshStandardMaterial color="#d6a57c" roughness={0.65} />
      </mesh>
      <mesh position={[0, 1.82, 0]}>
        <sphereGeometry args={[0.21, 14, 14]} />
        <meshStandardMaterial color="#e2b48d" roughness={0.6} />
      </mesh>

      {/* Hair / Goalkeeper Cap (Visor points toward +Z) */}
      <mesh position={[0, 1.9, -0.02]}>
        <sphereGeometry
          args={[0.215, 12, 12, 0, Math.PI * 2, 0, Math.PI * 0.55]}
        />
        <meshStandardMaterial
          color={isGoalkeeper ? kit.shorts : "#1e293b"}
          roughness={0.75}
        />
      </mesh>
      {isGoalkeeper && (
        <mesh position={[0, 1.9, 0.18]} rotation={[0.15, 0, 0]}>
          <boxGeometry args={[0.26, 0.04, 0.18]} />
          <meshStandardMaterial color={kit.shorts} roughness={0.6} />
        </mesh>
      )}

      {/* Overhead Billboarded Shirt Number Badge (Readable from all camera angles) */}
      {badgeTexture && (
        <sprite position={[0, 2.85, 0]} scale={[1.65, 1.65, 1]}>
          <spriteMaterial
            map={badgeTexture}
            transparent
            depthWrite={false}
          />
        </sprite>
      )}
    </group>
  );
}

export interface PlayersLayerProps {
  players: PitchPlayerPlacement[];
  onRegisterPlayerGroup?: (
    playerId: string,
    group: THREE.Group | null
  ) => void;
}

/**
 * Renders all 22 players on the pitch keyed by their stable player ID.
 */
export function PlayersLayer({
  players,
  onRegisterPlayerGroup,
}: PlayersLayerProps) {
  return (
    <group name="pitch-players-layer">
      {players.map((player) => (
        <PlayerModel3D
          key={player.id}
          player={player}
          onRegisterPlayerGroup={onRegisterPlayerGroup}
        />
      ))}
    </group>
  );
}
