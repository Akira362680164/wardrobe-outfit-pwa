/**
 * Fields that keep the same meaning in a wishlist item and its converted
 * wardrobe garment.  Undoing a purchase copies these fields back so edits
 * made after conversion are not silently discarded.
 *
 * Commerce fields (price/productUrl), wishlist assessment/status and
 * wardrobe-only lifecycle fields intentionally stay on their original side.
 * Image bindings are shared by the conversion feature and are not copied.
 */
export const WISHLIST_FIELDS_INHERITED_FROM_GARMENT = [
  "name",
  "category",
  "subcategory",
  "colors",
  "seasons",
  "styles",
  "formality",
  "warmth",
  "temperatureRange",
  "material",
  "fitGender",
  "fitNotes",
  "notes",
] as const;

export function inheritGarmentFieldsToWishlist(
  wishlistPayload: Record<string, unknown>,
  garmentPayload: Record<string, unknown>,
): Record<string, unknown> {
  const next = { ...wishlistPayload };
  for (const field of WISHLIST_FIELDS_INHERITED_FROM_GARMENT) {
    if (Object.prototype.hasOwnProperty.call(garmentPayload, field)) next[field] = garmentPayload[field];
  }
  return next;
}
