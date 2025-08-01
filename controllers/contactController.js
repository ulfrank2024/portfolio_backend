const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

exports.sendEmail = async (req, res) => {
  const { name, email, service, message } = req.body;

  // Email to client
  const mailOptionsClient = {
    from: process.env.SMTP_FROM_EMAIL,
    to: email,
    subject: process.env.CLIENT_EMAIL_SUBJECT,
    html: `
      <p>Cher(e) ${name},</p>
      <p>Nous vous remercions sincèrement d'avoir contacté notre équipe. Nous avons bien reçu votre demande concernant le service de <strong>${service}</strong>.</p>
      <p>Votre projet est important pour nous, et nous mettons tout en œuvre pour l'étudier avec la plus grande attention. Nous vous recontacterons dans les plus brefs délais pour discuter des prochaines étapes et vous apporter une solution adaptée à vos besoins.</p>
      <p>Nous sommes impatients de collaborer avec vous.</p>
      <p>Cordialement,</p>
      <p>L'équipe</p>
    `,
  };

  // Email to business
  const mailOptionsBusiness = {
    from: process.env.SMTP_FROM_EMAIL,
    to: process.env.BUSINESS_EMAIL_RECIPIENT,
    subject: process.env.BUSINESS_EMAIL_SUBJECT,
    html: `
      <p>Nouvelle demande de service reçue !</p>
      <p><strong>Nom du client :</strong> ${name}</p>
      <p><strong>Email du client :</strong> ${email}</p>
      <p><strong>Service demandé :</strong> ${service}</p>
      <p><strong>Détails de la demande :</strong></p>      <div>${message.replace(/\n/g, '<br>')}</div>
    `,
  };

  try {
    await transporter.sendMail(mailOptionsClient);
    console.log('Email de confirmation client envoyé avec succès!');    console.log("Destinataire de l'entreprise:", process.env.BUSINESS_EMAIL_RECIPIENT);    await transporter.sendMail(mailOptionsBusiness);    console.log('Email de notification entreprise envoyé avec succès!');
    res.status(200).json({ message: 'Emails envoyés avec succès!' });
  } catch (error) {
    console.error("Erreur lors de l'envoi des emails:", error);
    res.status(500).json({ message: "Erreur lors de l'envoi des emails.", error: error.message });
  }
};
