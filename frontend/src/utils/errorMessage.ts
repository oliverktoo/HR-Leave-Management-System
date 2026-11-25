/**
 * Readable text for a caught error. Supabase/PostgREST errors are plain
 * objects ({ message, details, hint, code }), not Error instances, so
 * String(e) would show "[object Object]".
 */
export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object') {
    const { message, details, hint, code } = e as Record<string, unknown>;
    if (code === '23505') return 'This record already exists (duplicate). ' + (details ? String(details) : '');
    const parts = [message, details, hint].filter(p => typeof p === 'string' && p.trim());
    if (parts.length) return parts.join(' — ');
    try { return JSON.stringify(e); } catch { /* fall through */ }
  }
  return String(e);
}
