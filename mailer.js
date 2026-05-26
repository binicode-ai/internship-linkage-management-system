const nodemailer = require("nodemailer");

// Configure with your SMTP credentials.
// For testing, use Ethereal (https://ethereal.email) or set real SMTP env vars.
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.ethereal.email",
  port: parseInt(process.env.SMTP_PORT || "587"),
  auth: {
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
  },
});

/**
 * Send acceptance email to a student.
 * @param {string} toEmail
 * @param {object} data - { studentName, internshipTitle, companyName, startDate, durationMonths }
 */
async function sendAcceptanceEmail(toEmail, data) {
  const mailOptions = {
    from: process.env.SMTP_FROM || '"InternLink" <no-reply@internlink.et>',
    to: toEmail,
    subject: `Congratulations! Your internship application has been accepted`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
        <div style="background:#0f1f3d;padding:24px;border-radius:8px 8px 0 0;">
          <h1 style="color:#fff;margin:0;font-size:1.4rem;">🎓 InternLink</h1>
        </div>
        <div style="background:#fff;padding:32px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;">
          <h2 style="color:#0f1f3d;">Congratulations, ${data.studentName}!</h2>
          <p style="color:#475569;line-height:1.7;">
            Your internship application has been <strong style="color:#16a34a;">accepted</strong>.
            Here are your placement details:
          </p>
          <table style="width:100%;border-collapse:collapse;margin:20px 0;">
            <tr style="background:#f8fafc;">
              <td style="padding:10px 14px;font-weight:600;color:#64748b;font-size:0.85rem;border-bottom:1px solid #e2e8f0;">Internship</td>
              <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;">${data.internshipTitle}</td>
            </tr>
            <tr>
              <td style="padding:10px 14px;font-weight:600;color:#64748b;font-size:0.85rem;border-bottom:1px solid #e2e8f0;">Company</td>
              <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;">${data.companyName}</td>
            </tr>
            <tr style="background:#f8fafc;">
              <td style="padding:10px 14px;font-weight:600;color:#64748b;font-size:0.85rem;border-bottom:1px solid #e2e8f0;">Start Date</td>
              <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;">${data.startDate}</td>
            </tr>
            <tr>
              <td style="padding:10px 14px;font-weight:600;color:#64748b;font-size:0.85rem;">Duration</td>
              <td style="padding:10px 14px;">${data.durationMonths} month${data.durationMonths === 1 ? '' : 's'}</td>
            </tr>
          </table>
          <p style="color:#475569;line-height:1.7;">
            Please log in to your <strong>Student Portal</strong> to view full details and track your internship progress.
          </p>
          <a href="${process.env.APP_URL || 'http://localhost:3000'}/portal"
             style="display:inline-block;background:#4f8ef7;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:8px;">
            Go to Student Portal
          </a>
          <p style="color:#94a3b8;font-size:0.8rem;margin-top:24px;">
            InternLink — Internship &amp; Industry Linkage Management System, Ethiopia
          </p>
        </div>
      </div>
    `,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("Acceptance email sent:", info.messageId);
    return info;
  } catch (err) {
    // Log but don't crash the app if email fails
    console.error("Email send failed:", err.message);
  }
}

module.exports = { sendAcceptanceEmail };
