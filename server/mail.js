const { readFileSync } = require('fs');
const { config } = require('./config.js');
/**
 * Verstuurt PDF per e-mail. Zonder RESEND_API_KEY: mock (log naar console).
 */
async function stuurRapportMail(order, pdfFilePath) {
  const onderwerp = `Je Pandloket: ${order.dossier?.adres || 'woningrapport'}`;
  const tekst = [
    `Hallo,`,
    ``,
    `Bedankt voor je bestelling. Hierbij je Pandloket voor:`,
    `${order.dossier?.adres || ''}${order.dossier?.plaats ? ', ' + order.dossier.plaats : ''}`,
    ``,
    `Je kunt het rapport ook downloaden via:`,
    `${config.publicUrl}/bedankt.html?order=${order.id}`,
    ``,
    `Met vriendelijke groet,`,
    `Pandloket`,
  ].join('\n');

  if (!config.resendApiKey) {
    console.log('✉️  [mock mail] naar', order.email);
    console.log('   onderwerp:', onderwerp);
    console.log('   pdf:', pdfFilePath);
    console.log('   download:', `${config.publicUrl}/api/orders/${order.id}/pdf`);
    return { mocked: true };
  }

  const pdfBase64 = readFileSync(pdfFilePath).toString('base64');
  const bestandsnaam = `pandloket-${(order.dossier?.adres || 'rapport')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.pdf`;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: config.mailFrom,
      to: [order.email],
      subject: onderwerp,
      text: tekst,
      attachments: [{
        filename: bestandsnaam,
        content: pdfBase64,
      }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend fout ${res.status}: ${body}`);
  }

  return { mocked: false, ...(await res.json()) };
}

exports.stuurRapportMail = stuurRapportMail;
