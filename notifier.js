import nodemailer from 'nodemailer';

const escapeHtml = value => String(value).replace(/[&<>"']/g, char => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]
));

export function createNotifier(env = process.env) {
  const recipients = env.NOTIFY_EMAIL?.trim();
  if (!env.SMTP_HOST || !recipients) {
    return { enabled: false, async submission() {} };
  }
  const transport = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: Number(env.SMTP_PORT ?? 587),
    secure: env.SMTP_SECURE === 'true',
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
  const from = env.SMTP_FROM || env.SMTP_USER;
  const dashboardUrl = env.PUBLIC_URL ? `${env.PUBLIC_URL.replace(/\/$/, '')}/admin` : '';

  return {
    enabled: true,
    async submission(details) {
      const rows = [
        ['Student name', details.studentName],
        ['Class', details.class ? `Class ${details.class}` : 'Not provided'],
        ['Jersey size', details.jerseySize],
        ['Pants size', details.pantsSize],
        ['Printed name', details.nickname],
        ['Jersey number', `#${details.jerseyNumber}`],
      ];
      await transport.sendMail({
        from,
        to: recipients,
        subject: `New jersey form: ${details.studentName} (#${details.jerseyNumber})`,
        text: `A new Junior Soccer jersey form was submitted.\n\n${rows.map(([label, value]) => `${label}: ${value}`).join('\n')}${dashboardUrl ? `\n\nDashboard: ${dashboardUrl}` : ''}`,
        html: `<div style="font-family:Arial,sans-serif;color:#111827">
  <div style="background:#730b2b;color:#fff;padding:16px 20px;border-top:4px solid #e5bc43">
    <strong>BINUS School Simprug</strong><br>New Junior Soccer jersey form
  </div>
  <table style="border-collapse:collapse;margin:16px 0;font-size:14px">
    ${rows.map(([label, value]) => `<tr><td style="padding:6px 16px 6px 0;color:#6b7280">${label}</td><td style="padding:6px 0;font-weight:700">${escapeHtml(value)}</td></tr>`).join('')}
  </table>
  ${dashboardUrl ? `<a href="${escapeHtml(dashboardUrl)}" style="color:#730b2b">Open the admin dashboard</a>` : ''}
</div>`,
      });
    },
  };
}
