export interface AnimationDef {
  row: number;
  frameCount: number;
  fps: number;
}

export interface SpriteConfig {
  /** Total columns in the sprite sheet grid */
  columns: number;
  /** Total rows in the sprite sheet grid */
  rows: number;
  /** Named animations keyed by label */
  animations: Record<string, AnimationDef>;
}

/**
 * Compute the UV offset and repeat for a given animation frame.
 *
 * In Three.js, texture coordinates have (0,0) at bottom-left.
 * Row 0 of the sprite sheet is at the top of the image, so we
 * flip the Y axis to pick the correct row from the bottom.
 */
export function getFrameUV(
  frameIndex: number,
  anim: AnimationDef,
  config: SpriteConfig
): { offsetX: number; offsetY: number; repeatX: number; repeatY: number } {
  const col = frameIndex % config.columns;
  const effectiveRow = anim.row; // row index in the sheet (0 = top)
  const offsetX = col / config.columns;
  // Three.js: offset (0,0) = bottom-left. Flip row.
  const offsetY = 1 - (effectiveRow + 1) / config.rows;
  return {
    offsetX,
    offsetY,
    repeatX: 1 / config.columns,
    repeatY: 1 / config.rows,
  };
}

/**
 * Given the elapsed time and an animation definition, return the
 * current frame index (0-based, loops).
 */
export function getCurrentFrame(
  elapsed: number,
  anim: AnimationDef
): number {
  const frameDuration = 1 / anim.fps;
  const totalDuration = frameDuration * anim.frameCount;
  const wrapped = elapsed % totalDuration;
  return Math.floor(wrapped / frameDuration) % anim.frameCount;
}

/**
 * Default sprite config for a 4x4 sprite sheet.
 */
export const defaultSpriteConfig: SpriteConfig = {
  columns: 4,
  rows: 4,
  animations: {
    idle: { row: 0, frameCount: 4, fps: 4 },
    walk: { row: 1, frameCount: 4, fps: 8 },
    talk: { row: 2, frameCount: 4, fps: 6 },
    reaction: { row: 3, frameCount: 3, fps: 5 },
  },
};