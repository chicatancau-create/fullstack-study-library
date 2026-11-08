export function isBackwardCompatible(oldSchema, newSchema) {
  const oldFields = oldSchema.fields ?? {};
  const newFields = newSchema.fields ?? {};
  for (const [name, spec] of Object.entries(oldFields)) {
    if (!(name in newFields)) {
      if (spec.required) return false;
      continue;
    }
    if (newFields[name].type !== spec.type) return false;
  }
  return true;
}
