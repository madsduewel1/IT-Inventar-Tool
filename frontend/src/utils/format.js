export function getInitials(name) {
  if (!name) return '??';
  const cleanName = name.includes('@') ? name.split('@')[0] : name;
  const parts = cleanName.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  if (cleanName.length >= 2) {
    return cleanName.slice(0, 2).toUpperCase();
  }
  return cleanName.toUpperCase();
}
