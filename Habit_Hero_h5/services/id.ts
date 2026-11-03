export const safeId = (): string => {
  try {
    // Prefer native crypto.randomUUID when available
    if (typeof crypto !== 'undefined' && typeof (crypto as any).randomUUID === 'function') {
      return (crypto as any).randomUUID();
    }
  } catch {}
  // Fallback: time + random segment
  const time = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `id-${time}-${rand}`;
};