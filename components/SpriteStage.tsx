"use client";

import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import SpriteMesh from "./SpriteMesh";

export default function SpriteStage() {
  return (
    <div className="w-[400px] h-[400px] rounded-xl overflow-hidden bg-bg-card border border-bg-surface shadow-lg">
      <Canvas
        camera={{ position: [0, 0, 4], fov: 40, near: 0.1, far: 10 }}
        gl={{ alpha: false, antialias: true }}
        style={{ width: "100%", height: "100%" }}
        onCreated={({ gl }) => {
          gl.setClearColor(new THREE.Color("#0f0f14"));
        }}
      >
        <SpriteMesh />
      </Canvas>
    </div>
  );
}