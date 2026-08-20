import { useMemo } from "react";
import * as THREE from "three";
import {
  asphaltTexture,
  grassTexture,
  shingleTexture,
  sidingTexture,
  stoneTexture,
} from "./textures";

/**
 * The house.
 *
 * Still procedural, and still the only file that knows what the building looks
 * like. Nothing here is referenced by the camera, the waypoints, the hotspots
 * or the panels — swapping this for a real model is one component replacement:
 *
 *   const { scene } = useGLTF("/house.glb");
 *   return <primitive object={scene} />;
 *
 * Keep the footprint and the waypoints in `lib/walkthrough.ts` still frame
 * correctly. Ridge at y≈5, eaves at y≈3.1, garage left, driveway front-left,
 * ground plane at y=0, basement mass below it.
 *
 * On realism: geometry is the ceiling, not materials. What lifts a procedural
 * massing like this is edge definition and grounding — trim that catches light,
 * a lintel over every opening, a plinth where the wall meets the earth — so the
 * detail here is spent on those rather than on more boxes.
 */

/** Warm, physical, and nothing that fights the dashboard's palette. */
const MATERIALS = {
  wall: { color: "#c9c1b2", roughness: 0.88, metalness: 0 },
  trim: { color: "#efeae0", roughness: 0.6, metalness: 0 },
  roof: { color: "#23272e", roughness: 0.72, metalness: 0.04 },
  door: { color: "#6f4326", roughness: 0.45, metalness: 0 },
  ground: { color: "#39402f", roughness: 1, metalness: 0 },
  drive: { color: "#4a4a4c", roughness: 0.94, metalness: 0 },
  stone: { color: "#8a8378", roughness: 0.95, metalness: 0 },
} as const;

type MatKey = keyof typeof MATERIALS;

function Box({
  args,
  position,
  rotation,
  m,
}: {
  args: [number, number, number];
  position: [number, number, number];
  rotation?: [number, number, number];
  m: MatKey;
}) {
  return (
    <mesh position={position} rotation={rotation} castShadow receiveShadow>
      <boxGeometry args={args} />
      <meshStandardMaterial {...MATERIALS[m]} />
    </mesh>
  );
}

/** A gable, built as a triangular prism so the ridge is real geometry. */
function Gable({
  width,
  depth,
  height,
  position,
  m = "roof",
  tex,
}: {
  width: number;
  depth: number;
  height: number;
  position: [number, number, number];
  m?: MatKey;
  tex?: { map: THREE.Texture; bumpMap: THREE.Texture };
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
      {tex ? (
        <meshStandardMaterial
          map={tex.map}
          bumpMap={tex.bumpMap}
          bumpScale={0.05}
          roughness={0.86}
          metalness={0}
        />
      ) : (
        <meshStandardMaterial {...MATERIALS[m]} />
      )}
    </mesh>
  );
}

/**
 * A window: recessed glass with a frame and a sill.
 *
 * The recess is what matters. A flat plane on a wall reads as a decal; pushing
 * the glass back a few centimetres gives it a shadow line and it becomes an
 * opening.
 */
function Window({
  position,
  w = 0.9,
  h = 1.25,
  rotation,
}: {
  position: [number, number, number];
  w?: number;
  h?: number;
  rotation?: [number, number, number];
}) {
  return (
    <group position={position} rotation={rotation}>
      {/* Reveal — the dark inset the glass sits in */}
      <mesh position={[0, 0, -0.07]} castShadow receiveShadow>
        <boxGeometry args={[w, h, 0.14]} />
        <meshStandardMaterial color="#20242a" roughness={0.9} />
      </mesh>
      {/* Glass */}
      <mesh position={[0, 0, -0.02]}>
        <planeGeometry args={[w - 0.12, h - 0.12]} />
        <meshStandardMaterial
          color="#2b3a49"
          roughness={0.08}
          metalness={0.85}
          envMapIntensity={1.6}
        />
      </mesh>
      {/* Frame — four bars around the opening, not a panel over it. A filled
          box here covers the glass and every window reads as a white rectangle. */}
      <Box args={[w + 0.1, 0.07, 0.06]} position={[0, h / 2 - 0.02, 0.01]} m="trim" />
      <Box args={[w + 0.1, 0.07, 0.06]} position={[0, -h / 2 + 0.02, 0.01]} m="trim" />
      <Box args={[0.07, h, 0.06]} position={[-w / 2 + 0.02, 0, 0.01]} m="trim" />
      <Box args={[0.07, h, 0.06]} position={[w / 2 - 0.02, 0, 0.01]} m="trim" />
      {/* Muntin — one vertical bar so the pane reads as a window, not a hole */}
      <Box args={[0.035, h - 0.14, 0.04]} position={[0, 0, 0.005]} m="trim" />
      {/* Sill, and a lintel above — the two edges that catch the sun */}
      <Box args={[w + 0.26, 0.07, 0.16]} position={[0, -h / 2 - 0.05, 0.06]} m="trim" />
      <Box args={[w + 0.26, 0.09, 0.14]} position={[0, h / 2 + 0.06, 0.05]} m="trim" />
    </group>
  );
}

