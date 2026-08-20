import { useMemo } from "react";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import type { PlacedObject } from "../../lib/walkthrough";

/**
 * The things a household's cover puts on their lot.
 *
 * Two rules run through all of it.
 *
 * **Solid means they have it; ghosted means they do not.** A gap renders
 * translucent and unlit rather than absent, because an empty driveway says
 * nothing while a faint car in it says "you have two vehicles and one of them
 * is not on this policy". That is the entire idea of the tab, and it is why
 * nothing here is decorative — every object exists because a coverage item
 * exists.
 *
 * **Nothing moves.** No spinning, no bobbing. These sit on a property the way
 * objects sit on a property.
 */

/** How a gap looks: present enough to read, plainly not real. */
function ghostMaterial(color: string) {
  return (
    <meshStandardMaterial
      color={color}
      transparent
      opacity={0.26}
      roughness={0.5}
      metalness={0}
      depthWrite={false}
    />
  );
}

function Body({
  held,
  color,
  roughness = 0.45,
  metalness = 0.55,
}: {
  held: boolean;
  color: string;
  roughness?: number;
  metalness?: number;
}) {
  if (!held) return ghostMaterial(color);
  return <meshStandardMaterial color={color} roughness={roughness} metalness={metalness} />;
}

/**
 * A car. Body, cabin, wheels, glass and lights.
 *
 * Deliberately a generic saloon shape rather than an attempt at a specific
 * make — the label carries "2021 Explorer", and a wrong-looking Explorer would
 * be worse than an honest stand-in.
 */
function Vehicle({ held, colour }: { held: boolean; colour: string }) {
  const wheels: [number, number][] = [
    [-0.78, 1.28],
    [0.78, 1.28],
    [-0.78, -1.3],
    [0.78, -1.3],
  ];
  return (
    <group>
      {/* Lower body */}
      <mesh position={[0, 0.62, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.86, 0.62, 4.4]} />
        <Body held={held} color={colour} />
      </mesh>
      {/* Bonnet and boot shoulders */}
      <mesh position={[0, 1.0, 1.42]} castShadow>
        <boxGeometry args={[1.78, 0.22, 1.5]} />
        <Body held={held} color={colour} />
      </mesh>
      <mesh position={[0, 1.0, -1.62]} castShadow>
        <boxGeometry args={[1.78, 0.22, 1.1]} />
        <Body held={held} color={colour} />
      </mesh>
      {/* Cabin */}
      <mesh position={[0, 1.24, -0.1]} castShadow>
        <boxGeometry args={[1.66, 0.66, 2.15]} />
        <Body held={held} color={colour} roughness={0.4} />
      </mesh>
      {/* Glass */}
      <mesh position={[0, 1.26, 0.98]} rotation={[-0.42, 0, 0]}>
        <planeGeometry args={[1.5, 0.78]} />
        {held ? (
          <meshStandardMaterial color="#1d2833" roughness={0.06} metalness={0.9} />
        ) : (
          ghostMaterial("#2a3a49")
        )}
      </mesh>
      {/* Wheels */}
      {wheels.map(([x, z], i) => (
        <mesh key={i} position={[x, 0.34, z]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.34, 0.34, 0.22, 16]} />
          {held ? <meshStandardMaterial color="#15171a" roughness={0.85} /> : ghostMaterial("#15171a")}
        </mesh>
      ))}
      {/* Lights */}
      <mesh position={[0, 0.78, 2.21]}>
        <boxGeometry args={[1.5, 0.16, 0.04]} />
        {held ? (
          <meshStandardMaterial color="#f4f1e6" emissive="#8a8574" emissiveIntensity={0.35} roughness={0.2} />
        ) : (
          ghostMaterial("#f4f1e6")
        )}
      </mesh>
      <mesh position={[0, 0.82, -2.21]}>
        <boxGeometry args={[1.5, 0.14, 0.04]} />
        {held ? <meshStandardMaterial color="#7d1f1c" roughness={0.3} /> : ghostMaterial("#7d1f1c")}
      </mesh>
    </group>
  );
}

