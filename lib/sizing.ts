export interface SizeRow {
  eu: number;
  usMens: number;
}

export const SIZE_TABLE: SizeRow[] = [
  { eu: 38, usMens: 5 }, { eu: 38.5, usMens: 5.5 },
  { eu: 39, usMens: 6 }, { eu: 39.5, usMens: 6.5 },
  { eu: 40, usMens: 7 }, { eu: 40.5, usMens: 7.5 },
  { eu: 41, usMens: 8 }, { eu: 41.5, usMens: 8.5 },
  { eu: 42, usMens: 9 }, { eu: 42.5, usMens: 9.5 },
  { eu: 43, usMens: 10 }, { eu: 43.5, usMens: 10.5 },
  { eu: 44, usMens: 11 }, { eu: 44.5, usMens: 11.5 },
  { eu: 45, usMens: 12 },
];

export function euToUS(eu: number): SizeRow | null {
  return SIZE_TABLE.find((row) => row.eu === eu) ?? null;
}