/** A box wearing one of the drawn surfaces. */
function Clad({
  args,
  position,
  rotation,
  tex,
  color = "#ffffff",
  roughness = 0.9,
  bumpScale = 0.03,
}: {
  args: [number, number, number];
  position: [number, number, number];
  rotation?: [number, number, number];
  tex: { map: THREE.Texture; bumpMap: THREE.Texture };
  color?: string;
  roughness?: number;
  bumpScale?: number;
}) {
  return (
    <mesh position={position} rotation={rotation} castShadow receiveShadow>
      <boxGeometry args={args} />
      <meshStandardMaterial
        map={tex.map}
        bumpMap={tex.bumpMap}
        bumpScale={bumpScale}
        color={color}
        roughness={roughness}
        metalness={0}
      />
    </mesh>
  );
}

/** A shrub: a couple of squashed spheres, which is all a shrub needs to be. */
function Shrub({ position, s = 1 }: { position: [number, number, number]; s?: number }) {
  return (
    <group position={position} scale={s}>
      <mesh position={[0, 0.34, 0]} castShadow receiveShadow>
        <sphereGeometry args={[0.42, 12, 10]} />
        <meshStandardMaterial color="#3d5230" roughness={1} />
      </mesh>
      <mesh position={[0.22, 0.22, 0.14]} castShadow receiveShadow>
        <sphereGeometry args={[0.28, 10, 8]} />
        <meshStandardMaterial color="#445c35" roughness={1} />
      </mesh>
    </group>
  );
}

/** A tree, kept simple and set back — entourage, not the subject. */
function Tree({ position, h = 4.2 }: { position: [number, number, number]; h?: number }) {
  return (
    <group position={position}>
      <mesh position={[0, h * 0.32, 0]} castShadow>
        <cylinderGeometry args={[0.13, 0.2, h * 0.64, 8]} />
        <meshStandardMaterial color="#4a3a2c" roughness={1} />
      </mesh>
      <mesh position={[0, h * 0.78, 0]} castShadow>
        <sphereGeometry args={[h * 0.36, 14, 12]} />
        <meshStandardMaterial color="#3a5130" roughness={1} />
      </mesh>
      <mesh position={[h * 0.16, h * 0.6, h * 0.1]} castShadow>
        <sphereGeometry args={[h * 0.24, 12, 10]} />
        <meshStandardMaterial color="#425a35" roughness={1} />
      </mesh>
    </group>
  );
}

