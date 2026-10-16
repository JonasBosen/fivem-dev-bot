const SAFE_ERRORS = new Set(['invalid_client', 'invalid_grant', 'invalid_request', 'invalid_scope', 'unsupported_grant_type', 'server_error', 'temporarily_unavailable']);
function logOAuthFailure(response, payload, logger = console) {
  const error = SAFE_ERRORS.has(payload?.error) ? payload.error : 'unknown_error';
  // Never log response bodies: they can contain credentials, codes or access tokens.
  const details = { status: response.status, error };
  if (response.status === 429) details.retryAfterSeconds = retryAfterSeconds(response, payload);
  logger.error('Discord OAuth exchange rejected:', JSON.stringify(details));
  return error;
}
function retryAfterSeconds(response, payload, now = Date.now()) {
  const header = response.headers?.get('retry-after');
  const numeric = Number(header);
  if (header && Number.isFinite(numeric) && numeric > 0) return Math.ceil(numeric);
  const date = header ? Date.parse(header) : NaN;
  if (Number.isFinite(date) && date > now) return Math.ceil((date - now) / 1000);
  const seconds = Number(payload?.retry_after);
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : 60;
}
function createOAuthCooldown(now = Date.now) {
  let until = 0;
  return {
    remaining: () => Math.max(0, Math.ceil((until - now()) / 1000)),
    register: (response, payload) => {
      until = Math.max(until, now() + retryAfterSeconds(response, payload, now()) * 1000);
    },
  };
}
function sendRateLimitPage(res, seconds) {
  res.setHeader('Retry-After', String(seconds));
  res.setHeader('Cache-Control', 'no-store');
  return res.status(429).send(`<html lang="da"><meta charset="utf-8"><title>Discord login afventer</title><h2>Discord begrænser login midlertidigt</h2><p>Vent mindst ${seconds} sekunder, og start derefter et nyt login. Dit panel og dine data er stadig tilgængelige.</p><p><a href="/auth/discord">Start et nyt Discord-login</a></p></html>`);
}
module.exports = { logOAuthFailure, retryAfterSeconds, createOAuthCooldown, sendRateLimitPage };