/** A boat on a trailer, which is how a boat actually sits on a driveway. */
function Boat({ held }: { held: boolean }) {
  const hull = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.85, 0);
    shape.lineTo(0.85, 0);
    shape.lineTo(0.72, 0.62);
    shape.lineTo(-0.72, 0.62);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 3.9, bevelEnabled: false });
    geo.translate(0, 0, -1.95);
    geo.computeVertexNormals();
    return geo;
  }, []);

  return (
    <group>
      {/* Trailer */}
      <mesh position={[0, 0.34, 0]} castShadow>
        <boxGeometry args={[1.5, 0.14, 4.2]} />
        {held ? <meshStandardMaterial color="#2e3238" roughness={0.7} /> : ghostMaterial("#2e3238")}
      </mesh>
      {[-0.82, 0.82].map((x) => (
        <mesh key={x} position={[x, 0.26, -0.5]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.26, 0.26, 0.16, 14]} />
          {held ? <meshStandardMaterial color="#15171a" roughness={0.85} /> : ghostMaterial("#15171a")}
        </mesh>
      ))}
      {/* Tow bar */}
      <mesh position={[0, 0.36, 2.4]} castShadow>
        <boxGeometry args={[0.1, 0.1, 0.9]} />
        {held ? <meshStandardMaterial color="#2e3238" roughness={0.7} /> : ghostMaterial("#2e3238")}
      </mesh>
      {/* Hull */}
      <mesh geometry={hull} position={[0, 0.52, 0]} castShadow receiveShadow>
        {held ? (
          <meshStandardMaterial color="#e8e4d9" roughness={0.32} metalness={0.1} />
        ) : (
          ghostMaterial("#e8e4d9")
        )}
      </mesh>
      {/* Windscreen */}
      <mesh position={[0, 1.2, -0.35]} rotation={[-0.5, 0, 0]}>
        <planeGeometry args={[1.2, 0.42]} />
        {held ? (
          <meshStandardMaterial color="#20303c" roughness={0.08} metalness={0.85} />
        ) : (
          ghostMaterial("#20303c")
        )}
      </mesh>
      {/* Outboard */}
      <mesh position={[0, 0.72, -2.1]} castShadow>
        <boxGeometry args={[0.34, 0.66, 0.34]} />
        {held ? <meshStandardMaterial color="#1b1e22" roughness={0.5} /> : ghostMaterial("#1b1e22")}
      </mesh>
    </group>
  );
}

/** A motorcycle, small enough that a suggestion of one is enough. */
function Motorcycle({ held }: { held: boolean }) {
  return (
    <group>
      {[0.72, -0.72].map((z) => (
        <mesh key={z} position={[0, 0.32, z]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.32, 0.32, 0.14, 16]} />
          {held ? <meshStandardMaterial color="#15171a" roughness={0.85} /> : ghostMaterial("#15171a")}
        </mesh>
      ))}
      <mesh position={[0, 0.62, 0]} castShadow>
        <boxGeometry args={[0.3, 0.34, 1.2]} />
        {held ? (
          <meshStandardMaterial color="#5d1f22" roughness={0.35} metalness={0.5} />
        ) : (
          ghostMaterial("#5d1f22")
        )}
      </mesh>
      <mesh position={[0, 0.92, -0.2]} castShadow>
        <boxGeometry args={[0.26, 0.16, 0.5]} />
        {held ? <meshStandardMaterial color="#1b1e22" roughness={0.5} /> : ghostMaterial("#1b1e22")}
      </mesh>
      <mesh position={[0, 0.98, 0.62]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.03, 0.03, 0.62, 8]} />
        {held ? <meshStandardMaterial color="#2e3238" metalness={0.7} roughness={0.3} /> : ghostMaterial("#2e3238")}
      </mesh>
    </group>
  );
}

/**
 * The umbrella, over the roof.
 *
 * The clearest object in the whole scene: a translucent canopy floating above
 * an otherwise-covered house says "this is what is missing" without a word of
 * explanation, and a solid one says the household is protected above their
 * underlying limits. Big enough to shelter the building, because that is
 * exactly what the policy does.
 */
