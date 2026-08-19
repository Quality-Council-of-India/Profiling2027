// Only CASU Anchors can cover more than one field (e.g. one person covering
// both "Literature & Education" and "Sports"); every other role has exactly
// one, and the roster stores this as a comma-joined string in that case
// (see services/roster.js). These helpers make every field-matching call
// site correct for both cases without needing to know which it's dealing with.

/** Splits a possibly comma-joined field value into a clean array. */
export function fieldList(field) {
  return field
    ? field
        .split(",")
        .map((f) => f.trim())
        .filter(Boolean)
    : [];
}

/** Whether two users share at least one field — the general-case replacement for `a.field === b.field`. */
export function sharesField(a, b) {
  const bFields = fieldList(b.field);
  return fieldList(a.field).some((f) => bFields.includes(f));
}
