// Sends a real notification (email and/or SMS) when a critical alert fires,
// so a monitoring system doesn't stop at "the dashboard turned red." Each
// channel is independently optional and gated by its own env vars, and the
// whole module degrades to a no-op (with a one-time boot log) if neither is
// configured — the same pattern the AI diagnosis layer uses for its API key.
const emailReady = !!(process.env.SENDGRID_API_KEY && process.env.ALERT_EMAIL_TO && process.env.ALERT_EMAIL_FROM);
const smsReady   = !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER && process.env.ALERT_SMS_TO);

let sgMail = null;
if (emailReady) {
  sgMail = require('@sendgrid/mail');
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

let twilioClient = null;
if (smsReady) {
  const twilio = require('twilio');
  twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
}

if (!emailReady && !smsReady) {
  console.log('Notifications disabled: set SENDGRID_API_KEY+ALERT_EMAIL_TO+ALERT_EMAIL_FROM and/or TWILIO_* env vars to enable critical-alert email/SMS.');
}

async function sendEmail(roomName, messages) {
  if (!emailReady) return;
  try {
    await sgMail.send({
      to: process.env.ALERT_EMAIL_TO,
      from: process.env.ALERT_EMAIL_FROM,
      subject: `ColdChain Guard — critical alert in ${roomName}`,
      text: messages.join('\n'),
    });
  } catch (err) {
    console.error('Email notification failed:', err.message);
  }
}

async function sendSms(roomName, messages) {
  if (!smsReady) return;
  try {
    await twilioClient.messages.create({
      to: process.env.ALERT_SMS_TO,
      from: process.env.TWILIO_FROM_NUMBER,
      body: `ColdChain Guard — ${roomName}: ${messages.join('; ')}`.slice(0, 1500),
    });
  } catch (err) {
    console.error('SMS notification failed:', err.message);
  }
}

async function notifyCritical(roomName, messages) {
  if (!messages.length) return;
  await Promise.all([sendEmail(roomName, messages), sendSms(roomName, messages)]);
}

module.exports = { notifyCritical, emailReady, smsReady };
