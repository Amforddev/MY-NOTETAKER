const STOP_WORDS = new Set([
  'about', 'above', 'after', 'again', 'against', 'all', 'also', 'and', 'any', 'are', 'aren',
  'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'can', 'cannot',
  'could', 'did', 'does', 'doing', 'down', 'during', 'each', 'few', 'for', 'from', 'further',
  'had', 'has', 'have', 'having', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his',
  'how', 'into', 'its', 'itself', 'just', 'more', 'most', 'myself', 'nor', 'not', 'now', 'off',
  'once', 'only', 'other', 'our', 'ours', 'ourselves', 'out', 'over', 'own', 'same', 'should',
  'some', 'such', 'than', 'that', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there',
  'these', 'they', 'this', 'those', 'through', 'too', 'under', 'until', 'very', 'was', 'were',
  'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'with', 'would', 'you', 'your',
  'yours', 'yourself', 'yourselves', 'will', 'want', 'like', 'going', 'think', 'today', 'tomorrow',
  'yesterday', 'really', 'started', 'starting', 'instead', 'opting', 'reliance', 'relying',
]);

/**
 * Automatically extracts 3 to 5 relevant keyword tags from transcript content
 */
export function extractKeywords(text: string, count: number = 4): string[] {
  if (!text || typeof text !== 'string') return [];

  // Remove URLs, punctuation, numbers
  const cleaned = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\d+/g, ' ');

  const words = cleaned
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 3 && !STOP_WORDS.has(w));

  if (words.length === 0) return [];

  // Frequency map
  const frequency: Record<string, number> = {};
  for (const word of words) {
    frequency[word] = (frequency[word] || 0) + 1;
  }

  // Sort by frequency and length
  const sortedWords = Object.keys(frequency).sort((a, b) => {
    const diff = frequency[b] - frequency[a];
    if (diff !== 0) return diff;
    return b.length - a.length;
  });

  const uniqueTags: string[] = [];
  for (const word of sortedWords) {
    // Avoid plural / stem duplicates (e.g. 'widget' and 'widgets')
    const alreadyHasStem = uniqueTags.some(
      (t) => t.startsWith(word) || word.startsWith(t)
    );
    if (!alreadyHasStem) {
      uniqueTags.push(word);
    }
    if (uniqueTags.length >= count) break;
  }

  return uniqueTags;
}
