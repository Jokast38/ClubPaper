// Simple color extraction using canvas pixel sampling + k-means-like clustering
export async function extractColorsFromImage(dataUrl, k = 3) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, 100 / Math.max(img.width, img.height));
        canvas.width = Math.max(1, Math.floor(img.width * scale));
        canvas.height = Math.max(1, Math.floor(img.height * scale));
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const pixels = [];
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i+1], b = data[i+2], a = data[i+3];
          if (a < 200) continue;
          // Skip near-white / near-black / gray
          const max = Math.max(r,g,b), min = Math.min(r,g,b);
          if (max > 245 && min > 245) continue;
          if (max < 25) continue;
          if (max - min < 15) continue;
          pixels.push([r,g,b]);
        }
        if (pixels.length < 5) {
          // Fallback if logo is mostly monochrome
          const allPixels = [];
          for (let i = 0; i < data.length; i += 4) {
            if (data[i+3] < 200) continue;
            allPixels.push([data[i], data[i+1], data[i+2]]);
          }
          if (allPixels.length === 0) return resolve(defaultTheme());
          const avg = averageColor(allPixels);
          return resolve({
            primary: rgbToHex(avg),
            secondary: "#0F172A",
            accent: "#FACC15",
          });
        }
        const clusters = kmeans(pixels, k, 8);
        clusters.sort((a, b) => b.count - a.count);
        const [c1, c2, c3] = clusters;
        resolve({
          primary: rgbToHex(c1.center),
          secondary: c2 ? rgbToHex(c2.center) : "#0F172A",
          accent: c3 ? rgbToHex(c3.center) : "#FACC15",
        });
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

function defaultTheme() {
  return { primary: "#EA580C", secondary: "#0F172A", accent: "#FACC15" };
}

function averageColor(pixels) {
  const s = pixels.reduce((a,p) => [a[0]+p[0], a[1]+p[1], a[2]+p[2]], [0,0,0]);
  return [s[0]/pixels.length, s[1]/pixels.length, s[2]/pixels.length];
}

function distance(a, b) {
  return (a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2;
}

function kmeans(pixels, k, iterations) {
  // init centers by picking spread pixels
  const centers = [];
  const step = Math.floor(pixels.length / k);
  for (let i = 0; i < k; i++) centers.push([...pixels[i * step]]);
  for (let it = 0; it < iterations; it++) {
    const groups = Array.from({length:k}, () => []);
    for (const p of pixels) {
      let best = 0, bd = Infinity;
      for (let i = 0; i < k; i++) {
        const d = distance(p, centers[i]);
        if (d < bd) { bd = d; best = i; }
      }
      groups[best].push(p);
    }
    for (let i = 0; i < k; i++) {
      if (groups[i].length > 0) centers[i] = averageColor(groups[i]);
    }
    // if converged we could break; small dataset -> cheap
  }
  const clusters = centers.map((c, i) => ({ center: c, count: 0 }));
  for (const p of pixels) {
    let best = 0, bd = Infinity;
    for (let i = 0; i < k; i++) {
      const d = distance(p, centers[i]);
      if (d < bd) { bd = d; best = i; }
    }
    clusters[best].count++;
  }
  return clusters;
}

function rgbToHex(c) {
  const to = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${to(c[0])}${to(c[1])}${to(c[2])}`.toUpperCase();
}

export function applyClubTheme(theme) {
  if (!theme) return;
  const root = document.documentElement;
  root.style.setProperty("--club-primary", theme.primary || "#EA580C");
  root.style.setProperty("--club-secondary", theme.secondary || "#0F172A");
  root.style.setProperty("--club-accent", theme.accent || "#FACC15");
  root.style.setProperty("--club-primary-soft", hexWithAlpha(theme.primary || "#EA580C", 0.12));
}

function hexWithAlpha(hex, alpha) {
  const h = hex.replace("#","");
  const r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
