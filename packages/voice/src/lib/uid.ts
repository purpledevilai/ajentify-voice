/**
 * Tiny UUID v4 generator. Prefers `crypto.randomUUID` when available
 * (browsers + Node 19+) and falls back to a `crypto.getRandomValues`
 * implementation otherwise. Avoids pulling in the `uuid` npm package.
 */
export function uuidv4(): string {
  if (typeof crypto !== 'undefined') {
    if (typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    if (typeof crypto.getRandomValues === 'function') {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      // Set version (4) and variant (10) bits.
      bytes[6] = (bytes[6]! & 0x0f) | 0x40;
      bytes[8] = (bytes[8]! & 0x3f) | 0x80;
      const hex: string[] = [];
      for (let i = 0; i < 16; i++) {
        hex.push(bytes[i]!.toString(16).padStart(2, '0'));
      }
      return (
        hex.slice(0, 4).join('') +
        '-' +
        hex.slice(4, 6).join('') +
        '-' +
        hex.slice(6, 8).join('') +
        '-' +
        hex.slice(8, 10).join('') +
        '-' +
        hex.slice(10, 16).join('')
      );
    }
  }
  // Last-resort fallback (non-cryptographic). Should never run in a modern browser.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
