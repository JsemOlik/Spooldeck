# JSON API (`/api/v1`)

The iOS app talks to Spooldeck through this API. It wraps the same services the web UI's Server Actions use, so validation and behaviour match.

## Auth

```bash
curl -X POST https://spools.example.com/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"username":"me","password":"…"}'
# → {"token":"…","expiresAt":"…","user":{"id":1,"username":"me"}}

curl https://spools.example.com/api/v1/spools -H "Authorization: Bearer $TOKEN"
```

- A token is a regular session: it lasts 30 days and renews on use.
- "Sign out everywhere" and changing the password revoke it.
- Logins share the web login's rate limit.

## Request and response shape

- Request bodies are JSON. Numbers can be sent as numbers or strings, and `null` or `""` means "not set". Field names match the web forms.
- Errors return `{ "error": "…", "fieldErrors": { "field": ["…"] } }`.
  - 400: validation failed
  - 401: missing or invalid token
  - 404: not found
  - 409: the request conflicts with existing data
  - 422: Prusament lookup failed
- Dates are ISO 8601. Day-only fields such as `purchaseDate` are `YYYY-MM-DD`.

## Endpoints

### Auth and account

| Method | Path | Notes |
|---|---|---|
| POST | `auth/login` | Takes `{username, password}` and returns a token. |
| POST | `auth/logout` | Ends the current session. |
| POST | `auth/logout-everywhere` | Ends all sessions. |
| POST | `auth/password` | Takes `{current, password, confirm}`. Returns a new token. |
| GET | `me` | Returns `{id, username, sessionCount}`. |

### Spools and usage

| Method | Path | Notes |
|---|---|---|
| GET | `dashboard` | Stats, low stock, recent prints, usage by material. |
| GET | `spools` | Query: `q`, `materialId`, `brandId`, `filamentId`, `status`, `location`, `sort`, `low=1`. |
| POST | `spools` | New spool form fields, plus `quantity` and `remaining`. |
| GET | `spools/{id}` | Spool with filament, usage, `filamentNotes` and `qrUrl`. |
| PUT | `spools/{id}` | Updates the spool. |
| DELETE | `spools/{id}` | Deletes the spool. |
| POST | `spools/{id}/status` | Takes `{status}`. |
| POST | `spools/{id}/usage` | Takes `{grams, printName?, note?}`. |
| POST | `spools/{id}/weigh-in` | Takes `{grams, includesSpool, note?}`. |
| GET | `spools/by-code/{code}` | Returns `{id}`. |
| DELETE | `usage/{id}` | Deletes a usage entry. |

### Filaments and notes

| Method | Path | Notes |
|---|---|---|
| GET | `filaments` | Add `archived=1` to list archived filaments. |
| POST | `filaments` | Creates a filament. |
| GET, PUT, DELETE | `filaments/{id}` | Read, update or delete a filament. |
| GET | `filaments/options` | Options for the spool form's filament picker. |
| POST | `filaments/{id}/archive` | Takes `{archived}`. |
| POST | `filaments/{id}/notes` | Takes `{body, spoolId?}`. |
| DELETE | `notes/{id}` | Deletes a note. |

### Scanning and Prusament import

| Method | Path | Notes |
|---|---|---|
| POST | `scan/resolve` | Takes `{text}`. Returns `{kind:"spool",id}`, `{kind:"prusament",url}` or `{kind:"error",error}`. |
| GET | `prusament/preview?url=` | Previews a Prusament spool before importing it. |
| POST | `prusament/import` | Imports a Prusament spool. |

### Settings, catalog and locations

| Method | Path | Notes |
|---|---|---|
| GET, PUT | `settings` | `currency`, `lowStockGrams`, `publicUrl`. GET also returns `detectedUrl`. |
| GET, POST | `catalog/{brands\|vendors\|materials}` | List or create catalog items. |
| PUT, DELETE | `catalog/{kind}/{id}` | Update or delete a catalog item. |
| GET | `locations` | Locations with spool counts. |
| POST | `locations/rename` | Takes `{from, name}`. |
