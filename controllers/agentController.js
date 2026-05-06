const Anthropic = require('@anthropic-ai/sdk');
const pdfParse = require('pdf-parse');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const supabase = require('../lib/supabase');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST?.trim(),
  port: parseInt(process.env.SMTP_PORT, 10),
  secure: process.env.SMTP_SECURE?.trim() === 'true',
  auth: {
    user: process.env.SMTP_USER?.trim(),
    pass: process.env.SMTP_PASSWORD?.trim(),
  },
});

const INITIAL_GREETING = `Bonjour ! Je suis l'assistant IA d'Ulrich Lontsi 👋

Je suis ici pour vous aider à définir votre projet digital et préparer un cahier des charges professionnel, gratuitement et sans engagement.

Pour commencer, pouvez-vous me parler de votre projet ? Quel type de site ou d'application souhaitez-vous créer ?`;

const SYSTEM_PROMPT = `Tu es l'assistant IA d'Ulrich Lontsi, développeur web freelance expert basé à Ottawa (React, Node.js, Supabase). Tu mènes des entretiens de découverte de projet avec ses clients potentiels.

TON OBJECTIF : Collecter toutes les informations nécessaires pour créer un cahier des charges complet.

INFORMATIONS À COLLECTER (de manière naturelle et conversationnelle) :
- Prénom et nom du client
- Email et téléphone
- Type de projet (site vitrine, e-commerce, application web/mobile, refonte, landing page...)
- Fonctionnalités souhaitées (liste précise)
- Public cible et utilisateurs
- Références visuelles ou design (encourage à partager des images ou PDFs)
- Contraintes techniques (hébergement existant, CMS, intégrations tierces)
- Délai souhaité
- Budget approximatif

RÈGLES :
- Maximum 2-3 questions à la fois — jamais de liste de 10 questions d'un coup
- Ton chaleureux, professionnel et expert
- Reformule et confirme ce que tu comprends
- Pose des questions de clarification pertinentes
- Propose des suggestions techniques quand pertinent
- Réponds TOUJOURS en français sauf si le client écrit dans une autre langue
- Analyse les fichiers partagés (maquettes, PDFs) et commente-les

SIGNAL DE FIN : Quand tu as collecté TOUTES les informations essentielles (type + fonctionnalités + délai + budget + contact), ajoute EXACTEMENT "[[SPEC_READY]]" à la fin de ton dernier message (après avoir résumé les infos collectées et proposé de générer le cahier des charges).`;

const SPEC_GEN_SYSTEM = `Tu es un consultant technique expert. À partir de la conversation fournie, génère un cahier des charges professionnel et complet.

IMPORTANT: Réponds UNIQUEMENT avec du JSON valide, sans texte avant ou après, sans balises markdown.

Structure JSON requise:
{
  "titre": "Titre descriptif du projet",
  "date": "YYYY-MM-DD",
  "client": { "nom": "...", "email": "...", "telephone": "..." },
  "description": "Description générale en 2-3 phrases",
  "type_projet": "Site vitrine | E-commerce | Application web | Application mobile | Refonte | Autre",
  "public_cible": "Description du public cible",
  "fonctionnalites": [
    { "nom": "Nom de la feature", "description": "Description détaillée", "priorite": "haute" }
  ],
  "cas_utilisation": ["L'utilisateur peut faire X...", "L'administrateur peut..."],
  "technologies": {
    "frontend": ["React", "..."],
    "backend": ["Node.js", "..."],
    "base_de_donnees": ["Supabase", "..."],
    "autres": ["..."]
  },
  "jalons": [
    { "titre": "Phase 1 - Conception", "description": "...", "duree": "1 semaine" }
  ],
  "budget": { "min": 0, "max": 0, "devise": "EUR", "note": "..." },
  "delai_total": "X semaines",
  "livrables": ["Code source", "Documentation", "..."],
  "contraintes": ["...", "..."],
  "notes": "..."
}`;

