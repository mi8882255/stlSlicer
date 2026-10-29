// Simple shelf packing of parts onto rectangular sheets.
// items: [{ key, w, h }] -> sheets: [{ index, width, height, placed: [{ key, x, y, rotated }] }]

export const nest = (items, { sheetWidth = 600, sheetHeight = 400, margin = 5, spacing = 4, allowRotate = true } = {}) => {
  const usableW = sheetWidth - 2 * margin;
  const usableH = sheetHeight - 2 * margin;
  const sheets = [];
  const oversize = [];

  const prepared = items.map((it) => {
    let { w, h } = it;
    let rotated = false;
    // Lay long side horizontally when it fits — shelves pack better that way.
    if (allowRotate && h > w && h <= usableW && w <= usableH) { [w, h] = [h, w]; rotated = true; }
    if (allowRotate && (w > usableW || h > usableH) && h <= usableW && w <= usableH) { [w, h] = [h, w]; rotated = !rotated; }
    return { ...it, w, h, rotated };
  }).sort((a, b) => b.h - a.h || b.w - a.w);

  const newSheet = (width = sheetWidth, height = sheetHeight) => {
    const sheet = { index: sheets.length + 1, width, height, placed: [], shelves: [] };
    sheets.push(sheet);
    return sheet;
  };

  for (const it of prepared) {
    if (it.w > usableW || it.h > usableH) {
      // Part does not fit a standard sheet: give it its own oversized sheet.
      const s = newSheet(Math.max(sheetWidth, it.w + 2 * margin), Math.max(sheetHeight, it.h + 2 * margin));
      s.placed.push({ key: it.key, x: margin, y: margin, w: it.w, h: it.h, rotated: it.rotated });
      s.full = true;
      oversize.push(it.key);
      continue;
    }
    let done = false;
    for (const sheet of sheets) {
      if (sheet.full) continue;
      for (const shelf of sheet.shelves) {
        if (it.h <= shelf.h && shelf.x + it.w <= usableW) {
          sheet.placed.push({ key: it.key, x: margin + shelf.x, y: margin + shelf.y, w: it.w, h: it.h, rotated: it.rotated });
          shelf.x += it.w + spacing;
          done = true;
          break;
        }
      }
      if (done) break;
      const used = sheet.shelves.reduce((s, sh) => Math.max(s, sh.y + sh.h + spacing), 0);
      if (used + it.h <= usableH) {
        const shelf = { y: used, h: it.h, x: it.w + spacing };
        sheet.shelves.push(shelf);
        sheet.placed.push({ key: it.key, x: margin, y: margin + used, w: it.w, h: it.h, rotated: it.rotated });
        done = true;
        break;
      }
    }
    if (!done) {
      const sheet = newSheet();
      sheet.shelves.push({ y: 0, h: it.h, x: it.w + spacing });
      sheet.placed.push({ key: it.key, x: margin, y: margin, w: it.w, h: it.h, rotated: it.rotated });
    }
  }
  return { sheets: sheets.map(({ shelves, full, ...s }) => s), oversize };
};
