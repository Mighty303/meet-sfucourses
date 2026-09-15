/**
 * Whether the Google door can actually complete a round trip.
 *
 * Auth.js will happily advertise Google and redirect to accounts.google.com
 * with only AUTH_GOOGLE_ID set; the callback then needs AUTH_GOOGLE_SECRET to
 * exchange the code. A missing or empty secret surfaces as the opaque
 * `error=Configuration` page. Both must be present before we register the
 * provider or show the button.
 */
export function googleEnabled(): boolean {
  const id = process.env.AUTH_GOOGLE_ID?.trim();
  const secret = process.env.AUTH_GOOGLE_SECRET?.trim();
  return Boolean(id && secret);
}
