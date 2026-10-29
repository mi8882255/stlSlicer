// Drawing -> DXF R12 (POLYLINE entities on layers CUT and ENGRAVE, millimetres).

const f = (v) => (+v.toFixed(4)).toString();

const polyline = (e, layer, color) => {
  const out = ['0', 'POLYLINE', '8', layer, '62', String(color), '66', '1', '70', e.closed ? '1' : '0', '10', '0', '20', '0', '30', '0'];
  for (const [x, y] of e.points) out.push('0', 'VERTEX', '8', layer, '10', f(x), '20', f(y), '30', '0');
  out.push('0', 'SEQEND', '8', layer);
  return out;
};

export const toDxf = (drawing) => {
  const layerTable = (name, color) => ['0', 'LAYER', '2', name, '70', '0', '62', String(color), '6', 'CONTINUOUS'];
  const lines = [
    '0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1009', '9', '$INSUNITS', '70', '4',
    '9', '$EXTMIN', '10', '0', '20', '0', '9', '$EXTMAX', '10', f(drawing.width), '20', f(drawing.height),
    '0', 'ENDSEC',
    '0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LAYER', '70', '2',
    ...layerTable('CUT', 1), ...layerTable('ENGRAVE', 5),
    '0', 'ENDTAB', '0', 'ENDSEC',
    '0', 'SECTION', '2', 'ENTITIES',
    ...drawing.engrave.flatMap((e) => polyline(e, 'ENGRAVE', 5)),
    ...drawing.cut.flatMap((e) => polyline(e, 'CUT', 1)),
    '0', 'ENDSEC', '0', 'EOF',
  ];
  return lines.join('\n') + '\n';
};
