# OFF API integration notes

## User identity in requests

- For READ (`GET /api/v*/product/...`) OFF requires only a custom `User-Agent` in format: `AppName/Version (ContactEmail)`.
- For WRITE (`POST`/`PUT`/`DELETE`) TBD.

## Rate limits (18.05.2026)

- 15 req/min/IP for READ (`GET /api/v*/product/...` or product page).

- 10 req/min/IP for READ (`GET /api/v*/search` or `GET /cgi/search.pl` requests).

- No limit for product write queries.
