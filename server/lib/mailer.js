/* lib/mailer.js — provider-agnostic SMTP send
   If no SMTP_HOST is configured, sends are SIMULATED (nothing leaves the box)
   so the server runs offline in dev. Works with Resend / SES / Postmark /
   Mailgun / Gmail — anything that speaks SMTP. */
import nodemailer from "nodemailer";

let transport = null;
if (process.env.SMTP_HOST) {
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: +(process.env.SMTP_PORT || 587),
    secure: +(process.env.SMTP_PORT || 587) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
}

export const mailEnabled = !!transport;

export async function sendMail({ to, subject, body }) {
  if (!transport) {
    return { simulated: true, messageId: "sim-" + Date.now() };
  }
  const info = await transport.sendMail({
    from: process.env.MAIL_FROM || "SIGNAL <noreply@signal.app>",
    to: Array.isArray(to) ? to.join(", ") : to,
    subject,
    text: body,
  });
  return { simulated: false, messageId: info.messageId };
}
