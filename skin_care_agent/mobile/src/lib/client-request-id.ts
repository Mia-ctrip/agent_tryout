export function createClientRequestId(
  random: () => number = Math.random,
): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (token) => {
    const value = Math.floor(random() * 16) & 0xf;
    const nibble = token === 'x' ? value : (value & 0x3) | 0x8;
    return nibble.toString(16);
  });
}
