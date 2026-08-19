import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Environment, Html } from "@react-three/drei";
import * as THREE from "three";
import { AREAS, areaById, type AreaId } from "../../lib/walkthrough";
import { HouseModel } from "./HouseModel";

/**
 * The camera rig.
 *
 * No orbit controls and no scroll handler by design — the only thing that moves
 * the camera is choosing an area. That is the whole difference between a
 * configurator and a game: the shots are composed in advance, and every one of
 * them is a shot somebody chose.
 *
 * The tween is hand-written rather than pulled from an animation library. It is
 * a critically-damped approach on two vectors, which is all a camera move
 * needs, and it keeps the dependency list to three.js and the renderer.
 */

/** Seconds to cover most of the distance. Slow enough to read as deliberate. */
const TRAVEL = 1.15;

/** Ease-in-out. Cinematic means it starts and ends still, not that it is slow. */
function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function CameraRig({ area, reduced }: { area: AreaId; reduced: boolean }) {
  const { camera } = useThree();

  const from = useRef(new THREE.Vector3());
  const fromTarget = useRef(new THREE.Vector3());
  const to = useRef(new THREE.Vector3());
  const toTarget = useRef(new THREE.Vector3());
  const current = useRef(new THREE.Vector3());
  const elapsed = useRef(Infinity);

  useEffect(() => {
    const wp = areaById(area).camera;
    from.current.copy(camera.position);
    fromTarget.current.copy(current.current);
    to.current.set(...wp.position);
    toTarget.current.set(...wp.target);

    if (reduced) {
      // No travel at all: cut straight to the shot. A camera flying across the
      // screen is exactly what someone asking for reduced motion is avoiding.
      camera.position.copy(to.current);
      current.current.copy(toTarget.current);
      camera.lookAt(current.current);
      elapsed.current = Infinity;
      return;
    }
    elapsed.current = 0;
  }, [area, camera, reduced]);

  useFrame((_, delta) => {
    if (elapsed.current === Infinity) return;
    elapsed.current = Math.min(TRAVEL, elapsed.current + delta);
    const t = easeInOutCubic(elapsed.current / TRAVEL);

    camera.position.lerpVectors(from.current, to.current, t);
    current.current.lerpVectors(fromTarget.current, toTarget.current, t);
    camera.lookAt(current.current);

    if (elapsed.current >= TRAVEL) elapsed.current = Infinity;
  });

  return null;
}

/**
 * A hotspot marker.
 *
 * Small, unlit, and it does not pulse or spin. It reads as an annotation on a
 * drawing rather than a pickup in a game.
 */
function Hotspot({
  id,
  label,
  position,
  active,
  onSelect,
}: {
  id: AreaId;
  label: string;
  position: [number, number, number];
  active: boolean;
  onSelect: (id: AreaId) => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <group position={position}>
      {/* No distanceFactor on purpose. Scaling a control with camera distance
          makes its hit area shrink to a few pixels on the wide shots and its
          label unreadable; a fixed screen size keeps every marker the same
          honest target, and reads as an annotation on a drawing rather than an
          object floating in the world. */}
      <Html center zIndexRange={[8, 0]}>
        <button
          type="button"
          className={`wt-hotspot${active ? " is-active" : ""}${hovered ? " is-hover" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(id);
          }}
          onPointerEnter={() => setHovered(true)}
          onPointerLeave={() => setHovered(false)}
          aria-label={`View ${label}`}
        >
          <span className="wt-hotspot-dot" aria-hidden="true" />
          <span className="wt-hotspot-label">{label}</span>
        </button>
      </Html>
    </group>
  );
}

interface SceneProps {
  area: AreaId;
  onSelect: (id: AreaId) => void;
  /** Hotspots are hidden on the overhead shot, where they would crowd. */
  showHotspots: boolean;
}

export default function Scene({ area, onSelect, showHotspots }: SceneProps) {
  const [reduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  const start = areaById(area).camera;

  return (
    <Canvas
      // "percentage" is PCFShadowMap. Plain `shadows` defaults to PCFSoft,
      // which three deprecated in 0.185 and warns about on every mount.
      shadows="percentage"
      dpr={[1, 2]}
      camera={{ position: start.position, fov: 38, near: 0.1, far: 200 }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
      // Nothing in the scene animates on its own, so frames are rendered only
      // when something actually changes. On a static shot this costs nothing.
      frameloop="demand"
    >
      <color attach="background" args={["#12161c"]} />
      <fog attach="fog" args={["#12161c", 26, 62]} />

      {/* A low key light and a soft fill. One sun, one bounce, nothing else. */}
      <hemisphereLight args={["#93a4b8", "#20242b", 0.55]} />
      <directionalLight
        position={[9, 12, 7]}
        intensity={1.5}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-18}
        shadow-camera-right={18}
        shadow-camera-top={18}
        shadow-camera-bottom={-18}
      />

      <Suspense fallback={null}>
        <HouseModel />
        <ContactShadows position={[0, 0.01, 0]} opacity={0.5} scale={40} blur={2.4} far={9} />
        <Environment preset="city" />
      </Suspense>

      {showHotspots &&
        AREAS.map((a) => (
          <Hotspot
            key={a.id}
            id={a.id}
            label={a.label}
            position={a.hotspot}
            active={a.id === area}
            onSelect={onSelect}
          />
        ))}

      <CameraRig area={area} reduced={reduced} />
      <FrameOnChange area={area} reduced={reduced} />
    </Canvas>
  );
}

/**
 * `frameloop="demand"` renders only on invalidation, so a tween needs to keep
 * asking for frames for as long as it is running.
 */
function FrameOnChange({ area, reduced }: { area: AreaId; reduced: boolean }) {
  const invalidate = useThree((s) => s.invalidate);
  const until = useRef(0);

  useEffect(() => {
    until.current = reduced ? 0 : performance.now() + TRAVEL * 1000 + 120;
    invalidate();
  }, [area, invalidate, reduced]);

  useFrame(() => {
    if (performance.now() < until.current) invalidate();
  });

  return null;
}
