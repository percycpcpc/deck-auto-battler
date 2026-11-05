export const FREE_SPEEDS = Object.freeze([1, 2]);
export const PREMIUM_SPEEDS = Object.freeze([3, 10]);
export const SPEEDS = Object.freeze([...FREE_SPEEDS, ...PREMIUM_SPEEDS]);

export function isSpeedAvailable(speed, premiumEntitled = false) {
  const value = Number(speed);
  return FREE_SPEEDS.includes(value) || (premiumEntitled === true && PREMIUM_SPEEDS.includes(value));
}

export function durationAtSpeed(milliseconds, speed) {
  if (!SPEEDS.includes(Number(speed))) throw new RangeError(`unsupported playback speed: ${speed}`);
  return Math.round(milliseconds * 2 / Number(speed));
}
