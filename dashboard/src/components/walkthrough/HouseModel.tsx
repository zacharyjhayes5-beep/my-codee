import { useMemo } from "react";
import * as THREE from "three";

/**
 * The house.
 *
 * Deliberately primitive geometry, and deliberately the only file that knows
 * what the building looks like. Nothing here is referenced by the camera, the
 * waypoints, the hotspots or the panels — swapping this for a real model is
 * one component replacement:
 *
 *   const { scene } = useGLTF("/house.glb");
 *   return <primitive object={scene} />;
 *
 * Keep the same footprint and the waypoints in `lib/walkthrough.ts` still
 * frame correctly. Ridge sits at y≈5, eaves at y≈3.1, garage to the left,
 * ground plane at y=0, basement mass below it.
 */

/** Muted, physical, no colour that would fight the dashboard's palette. */
const MATERIALS = {
  wall: { color: "#cfc8ba", roughness: 0.82, metalness: 0.02 },
  trim: { color: "#e8e3d8", roughness: 0.7, metalness: 0 },
  roof: { color: "#2a2f38", roughness: 0.62, metalness: 0.06 },
  glass: { color: "#7d8894", roughness: 0.18, metalness: 0.5 },
  door: { color: "#7a4a2b", roughness: 0.6, metalness: 0 },
  ground: { color: "#3a3a36", roughness: 1, metalness: 0 },
  stone: { color: "#8d8579", roughness: 0.9, metalness: 0 },
} as const;

function Box({
  args,
  position,
  rotation,
  m,
}: {
  args: [number, number, number];
  position: [number, number, number];
  rotation?: [number, number, number];
  m: keyof typeof MATERIALS;
}) {
  return (
    <mesh position={position} rotation={rotation} castShadow receiveShadow>
      <boxGeometry args={args} />
      <meshStandardMaterial {...MATERIALS[m]} />
    </mesh>
  );
}

/** A simple gable, built from a triangular prism so the ridge is real geometry. */
function Gable({
  width,
  depth,
  height,
  position,
}: {
  width: number;
  depth: number;
  height: number;
  position: [number, number, number];
}) {
  const geometry = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-width / 2, 0);
    shape.lineTo(width / 2, 0);
    shape.lineTo(0, height);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    geo.translate(0, 0, -depth / 2);
    geo.computeVertexNormals();
    return geo;
  }, [width, depth, height]);

  return (
    <mesh geometry={geometry} position={position} castShadow receiveShadow>
      <meshStandardMaterial {...MATERIALS.roof} />
    </mesh>
  );
}

function Window({ position, w = 0.8, h = 1.1 }: { position: [number, number, number]; w?: number; h?: number }) {
  return (
    <mesh position={position}>
      <planeGeometry args={[w, h]} />
      <meshStandardMaterial {...MATERIALS.glass} />
    </mesh>
  );
}

export function HouseModel() {
  return (
    <group>
      {/* Ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial {...MATERIALS.ground} />
      </mesh>

      {/* The basement mass, below grade. Visible from the basement waypoint. */}
      <Box args={[8, 2.2, 7]} position={[0, -1.1, 0]} m="stone" />

      {/* Main dwelling */}
      <Box args={[8, 3.1, 7]} position={[0, 1.55, 0]} m="wall" />
      <Gable width={8.4} depth={7.2} height={1.9} position={[0, 3.1, 0]} />

      {/* Front face: door and windows */}
      <Box args={[0.9, 2, 0.1]} position={[0, 1, 3.51]} m="door" />
      <Window position={[-2.2, 1.8, 3.52]} />
      <Window position={[2.2, 1.8, 3.52]} />
      <Window position={[-1.1, 1.8, 3.52]} w={0.6} h={0.9} />
      <Window position={[1.1, 1.8, 3.52]} w={0.6} h={0.9} />

      {/* Chimney */}
      <Box args={[0.7, 2.2, 0.7]} position={[2.5, 4, -1.4]} m="stone" />

      {/* Garage, attached to the left and set slightly forward */}
      <Box args={[4.4, 2.6, 5.4]} position={[-4.1, 1.3, 0.6]} m="wall" />
      <Gable width={4.6} depth={5.6} height={1.2} position={[-4.1, 2.6, 0.6]} />
      <Box args={[3.4, 2, 0.12]} position={[-4.1, 1, 3.31]} m="trim" />

      {/* A shed, so the grounds waypoint has something to look at */}
      <Box args={[2.2, 1.8, 2.2]} position={[6.4, 0.9, -3.4]} m="wall" />
      <Gable width={2.4} depth={2.4} height={0.7} position={[6.4, 1.8, -3.4]} />

      {/* A path, purely to give the establishing shot some ground detail */}
      <Box args={[1.6, 0.04, 5]} position={[0, 0.02, 6.4]} m="trim" />
    </group>
  );
}
