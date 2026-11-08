export function validateOpenApi(doc) {
  const errors = [];
  if (!doc.openapi) errors.push('MISSING_OPENAPI');
  if (!doc.info) errors.push('MISSING_INFO');
  if (!doc.paths) errors.push('MISSING_PATHS');
  return errors;
}
