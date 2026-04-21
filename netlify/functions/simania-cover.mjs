function buildCoverUrl(itemId) {
  const prefix = Math.floor(itemId / 10000);
  return `https://cdn.simania.co.il/bookimages/covers${prefix}/${itemId}.jpg`;
}

function browserHeaders() {
  return {
    'user-agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'accept': 'application/json, text/plain, */*',
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

    const query = `${title} ${writer}`.trim();
    const apiUrl = `https://simania.co.il/api/search?${new URLSearchParams({
      query,
      page: '1'
    }).toString()}`;

    const searchResponse = await fetch(apiUrl, {
      method: 'GET',
      headers: browserHeaders(),
      redirect: 'follow'
    });
    if (!searchResponse.ok) {
      return Response.json(
        {
          ok: false,
          error: `Simania API HTTP ${searchResponse.status}`,
          apiUrl
        },
        { status: 502 }
      );
    }

    const payload = await searchResponse.json();
    const books = Array.isArray(payload?.data?.books) ? payload.data.books : [];
    const firstBook = books[0] || null;
    const itemId = Number.parseInt(firstBook?.ID ?? firstBook?.BOOK_ID, 10);
    const coverUrl = firstBook?.COVER || (
      Number.isFinite(itemId) ? buildCoverUrl(itemId) : null
    );

    if (!firstBook || !Number.isFinite(itemId) || !coverUrl) {
      return Response.json({
        ok: false,
        error: 'No book result found in Simania API response',
        apiUrl,
        debugPayload: debug ? payload : undefined
      });
    }

    return Response.json({
      ok: true,
      itemId,
      coverUrl,
      apiUrl,
      title: firstBook?.NAME || null,
      author: firstBook?.AUTHOR || null
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
