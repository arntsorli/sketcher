export function mapImageRequestAttempts(sourceUrl: string): string[] {
  const source = new URL(sourceUrl);
  const size = source.searchParams.get("size")?.split(",").map(Number);
  const width = size?.[0];
  const height = size?.[1];
  if (!width || !height || !Number.isFinite(width) || !Number.isFinite(height)) {
    return [source.toString()];
  }
  return [1, 0.75, 0.5].map((scale) => {
    const attempt = new URL(source);
    attempt.searchParams.set(
      "size",
      `${Math.max(64, Math.round(width * scale))},${Math.max(64, Math.round(height * scale))}`,
    );
    return attempt.toString();
  });
}
