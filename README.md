# Spooldeck

A self-hosted filament tracker for 3D printing. It runs as a single-user app with QR codes at its core:

- **Scan a Prusament spool** and the app imports the spool's real data (net and empty-spool weight, length, manufacture date, diameter tolerance, nozzle and bed temps, color).
- **Print your own labels** for any other spool. Stick one on the box; scanning it, even with the phone's normal camera app, opens that spool.
- **Log usage per print**, or weigh the spool and enter the scale reading. Remaining weight, estimated length and cost per print are calculated from that.
- **Keep the details:** brand, material, color, temps, drying settings, price, where you bought it and storage location, plus dated notes like "strings above 230 °C" for the next time you use the same filament.

Built with Next.js 16, bun, SQLite (Drizzle ORM) and Tailwind/shadcn.

## Quick start (Docker)

```bash
docker compose up -d --build
docker compose logs spooldeck
```

The logs print a **one-time setup code**. Open `http://<host>:3000/setup`, enter the code and create your account. The code means a stranger can't claim a fresh instance that happens to be reachable before you set it up.

Data lives in the `spooldeck-data` volume (`/data/spooldeck.db`). Migrations run automatically on start.

| Variable       | Default                    | Purpose                                                                                                 |
| -------------- | -------------------------- | ------------------------------------------------------------------------------------------------------- |
| `PUBLIC_URL`   | _(request host)_           | The URL encoded in label QR codes, e.g. `https://spools.example.com`. Can also be set under Settings. |
| `DATABASE_URL` | `file:/data/spooldeck.db`  | SQLite file location.                                                                                   |
| `PORT`         | `3000`                     | HTTP port.                                                                                              |

## HTTPS and the camera

Browsers only allow live camera scanning on **HTTPS** or `localhost`. On plain HTTP over your LAN, Spooldeck still works:

- **Labels:** scan them with the phone's built-in camera app; the QR code is a link that opens the spool.
- **Photo scan:** "Scan from a photo" on the Scan page decodes a picture of any QR code, including Prusament ones.
- **Paste:** paste a Prusament link or type a spool code by hand.

For live scanning and secure cookies, put Spooldeck behind a TLS reverse proxy. With [Caddy](https://caddyserver.com):

```caddyfile
spools.example.com {
	reverse_proxy localhost:3000
}
```

Then set `PUBLIC_URL=https://spools.example.com` so printed labels point at the HTTPS address.

## Security

Spooldeck is meant for one person, but it's built to survive being exposed to the internet:

- **Account and passwords:** first-run setup is gated by a setup code from the server logs. Passwords are hashed with scrypt.
- **Sessions:** random 256-bit tokens, stored hashed. The cookie is `httpOnly`, `SameSite=Lax`, and `Secure` behind HTTPS. Sessions slide over 30 days.
- **Rate limiting:** failed logins back off exponentially per IP, with a global limit on top.
- **Access checks:** every page, Server Action and API route checks the session server-side.
- **Prusament lookups:** only `prusament.com` URLs are fetched, which prevents SSRF.
- **Search engines:** pages are `noindex`. Framing and camera use from other origins are blocked.

### Forgot your password?

```bash
docker compose exec spooldeck bun reset-password.js
```

This prints a new random password and signs out every session. Outside Docker, run `bun run reset-password`.

## Labels

Open **Labels** to design one:

- **Size:** pick a preset (Brother QL 62 mm, 50×30/40×30 thermal, Niimbot/Dymo, A4 and Letter sticker sheets) or enter any size in mm.
- **Content and layout:** choose which fields to show and where the QR code goes, then save the setup as a template.
- **Printing:** select spools and press **Print**. The print view sets the page size to match the label.
  - In the browser's print dialog, choose margins **None** and scale **100%**.
  - On a label printer, pick the matching paper size.
  - On a sticker sheet, use **Skip cells** to begin on a partly used sheet.

## Backup

**Settings → Backup** downloads a JSON file with everything except your login. Restoring a backup replaces all current data. You can also copy the SQLite file out of the volume while the app is stopped.

## Development

```bash
bun install
bun run dev          # http://localhost:3000; the setup code is printed in the terminal
bun test             # unit tests
bun run lint
bun run typecheck
bun run build        # standalone production build
```

After changing `src/db/schema.ts`, run `bun run db:generate` to create a migration in `drizzle/`.