export function HouseModel() {
  const siding = sidingTexture();
  const shingle = shingleTexture();
  const stone = stoneTexture();
  const grass = grassTexture();
  const asphalt = asphaltTexture();

  return (
    <group>
      {/* Ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial map={grass.map} bumpMap={grass.bumpMap} bumpScale={0.06} roughness={1} />
      </mesh>

      {/* Driveway — where the vehicles will stand. Runs from the road up to
          the garage, so the bays have somewhere to sit. */}
      <Clad args={[6.2, 0.06, 15]} position={[-4.1, 0.03, 9.4]} tex={asphalt} roughness={0.96} bumpScale={0.02} />

      {/* Basement mass, below grade */}
      <Clad args={[8, 2.2, 7]} position={[0, -1.1, 0]} tex={stone} />

      {/* Plinth: the wall does not meet the earth directly, it sits on stone */}
      <Clad args={[8.3, 0.42, 7.3]} position={[0, 0.21, 0]} tex={stone} bumpScale={0.05} />

      {/* Main dwelling */}
      <Clad args={[8, 3.1, 7]} position={[0, 1.97, 0]} tex={siding} bumpScale={0.045} roughness={0.92} />
      {/* Eaves overhang, which is what casts the shadow line under the roof */}
      <Box args={[8.7, 0.16, 7.7]} position={[0, 3.58, 0]} m="trim" />
      <Gable width={8.6} depth={7.6} height={1.9} position={[0, 3.66, 0]} tex={shingle} />

      {/* Front elevation */}
      <group position={[0, 0, 3.51]}>
        {/* Door, recessed, with a surround and a threshold */}
        <mesh position={[0, 1.45, -0.06]} castShadow receiveShadow>
          <boxGeometry args={[1.16, 2.36, 0.12]} />
          <meshStandardMaterial color="#22262b" roughness={0.9} />
        </mesh>
        <Box args={[0.96, 2.2, 0.09]} position={[0, 1.42, 0]} m="door" />
        <Box args={[1.3, 0.1, 0.2]} position={[0, 2.6, 0.04]} m="trim" />
        <Box args={[1.6, 0.14, 0.9]} position={[0, 0.4, 0.42]} m="stone" />
      </group>

      <Window position={[-2.4, 2.15, 3.52]} />
      <Window position={[2.4, 2.15, 3.52]} />
      <Window position={[-1.25, 2.15, 3.52]} w={0.62} h={0.95} />
      <Window position={[1.25, 2.15, 3.52]} w={0.62} h={0.95} />

      {/* Side elevation, so the building reads from more than one angle */}
      <Window position={[4.01, 2.2, -1.2]} rotation={[0, Math.PI / 2, 0]} />
      <Window position={[4.01, 2.2, 1.2]} rotation={[0, Math.PI / 2, 0]} />
      <Window position={[-4.01, 2.2, -1.6]} rotation={[0, -Math.PI / 2, 0]} />

      {/* Chimney, with a cap */}
      <Clad args={[0.78, 2.6, 0.78]} position={[2.5, 4.2, -1.4]} tex={stone} bumpScale={0.05} />
      <Box args={[0.96, 0.12, 0.96]} position={[2.5, 5.56, -1.4]} m="trim" />

      {/* Garage, attached left and set forward */}
      <Clad args={[4.4, 2.6, 5.4]} position={[-4.1, 1.72, 0.6]} tex={siding} bumpScale={0.045} roughness={0.92} />
      <Box args={[4.7, 0.14, 5.7]} position={[-4.1, 3.06, 0.6]} m="trim" />
      <Gable width={4.7} depth={5.7} height={1.2} position={[-4.1, 3.13, 0.6]} tex={shingle} />
      {/* The door: recess, panel, and a header above it */}
      <mesh position={[-4.1, 1.42, 3.28]} castShadow receiveShadow>
        <boxGeometry args={[3.5, 2.2, 0.14]} />
        <meshStandardMaterial color="#22262b" roughness={0.9} />
      </mesh>
      <Box args={[3.32, 2.02, 0.1]} position={[-4.1, 1.42, 3.36]} m="trim" />
      <Box args={[3.8, 0.16, 0.24]} position={[-4.1, 2.6, 3.36]} m="trim" />

      {/* Shed on the grounds */}
      <Clad args={[2.2, 1.9, 2.2]} position={[6.6, 1.16, -3.4]} tex={siding} bumpScale={0.04} roughness={0.92} />
      <Box args={[2.5, 0.1, 2.5]} position={[6.6, 2.16, -3.4]} m="trim" />
      <Gable width={2.5} depth={2.5} height={0.72} position={[6.6, 2.21, -3.4]} tex={shingle} />
      <Box args={[2.4, 0.22, 2.4]} position={[6.6, 0.11, -3.4]} m="stone" />

      {/* Planting. Foundation shrubs give the wall a base and a sense of
          scale; the trees sit well back so they frame the lot without
          crowding the building or the driveway. */}
      <Shrub position={[1.5, 0.42, 3.9]} s={0.9} />
      <Shrub position={[2.6, 0.42, 3.95]} s={1.05} />
      <Shrub position={[3.5, 0.42, 3.8]} s={0.8} />
      <Shrub position={[-1.4, 0.42, 3.95]} s={0.95} />
      <Shrub position={[8.4, 0.42, 1.2]} s={1.1} />
      <Tree position={[11.5, 0, -2.5]} h={5.4} />
      <Tree position={[-11.5, 0, -4.5]} h={4.6} />
      <Tree position={[13.5, 0, 8]} h={4.9} />
      <Tree position={[-13, 0, 14]} h={5.1} />

      {/* Path to the front door */}
      <Box args={[1.5, 0.05, 3.4]} position={[0, 0.03, 5.6]} m="stone" />
    </group>
  );
}
