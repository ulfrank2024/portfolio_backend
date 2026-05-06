const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST?.trim(),
  port: parseInt(process.env.SMTP_PORT, 10),
  secure: process.env.SMTP_SECURE?.trim() === 'true',
  auth: {
    user: process.env.SMTP_USER?.trim(),
    pass: process.env.SMTP_PASSWORD?.trim(),
  },
});

const clientEmailTemplate = (name, service, message) => `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Confirmation de votre demande</title>
</head>
<body style="margin:0;padding:0;background-color:#0d1117;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0d1117;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#0f1923 0%,#1a2332 100%);border-radius:16px 16px 0 0;padding:40px 40px 30px;text-align:center;border-bottom:2px solid #00d4ff;">
              <div style="display:inline-block;background:linear-gradient(135deg,#00d4ff,#8b5cf6);border-radius:50%;width:60px;height:60px;line-height:60px;font-size:26px;font-weight:700;color:#fff;margin-bottom:16px;">UL</div>
              <h1 style="margin:0 0 6px;font-size:22px;font-weight:700;color:#ffffff;letter-spacing:0.5px;">Ulrich Lontsi</h1>
              <p style="margin:0;font-size:13px;color:#00d4ff;letter-spacing:2px;text-transform:uppercase;">Développeur Full-Stack</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:#111827;padding:40px;">

              <!-- Greeting -->
              <h2 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#f1f5f9;">Bonjour, ${name} 👋</h2>
              <p style="margin:0 0 28px;font-size:15px;color:#94a3b8;line-height:1.6;">
                Merci pour votre confiance ! Votre demande a bien été reçue et je l'examine avec attention.
              </p>

              <!-- Service badge -->
              <table cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
                <tr>
                  <td style="background:linear-gradient(135deg,#00d4ff15,#8b5cf615);border:1px solid #00d4ff40;border-radius:10px;padding:18px 24px;">
                    <p style="margin:0 0 4px;font-size:11px;color:#00d4ff;text-transform:uppercase;letter-spacing:2px;font-weight:600;">Service demandé</p>
                    <p style="margin:0;font-size:18px;font-weight:700;color:#ffffff;">${service}</p>
                  </td>
                </tr>
              </table>

              <!-- Message recap -->
              <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:28px;">
                <tr>
                  <td style="background:#1e2a3a;border-left:3px solid #8b5cf6;border-radius:0 8px 8px 0;padding:18px 20px;">
                    <p style="margin:0 0 8px;font-size:11px;color:#8b5cf6;text-transform:uppercase;letter-spacing:2px;font-weight:600;">Récapitulatif de votre demande</p>
                    <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.8;white-space:pre-line;">${message.replace(/\n/g, '<br>')}</p>
                  </td>
                </tr>
              </table>

              <!-- Next steps -->
              <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:32px;">
                <tr><td style="padding-bottom:10px;">
                  <p style="margin:0 0 16px;font-size:13px;font-weight:600;color:#f1f5f9;text-transform:uppercase;letter-spacing:1px;">Prochaines étapes</p>
                </td></tr>
                <tr>
                  <td>
                    <table cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td width="36" valign="top" style="padding-right:12px;">
                          <div style="width:28px;height:28px;background:linear-gradient(135deg,#00d4ff,#0ea5e9);border-radius:50%;text-align:center;line-height:28px;font-size:12px;font-weight:700;color:#fff;">1</div>
                        </td>
                        <td style="padding-bottom:14px;">
                          <p style="margin:0;font-size:14px;color:#f1f5f9;font-weight:600;">Analyse de votre projet</p>
                          <p style="margin:2px 0 0;font-size:13px;color:#64748b;">Je prends connaissance de tous les détails de votre demande.</p>
                        </td>
                      </tr>
                      <tr>
                        <td width="36" valign="top" style="padding-right:12px;">
                          <div style="width:28px;height:28px;background:linear-gradient(135deg,#8b5cf6,#7c3aed);border-radius:50%;text-align:center;line-height:28px;font-size:12px;font-weight:700;color:#fff;">2</div>
                        </td>
                        <td style="padding-bottom:14px;">
                          <p style="margin:0;font-size:14px;color:#f1f5f9;font-weight:600;">Prise de contact sous 24–48h</p>
                          <p style="margin:2px 0 0;font-size:13px;color:#64748b;">Je vous contacterai pour discuter des détails et vous soumettre une proposition.</p>
                        </td>
                      </tr>
                      <tr>
                        <td width="36" valign="top" style="padding-right:12px;">
                          <div style="width:28px;height:28px;background:linear-gradient(135deg,#06ffa5,#10b981);border-radius:50%;text-align:center;line-height:28px;font-size:12px;font-weight:700;color:#fff;">3</div>
                        </td>
                        <td>
                          <p style="margin:0;font-size:14px;color:#f1f5f9;font-weight:600;">Démarrage du projet</p>
                          <p style="margin:2px 0 0;font-size:13px;color:#64748b;">Une fois votre accord obtenu, le développement commence.</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- CTA -->
              <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:32px;">
                <tr>
                  <td align="center">
                    <a href="https://portfolio-ulrich-lontsi.vercel.app" style="display:inline-block;background:linear-gradient(135deg,#00d4ff,#8b5cf6);color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:14px 32px;border-radius:8px;letter-spacing:0.5px;">Voir mon portfolio →</a>
                  </td>
                </tr>
              </table>

              <!-- Signature -->
              <table cellpadding="0" cellspacing="0" width="100%" style="border-top:1px solid #1e2a3a;padding-top:24px;">
                <tr>
                  <td>
                    <p style="margin:0 0 4px;font-size:15px;font-weight:700;color:#f1f5f9;">Ulrich Lontsi</p>
                    <p style="margin:0 0 2px;font-size:13px;color:#00d4ff;">Développeur Full-Stack · React · Node.js · Supabase</p>
                    <p style="margin:0;font-size:13px;color:#64748b;">frranklinlontsi99@gmail.com</p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#0f1923;border-radius:0 0 16px 16px;padding:20px 40px;text-align:center;border-top:1px solid #1e2a3a;">
              <p style="margin:0;font-size:11px;color:#334155;">Cet email a été envoyé automatiquement suite à votre demande sur le portfolio d'Ulrich Lontsi.</p>
              <p style="margin:6px 0 0;font-size:11px;color:#334155;">© 2025 Ulrich Lontsi · Ottawa, Canada</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

const businessEmailTemplate = (name, email, service, message) => `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Nouvelle demande de service</title>
</head>
<body style="margin:0;padding:0;background-color:#0d1117;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0d1117;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#1a0533 0%,#0f1923 100%);border-radius:16px 16px 0 0;padding:30px 40px;border-bottom:2px solid #8b5cf6;">
              <table cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td>
                    <p style="margin:0 0 4px;font-size:11px;color:#8b5cf6;text-transform:uppercase;letter-spacing:2px;font-weight:600;">Nouveau lead entrant</p>
                    <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;">Demande de service reçue 🚀</h1>
                  </td>
                  <td align="right" valign="middle">
                    <div style="background:linear-gradient(135deg,#8b5cf6,#7c3aed);border-radius:8px;padding:8px 16px;font-size:12px;font-weight:700;color:#fff;white-space:nowrap;">NOUVEAU</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:#111827;padding:36px 40px;">

              <!-- Client info card -->
              <p style="margin:0 0 16px;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:2px;font-weight:600;">Informations du client</p>
              <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:28px;background:#1e2a3a;border-radius:10px;overflow:hidden;">
                <tr>
                  <td style="padding:20px 24px;border-bottom:1px solid #0d1117;">
                    <table cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td width="50%" style="padding-right:12px;">
                          <p style="margin:0 0 2px;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;">Nom</p>
                          <p style="margin:0;font-size:15px;font-weight:600;color:#f1f5f9;">${name}</p>
                        </td>
                        <td width="50%">
                          <p style="margin:0 0 2px;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;">Email</p>
                          <a href="mailto:${email}" style="margin:0;font-size:14px;font-weight:600;color:#00d4ff;text-decoration:none;">${email}</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:16px 24px;">
                    <p style="margin:0 0 2px;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;">Service demandé</p>
                    <p style="margin:0;font-size:16px;font-weight:700;color:#8b5cf6;">${service}</p>
                  </td>
                </tr>
              </table>

              <!-- Message details -->
              <p style="margin:0 0 16px;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:2px;font-weight:600;">Détails de la demande</p>
              <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:28px;">
                <tr>
                  <td style="background:#1e2a3a;border-left:3px solid #00d4ff;border-radius:0 8px 8px 0;padding:20px 24px;">
                    <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.9;white-space:pre-line;">${message.replace(/\n/g, '<br>')}</p>
                  </td>
                </tr>
              </table>

              <!-- Action button -->
              <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:8px;">
                <tr>
                  <td align="center">
                    <a href="mailto:${email}?subject=Re: Votre demande - ${service}" style="display:inline-block;background:linear-gradient(135deg,#8b5cf6,#7c3aed);color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:14px 32px;border-radius:8px;letter-spacing:0.5px;">Répondre au client →</a>
                  </td>
                </tr>
              </table>
              <p style="margin:10px 0 0;text-align:center;font-size:12px;color:#334155;">Répondre dans les 24–48h pour maximiser la conversion.</p>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#0f1923;border-radius:0 0 16px 16px;padding:20px 40px;text-align:center;border-top:1px solid #1e2a3a;">
              <p style="margin:0;font-size:11px;color:#334155;">Notification automatique · Portfolio Ulrich Lontsi</p>
              <p style="margin:6px 0 0;font-size:11px;color:#334155;">© 2025 · Ottawa, Canada</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

