<h1 align="center">
  <img src="src/app/icon.svg" alt="" width="72" height="72" align="absmiddle" />
  Spooldeck
</h1>

A self-hosted filament tracker for 3D printing. It runs as a single-user app with QR codes at its core:

- **Scan a Prusament spool** and the app imports the spool's real data (net and empty-spool weight, length, manufacture date, diameter tolerance, nozzle and bed temps, color).
- **Print your own labels** for any other spool. Stick one on the box; scanning it, even with the phone's normal camera app, opens that spool.
- **Log usage per print**: upload the G-code from PrusaSlicer and the filament it used comes off the right spools, even for multi-material prints. You can also type in the grams, or weigh the spool and enter the scale reading. Remaining weight, estimated length and cost per print are calculated from that.
- **Follow printers live:** connect a Klipper printer through Moonraker or a Prusa through PrusaLink, pick the spool on each tool or MMU slot, and the spools' weight goes down while it prints.
- **Keep the details:** brand, material, color, temps, drying settings, price, where you bought it and storage location, plus dated notes like "strings above 230 °C" for the next time you use the same filament.

Built with Next.js 16, bun, PostgreSQL (Drizzle ORM) and Tailwind/shadcn.

## Screenshots

![Dashboard with spools in stock, filament on hand, inventory value, a running-low list and recent prints](docs/screenshots/dashboard.png)

<p>
  <img src="docs/screenshots/spools.png" alt="Spool list with color swatches, remaining weight bars, status and storage location" width="49%" />
  <img src="docs/screenshots/spool.png" alt="Spool page with remaining weight, usage history with cost per print, print settings and purchase details" width="49%" />
</p>
<p>
  <img src="docs/screenshots/filament.png" alt="Filament page with dated notes, print settings and every spool bought with its price per kg" width="49%" />
  <img src="docs/screenshots/labels.png" alt="Label designer with a QR label preview, size presets and spool selection" width="49%" />
</p>

On a phone, the sidebar becomes a bottom bar with the scanner in the middle:

<p>
  <img src="docs/screenshots/mobile-dashboard.png" alt="Dashboard on a phone" width="32%" />
  <img src="docs/screenshots/mobile-spool.png" alt="Spool page on a phone" width="32%" />
</p>

## Quick start (Docker)

