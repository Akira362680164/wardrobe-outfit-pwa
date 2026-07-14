"use client";

export async function createTenByTenGridDataUrl(imageDataUrl: string): Promise<string> {
  const image = await loadImage(imageDataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法创建图片网格");
  context.drawImage(image, 0, 0);
  context.strokeStyle = "rgba(255, 64, 64, .82)";
  context.fillStyle = "rgba(255,255,255,.92)";
  context.lineWidth = Math.max(1, Math.round(Math.min(canvas.width, canvas.height) / 500));
  context.font = `bold ${Math.max(12, Math.round(Math.min(canvas.width, canvas.height) / 35))}px sans-serif`;
  for (let index = 0; index <= 10; index += 1) {
    const x = (canvas.width * index) / 10;
    const y = (canvas.height * index) / 10;
    context.beginPath(); context.moveTo(x, 0); context.lineTo(x, canvas.height); context.stroke();
    context.beginPath(); context.moveTo(0, y); context.lineTo(canvas.width, y); context.stroke();
    if (index < 10) { context.fillText(String(index), x + 3, Math.max(16, y + 20)); }
  }
  return canvas.toDataURL("image/jpeg", 0.94);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = src; });
}
