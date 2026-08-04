"use client";

import { useRef, useMemo, useEffect, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useAppStore } from "@/store/useAppStore";
import {
  defaultSpriteConfig,
  getFrameUV,
  getCurrentFrame,
  type SpriteConfig,
} from "@/lib/spriteEngine";
import { generateSpriteSheetDataUrl } from "@/lib/spriteSheetGenerator";

export default function SpriteMesh() {
  const meshRef = useRef<THREE.Mesh>(null!);
  const textureRef = useRef<THREE.Texture | null>(null);
  const reactionTimer = useRef<number | null>(null);

  const {
    currentAnimation,
    setCurrentAnimation,
    spritePosition,
    setSpritePosition,
    spriteRotation,
    setSpriteRotation,
  } = useAppStore();

  const config = defaultSpriteConfig;
  const [sheetUrl, setSheetUrl] = useState<string>("");

  // Generate the sprite sheet once
  useEffect(() => {
    setSheetUrl(generateSpriteSheetDataUrl());
  }, []);

  // Load texture
  const texture = useMemo(() => {
    if (!sheetUrl) return null;
    const loader = new THREE.TextureLoader();
    const tex = loader.load(sheetUrl);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    textureRef.current = tex;
    return tex;
  }, [sheetUrl]);

  const anim = config.animations[currentAnimation] ?? config.animations.idle;

  // ── Animation loop — UV offset per frame ──
  useFrame((state) => {
    if (!textureRef.current) return;

    const elapsed = state.clock.elapsedTime;
    const frameIndex = getCurrentFrame(elapsed, anim);
    const uv = getFrameUV(frameIndex, anim, config);

    textureRef.current.offset.x = uv.offsetX;
    textureRef.current.offset.y = uv.offsetY;
    textureRef.current.repeat.x = uv.repeatX;
    textureRef.current.repeat.y = uv.repeatY;

    // Sync mesh position / rotation from store
    if (meshRef.current) {
      meshRef.current.position.x = spritePosition.x;
      meshRef.current.position.y = spritePosition.y;
      meshRef.current.rotation.y = spriteRotation;
    }
  });

  // ── Click → trigger reaction animation ──
  const handleClick = () => {
    if (reactionTimer.current) clearTimeout(reactionTimer.current);
    setCurrentAnimation("reaction");
    reactionTimer.current = window.setTimeout(() => {
      setCurrentAnimation("idle");
      reactionTimer.current = null;
    }, (1 / (config.animations.reaction?.fps ?? 5)) * (config.animations.reaction?.frameCount ?? 3) * 1000 + 100);
  };

  // ── Drag to move ──
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  const handlePointerDown = (e: any) => {
    if (e.button === 2) return; // right-click reserved
    dragStart.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: any) => {
    if (!dragStart.current) return;
    const dx = (e.movementX / window.innerWidth) * 6;
    const dy = -(e.movementY / window.innerHeight) * 6;
    const pos = useAppStore.getState().spritePosition;
    setSpritePosition({
      x: Math.max(-2, Math.min(2, pos.x + dx)),
      y: Math.max(-2, Math.min(2, pos.y + dy)),
    });
  };

  const handlePointerUp = () => {
    dragStart.current = null;
  };

  // ── Right-click drag to rotate ──
  const isRotating = useRef(false);

  const handlePointerDownRight = (e: any) => {
    if (e.button !== 2) return;
    isRotating.current = true;
  };

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isRotating.current) return;
      const current = useAppStore.getState().spriteRotation;
      setSpriteRotation(current - e.movementX * 0.02);
    };
    const onMouseUp = () => {
      isRotating.current = false;
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [setSpriteRotation]);

  if (!texture) return null;

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 5, 5]} intensity={1.2} />
      <directionalLight position={[-3, 2, -2]} intensity={0.4} color="#7c5cfc" />

      {/* Ground plane hint */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.35, 0]}>
        <planeGeometry args={[6, 4]} />
        <meshStandardMaterial
          color="#1a1a24"
          transparent
          opacity={0.4}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Sprite */}
      <mesh
        ref={meshRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onClick={handleClick}
        onContextMenu={(e) => {
          e.stopPropagation();
          isRotating.current = true;
        }}
      >
        <planeGeometry args={[2.4, 2.4]} />
        <meshStandardMaterial
          map={texture}
          transparent
          side={THREE.DoubleSide}
          alphaTest={0.1}
        />
      </mesh>
    </>
  );
}