// Drawing -> SVG (mm units). Red = cut, blue = engrave (common laser convention).

const f = (v) => +v.toFixed(3);

const pathD = (e, h) =>
  e.points.map(([x, y], i) => `${i ? 'L' : 'M'}${f(x)} ${f(h - y)}`).join(' ') + (e.closed ? ' Z' : '');

export const toSvg = (drawing, { cutColor = '#ff0000', engraveColor = '#0000ff', strokeWidth = 0.1 } = {}) => {
  const { width: w, height: h } = drawing;
  const group = (id, list, color) =>
    `  <g id="${id}" inkscape:label="${id}" inkscape:groupmode="layer" fill="none" stroke="${color}" stroke-width="${strokeWidth}">\n` +
    list.map((e) => `    <path d="${pathD(e, h)}"/>`).join('\n') +
    '\n  </g>';
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" width="${f(w)}mm" height="${f(h)}mm" viewBox="0 0 ${f(w)} ${f(h)}">
  <title>${drawing.name}</title>
${group('engrave', drawing.engrave, engraveColor)}
${group('cut', drawing.cut, cutColor)}
</svg>
`;
};
