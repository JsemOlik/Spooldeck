# JSON API

Spooldeck has a JSON API under `/api/v1` for scripts, home automation, shortcuts and other apps. It can do everything the web interface does: list and add spools, log prints, weigh in, manage filaments and notes, resolve scanned codes and import Prusament spools.

The API uses the same validation and logic as the web forms, so the rules and error messages are the same.

## Quick start

Sign in once to get a token, then send it as a bearer token:

```bash
TOKEN=$(curl -s -X POST https://spools.example.com/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"username":"me","password":"…"}' | jq -r .token)

# Every spool in stock
curl https://spools.example.com/api/v1/spools -H "Authorization: Bearer $TOKEN"

# Log a 42.5 g print on spool 3
curl -X POST https://spools.example.com/api/v1/spools/3/usage \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"grams":42.5,"printName":"Cable clips"}'
```

The login response looks like this:

```json
{ "token": "…", "expiresAt": "2026-11-23T10:00:00.000Z", "user": { "id": 1, "username": "me" } }
```

## Tokens

- A token is an ordinary login session. It lasts 30 days and every request extends it, so a script that runs regularly stays signed in.
- Tokens count toward the active sessions shown in **Settings**. **Sign out everywhere** and changing your password revoke them all.
- Store tokens like passwords. Anyone holding one has full access to your data.
- Logins share the web login's rate limit. Call `auth/login` once and reuse the token instead of signing in for every request.
- Before the account exists, `auth/login` returns 409. Finish the setup in the browser first.

## Requests and responses

- **Bodies** are JSON. Numbers can be sent as numbers or strings, and `null` or `""` means "not set". Field names match the web forms.
- **Brands, materials and vendors** are passed by name (`"brand": "Prusament"`). A name that doesn't exist yet is added to the catalog.
- **Dates** are ISO 8601 timestamps. Day-only fields such as `purchaseDate` use `YYYY-MM-DD`.
- **Weights** are grams; prices use the currency from settings unless a spool has its own `currency`.
- **Errors** return a message and, for validation errors, the failing fields:

  ```json
  { "error": "Please fix the highlighted fields.", "fieldErrors": { "grams": ["Enter the grams used"] } }
  ```

| Status | Meaning                                          |
| ------ | ------------------------------------------------ |
| 200    | OK                                               |
| 201    | Created                                          |
| 400    | Validation failed, or the body isn't valid JSON  |
| 401    | Missing, invalid or expired token                |
| 404    | No such item                                     |
| 409    | The request conflicts with existing data         |
| 422    | The Prusament page couldn't be read              |
| 500    | Something went wrong on the server; see its logs |

## Endpoints

All paths are relative to `/api/v1`.

### Account

| Method | Path                     | Body / query                  | Notes                                                       |
| ------ | ------------------------ | ----------------------------- | ----------------------------------------------------------- |
| POST   | `auth/login`             | `{username, password}`        | Returns `{token, expiresAt, user}`. No token needed.        |
| POST   | `auth/logout`            |                               | Revokes the token used for this request.                    |
| POST   | `auth/logout-everywhere` |                               | Revokes every session and token, including this one.        |
| POST   | `auth/password`          | `{current, password, confirm}` | Signs out everywhere and returns a new `{token, expiresAt}`. |
| GET    | `me`                     |                               | `{id, username, sessionCount}`                              |

### Spools and usage

| Method | Path                    | Body / query                                                                                         | Notes                                                                                    |
| ------ | ----------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| GET    | `dashboard`             |                                                                                                      | Totals, low stock, recent prints and usage by material, plus `currency` and `lowStockGrams`. |
| GET    | `spools`                | `q`, `materialId`, `brandId`, `filamentId`, `location`, `status`, `sort`, `low=1`                     | `status`: `active` (default), `all`, `sealed`, `opened`, `empty`, `archived`. `sort`: `name`, `remaining`, `recent`, `used`. |
| POST   | `spools`                | Spool fields (below), plus `quantity` (1–50) and `remaining`                                        | Adds one or more identical spools. Returns `{ids, filamentId}`.                           |
| GET    | `spools/{id}`           |                                                                                                      | The spool with its filament, usage history, the latest five filament notes and `qrUrl`. |
| PUT    | `spools/{id}`           | Spool fields                                                                                         | Replaces the spool's fields.                                                             |
| DELETE | `spools/{id}`           |                                                                                                      | Deletes the spool and its usage history.                                                 |
| POST   | `spools/{id}/status`    | `{status}`                                                                                           | `sealed`, `opened`, `empty` or `archived`.                                                |
| POST   | `spools/{id}/usage`     | `{grams, printName?, note?}`                                                                         | Logs filament used by a print.                                                           |
| POST   | `spools/{id}/weigh-in`  | `{scaleGrams, includesSpool?, note?}`                                                                | Sets the remaining weight from a scale reading. With `includesSpool: true`, the empty spool weight is subtracted. |
| GET    | `spools/by-code/{code}` |                                                                                                      | Looks up a spool by the code on its label. Returns `{id}`.                               |
| DELETE | `usage/{id}`            |                                                                                                      | Deletes a usage entry, adding its grams back to the spool.                               |

