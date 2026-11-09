export function a11yIssues(html) {
  const issues = [];
  if (!/<html[^>]*\blang=/.test(html)) issues.push('html-lang');
  if (/<img\b(?![^>]*\balt=)/.test(html)) issues.push('img-alt');
  if (/<input\b(?![^>]*\b(aria-label|id)=)/.test(html)) issues.push('input-label');
  if (!/<meta[^>]*name=["']viewport/.test(html)) issues.push('viewport');
  return issues;
}