function Umbrella({ held }: { held: boolean }) {
  const R = 6.2;
  const skin = held ? "#2c445e" : "#93a9bf";
  return (
    <group>
      {/* Canopy. Solid enough to read as fabric — the first version was so
          faint, with ribs running past its own edge, that it looked like a
          lens flare rather than an umbrella. */}
      <mesh castShadow>
        <coneGeometry args={[R, 2.1, 48, 1, false]} />
        <meshStandardMaterial
          color={skin}
          transparent
          opacity={held ? 0.5 : 0.24}
          roughness={0.55}
          metalness={0}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* The rim is what makes the shape legible: a clean circle at the edge,
          which a cone alone never gives you. */}
      <mesh position={[0, -1.05, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[R, 0.07, 8, 56]} />
        <meshStandardMaterial
          color={held ? "#1d2f42" : "#a8bccf"}
          transparent
          opacity={held ? 0.85 : 0.4}
          depthWrite={false}
        />
      </mesh>

      {/* Shaft, down toward the ridge. */}
      <mesh position={[0, -1.7, 0]}>
        <cylinderGeometry args={[0.07, 0.07, 3.2, 10]} />
        <meshStandardMaterial
          color={held ? "#1d2f42" : "#a8bccf"}
          transparent
          opacity={held ? 0.8 : 0.35}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

/** A person. Not a portrait — a presence, so life cover has somewhere to live. */
function Figure({ held }: { held: boolean }) {
  const skin = held ? "#3d4a57" : "#8496a6";
  return (
    <group>
      <mesh position={[0, 0.52, 0]} castShadow>
        <capsuleGeometry args={[0.17, 0.5, 6, 12]} />
        {held ? <meshStandardMaterial color={skin} roughness={0.8} /> : ghostMaterial(skin)}
      </mesh>
      <mesh position={[0, 1.02, 0]} castShadow>
        <sphereGeometry args={[0.15, 14, 12]} />
        {held ? <meshStandardMaterial color="#5b6470" roughness={0.75} /> : ghostMaterial("#5b6470")}
      </mesh>
      <mesh position={[0, 0.16, 0]} castShadow>
        <capsuleGeometry args={[0.1, 0.28, 6, 10]} />
        {held ? <meshStandardMaterial color="#2f3843" roughness={0.85} /> : ghostMaterial("#2f3843")}
      </mesh>
    </group>
  );
}

/** Vehicle paint, varied per object so two cars are not identical. */
const PAINT = ["#31465c", "#6d2f2c", "#4a4f56", "#2f4a3c", "#6a5a3a", "#3c3f4a"];

interface CoverageObjectsProps {
  placed: PlacedObject[];
  /** Which object is selected in the panel, so the scene can echo it. */
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function CoverageObjects({ placed, selectedId, onSelect }: CoverageObjectsProps) {
  return (
    <group>
      {placed.map((p, i) => {
        const held = p.item.status === "held";
        const active = p.item.id === selectedId;
        const label = p.item.label.trim();

        return (
          <group
            key={p.item.id}
            position={p.position}
            rotation={[0, p.rotation, 0]}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(p.item.id);
            }}
          >
            {p.kind === "vehicle" && <Vehicle held={held} colour={PAINT[i % PAINT.length]} />}
            {p.kind === "boat" && <Boat held={held} />}
            {p.kind === "motorcycle" && <Motorcycle held={held} />}
            {p.kind === "umbrella" && <Umbrella held={held} />}
            {p.kind === "figure" && <Figure held={held} />}

            {label && (
              <Html center position={[0, p.kind === "umbrella" ? 1.9 : 2.0, 0]} zIndexRange={[6, 0]}>
                <button
                  type="button"
                  className={`wt-obj${held ? "" : " is-gap"}${active ? " is-active" : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(p.item.id);
                  }}
                >
                  {label}
                </button>
              </Html>
            )}
          </group>
        );
      })}
    </group>
  );
}