**Spool fields:** `filamentId` and `initialWeight` (grams of filament, without the spool) are required. Optional: `spoolWeight`, `price`, `currency`, `vendor`, `purchaseDate`, `purchaseUrl`, `location`, `status`, `notes`.

### Filaments and notes

| Method | Path                     | Body / query                               | Notes                                                     |
| ------ | ------------------------ | ------------------------------------------ | --------------------------------------------------------- |
| GET    | `filaments`              | `q`, `materialId`, `brandId`, `archived=1` | Filaments with stock totals.                              |
| POST   | `filaments`              | Filament fields (below)                    | Returns the new filament's `id`.                          |
| GET    | `filaments/{id}`         |                                            | The filament with its brand, material, spools and notes.  |
| PUT    | `filaments/{id}`         | Filament fields                            |                                                           |
| DELETE | `filaments/{id}`         |                                            | Only works when the filament has no spools; returns 409 otherwise. |
| GET    | `filaments/options`      |                                            | A short list for pickers: name, color, brand, material and default weights. |
| POST   | `filaments/{id}/archive` | `{archived}`                               | Hides or shows the filament in lists.                     |
| POST   | `filaments/{id}/notes`   | `{body, spoolId?}`                         | Adds a dated note, optionally tied to one spool.          |
| DELETE | `notes/{id}`             |                                            |                                                           |

**Filament fields:** `name` is required. Optional: `brand`, `material`, `colorName`, `colorHex` (`#rrggbb`), `diameter`, `nominalWeight`, `spoolWeight`, `nozzleMin`, `nozzleMax`, `bedMin`, `bedMax`, `dryingTemp`, `dryingHours`, `maxSpeed`, `fan`, `productUrl`, `imageUrl`, `rating` (1–5).

### Scanning and Prusament

| Method | Path                     | Body / query                                                            | Notes                                                                                     |
| ------ | ------------------------ | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| POST   | `scan/resolve`           | `{text}`                                                                | Works out what a scanned QR code points to: `{kind: "spool", id}`, `{kind: "prusament", url}` or `{kind: "error", error}`. |
| GET    | `prusament/preview`      | `url`                                                                   | What importing this Prusament spool would create, read from prusament.com.              |
| POST   | `prusament/import`       | `{url, price?, currency?, vendor?, purchaseDate?, location?, notes?, remaining?}` | Imports the spool. If it already exists, returns `{id, existing: true}` instead.          |

### Settings, catalog and locations

| Method      | Path                                     | Body / query                         | Notes                                                                  |
| ----------- | ---------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------- |
| GET, PUT    | `settings`                               | `{currency, lowStockGrams, publicUrl}` | GET also returns `detectedUrl`, the address the server sees requests on. |
| GET, POST   | `catalog/brands`, `catalog/vendors`, `catalog/materials` | `{name, …}`                | Lists items with usage counts, or adds one.                            |
| PUT, DELETE | `catalog/{kind}/{id}`                    | `{name, …}`                          | Deleting an item clears it from filaments and spools that used it.     |
| GET         | `locations`                              |                                      | Storage locations with spool counts.                                   |
| POST        | `locations/rename`                       | `{from, name}`                       | Renames a location on every spool. An empty `name` clears it.          |

Catalog fields: brands take `name` and `website`; vendors take `name`, `url` and `notes`; materials take `name`, `density` (g/cm³), `nozzleMin`, `nozzleMax`, `bedMin`, `bedMax` and `notes`.
