# Pandloket

Openbare woningdata (BAG, WOZ, bronnen) + betaalde PDF-export.

## Snel starten (mock-betaling, geen account nodig)

```bash
npm install
npm start
```

Open **http://localhost:3000**

1. Zoek een adres  
2. Klik **Bestel PDF**  
3. Vul e-mail in → doorgaan  
4. Op de mock-pagina: **Betaal (test)**  
5. Download PDF op de bedankt-pagina (e-mail wordt in de terminal gelogd)

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
