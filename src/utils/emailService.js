const nodemailer = require('nodemailer');
require('dotenv').config();

let transporter;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE) === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  return transporter;
}

async function sendSetupPasswordEmail({ to, fullName, setupLink }) {
  const mailer = getTransporter();

  await mailer.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to,
    subject: 'Սահմանեք ձեր գաղտնաբառը',
    text: `
Բարև ${fullName || ''},

Գրանցումը ավարտելու համար բացեք այս հղումը՝
${setupLink}

Եթե սա դուք չեք արել, պարզապես անտեսեք այս նամակը։
    `.trim(),
    html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827;">
        <h2>Բարև ${fullName || ''}</h2>
        <p>Գրանցումը ավարտելու համար սեղմեք ներքևի կոճակը և սահմանեք ձեր գաղտնաբառը։</p>
        <p style="margin: 24px 0;">
          <a
            href="${setupLink}"
            style="background:#111827;color:#ffffff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:700;"
          >
            Սահմանել գաղտնաբառը
          </a>
        </p>
        <p>Կամ բացեք այս հղումը՝</p>
        <p><a href="${setupLink}">${setupLink}</a></p>
        <p>Եթե սա դուք չեք արել, պարզապես անտեսեք այս նամակը։</p>
      </div>
    `,
  });
}

module.exports = {
  sendSetupPasswordEmail,
};