Spooldeck expects to sit behind a reverse proxy container on a shared Docker network called `proxy` (see [HTTPS and the camera](#https-and-the-camera)). Create the network once if you don't have it yet:

```bash
docker network create proxy
docker compose up -d --build
docker compose logs spooldeck
```

The logs print a **one-time setup code**. Open `https://<your domain>/setup`, enter the code and create your account. The code means a stranger can't claim a fresh instance that happens to be reachable before you set it up.

Compose runs Spooldeck next to a PostgreSQL 17 container. The database isn't published on the host, and its data lives in the `spooldeck-postgres` volume. Migrations run automatically on start. Set `POSTGRES_PASSWORD` in a `.env` file next to `docker-compose.yml` before the first start.

| Variable            | Default            | Purpose                                                                                                 |
| ------------------- | ------------------ | ------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`      | _(required)_       | PostgreSQL connection string, e.g. `postgres://user:pass@host:5432/spooldeck`. Compose sets it.          |
| `PGPASSWORD`        | _(none)_           | Database password, if you leave it out of `DATABASE_URL`. Saves percent-encoding special characters. Compose sets it. |
| `POSTGRES_PASSWORD` | `spooldeck`        | Password for the bundled Postgres container (compose only).                                             |
| `PUBLIC_URL`        | _(request host)_   | The URL encoded in label QR codes, e.g. `https://spools.example.com`. Can also be set under Settings. |
| `DATABASE_POOL_MAX` | `10`               | Database connections per app instance.                                                                  |
| `PORT`              | `3000`             | HTTP port.                                                                                              |

To use a Postgres server you already run, drop the `postgres` service from the compose file and point `DATABASE_URL` at it.

## HTTPS and the camera

Browsers only allow live camera scanning on **HTTPS** or `localhost`. On plain HTTP over your LAN, Spooldeck still works:

- **Labels:** scan them with the phone's built-in camera app; the QR code is a link that opens the spool.
- **Photo scan:** "Scan from a photo" on the Scan page decodes a picture of any QR code, including Prusament ones.
- **Paste:** paste a Prusament link or type a spool code by hand.

For live scanning and secure cookies, put Spooldeck behind a TLS reverse proxy. The compose file doesn't publish any ports. Instead it joins the external `proxy` network, so a proxy container on that network reaches it as `spooldeck:3000`. With [Caddy](https://caddyserver.com) running in Docker on the `proxy` network:

```caddyfile
spools.example.com {
	reverse_proxy spooldeck:3000
}
```

Then set `PUBLIC_URL=https://spools.example.com` so printed labels point at the HTTPS address.

Spooldeck relies on the `X-Forwarded-Proto`, `X-Forwarded-Host` and `X-Forwarded-For` headers, which Caddy sets by default. They decide secure cookies, the address in QR codes and login rate limiting, so don't publish port 3000 next to the proxy: anyone reaching the app directly could forge them.

No reverse proxy? Uncomment the `ports` block in `docker-compose.yml` and remove the `proxy` network from the `spooldeck` service and the `networks` section.

## Security

Spooldeck is meant for one person, but it's built to survive being exposed to the internet:

- **Account and passwords:** first-run setup is gated by a setup code from the server logs. Passwords are hashed with scrypt.
- **Sessions:** random 256-bit tokens, stored hashed. The cookie is `httpOnly`, `SameSite=Lax`, and `Secure` behind HTTPS. Sessions slide over 30 days.
- **Rate limiting:** failed logins back off exponentially per IP, with a global limit on top.
- **Access checks:** every page, Server Action and API route (except the `/api/health` check) verifies the session server-side.
- **API tokens:** the JSON API under `/api/v1` takes `Authorization: Bearer <token>`. Tokens come from `POST /api/v1/auth/login`, are ordinary sessions, and are revoked by "Sign out everywhere" and password changes. See [docs/api.md](docs/api.md).
- **Prusament lookups:** only `prusament.com` URLs are fetched, which prevents SSRF.
- **Printers:** the server only connects to printer addresses you add. Moonraker API keys and PrusaLink passwords are stored in the database and never sent back by the API or shown in the web interface.
- **Search engines:** pages are `noindex`. Framing and camera use from other origins are blocked.

### Forgot your password?

```bash
docker compose exec spooldeck bun reset-password.js
```

This prints a new random password and signs out every session. Outside Docker, run `bun run reset-password`.

## Labels

Open **Labels** to design one:

- **Size:** pick a preset (Brother QL 62 mm, 50×30/40×30 thermal, Niimbot/Dymo, A4 and Letter sticker sheets) or enter any size in mm.
- **Content and layout:** a label shows the brand, the colour name, the material and spool code, and a bar in the filament's colour, with the Spooldeck spool on that colour in the middle of the QR code. Add the nozzle and bed temperatures or other fields under **Fields**, move the QR code, and save the setup as a template.
- **Printing:** select spools and press **Print**. The print view sets the page size to match the label.
  - In the browser's print dialog, choose margins **None** and scale **100%**.
  - On a label printer, pick the matching paper size.
  - On a sticker sheet, use **Skip cells** to begin on a partly used sheet.

## Logging prints from PrusaSlicer

Open **Log print** and drop in the file PrusaSlicer exported, either plain `.gcode` or binary `.bgcode` (the default for the MK4, XL and MINI). Spooldeck reads how much filament each extruder used and suggests a spool for each one by matching the material, the filament profile name and the colour. Check the suggestions, change any spool or amount, and save.

- **Multi-material:** each extruder or MMU slot gets its own row. Pick "Don't log this filament" for any you don't want to track.
- **Missing density:** if the filament profile in PrusaSlicer has no density, the slicer reports only a volume. Spooldeck then estimates the grams from the chosen spool's material density.
- **Privacy:** the file is read in your browser. Only the print name and the grams are sent to the server.

## Printers (Klipper and Prusa)

Spooldeck can follow your printers and take the filament off the loaded spools while they print, so you don't have to log anything. It works with Klipper printers through Moonraker, and with Prusa printers through PrusaLink (MK4, XL, MINI and Core One, or an MK3 running Prusa-Link).

1. Open **Printers → Add printer**, pick the type and enter the address:
   - **Klipper:** the address you open Mainsail or Fluidd on usually works; otherwise use the printer's IP with port 7125, e.g. `http://192.168.1.50:7125`.
   - **Prusa:** turn on PrusaLink on the printer, then enter its IP address and the username and password shown in its network settings (the username is usually `maker`).
2. Set **Tools** to the number of toolheads (an XL, a toolchanger) or MMU slots. Each tool holds its own spool.
3. Pick the spool that's loaded on each tool. You can also do this from a spool's **⋯** menu, so scanning the label on the spool you just put on is enough.
4. Print as usual. The printer card, the dashboard and the spool page update on their own every few seconds.

How the filament is counted:

- **Klipper** reports how much filament it has extruded. Spooldeck converts that to grams with the spool's diameter and material density. On a toolchanger the filament goes to the active extruder's spool.
- **Prusa** printers only report how far the print has got. When a print starts, Spooldeck downloads the print file once and reads how much filament it uses per tool, the same way **Log print** does. A `.bgcode` file is only read up to its G-code, so this is quick; a plain `.gcode` file is downloaded in full. Each spool is then charged its tool's share times the progress, so a stopped print keeps what it used up to then. The file has to be sliced in PrusaSlicer, since other slicers don't write the stats Spooldeck reads.

Details:

- **Server-side connection:** the Spooldeck server talks to the printer, not your browser, so the server (or its container) has to reach the printer on your network.
- **Access on Klipper:** if Moonraker requires sign-in, either add Spooldeck's address to `trusted_clients` in `moonraker.conf` or enter an API key. You can read the key with `curl http://<printer>:7125/access/api_key` from a machine that's already trusted.
- **Swapping spools mid-print:** pick the new spool when you swap. The old spool keeps what was printed so far and the new one counts from that point.
- **No spool loaded yet:** if you start a print and pick the spool afterwards, the whole print is counted on it.
- **Cancelled and failed prints** keep the filament they used, marked "Cancelled" or "Failed" in the usage history.
- **Restarts:** the print being tracked is saved, so if Spooldeck restarts mid-print it carries on with the same entries. Prints that start and finish entirely while Spooldeck is down aren't logged; use **Log print** for those.
- **MMU on Klipper:** Klipper reports one extruder for an MMU (Happy Hare, ERCF and the like), so all of the filament goes to tool 1's spool. For multi-material prints on those, upload the G-code on **Log print** instead.

## JSON API

Everything the web interface does is also available as a JSON API under `/api/v1`, so you can log prints from a script, a home automation or your own app. Sign in once for a token and send it as a bearer token:

```bash
TOKEN=$(curl -s -X POST https://spools.example.com/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"username":"me","password":"…"}' | jq -r .token)

curl -X POST https://spools.example.com/api/v1/spools/3/usage \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"grams":42.5,"printName":"Cable clips"}'
```

[docs/api.md](docs/api.md) lists every endpoint.

## Backup

**Settings → Backup** downloads a JSON file with everything except your login. Restoring a backup replaces all current data. For a full copy including your login, use `pg_dump`:

```bash
docker compose exec postgres pg_dump -U spooldeck spooldeck > spooldeck.sql
```

## Development

You need a PostgreSQL database. Either run one with Docker:

```bash
docker compose up -d postgres
```

and add `ports: ["5432:5432"]` to the `postgres` service so it's reachable from the host, or, without Docker, start an embedded one ([PGlite](https://pglite.dev)) that keeps its data in `./data/pglite`:

```bash
bun run db:dev
```

Copy `.env.example` to `.env.local` and set `DATABASE_URL`. With `db:dev` that's `postgres://postgres@localhost:5432/postgres` plus `DATABASE_POOL_MAX=1`, because PGlite can only serve one connection reliably. Then:

```bash
bun install
bun run dev          # http://localhost:3000; the setup code is printed in the terminal
bun test             # unit tests; they start their own in-memory Postgres
bun run lint
bun run typecheck
bun run build        # standalone production build
```

After changing `src/db/schema.ts`, run `bun run db:generate` to create a migration in `drizzle/`.

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the development setup, conventions and what to check before opening a PR.

## License

Spooldeck is free software under the [GNU General Public License v3.0](LICENSE).