const directClientEmailTemplate = (name, message) => `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Message bien reçu</title>
</head>
<body style="margin:0;padding:0;background-color:#0d1117;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0d1117;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#0f1923 0%,#1a2332 100%);border-radius:16px 16px 0 0;padding:40px 40px 30px;text-align:center;border-bottom:2px solid #00d4ff;">
              <div style="display:inline-block;background:linear-gradient(135deg,#00d4ff,#8b5cf6);border-radius:50%;width:60px;height:60px;line-height:60px;font-size:26px;font-weight:700;color:#fff;margin-bottom:16px;">UL</div>
              <h1 style="margin:0 0 6px;font-size:22px;font-weight:700;color:#ffffff;">Ulrich Lontsi</h1>
              <p style="margin:0;font-size:13px;color:#00d4ff;letter-spacing:2px;text-transform:uppercase;">Développeur Full-Stack</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:#111827;padding:40px;">

              <h2 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#f1f5f9;">Bonjour, ${name} 👋</h2>
              <p style="margin:0 0 28px;font-size:15px;color:#94a3b8;line-height:1.6;">
                Merci pour votre message ! Je l'ai bien reçu et vous répondrai dans les meilleurs délais.
              </p>

              <!-- Message recap -->
              <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:32px;">
                <tr>
                  <td style="background:#1e2a3a;border-left:3px solid #00d4ff;border-radius:0 8px 8px 0;padding:20px 24px;">
                    <p style="margin:0 0 10px;font-size:11px;color:#00d4ff;text-transform:uppercase;letter-spacing:2px;font-weight:600;">Votre message</p>
                    <p style="margin:0;font-size:14px;color:#cbd5e1;line-height:1.8;">${message.replace(/\n/g, '<br>')}</p>
                  </td>
                </tr>
              </table>

              <!-- Réponse rapide info -->
              <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:32px;background:#0f1923;border-radius:10px;border:1px solid #1e2a3a;">
                <tr>
                  <td style="padding:20px 24px;text-align:center;">
                    <p style="margin:0 0 4px;font-size:28px;">⏱️</p>
                    <p style="margin:0 0 4px;font-size:15px;font-weight:700;color:#f1f5f9;">Réponse sous 24h</p>
                    <p style="margin:0;font-size:13px;color:#64748b;">Je suis disponible du lundi au vendredi et réponds aussi le weekend.</p>
                  </td>
                </tr>
              </table>

              <!-- CTA -->
              <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:32px;">
                <tr>
                  <td align="center">
                    <a href="https://portfolio-ulrich-lontsi.vercel.app" style="display:inline-block;background:linear-gradient(135deg,#00d4ff,#8b5cf6);color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:14px 32px;border-radius:8px;letter-spacing:0.5px;">Voir mon portfolio →</a>
                  </td>
                </tr>
              </table>

              <!-- Signature -->
              <table cellpadding="0" cellspacing="0" width="100%" style="border-top:1px solid #1e2a3a;padding-top:24px;">
                <tr>
                  <td>
                    <p style="margin:0 0 4px;font-size:15px;font-weight:700;color:#f1f5f9;">Ulrich Lontsi</p>
                    <p style="margin:0 0 2px;font-size:13px;color:#00d4ff;">Développeur Full-Stack · React · Node.js · Supabase</p>
                    <p style="margin:0;font-size:13px;color:#64748b;">frranklinlontsi99@gmail.com</p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#0f1923;border-radius:0 0 16px 16px;padding:20px 40px;text-align:center;border-top:1px solid #1e2a3a;">
              <p style="margin:0;font-size:11px;color:#334155;">Cet email a été envoyé automatiquement suite à votre message sur le portfolio d'Ulrich Lontsi.</p>
              <p style="margin:6px 0 0;font-size:11px;color:#334155;">© 2025 Ulrich Lontsi · Ottawa, Canada</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

const directBusinessEmailTemplate = (name, email, phone, message) => `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Nouveau message de contact</title>
</head>
<body style="margin:0;padding:0;background-color:#0d1117;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0d1117;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#0a1f14 0%,#0f1923 100%);border-radius:16px 16px 0 0;padding:30px 40px;border-bottom:2px solid #06ffa5;">
              <table cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td>
                    <p style="margin:0 0 4px;font-size:11px;color:#06ffa5;text-transform:uppercase;letter-spacing:2px;font-weight:600;">Message direct</p>
                    <h1 style="margin:0;font-size:22px;font-weight:700;color:#ffffff;">Quelqu'un vous a écrit ✉️</h1>
                  </td>
                  <td align="right" valign="middle">
                    <div style="background:linear-gradient(135deg,#06ffa5,#10b981);border-radius:8px;padding:8px 16px;font-size:12px;font-weight:700;color:#0a1f14;white-space:nowrap;">CONTACT</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:#111827;padding:36px 40px;">

              <!-- Contact info -->
              <p style="margin:0 0 16px;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:2px;font-weight:600;">Expéditeur</p>
              <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:28px;background:#1e2a3a;border-radius:10px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <table cellpadding="0" cellspacing="0" width="100%">
                      <tr>
                        <td width="33%" style="padding-right:12px;padding-bottom:16px;">
                          <p style="margin:0 0 3px;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;">Nom</p>
                          <p style="margin:0;font-size:15px;font-weight:600;color:#f1f5f9;">${name}</p>
                        </td>
                        <td width="33%" style="padding-right:12px;padding-bottom:16px;">
                          <p style="margin:0 0 3px;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;">Email</p>
                          <a href="mailto:${email}" style="font-size:14px;font-weight:600;color:#00d4ff;text-decoration:none;">${email}</a>
                        </td>
                        <td width="33%" style="padding-bottom:16px;">
                          <p style="margin:0 0 3px;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;">Téléphone</p>
                          <p style="margin:0;font-size:14px;font-weight:600;color:${phone ? '#f1f5f9' : '#334155'};">${phone || 'Non renseigné'}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Message -->
              <p style="margin:0 0 16px;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:2px;font-weight:600;">Message</p>
              <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:28px;">
                <tr>
                  <td style="background:#1e2a3a;border-left:3px solid #06ffa5;border-radius:0 8px 8px 0;padding:20px 24px;">
                    <p style="margin:0;font-size:14px;color:#cbd5e1;line-height:1.9;">${message.replace(/\n/g, '<br>')}</p>
                  </td>
                </tr>
              </table>

              <!-- CTA -->
              <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:8px;">
                <tr>
                  <td align="center">
                    <a href="mailto:${email}?subject=Re: Votre message" style="display:inline-block;background:linear-gradient(135deg,#06ffa5,#10b981);color:#0a1f14;text-decoration:none;font-size:14px;font-weight:700;padding:14px 32px;border-radius:8px;letter-spacing:0.5px;">Répondre →</a>
                  </td>
                </tr>
              </table>
              <p style="margin:10px 0 0;text-align:center;font-size:12px;color:#334155;">Répondre rapidement améliore l'expérience visiteur.</p>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#0f1923;border-radius:0 0 16px 16px;padding:20px 40px;text-align:center;border-top:1px solid #1e2a3a;">
              <p style="margin:0;font-size:11px;color:#334155;">Notification automatique · Portfolio Ulrich Lontsi</p>
              <p style="margin:6px 0 0;font-size:11px;color:#334155;">© 2025 · Ottawa, Canada</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

