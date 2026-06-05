export function parseQuantityInput(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  const quantity = Number.parseInt(trimmed, 10);
  return quantity > 0 ? quantity : null;
}