// ─── CREATE SESSION ───────────────────────────────────────────────────────────
exports.createSession = async (req, res) => {
  try {
    const { data: session, error } = await supabase
      .from('chat_sessions')
      .insert({ status: 'active' })
      .select()
      .single();

    if (error) throw error;

    // Save initial greeting
    await supabase.from('chat_messages').insert({
      session_id: session.id,
      role: 'assistant',
      content: INITIAL_GREETING,
    });

    res.json({ sessionId: session.id, greeting: INITIAL_GREETING });
  } catch (err) {
    console.error('createSession error:', err);
    res.status(500).json({ error: err.message });
  }
};

// ─── LOAD HISTORY ────────────────────────────────────────────────────────────
exports.getHistory = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { data, error } = await supabase
      .from('chat_messages')
      .select('role, content, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (error) throw error;
    res.json({ messages: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─── STREAMING CHAT ──────────────────────────────────────────────────────────
exports.chat = async (req, res) => {
  const { sessionId } = req.params;
  const userText = req.body.message || '';
  const files = req.files || [];

  // Verify session exists
  const { data: session } = await supabase
    .from('chat_sessions')
    .select('id, status')
    .eq('id', sessionId)
    .single();

  if (!session) return res.status(404).json({ error: 'Session introuvable' });

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    // Load history from DB
    const { data: dbMessages } = await supabase
      .from('chat_messages')
      .select('role, content')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    const history = (dbMessages || []).map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // Build current user message (text + files)
    const contentBlocks = [];

    for (const file of files) {
      if (file.mimetype.startsWith('image/')) {
        const mediaType = file.mimetype;
        contentBlocks.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: mediaType,
            data: file.buffer.toString('base64'),
          },
        });
      } else if (file.mimetype === 'application/pdf') {
        try {
          const parsed = await pdfParse(file.buffer);
          contentBlocks.push({
            type: 'text',
            text: `[Fichier PDF : ${file.originalname}]\n${parsed.text.slice(0, 8000)}`,
          });
        } catch {
          contentBlocks.push({
            type: 'text',
            text: `[PDF joint : ${file.originalname} — impossible à lire]`,
          });
        }
      }
    }

    if (userText.trim()) {
      contentBlocks.push({ type: 'text', text: userText });
    }

    const userMessageContent =
      contentBlocks.length === 1 && contentBlocks[0].type === 'text'
        ? userText
        : contentBlocks;

    // Save user message to DB (text only — no base64 in DB)
    const dbUserContent =
      files.length > 0
        ? `${userText}${files.map((f) => `\n[Fichier joint : ${f.originalname}]`).join('')}`
        : userText;

    await supabase.from('chat_messages').insert({
      session_id: sessionId,
      role: 'user',
      content: dbUserContent,
    });

    // Call Claude with streaming
    const claudeMessages = [
      ...history,
      { role: 'user', content: userMessageContent },
    ];

    let fullText = '';

    const stream = anthropic.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: claudeMessages,
    });

    stream.on('text', (text) => {
      fullText += text;
      res.write(`data: ${JSON.stringify({ text })}\n\n`);
    });

    await stream.finalMessage();

    // Save assistant response to DB
    await supabase.from('chat_messages').insert({
      session_id: sessionId,
      role: 'assistant',
      content: fullText,
    });

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    console.error('Chat stream error:', err);
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
  }
};