exports.sendEmail = async (req, res) => {
  const { type, name, email, phone, service, message } = req.body;
  const isDirect = type === 'direct';

  const mailOptionsClient = {
    from: `"Ulrich Lontsi" <${process.env.SMTP_FROM_EMAIL?.trim()}>`,
    to: email,
    subject: isDirect ? 'Message bien reçu ✓' : process.env.CLIENT_EMAIL_SUBJECT?.trim(),
    html: isDirect
      ? directClientEmailTemplate(name, message)
      : clientEmailTemplate(name, service, message),
  };

  const mailOptionsBusiness = {
    from: `"Portfolio Bot" <${process.env.SMTP_FROM_EMAIL?.trim()}>`,
    to: process.env.BUSINESS_EMAIL_RECIPIENT?.trim(),
    subject: isDirect ? `✉️ Message de ${name}` : process.env.BUSINESS_EMAIL_SUBJECT?.trim(),
    html: isDirect
      ? directBusinessEmailTemplate(name, email, phone, message)
      : businessEmailTemplate(name, email, service, message),
  };

  try {
    await transporter.sendMail(mailOptionsClient);
    await transporter.sendMail(mailOptionsBusiness);
    res.status(200).json({ message: 'Emails envoyés avec succès!' });
  } catch (error) {
    console.error("Erreur lors de l'envoi des emails:", error);
    res.status(500).json({ message: "Erreur lors de l'envoi des emails.", error: error.message });
  }
};
