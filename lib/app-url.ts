// The public origin used for PayPal return/cancel links and same-origin checks.
// APP_URL wins when it is a valid http(s) URL; otherwise the request's own origin is used.
export function appOrigin(req: Request): string {
  const configured = process.env.APP_URL;
  if (configured) {
    try {
      const u = new URL(configured);
      if (u.protocol === 'https:' || u.protocol === 'http:') return u.origin;
    } catch {}
  }
  return new URL(req.url).origin;
}

// Rejects cross-site form posts (basic CSRF protection for the checkout endpoint).
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return req.headers.get('sec-fetch-site') !== 'cross-site';
  return origin === appOrigin(req) || origin === new URL(req.url).origin;
}