// ─── GENERATE SPEC ───────────────────────────────────────────────────────────
exports.generateSpec = async (req, res) => {
  const { sessionId } = req.params;

  try {
    // Load full conversation
    const { data: dbMessages } = await supabase
      .from('chat_messages')
      .select('role, content, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (!dbMessages?.length) {
      return res.status(400).json({ error: 'Pas de conversation trouvée' });
    }

    const history = dbMessages.map((m) => ({ role: m.role, content: m.content }));

    // Ask Claude to generate the spec as JSON
    const specResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: SPEC_GEN_SYSTEM,
      messages: [
        ...history,
        {
          role: 'user',
          content:
            'Génère maintenant le cahier des charges complet au format JSON selon la structure fournie, basé sur toute notre conversation. Réponds UNIQUEMENT avec du JSON valide.',
        },
      ],
    });

    const specText = specResponse.content[0].text.trim();

    let specData;
    try {
      specData = JSON.parse(specText);
    } catch {
      const match = specText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (match) {
        specData = JSON.parse(match[1]);
      } else {
        throw new Error('Format JSON invalide retourné par Claude');
      }
    }

    // Generate secure admin token
    const adminToken = crypto.randomBytes(32).toString('hex');

    // Generate MD documents in parallel (JSON spec is ready)
    const [claudeCodeMd, specTechniqueMd] = await Promise.all([
      generateClaudeCodeMd(specData),
      generateSpecTechniqueMd(specData),
    ]);

    // Save spec + MD docs to Supabase
    const { data: spec, error: specError } = await supabase
      .from('project_specs')
      .insert({
        session_id: sessionId,
        spec_data: specData,
        admin_token: adminToken,
        status: 'draft',
        claude_code_md: claudeCodeMd,
        spec_technique_md: specTechniqueMd,
      })
      .select()
      .single();

    if (specError) throw specError;

    // Update session with client info
    await supabase
      .from('chat_sessions')
      .update({
        status: 'spec_ready',
        client_name: specData.client?.nom || null,
        client_email: specData.client?.email || null,
        client_phone: specData.client?.telephone || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId);

    // Send notification email to Ulrich
    const validateUrl = `${process.env.BACKEND_URL}/api/admin/validate/${spec.id}?token=${adminToken}`;
    await sendSpecNotificationEmail(specData, validateUrl, spec.id);

    res.json({ specId: spec.id, specData, claudeCodeMd, specTechniqueMd });
  } catch (err) {
    console.error('generateSpec error:', err);
    res.status(500).json({ error: err.message });
  }
};

// ─── ADMIN VALIDATE SPEC (via email link) ────────────────────────────────────
exports.validateSpec = async (req, res) => {
  const { specId } = req.params;
  const { token } = req.query;

  const errorPage = (msg) => `
<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Erreur</title>
<style>body{background:#0d1117;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}
.card{background:#111827;border:1px solid #ef4444;border-radius:16px;padding:40px;text-align:center;max-width:400px;}
h1{color:#ef4444;margin:0 0 12px;} p{color:#94a3b8;}</style></head>
<body><div class="card"><h1>❌ Erreur</h1><p>${msg}</p></div></body></html>`;

  const successPage = (clientName) => `
<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><title>Envoyé !</title>
<style>body{background:#0d1117;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;}
.card{background:#111827;border:1px solid #06ffa5;border-radius:16px;padding:40px;text-align:center;max-width:500px;}
h1{color:#06ffa5;margin:0 0 12px;font-size:28px;} p{color:#94a3b8;font-size:15px;line-height:1.6;margin:0;}
.check{font-size:60px;margin-bottom:20px;}</style></head>
<body><div class="card"><div class="check">✅</div>
<h1>Cahier des charges envoyé !</h1>
<p>Le cahier des charges a été envoyé à <strong style="color:#f1f5f9;">${clientName}</strong> par email.</p>
</div></body></html>`;

  try {
    const { data: spec } = await supabase
      .from('project_specs')
      .select('*, chat_sessions(*)')
      .eq('id', specId)
      .eq('admin_token', token)
      .single();

    if (!spec) return res.status(403).send(errorPage('Lien invalide ou expiré.'));
    if (spec.status === 'sent') return res.send(successPage(spec.spec_data?.client?.nom || 'le client'));

    const specData = spec.spec_data;
    const clientEmail = specData?.client?.email || spec.chat_sessions?.client_email;
    const clientName = specData?.client?.nom || spec.chat_sessions?.client_name || 'Client';

    if (!clientEmail) return res.status(400).send(errorPage("Email client introuvable dans le cahier des charges."));

    // Send spec to client
    await transporter.sendMail({
      from: `"Ulrich Lontsi" <${process.env.SMTP_FROM_EMAIL?.trim()}>`,
      to: clientEmail,
      subject: `📋 Votre cahier des charges — ${specData.titre}`,
      html: specClientEmailTemplate(specData),
    });

    // Update DB
    await supabase
      .from('project_specs')
      .update({ status: 'sent', updated_at: new Date().toISOString() })
      .eq('id', specId);

    await supabase
      .from('chat_sessions')
      .update({ status: 'sent', updated_at: new Date().toISOString() })
      .eq('id', spec.session_id);

    res.send(successPage(clientName));
  } catch (err) {
    console.error('validateSpec error:', err);
    res.status(500).send(errorPage(`Erreur serveur : ${err.message}`));
  }
};

