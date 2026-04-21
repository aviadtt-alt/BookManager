function buildCoverUrl(itemId) {
  const prefix = Math.floor(itemId / 10000);
  return `https://cdn.simania.co.il/bookimages/covers${prefix}/${itemId}.jpg`;
}

function extractItemIdFromText(text) {
  if (!text) return null;
  const match =
    text.match(/bookdetails\.php\?item_id=(\d+)/i) ||
    text.match(/item_id=(\d+)/i);
  return match ? Number.parseInt(match[1], 10) : null;
}

function browserHeaders() {
  return {
    'user-agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'accept':
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'accept-language': 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7',
    'cache-control': 'no-cache',
    pragma: 'no-cache'
  };
}

export default async (req) => {
  try {
    const url = new URL(req.url);
    const title = (url.searchParams.get('title') || '').trim();
    const writer = (url.searchParams.get('writer') || '').trim();
    const debug = url.searchParams.get('debug') === '1';

    if (!title && !writer) {
      return Response.json(
        { ok: false, error: 'Missing title or writer' },
        { status: 400 }
      );
    }

    const query = `${title} ${writer}`.trim().replace(/\s+/g, '+');
    const searchUrl = `https://simania.co.il/searchBooks.php?query=${query}`;

    const searchResponse = await fetch(searchUrl, {
      method: 'GET',
      headers: browserHeaders(),
      redirect: 'follow'
    });

    const finalUrl = searchResponse.url || searchUrl;
    const html = await searchResponse.text();

    const redirectedItemId = extractItemIdFromText(finalUrl);
    const parsedItemId = redirectedItemId || extractItemIdFromText(html);

    if (!parsedItemId) {
      return Response.json({
        ok: false,
        error: 'No item_id found in Simania response',
        searchUrl,
        finalUrl,
        debugHtmlPreview: debug ? html.slice(0, 3000) : undefined
      });
    }

    return Response.json({
      ok: true,
      itemId: parsedItemId,
      coverUrl: buildCoverUrl(parsedItemId),
      searchUrl,
      finalUrl
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
};
