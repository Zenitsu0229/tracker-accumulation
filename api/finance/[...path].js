export default async function handler(req, res) {
  // Strip the /api/finance prefix to get the Yahoo Finance path
  const path = req.url.replace(/^\/api\/finance/, '')
  const url = `https://query1.finance.yahoo.com${path}`

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
      },
    })

    const data = await response.json()

    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate')
    res.status(response.status).json(data)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch stock data', detail: String(error) })
  }
}