// ─── EMAIL: Notification to Ulrich ───────────────────────────────────────────
async function sendSpecNotificationEmail(specData, validateUrl, specId) {
  const featuresList = (specData.fonctionnalites || [])
    .slice(0, 6)
    .map(
      (f) =>
        `<tr><td style="padding:8px 0;border-bottom:1px solid #1e2a3a;">
          <span style="color:${f.priorite === 'haute' ? '#ef4444' : f.priorite === 'moyenne' ? '#f59e0b' : '#6b7280'};font-size:10px;font-weight:700;text-transform:uppercase;margin-right:8px;">${f.priorite || 'N/A'}</span>
          <span style="color:#f1f5f9;font-size:13px;">${f.nom}</span>
          ${f.description ? `<p style="margin:2px 0 0;color:#64748b;font-size:12px;">${f.description}</p>` : ''}
        </td></tr>`
    )
    .join('');

  const html = `
<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<style>*{box-sizing:border-box;}</style></head>
<body style="margin:0;padding:0;background:#0d1117;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0d1117;padding:40px 20px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

  <!-- Header -->
  <tr><td style="background:linear-gradient(135deg,#1a0533,#0f1923);border-radius:16px 16px 0 0;padding:30px 40px;border-bottom:2px solid #8b5cf6;">
    <table width="100%" cellpadding="0" cellspacing="0"><tr>
      <td><p style="margin:0 0 4px;font-size:11px;color:#8b5cf6;text-transform:uppercase;letter-spacing:2px;font-weight:600;">Nouveau cahier des charges</p>
        <h1 style="margin:0;font-size:22px;font-weight:700;color:#fff;">Projet prêt à valider 🚀</h1></td>
      <td align="right"><div style="background:linear-gradient(135deg,#8b5cf6,#7c3aed);border-radius:8px;padding:8px 16px;font-size:12px;font-weight:700;color:#fff;">À VALIDER</div></td>
    </tr></table>
  </td></tr>

  <!-- Body -->
  <tr><td style="background:#111827;padding:36px 40px;">

    <!-- Client -->
    <p style="margin:0 0 12px;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:2px;font-weight:600;">Client</p>
    <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:28px;background:#1e2a3a;border-radius:10px;">
      <tr><td style="padding:20px 24px;">
        <table width="100%" cellpadding="0" cellspacing="0"><tr>
          <td width="33%"><p style="margin:0 0 2px;font-size:11px;color:#64748b;">Nom</p><p style="margin:0;font-size:15px;font-weight:600;color:#f1f5f9;">${specData.client?.nom || '—'}</p></td>
          <td width="33%"><p style="margin:0 0 2px;font-size:11px;color:#64748b;">Email</p><a href="mailto:${specData.client?.email}" style="font-size:14px;font-weight:600;color:#00d4ff;text-decoration:none;">${specData.client?.email || '—'}</a></td>
          <td width="33%"><p style="margin:0 0 2px;font-size:11px;color:#64748b;">Téléphone</p><p style="margin:0;font-size:14px;color:#f1f5f9;">${specData.client?.telephone || '—'}</p></td>
        </tr></table>
      </td></tr>
    </table>

    <!-- Project summary -->
    <p style="margin:0 0 12px;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:2px;font-weight:600;">Projet</p>
    <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:28px;background:#1e2a3a;border-radius:10px;">
      <tr><td style="padding:20px 24px;">
        <p style="margin:0 0 4px;font-size:18px;font-weight:700;color:#f1f5f9;">${specData.titre || 'Projet sans titre'}</p>
        <p style="margin:4px 0 12px;font-size:12px;color:#8b5cf6;font-weight:600;">${specData.type_projet || ''}</p>
        <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.6;">${specData.description || ''}</p>
        <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;"><tr>
          <td width="50%"><p style="margin:0 0 2px;font-size:11px;color:#64748b;">Budget</p>
            <p style="margin:0;font-size:14px;font-weight:700;color:#06ffa5;">${specData.budget?.min || 0}–${specData.budget?.max || 0} ${specData.budget?.devise || 'EUR'}</p></td>
          <td width="50%"><p style="margin:0 0 2px;font-size:11px;color:#64748b;">Délai</p>
            <p style="margin:0;font-size:14px;font-weight:700;color:#00d4ff;">${specData.delai_total || '—'}</p></td>
        </tr></table>
      </td></tr>
    </table>

    <!-- Features -->
    <p style="margin:0 0 12px;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:2px;font-weight:600;">Fonctionnalités principales</p>
    <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:32px;background:#1e2a3a;border-radius:10px;">
      <tr><td style="padding:16px 24px;"><table width="100%" cellpadding="0" cellspacing="0">${featuresList}</table></td></tr>
    </table>

    <!-- CTA -->
    <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:16px;">
      <tr><td align="center">
        <a href="${validateUrl}" style="display:inline-block;background:linear-gradient(135deg,#06ffa5,#10b981);color:#0a1f14;text-decoration:none;font-size:16px;font-weight:700;padding:18px 48px;border-radius:10px;letter-spacing:0.5px;">✅ Valider et envoyer au client</a>
      </td></tr>
    </table>
    <p style="margin:0;text-align:center;font-size:12px;color:#64748b;">Ce lien envoie automatiquement le cahier des charges à ${specData.client?.email || 'le client'}.</p>
    <p style="margin:8px 0 0;text-align:center;font-size:12px;color:#334155;">Spec ID : ${specId}</p>

  </td></tr>

  <!-- Footer -->
  <tr><td style="background:#0f1923;border-radius:0 0 16px 16px;padding:20px 40px;text-align:center;border-top:1px solid #1e2a3a;">
    <p style="margin:0;font-size:11px;color:#334155;">Portfolio Agent IA · Ulrich Lontsi</p>
  </td></tr>

</table></td></tr></table>
</body></html>`;

  await transporter.sendMail({
    from: `"Portfolio Bot" <${process.env.SMTP_FROM_EMAIL?.trim()}>`,
    to: process.env.BUSINESS_EMAIL_RECIPIENT?.trim(),
    subject: `📋 Nouveau CDC prêt — ${specData.titre || 'Projet'} (${specData.client?.nom || 'Client'})`,
    html,
  });
}

