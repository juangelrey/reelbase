/**
 * Whether one comma-separated part of an id list (a `genre` or `providers` param, the `reelbase-services` cookie)
 * is an id: plain decimal digits, no sign, no leading zero.
 */
export function isIdPart(part: string): boolean {
  return /^[1-9]\d*$/.test(part);
}
