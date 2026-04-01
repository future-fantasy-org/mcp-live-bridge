// Paginated: fetch all pages of search results
export default async function(params, ctx) {
  const { http, auth, logger } = ctx;
  const headers = { ...auth };
  let page = 1;
  const allResults = [];

  while (true) {
    logger.debug(`Fetching search page ${page}: q=${params.query}`);
    const res = await http.get('https://api.example.com/search', {
      headers,
      params: { q: params.query, page },
    });
    allResults.push(...res.results);
    if (res.results.length < 20) break;
    page++;
  }

  logger.debug(`Search complete: ${allResults.length} results`);
  return { total: allResults.length, results: allResults };
}