// ─── EMAIL: Final spec to client ─────────────────────────────────────────────
function specClientEmailTemplate(specData) {
  const features = (specData.fonctionnalites || [])
    .map(
      (f) =>
        `<tr><td style="padding:10px 0;border-bottom:1px solid #1e2a3a;">
          <div style="display:flex;align-items:flex-start;gap:12px;">
            <span style="min-width:60px;font-size:10px;font-weight:700;color:${f.priorite === 'haute' ? '#ef4444' : f.priorite === 'moyenne' ? '#f59e0b' : '#6b7280'};text-transform:uppercase;padding-top:2px;">${f.priorite || ''}</span>
            <div><p style="margin:0;font-size:14px;font-weight:600;color:#f1f5f9;">${f.nom}</p>
            ${f.description ? `<p style="margin:2px 0 0;font-size:12px;color:#64748b;">${f.description}</p>` : ''}</div>
          </div>
        </td></tr>`
    )
    .join('');

  const jalons = (specData.jalons || [])
    .map(
      (j, i) =>
        `<tr><td style="padding:12px 0;${i < specData.jalons.length - 1 ? 'border-bottom:1px solid #1e2a3a;' : ''}">
          <p style="margin:0 0 2px;font-size:14px;font-weight:600;color:#f1f5f9;">${j.titre}</p>
          <p style="margin:0 0 2px;font-size:12px;color:#94a3b8;">${j.description}</p>
          <span style="font-size:11px;color:#00d4ff;font-weight:600;">⏱ ${j.duree}</span>
        </td></tr>`
    )
    .join('');

  const techSections = Object.entries(specData.technologies || {})
    .filter(([, arr]) => arr?.length)
    .map(
      ([key, arr]) =>
        `<td style="padding:0 12px 0 0;vertical-align:top;width:25%;">
          <p style="margin:0 0 6px;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;">${key}</p>
          ${arr.map((t) => `<span style="display:inline-block;background:#1e2a3a;border:1px solid #2d3f55;color:#94a3b8;font-size:11px;padding:3px 8px;border-radius:4px;margin:2px 2px 2px 0;">${t}</span>`).join('')}
        </td>`
    )
    .join('');

  return `
<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Votre cahier des charges</title></head>
<body style="margin:0;padding:0;background:#0d1117;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0d1117;padding:40px 20px;">
<tr><td align="center">
<table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;">

  <!-- Header -->
  <tr><td style="background:linear-gradient(135deg,#0f1923,#1a2332);border-radius:16px 16px 0 0;padding:40px;text-align:center;border-bottom:2px solid #00d4ff;">
    <div style="display:inline-block;background:linear-gradient(135deg,#00d4ff,#8b5cf6);border-radius:50%;width:60px;height:60px;line-height:60px;font-size:26px;font-weight:700;color:#fff;margin-bottom:16px;">UL</div>
    <h1 style="margin:0 0 6px;font-size:22px;font-weight:700;color:#fff;">Ulrich Lontsi</h1>
    <p style="margin:0;font-size:13px;color:#00d4ff;letter-spacing:2px;text-transform:uppercase;">Développeur Full-Stack</p>
  </td></tr>

  <!-- Body -->
  <tr><td style="background:#111827;padding:40px;">

    <h2 style="margin:0 0 8px;font-size:26px;font-weight:700;color:#f1f5f9;">Votre cahier des charges</h2>
    <p style="margin:0 0 32px;font-size:15px;color:#94a3b8;line-height:1.6;">Voici le document préparé suite à notre échange. Ulrich l'a examiné et il est prêt à démarrer votre projet.</p>

    <!-- Project title card -->
    <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:28px;background:linear-gradient(135deg,#00d4ff15,#8b5cf615);border:1px solid #00d4ff40;border-radius:12px;">
      <tr><td style="padding:24px 28px;">
        <p style="margin:0 0 4px;font-size:12px;color:#00d4ff;text-transform:uppercase;letter-spacing:2px;font-weight:600;">${specData.type_projet || 'Projet digital'}</p>
        <h3 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#fff;">${specData.titre || 'Votre projet'}</h3>
        <p style="margin:0;font-size:14px;color:#94a3b8;line-height:1.6;">${specData.description || ''}</p>
        <table cellpadding="0" cellspacing="0" style="margin-top:16px;"><tr>
          <td style="padding-right:32px;"><p style="margin:0 0 2px;font-size:11px;color:#64748b;">Budget estimé</p>
            <p style="margin:0;font-size:16px;font-weight:700;color:#06ffa5;">${specData.budget?.min || 0}–${specData.budget?.max || 0} ${specData.budget?.devise || 'EUR'}</p></td>
          <td><p style="margin:0 0 2px;font-size:11px;color:#64748b;">Délai total</p>
            <p style="margin:0;font-size:16px;font-weight:700;color:#00d4ff;">${specData.delai_total || '—'}</p></td>
        </tr></table>
      </td></tr>
    </table>

    <!-- Features -->
    <p style="margin:0 0 12px;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:2px;font-weight:600;">Fonctionnalités</p>
    <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:28px;background:#1e2a3a;border-radius:10px;">
      <tr><td style="padding:16px 24px;"><table width="100%" cellpadding="0" cellspacing="0">${features}</table></td></tr>
    </table>

    <!-- Technologies -->
    ${techSections ? `
    <p style="margin:0 0 12px;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:2px;font-weight:600;">Technologies</p>
    <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:28px;background:#1e2a3a;border-radius:10px;">
      <tr><td style="padding:20px 24px;"><table width="100%" cellpadding="0" cellspacing="0"><tr>${techSections}</tr></table></td></tr>
    </table>` : ''}

    <!-- Jalons -->
    ${jalons ? `
    <p style="margin:0 0 12px;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:2px;font-weight:600;">Jalons & planning</p>
    <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:28px;background:#1e2a3a;border-radius:10px;">
      <tr><td style="padding:16px 24px;"><table width="100%" cellpadding="0" cellspacing="0">${jalons}</table></td></tr>
    </table>` : ''}

    <!-- Note -->
    ${specData.notes ? `
    <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:28px;">
      <tr><td style="background:#1e2a3a;border-left:3px solid #8b5cf6;border-radius:0 8px 8px 0;padding:16px 20px;">
        <p style="margin:0 0 4px;font-size:11px;color:#8b5cf6;text-transform:uppercase;letter-spacing:1px;">Notes</p>
        <p style="margin:0;font-size:13px;color:#94a3b8;line-height:1.6;">${specData.notes}</p>
      </td></tr>
    </table>` : ''}

    <!-- CTA -->
    <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:32px;">
      <tr><td align="center">
        <a href="mailto:frranklinlontsi99@gmail.com?subject=Re: Cahier des charges - ${encodeURIComponent(specData.titre || 'Projet')}" style="display:inline-block;background:linear-gradient(135deg,#00d4ff,#8b5cf6);color:#fff;text-decoration:none;font-size:14px;font-weight:700;padding:14px 32px;border-radius:8px;">Discuter de ce projet →</a>
      </td></tr>
    </table>

    <!-- Signature -->
    <table cellpadding="0" cellspacing="0" width="100%" style="border-top:1px solid #1e2a3a;padding-top:24px;">
      <tr><td>
        <p style="margin:0 0 4px;font-size:15px;font-weight:700;color:#f1f5f9;">Ulrich Lontsi</p>
        <p style="margin:0 0 2px;font-size:13px;color:#00d4ff;">Développeur Full-Stack · React · Node.js · Supabase</p>
        <p style="margin:0;font-size:13px;color:#64748b;">frranklinlontsi99@gmail.com</p>
      </td></tr>
    </table>

  </td></tr>

  <!-- Footer -->
  <tr><td style="background:#0f1923;border-radius:0 0 16px 16px;padding:20px 40px;text-align:center;border-top:1px solid #1e2a3a;">
    <p style="margin:0;font-size:11px;color:#334155;">Document généré automatiquement par l'assistant IA d'Ulrich Lontsi · ${new Date().getFullYear()}</p>
  </td></tr>

</table></td></tr></table>
</body></html>`;
}

