/**
 * Generates a simple pixel-art character sprite sheet as a data URL.
 * The sheet is 4 columns x 4 rows of 64x64 frames = 256x256 total.
 *
 * Row 0: idle (subtle breathing)
 * Row 1: walk (leg movement)
 * Row 2: talk (mouth bob)
 * Row 3: reaction (arms up)
 */
export function generateSpriteSheetDataUrl(): string {
  const cols = 4;
  const rows = 4;
  const fw = 64;
  const fh = 64;
  const canvas = document.createElement("canvas");
  canvas.width = fw * cols;
  canvas.height = fh * rows;
  const ctx = canvas.getContext("2d")!;

  const bodyColor = "#4A90D9";
  const headColor = "#FFD700";
  const limbColor = "#2C5F8A";
  const eyeColor = "#1a1a2e";
  const shadowColor = "rgba(0,0,0,0.15)";

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const ox = col * fw;
      const oy = row * fh;

      // Clear
      ctx.clearRect(ox, oy, fw, fh);

      const cx = ox + fw / 2; // center x
      const headY = oy + 18;

      // ---- Shadow ----
      ctx.fillStyle = shadowColor;
      ctx.beginPath();
      ctx.ellipse(cx, oy + 52, 14, 4, 0, 0, Math.PI * 2);
      ctx.fill();

      // ---- Legs ----
      ctx.fillStyle = limbColor;

      // Walk animation (row 1): legs alternate
      if (row === 1) {
        const legSwing = Math.sin((col / cols) * Math.PI * 2) * 6;
        // Left leg
        ctx.save();
        ctx.translate(cx - 5, oy + 36);
        ctx.rotate((-legSwing * Math.PI) / 180);
        ctx.fillRect(-3, 0, 5, 14);
        ctx.restore();
        // Right leg
        ctx.save();
        ctx.translate(cx + 5, oy + 36);
        ctx.rotate((legSwing * Math.PI) / 180);
        ctx.fillRect(-2, 0, 5, 14);
        ctx.restore();
      } else {
        // Standing legs
        ctx.fillRect(cx - 6, oy + 36, 5, 14);
        ctx.fillRect(cx + 1, oy + 36, 5, 14);
      }

      // ---- Body ----
      ctx.fillStyle = bodyColor;
      // Torso
      const bodyBob = row === 0 ? Math.sin((col / cols) * Math.PI * 2) * 1.5 : 0;
      ctx.fillRect(cx - 9, oy + 20 + bodyBob, 18, 18);

      // Belt
      ctx.fillStyle = "#3a7bc8";
      ctx.fillRect(cx - 9, oy + 37 + bodyBob, 18, 3);

      // ---- Arms ----
      ctx.fillStyle = limbColor;
      if (row === 3) {
        // Reaction: arms up
        ctx.fillRect(cx - 16, oy + 12 + bodyBob, 6, 14);
        ctx.fillRect(cx + 10, oy + 12 + bodyBob, 6, 14);
      } else if (row === 1) {
        // Walk: arms swing opposite legs
        const armSwing = Math.sin((col / cols) * Math.PI * 2) * 4;
        ctx.save();
        ctx.translate(cx - 12, oy + 24);
        ctx.rotate((-armSwing * Math.PI) / 180);
        ctx.fillRect(-2, 0, 5, 12);
        ctx.restore();
        ctx.save();
        ctx.translate(cx + 12, oy + 24);
        ctx.rotate((armSwing * Math.PI) / 180);
        ctx.fillRect(-3, 0, 5, 12);
        ctx.restore();
      } else {
        // Resting arms
        ctx.fillRect(cx - 14, oy + 23 + bodyBob, 5, 12);
        ctx.fillRect(cx + 9, oy + 23 + bodyBob, 5, 12);
      }

      // ---- Head ----
      ctx.fillStyle = headColor;
      ctx.beginPath();
      ctx.arc(cx, headY + bodyBob, 10, 0, Math.PI * 2);
      ctx.fill();

      // Hat / hair
      ctx.fillStyle = "#e6b800";
      ctx.fillRect(cx - 9, headY - 8 + bodyBob, 18, 5);

      // ---- Eyes ----
      ctx.fillStyle = eyeColor;
      // Idle (row 0) and reaction (row 3): open eyes
      if (row === 0 || row === 3) {
        ctx.fillRect(cx - 5, headY - 1 + bodyBob, 3, 3);
        ctx.fillRect(cx + 2, headY - 1 + bodyBob, 3, 3);
      }
      // Walk (row 1): determined eyes
      else if (row === 1) {
        ctx.fillRect(cx - 5, headY - 1 + bodyBob, 3, 4);
        ctx.fillRect(cx + 2, headY - 1 + bodyBob, 3, 4);
      }
      // Talk (row 2): variable mouth
      else {
        ctx.fillRect(cx - 5, headY - 1 + bodyBob, 3, 3);
        ctx.fillRect(cx + 2, headY - 1 + bodyBob, 3, 3);
      }

      // ---- Mouth ----
      if (row === 2) {
        // Talk: mouth opens wider per frame
        const mouthW = 3 + col * 1.5;
        ctx.fillStyle = "#333";
        ctx.fillRect(cx - mouthW / 2, headY + 5 + bodyBob, mouthW, 2 + col * 0.5);
      } else if (row === 3) {
        // Reaction: big smile
        ctx.strokeStyle = "#333";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, headY + 4 + bodyBob, 4, 0.1, Math.PI - 0.1);
        ctx.stroke();
      } else {
        // Small smile
        ctx.strokeStyle = "#333";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(cx, headY + 4 + bodyBob, 3, 0.2, Math.PI - 0.2);
        ctx.stroke();
      }

      // ---- Accent / shoulder pads ----
      ctx.fillStyle = "#6a4ae8";
      ctx.fillRect(cx - 11, oy + 20 + bodyBob, 3, 5);
      ctx.fillRect(cx + 8, oy + 20 + bodyBob, 3, 5);
    }
  }

  return canvas.toDataURL("image/png");
}