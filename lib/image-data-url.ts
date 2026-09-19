/** Maximum encoded size for a browser-downscaled image stored in Postgres. */
export const MAX_IMAGE_DATA_URL_CHARS = 200_000;

/**
 * Accept only the raster data URLs our canvas encoder can produce. In
 * particular, SVG and arbitrary URLs stay out of image sources populated from
 * persisted user input.
 */
export function isValidImageDataUrl(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= MAX_IMAGE_DATA_URL_CHARS &&
    /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)
  );
}