// ─── GENERATE CLAUDE CODE PROMPT (.md) ───────────────────────────────────────
async function generateClaudeCodeMd(specData) {
  const featuresList = (specData.fonctionnalites || [])
    .map((f) => `- **${f.nom}** *(${f.priorite || 'moyenne'})* — ${f.description || ''}`)
    .join('\n');

  const jalonsList = (specData.jalons || [])
    .map((j, i) => `### Phase ${i + 1} : ${j.titre}\n${j.description}\n⏱ Durée : ${j.duree}`)
    .join('\n\n');

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: `Tu es un expert en développement logiciel et en prompt engineering pour Claude Code.

Génère un fichier CLAUDE.md complet et détaillé pour guider Claude Code dans le développement de ce projet.

## Données du projet
${JSON.stringify(specData, null, 2)}

## Structure requise du CLAUDE.md

Le fichier doit contenir exactement ces sections (en Markdown) :

1. **Vue d'ensemble** — description, objectif, public cible
2. **Stack technique** — frontend, backend, BDD, autres outils
3. **Architecture & structure de dossiers** — arborescence complète du projet avec tous les fichiers importants
4. **Fonctionnalités à implémenter** — liste priorisée avec description technique de chaque feature
5. **Ordre d'implémentation** — roadmap en phases numérotées avec what/why pour chaque étape
6. **API & endpoints** — pour chaque endpoint : méthode, route, corps de requête, réponse, auth
7. **Modèle de données** — schéma de chaque table/collection avec types et relations
8. **Variables d'environnement** — liste de toutes les env vars avec description et exemple
9. **Commandes de setup** — étapes d'installation et de lancement en local
10. **Conventions de code** — naming, formatage, patterns à suivre dans ce projet

Sois extrêmement précis et technique. Ce fichier est directement utilisé par Claude Code pour démarrer le développement sans questions supplémentaires.`,
      },
    ],
  });
  return response.content[0].text;
}

