export interface Code128Element {
  isBar: boolean;
  units: number;
}

export interface Code128BarRect {
  xDots: number;
  yDots: number;
  widthDots: number;
  heightDots: number;
}

export const CODE128_QUIET_MODULES = 2;

const CODE128_PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112'
];

export function code128Elements(value: string): { elements: Code128Element[]; totalUnits: number } {
  const cleanVal = (value || '000000').replace(/[^ -~]/g, '');
  const displayVal = cleanVal || '000000';

  const symbols: number[] = [104];
  let checksum = 104;

  for (let i = 0; i < displayVal.length; i++) {
    const code = displayVal.charCodeAt(i);
    const val = code >= 32 && code <= 126 ? code - 32 : 0;
    symbols.push(val);
    checksum += (i + 1) * val;
  }

  symbols.push(checksum % 103);
  symbols.push(106);

  const elements: Code128Element[] = [];
  let totalUnits = 0;

  symbols.forEach(symIdx => {
    const pat = CODE128_PATTERNS[symIdx] || CODE128_PATTERNS[0];
    for (let p = 0; p < pat.length; p++) {
      const units = parseInt(pat[p], 10);
      elements.push({ isBar: p % 2 === 0, units });
      totalUnits += units;
    }
  });

  return { elements, totalUnits };
}

export function code128BarRects(
  value: string,
  box: { xDots: number; yDots: number; widthDots: number; heightDots: number },
): Code128BarRect[] {
  const { elements, totalUnits } = code128Elements(value);
  const spanUnits = totalUnits + CODE128_QUIET_MODULES * 2;
  const unitDots = box.widthDots / spanUnits;
  const rects: Code128BarRect[] = [];
  let cursor = CODE128_QUIET_MODULES;

  for (const element of elements) {
    const start = box.xDots + Math.round(cursor * unitDots);
    cursor += element.units;
    if (!element.isBar) continue;
    const end = box.xDots + Math.round(cursor * unitDots);
    if (end <= start) continue;
    rects.push({
      xDots: start,
      yDots: box.yDots,
      widthDots: end - start,
      heightDots: box.heightDots,
    });
  }

  return rects;
}
