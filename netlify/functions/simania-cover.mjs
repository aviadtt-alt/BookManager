const MCP_URL = 'https://simania.co.il/api/mcp';

function buildCoverUrl(itemId) {
  const prefix = Math.floor(itemId / 10000);
  return `https://cdn.simania.co.il/bookimages/covers${prefix}/${itemId}.jpg`;
}

function isHebrew(text) {
  return /[\u0590-\u05FF]/.test(text || '');
}

function normalizeText(text) {
  return (text || '')
    .normalize('NFKC')
    .replace(/[`"'׳״]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function similarityScore(a, b) {
  const aa = normalizeText(a);
  const bb = normalizeText(b);
  if (!aa || !bb) return 0;
  if (aa === bb) return 100;
  if (aa.includes(bb) || bb.includes(aa)) return 80;

  const aWords = new Set(aa.split(' ').filter(Boolean));
  const bWords = new Set(bb.split(' ').filter(Boolean));
  let overlap = 0;
  for (const word of aWords) if (bWords.has(word)) overlap++;
  return Math.round((overlap / Math.max(aWords.size, bWords.size, 1)) * 100);
}

function parseMcpToolPayload(result) {
  const text = result?.content?.find(item => item?.type === 'text')?.text || '';
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function mcpRequest(body) {
  const response = await fetch(MCP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream'
    },
    body: JSON.stringify(body)
  });

  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }

  if (!response.ok || json?.error) {
    const message = json?.error?.message || `MCP HTTP ${response.status}`;
    throw new Error(message);
  }

  return json;
}

async function mcpInitialize() {
  return mcpRequest({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'book-manager-cover-fetch', version: '1.0' }
    }
  });
}

async function mcpToolCall(name, args) {
  const result = await mcpRequest({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: {
      name,
      arguments: args
    }
  });
  return parseMcpToolPayload(result?.result);
}

function englishAuthorVariants(writer) {
  const normalized = normalizeText(writer);
  const map = {
    'סטיבן קינג': ['Stephen King'],
    'ג ק רולינג': ['J. K. Rowling', 'JK Rowling'],
    'הרלן קובן': ['Harlan Coben'],
    'יו נסבו': ['Jo Nesbo', 'Jo Nesbø'],
    'ג ורג אורוול': ['George Orwell'],
    'אגתה כריסטי': ['Agatha Christie'],
    'מרגרט אטווד': ['Margaret Atwood'],
    'דן בראון': ['Dan Brown'],
    'דיוויד בלדאצ י': ['David Baldacci'],
    'ג ון גרישם': ['John Grisham'],
    'פאולו קואלו': ['Paulo Coelho'],
    'ג ר ר מרטין': ['George R. R. Martin'],
    'ג ר טולקין': ['J. R. R. Tolkien', 'JRR Tolkien']
  };
  return map[normalized] || [];
}

function candidateFromBook(book, reason, title, writer) {
  if (!book?.id) return null;
  return {
    itemId: book.id,
    coverUrl: book.coverUrl || buildCoverUrl(book.id),
    titleScore: similarityScore(title, book.title),
    authorScore: similarityScore(writer, book.author),
    reason,
    book
  };
}

function pickBestCandidate(candidates) {
  if (!candidates.length) return null;
  return candidates
    .sort((a, b) => {
      const scoreA = a.titleScore * 2 + a.authorScore;
      const scoreB = b.titleScore * 2 + b.authorScore;
      return scoreB - scoreA;
    })[0];
}

async function searchBooksByQuery(query, title, writer, reason, debugSteps) {
  const payload = await mcpToolCall('books_search', { query, limit: 10 });
  const books = Array.isArray(payload?.data) ? payload.data : [];
  debugSteps.push({ step: reason, query, total: books.length });
  return books
    .map(book => candidateFromBook(book, reason, title, writer))
    .filter(Boolean);
}

async function searchViaAuthorDetails(writer, title, debugSteps) {
  const variants = [writer, ...englishAuthorVariants(writer)].filter(Boolean);
  const candidates = [];

  for (const variant of variants) {
    const authorPayload = await mcpToolCall('authors_search', { query: variant, limit: 5 });
    const authors = Array.isArray(authorPayload?.data) ? authorPayload.data : [];
    debugSteps.push({ step: 'authors_search', query: variant, total: authors.length });

    for (const author of authors) {
      if (!author?.sampleBookId) continue;
      const detailsPayload = await mcpToolCall('authors_get_details', { bookId: author.sampleBookId });
      const books = Array.isArray(detailsPayload?.data?.books) ? detailsPayload.data.books : [];
      debugSteps.push({
        step: 'authors_get_details',
        query: variant,
        sampleBookId: author.sampleBookId,
        totalBooks: books.length
      });
      for (const book of books) {
        const candidate = candidateFromBook(book, `author:${variant}`, title, writer);
        if (candidate) candidates.push(candidate);
      }
    }
  }

  return candidates;
}

export default async req => {
  try {
    const url = new URL(req.url);
    const title = (url.searchParams.get('title') || '').trim();
    const writer = (url.searchParams.get('writer') || '').trim();
    const debug = url.searchParams.get('debug') === '1';

    if (!title && !writer) {
      return Response.json({ ok: false, error: 'Missing title or writer' }, { status: 400 });
    }

    await mcpInitialize();

    const debugSteps = [];
    const queries = [];
    const combined = `${title} ${writer}`.trim();
    if (combined) queries.push({ query: combined, reason: 'combined' });
    if (title) queries.push({ query: title, reason: 'title-only' });
    if (writer && !isHebrew(writer)) queries.push({ query: writer, reason: 'writer-only' });

    let candidates = [];
    for (const item of queries) {
      const found = await searchBooksByQuery(item.query, title, writer, item.reason, debugSteps);
      candidates = candidates.concat(found);
    }

    if (!candidates.length) {
      const authorCandidates = await searchViaAuthorDetails(writer, title, debugSteps);
      candidates = candidates.concat(authorCandidates);
    }

    const best = pickBestCandidate(candidates);
    if (!best || !best.itemId) {
      return Response.json({
        ok: false,
        error: 'No matching book found via Simania MCP',
        debugSteps: debug ? debugSteps : undefined
      });
    }

    const detailsPayload = await mcpToolCall('books_get_details', { bookId: best.itemId });
    const details = detailsPayload?.data || {};
    const coverUrl = details.coverUrl || best.coverUrl || buildCoverUrl(best.itemId);

    return Response.json({
      ok: true,
      itemId: best.itemId,
      coverUrl,
      matchedTitle: details.title || best.book?.title || null,
      matchedAuthor: details.author || best.book?.author || null,
      matchReason: best.reason,
      debugSteps: debug ? debugSteps : undefined
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown MCP error'
      },
      { status: 500 }
    );
  }
};
