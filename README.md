# Pandloket

Openbare woningdata (BAG, WOZ, bronnen) + betaalde PDF-export.

## Snel starten (mock-betaling, geen account nodig)

```bash
npm install
npm start
```

Open **http://localhost:3000**

> Niet gebruiken: `python3 -m http.server` — dat serveert alleen HTML zonder `/api/*` (WOZ, OV, enz.).

1. Zoek een adres  
2. Klik **Bestel PDF**  
3. Vul e-mail in → doorgaan  
4. Op de mock-pagina: **Betaal (test)**  
5. Download PDF op de bedankt-pagina (e-mail wordt in de terminal gelogd)

## Deploy (productie)

### Optie A — Railway (aanbevolen als Hostinger 503 blijft)

1. Ga naar [railway.app](https://railway.app) → New Project → Deploy from GitHub → `huizen-check`
2. Variables:
   - `PUBLIC_URL` = `https://pandloket.nl` (of eerst de Railway-URL)
   - `PAYMENT_MODE` = `mock`
   - `PORT` wordt door Railway gezet (niet forceren)
3. Settings → Generate Domain → test `/api/health`
4. DNS bij Hostinger: `pandloket.nl` CNAME/A naar Railway (of Railway custom domain + hun DNS-instructies)

### Optie B — Hostinger Node (Express)

- Entry file: `server/index.js`
- Start command / package.json: `npm start` → `node server/index.js`
- Server is **CommonJS** (geen `"type": "module"`) — nodig voor Hostinger’s preload `require()`
- Output directory: leeg
- Env: `PORT=3000`, `PUBLIC_URL=https://pandloket.nl`, `PAYMENT_MODE=mock`
- Na deploy: Restart, test `/api/health`
- Lokaal altijd met `npm start`, niet Python
## Betalingsmodi

In `.env` (zie `.env.example`):

| `PAYMENT_MODE` | Wat gebeurt er |
|----------------|----------------|
| `mock` (standaard) | Gesimuleerde betaling, geen Mollie |
| `test` | Mollie testkeys (`test_...`) |
| `live` | Echte betalingen (`live_...`) |

### Mollie test

1. Account op [mollie.com](https://www.mollie.com)  
2. Kopieer test-API-key  
3. In `.env`:

```env
PAYMENT_MODE=test
MOLLIE_API_KEY=test_xxxxxxxx
PUBLIC_URL=https://jouw-tunnel.example  # of ngrok — webhook moet bereikbaar zijn
```

4. Herstart `npm start`

### Echte e-mail (optioneel)

Zonder `RESEND_API_KEY` logt de server de mail naar de console.  
Met [Resend](https://resend.com):

```env
RESEND_API_KEY=re_xxxxxxxx
MAIL_FROM=Pandloket <noreply@jouwdomein.nl>
```

## Frontend preview (gratis PDF, geen checkout)

In `js/config.js`:

```js
previewMode: true  // gratis download
previewMode: false // checkout via server (standaard)
```

## API

- `GET  /api/health`
- `POST /api/checkout` — `{ email, dossier }`
- `POST /api/mock-pay/:orderId` — alleen in mock
- `POST /api/webhooks/mollie`
- `GET  /api/orders/:id`
- `GET  /api/orders/:id/pdf`

## Stack

- Static frontend (HTML/JS)
- Express-server (static + API)
- PDFKit (server-PDF)
- Mollie (optioneel) / mock checkout
