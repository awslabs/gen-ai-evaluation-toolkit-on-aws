/* istanbul ignore file - The file is excluded as dynamic imports are really annoying to */
/**
 * Uses a dynamic import to open a browser loading the specified url
 * @param url The request url
 */
export async function openBrowser(url: string): Promise<void> {
  const open = (await import('open')).default;
  await open(url);
}
