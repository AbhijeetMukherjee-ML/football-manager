"use client";

import { useMemo } from "react";
import { Line } from "@react-three/drei";

// Standard FIFA pitch dimensions in meters (1 unit = 1 meter)
export const PITCH_LENGTH = 105;
export const PITCH_WIDTH = 68;
const HALF_LENGTH = PITCH_LENGTH / 2; // 52.5
const HALF_WIDTH = PITCH_WIDTH / 2; // 34.0

const PENALTY_BOX_DEPTH = 16.5;
const PENALTY_BOX_HALF_WIDTH = 40.32 / 2; // 20.16

const GOAL_AREA_DEPTH = 5.5;
const GOAL_AREA_HALF_WIDTH = 18.32 / 2; // 9.16

const PENALTY_SPOT_DIST = 11; // x = ±41.5
const CENTER_CIRCLE_RADIUS = 9.15;
const CORNER_ARC_RADIUS = 1.0;

const GOAL_WIDTH = 7.32;
const GOAL_HEIGHT = 2.44;
const GOAL_DEPTH = 2.0;

const LINE_Y = 0.03;

type Vec3 = [number, number, number];

function createCirclePoints(
  centerX: number,
  centerZ: number,
  radius: number,
  startAngle: number,
  endAngle: number,
  segments = 48
): Vec3[] {
  const pts: Vec3[] = [];
  for (let i = 0; i <= segments; i++) {
    const theta = startAngle + (i / segments) * (endAngle - startAngle);
    pts.push([
      centerX + Math.cos(theta) * radius,
      LINE_Y,
      centerZ + Math.sin(theta) * radius,
    ]);
  }
  return pts;
}

