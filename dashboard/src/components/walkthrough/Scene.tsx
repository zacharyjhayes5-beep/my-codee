import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ContactShadows, Environment, Html, OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import { AREAS, areaById, type AreaId } from "../../lib/walkthrough";
import { HouseModel } from "./HouseModel";

/**
 * The property, and a camera you actually drive.
 *
 * This reverses the original rule that there were no orbit controls. That rule
 * was right when the tab was six composed shots; it is wrong now that the scene
 * is a property with a household's coverage standing on it, because inspecting
 * a thing means going and looking at it from where you want.
 *
 * The waypoints survive as *shortcuts*, not as the only way to move: choosing an
 * area flies you there, and you are free from wherever you land.
 */

/** Seconds to cover the distance. Slow enough to read as deliberate. */
const TRAVEL = 1.15;

/** Ease-in-out. Cinematic means it starts and ends still, not that it is slow. */
function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Flies to a waypoint, then gets out of the way.
 *
 * The controls own the camera the rest of the time, so the tween takes them
 * offline for its duration and hands back cleanly — moving `controls.target`
 * alongside the position, or the camera would arrive pointing at wherever you
 * were last looking.
 */
function CameraRig({
  area,
  reduced,
  controls,
}: {
  area: AreaId;
  reduced: boolean;
  controls: React.RefObject<OrbitControlsImpl | null>;
}) {
  const { camera, invalidate } = useThree();

  const from = useRef(new THREE.Vector3());
  const fromTarget = useRef(new THREE.Vector3());
  const to = useRef(new THREE.Vector3());
  const toTarget = useRef(new THREE.Vector3());
  const elapsed = useRef(Infinity);
  // Skip the flight on first mount: the camera already starts on the waypoint,
  // and a fly-in from nowhere on arrival reads as a loading artefact.
  const mounted = useRef(false);

  useEffect(() => {
    const wp = areaById(area).camera;
    const c = controls.current;

    if (!mounted.current) {
      mounted.current = true;
      if (c) {
        c.target.set(...wp.target);
        c.update();
      }
      return;
    }

    to.current.set(...wp.position);
    toTarget.current.set(...wp.target);

    if (reduced || !c) {
      camera.position.copy(to.current);
      c?.target.copy(toTarget.current);
      c?.update();
      camera.lookAt(toTarget.current);
      elapsed.current = Infinity;
      invalidate();
      return;
    }

    from.current.copy(camera.position);
    fromTarget.current.copy(c.target);
    elapsed.current = 0;
    c.enabled = false;
  }, [area, camera, reduced, controls, invalidate]);

  useFrame((_, delta) => {
    if (elapsed.current === Infinity) return;
    const c = controls.current;

    elapsed.current = Math.min(TRAVEL, elapsed.current + delta);
    const t = easeInOutCubic(elapsed.current / TRAVEL);

    camera.position.lerpVectors(from.current, to.current, t);
    if (c) {
      c.target.lerpVectors(fromTarget.current, toTarget.current, t);
      c.update();
    } else {
      camera.lookAt(toTarget.current);
    }

    if (elapsed.current >= TRAVEL) {
      elapsed.current = Infinity;
      if (c) c.enabled = true;
    }
  });

  return null;
}

/**
 * Ambient life.
 *
 * One key light walking slowly around the property — the only thing in the
 * scene that moves on its own. It carries no information; it exists so the
 * render feels lit rather than rendered. Nothing spins, bobs or pulses.
 */
function DriftingSun({ reduced }: { reduced: boolean }) {
  const light = useRef<THREE.DirectionalLight>(null);
  const t = useRef(0);

  useFrame((_, delta) => {
    if (reduced || !light.current) return;
    // A full circuit takes about three minutes: present when you watch for it,
    // invisible when you are working.
    t.current += delta * 0.035;
    const r = 15;
    light.current.position.set(Math.cos(t.current) * r, 11 + Math.sin(t.current * 0.6) * 2.5, Math.sin(t.current) * r);
  });

  return (
    <directionalLight
      ref={light}
      position={[9, 12, 7]}
      intensity={2.1}
      color="#fff3e2"
      castShadow
      shadow-mapSize={[2048, 2048]}
      shadow-bias={-0.0004}
      shadow-normalBias={0.02}
      shadow-camera-left={-20}
      shadow-camera-right={20}
      shadow-camera-top={20}
      shadow-camera-bottom={-20}
      shadow-camera-far={60}
    />
  );
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
  const controls = useRef<OrbitControlsImpl>(null);
  const start = areaById(area).camera;

  return (
    <Canvas
      // "percentage" is PCFShadowMap. Plain `shadows` defaults to PCFSoft,
      // which three deprecated in 0.185 and warns about on every mount.
      shadows="percentage"
      dpr={[1, 2]}
      camera={{ position: start.position, fov: 38, near: 0.05, far: 300 }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
      // The sun drifts, so there is always something to draw. Under reduced
      // motion nothing moves by itself and frames are rendered on demand.
      frameloop={reduced ? "demand" : "always"}
    >
      <color attach="background" args={["#0e1319"]} />
      <fog attach="fog" args={["#0e1319", 34, 88]} />

      {/* No <SoftShadows>: it patches three's shadow shader chunk and the
          version in three 0.185 no longer exposes `unpackRGBAToDepth` with the
          signature it expects, so every standard material silently fails to
          compile and the scene renders untextured. Softness comes from the
          light's own radius plus the ContactShadows plane below. */}
      <hemisphereLight args={["#8ea6c0", "#1b1f26", 0.5]} />
      <DriftingSun reduced={reduced} />

      <Suspense fallback={null}>
        <HouseModel />
        <ContactShadows position={[0, 0.012, 0]} opacity={0.62} scale={46} blur={2.1} far={11} resolution={1024} />
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

      <OrbitControls
        ref={controls}
        makeDefault
        enableDamping
        dampingFactor={0.06}
        // Close enough to step inside a room, far enough to see the whole lot.
        minDistance={0.6}
        maxDistance={46}
        // Just above the horizon: you can crouch to the foundation line, but
        // never end up underneath the ground looking up at nothing.
        maxPolarAngle={Math.PI * 0.495}
        panSpeed={0.7}
        rotateSpeed={0.55}
        zoomSpeed={0.75}
        target={start.target}
      />

      <CameraRig area={area} reduced={reduced} controls={controls} />
    </Canvas>
  );
}