// ─── GENERATE TECHNICAL SPEC (.md) ───────────────────────────────────────────
async function generateSpecTechniqueMd(specData) {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: `Tu es un architecte logiciel senior. Génère un cahier des charges technique complet et professionnel en Markdown.

## Données du projet
${JSON.stringify(specData, null, 2)}

## Structure requise du document technique

Génère exactement ces sections :

# Cahier des Charges Technique — [Titre du projet]

## 1. Contexte et objectifs
- Problème résolu, valeur métier, KPIs attendus

## 2. Architecture système
- Diagramme en ASCII art (frontend ↔ backend ↔ BDD ↔ services tiers)
- Flux de données principaux
- Décisions architecturales et justifications

## 3. Modèle de données
- Pour chaque table : nom, colonnes (type, contraintes, description), indexes, relations
- Diagramme de relations en ASCII

## 4. Spécification API REST
- Pour chaque endpoint : méthode HTTP, URL, description, authentification requise, corps de requête (JSON schema), réponse succès (JSON schema), codes d'erreur possibles

## 5. Composants frontend
- Arborescence des composants/pages
- Navigation et routing
- Gestion de l'état (state management)

## 6. Sécurité
- Authentification et autorisation
- Protection des données sensibles
- Validation des entrées

## 7. Performance et scalabilité
- Stratégie de cache
- Pagination
- Optimisations prévues

## 8. Déploiement et CI/CD
- Environnements (dev/staging/prod)
- Pipeline de déploiement
- Variables d'environnement par environnement

## 9. Tests
- Stratégie de test (unitaires, intégration, e2e)
- Couverture cible

## 10. Livrables et critères d'acceptation
- Définition of Done pour chaque phase
- Critères de validation client

Sois précis, professionnel et actionnable. Format Markdown propre avec tableaux, listes et blocs de code quand pertinent.`,
      },
    ],
  });
  return response.content[0].text;
}