function GoalFrame({ side }: { side: -1 | 1 }) {
  const goalLineX = side * HALF_LENGTH;
  const backX = side * (HALF_LENGTH + GOAL_DEPTH);
  const halfGoalW = GOAL_WIDTH / 2;
  const postRadius = 0.08;

  const netFramePoints = useMemo<Vec3[]>(
    () => [
      [goalLineX, 0, -halfGoalW],
      [backX, 0, -halfGoalW],
      [backX, 0, halfGoalW],
      [goalLineX, 0, halfGoalW],
    ],
    [goalLineX, backX, halfGoalW]
  );

  const topNetFramePoints = useMemo<Vec3[]>(
    () => [
      [goalLineX, GOAL_HEIGHT, -halfGoalW],
      [backX, GOAL_HEIGHT, -halfGoalW],
      [backX, GOAL_HEIGHT, halfGoalW],
      [goalLineX, GOAL_HEIGHT, halfGoalW],
    ],
    [goalLineX, backX, halfGoalW]
  );

  return (
    <group>
      {/* Left Post */}
      <mesh position={[goalLineX, GOAL_HEIGHT / 2, -halfGoalW]}>
        <cylinderGeometry args={[postRadius, postRadius, GOAL_HEIGHT, 12]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.3} metalness={0.2} />
      </mesh>

      {/* Right Post */}
      <mesh position={[goalLineX, GOAL_HEIGHT / 2, halfGoalW]}>
        <cylinderGeometry args={[postRadius, postRadius, GOAL_HEIGHT, 12]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.3} metalness={0.2} />
      </mesh>

      {/* Crossbar */}
      <mesh
        position={[goalLineX, GOAL_HEIGHT, 0]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <cylinderGeometry args={[postRadius, postRadius, GOAL_WIDTH + 0.16, 12]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.3} metalness={0.2} />
      </mesh>

      {/* Back Support Frame & Lightweight Translucent Netting */}
      <Line points={netFramePoints} color="#cbd5e1" lineWidth={1.5} />
      <Line points={topNetFramePoints} color="#cbd5e1" lineWidth={1.5} />
      <Line
        points={[
          [backX, 0, -halfGoalW],
          [backX, GOAL_HEIGHT, -halfGoalW],
        ]}
        color="#cbd5e1"
        lineWidth={1.5}
      />
      <Line
        points={[
          [backX, 0, halfGoalW],
          [backX, GOAL_HEIGHT, halfGoalW],
        ]}
        color="#cbd5e1"
        lineWidth={1.5}
      />

      {/* Back net plane */}
      <mesh position={[backX, GOAL_HEIGHT / 2, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[GOAL_WIDTH, GOAL_HEIGHT, 8, 4]} />
        <meshBasicMaterial
          color="#e2e8f0"
          wireframe
          transparent
          opacity={0.35}
        />
      </mesh>

      {/* Top net plane */}
      <mesh
        position={[side * (HALF_LENGTH + GOAL_DEPTH / 2), GOAL_HEIGHT, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
      >
        <planeGeometry args={[GOAL_DEPTH, GOAL_WIDTH, 3, 8]} />
        <meshBasicMaterial
          color="#e2e8f0"
          wireframe
          transparent
          opacity={0.3}
        />
      </mesh>
    </group>
  );
}

export function PitchGeometry() {
  const stripeCount = 18;
  const stripeWidth = PITCH_LENGTH / stripeCount;

  const stripes = useMemo(() => {
    return Array.from({ length: stripeCount }, (_, idx) => {
      const x = -HALF_LENGTH + stripeWidth / 2 + idx * stripeWidth;
      const isEven = idx % 2 === 0;
      return {
        x,
        color: isEven ? "#15803d" : "#166534",
      };
    });
  }, [stripeWidth]);

  // Outer boundary rectangle
  const outerBoundary = useMemo<Vec3[]>(
    () => [
      [-HALF_LENGTH, LINE_Y, -HALF_WIDTH],
      [HALF_LENGTH, LINE_Y, -HALF_WIDTH],
      [HALF_LENGTH, LINE_Y, HALF_WIDTH],
      [-HALF_LENGTH, LINE_Y, HALF_WIDTH],
      [-HALF_LENGTH, LINE_Y, -HALF_WIDTH],
    ],
    []
  );

  // Halfway line
  const halfwayLine = useMemo<Vec3[]>(
    () => [
      [0, LINE_Y, -HALF_WIDTH],
      [0, LINE_Y, HALF_WIDTH],
    ],
    []
  );

  // Centre circle
  const centerCircle = useMemo<Vec3[]>(
    () => createCirclePoints(0, 0, CENTER_CIRCLE_RADIUS, 0, Math.PI * 2, 64),
    []
  );

  // Penalty arc angle: cos(theta) = (16.5 - 11) / 9.15 = 5.5 / 9.15
  const arcHalfAngle = Math.acos(5.5 / CENTER_CIRCLE_RADIUS);

  const leftPenaltyArc = useMemo<Vec3[]>(
    () =>
      createCirclePoints(
        -HALF_LENGTH + PENALTY_SPOT_DIST,
        0,
        CENTER_CIRCLE_RADIUS,
        -arcHalfAngle,
        arcHalfAngle,
        32
      ),
    [arcHalfAngle]
  );

  const rightPenaltyArc = useMemo<Vec3[]>(
    () =>
      createCirclePoints(
        HALF_LENGTH - PENALTY_SPOT_DIST,
        0,
        CENTER_CIRCLE_RADIUS,
        Math.PI - arcHalfAngle,
        Math.PI + arcHalfAngle,
        32
      ),
    [arcHalfAngle]
  );

  // Corner arcs
  const cornerArcs = useMemo<Vec3[][]>(
    () => [
      createCirclePoints(
        -HALF_LENGTH,
        -HALF_WIDTH,
        CORNER_ARC_RADIUS,
        0,
        Math.PI / 2,
        12
      ),
      createCirclePoints(
        HALF_LENGTH,
        -HALF_WIDTH,
        CORNER_ARC_RADIUS,
        Math.PI / 2,
        Math.PI,
        12
      ),
      createCirclePoints(
        HALF_LENGTH,
        HALF_WIDTH,
        CORNER_ARC_RADIUS,
        Math.PI,
        (3 * Math.PI) / 2,
        12
      ),
      createCirclePoints(
        -HALF_LENGTH,
        HALF_WIDTH,
        CORNER_ARC_RADIUS,
        (3 * Math.PI) / 2,
        Math.PI * 2,
        12
      ),
    ],
    []
  );

  return (
    <group>
      {/* Stadium Surround / Track Apron */}
      <mesh position={[0, -0.04, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[PITCH_LENGTH + 18, PITCH_WIDTH + 16]} />
        <meshStandardMaterial color="#0b1727" roughness={0.95} />
      </mesh>

      {/* Outer Turf Border */}
      <mesh position={[0, -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[PITCH_LENGTH + 6, PITCH_WIDTH + 6]} />
        <meshStandardMaterial color="#14532d" roughness={0.9} />
      </mesh>

      {/* Alternating Mowed Grass Stripes */}
      {stripes.map((stripe, idx) => (
        <mesh
          key={`grass-stripe-${idx}`}
          position={[stripe.x, 0, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[stripeWidth + 0.02, PITCH_WIDTH]} />
          <meshStandardMaterial color={stripe.color} roughness={0.85} />
        </mesh>
      ))}

      {/* White Pitch Markings */}
      <Line points={outerBoundary} color="#f8fafc" lineWidth={2.2} />
      <Line points={halfwayLine} color="#f8fafc" lineWidth={2.0} />
      <Line points={centerCircle} color="#f8fafc" lineWidth={2.0} />

      {/* Left Penalty Area & 6-Yard Goal Area */}
      <Line
        points={[
          [-HALF_LENGTH, LINE_Y, -PENALTY_BOX_HALF_WIDTH],
          [-HALF_LENGTH + PENALTY_BOX_DEPTH, LINE_Y, -PENALTY_BOX_HALF_WIDTH],
          [-HALF_LENGTH + PENALTY_BOX_DEPTH, LINE_Y, PENALTY_BOX_HALF_WIDTH],
          [-HALF_LENGTH, LINE_Y, PENALTY_BOX_HALF_WIDTH],
        ]}
        color="#f8fafc"
        lineWidth={2.0}
      />
      <Line
        points={[
          [-HALF_LENGTH, LINE_Y, -GOAL_AREA_HALF_WIDTH],
          [-HALF_LENGTH + GOAL_AREA_DEPTH, LINE_Y, -GOAL_AREA_HALF_WIDTH],
          [-HALF_LENGTH + GOAL_AREA_DEPTH, LINE_Y, GOAL_AREA_HALF_WIDTH],
          [-HALF_LENGTH, LINE_Y, GOAL_AREA_HALF_WIDTH],
        ]}
        color="#f8fafc"
        lineWidth={2.0}
      />
      <Line points={leftPenaltyArc} color="#f8fafc" lineWidth={2.0} />

      {/* Right Penalty Area & 6-Yard Goal Area */}
      <Line
        points={[
          [HALF_LENGTH, LINE_Y, -PENALTY_BOX_HALF_WIDTH],
          [HALF_LENGTH - PENALTY_BOX_DEPTH, LINE_Y, -PENALTY_BOX_HALF_WIDTH],
          [HALF_LENGTH - PENALTY_BOX_DEPTH, LINE_Y, PENALTY_BOX_HALF_WIDTH],
          [HALF_LENGTH, LINE_Y, PENALTY_BOX_HALF_WIDTH],
        ]}
        color="#f8fafc"
        lineWidth={2.0}
      />
      <Line
        points={[
          [HALF_LENGTH, LINE_Y, -GOAL_AREA_HALF_WIDTH],
          [HALF_LENGTH - GOAL_AREA_DEPTH, LINE_Y, -GOAL_AREA_HALF_WIDTH],
          [HALF_LENGTH - GOAL_AREA_DEPTH, LINE_Y, GOAL_AREA_HALF_WIDTH],
          [HALF_LENGTH, LINE_Y, GOAL_AREA_HALF_WIDTH],
        ]}
        color="#f8fafc"
        lineWidth={2.0}
      />
      <Line points={rightPenaltyArc} color="#f8fafc" lineWidth={2.0} />

      {/* Corner Arcs */}
      {cornerArcs.map((arcPts, idx) => (
        <Line
          key={`corner-arc-${idx}`}
          points={arcPts}
          color="#f8fafc"
          lineWidth={1.8}
        />
      ))}

      {/* Centre Spot & Both Penalty Spots */}
      {[
        [0, LINE_Y, 0],
        [-HALF_LENGTH + PENALTY_SPOT_DIST, LINE_Y, 0],
        [HALF_LENGTH - PENALTY_SPOT_DIST, LINE_Y, 0],
      ].map(([x, y, z], idx) => (
        <mesh
          key={`pitch-spot-${idx}`}
          position={[x, y, z]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <circleGeometry args={[0.32, 16]} />
          <meshBasicMaterial color="#f8fafc" />
        </mesh>
      ))}

      {/* Corner Flags */}
      {[
        [-HALF_LENGTH, -HALF_WIDTH],
        [HALF_LENGTH, -HALF_WIDTH],
        [HALF_LENGTH, HALF_WIDTH],
        [-HALF_LENGTH, HALF_WIDTH],
      ].map(([cx, cz], idx) => (
        <mesh key={`corner-flag-${idx}`} position={[cx, 0.75, cz]}>
          <cylinderGeometry args={[0.04, 0.04, 1.5, 8]} />
          <meshStandardMaterial color="#fbbf24" />
        </mesh>
      ))}

      {/* Left & Right 3D Goals */}
      <GoalFrame side={-1} />
      <GoalFrame side={1} />
    </group>
  );
}
