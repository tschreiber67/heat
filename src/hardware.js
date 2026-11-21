// Driver interface. A real hardware driver implements these two methods:
//   read()  -> { upper: [value|null, ageSeconds], lower: [...], ambient: [...], electronics: [...] }
//   apply(upperHeater: boolean, lowerHeater: boolean, ventPct: number) -> void
export const SENSORS = ['upper', 'lower', 'ambient', 'electronics'];
