const Groq = require('groq-sdk');
const pdfParse = require('pdf-parse');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const supabase = require('../lib/supabase');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const CHAT_MODEL = 'llama-3.3-70b-versatile';
const CHAT_FALLBACK_MODEL = 'llama-3.1-8b-instant'; // 500K TPD on free tier
const SPEC_MODEL = 'llama-3.3-70b-versatile';
const SPEC_FALLBACK_MODEL = 'llama-3.1-8b-instant';

async function groqChatWithFallback({ model, fallbackModel, ...params }) {
  try {
    return await groq.chat.completions.create({ model, ...params });
  } catch (err) {
    if (err?.status === 429 && fallbackModel) {
      console.warn(`Rate limit on ${model}, falling back to ${fallbackModel}`);
      return await groq.chat.completions.create({ model: fallbackModel, ...params });
    }
    throw err;
  }
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST?.trim(),
  port: parseInt(process.env.SMTP_PORT, 10),
  secure: process.env.SMTP_SECURE?.trim() === 'true',
  auth: {
    user: process.env.SMTP_USER?.trim(),
    pass: process.env.SMTP_PASSWORD?.trim(),
  },
});

const INITIAL_GREETING = `Bonjour ! Je suis l'assistant d'Ulrich Lontsi 👋

Dites-moi en quelques mots : quel projet avez-vous en tête ?`;

const SYSTEM_PROMPT = `Tu es l'assistant IA d'Ulrich Lontsi, développeur web freelance expert (React, Node.js, Supabase, Ottawa).

TON OBJECTIF : Collecter toutes les informations nécessaires pour produire un cahier des charges professionnel et complet. Tu dois comprendre le projet en profondeur : fonctionnel, technique, organisationnel.

RÈGLES ABSOLUES :
- UNE SEULE question par réponse — jamais deux questions dans le même message
- Réponses courtes : 1 ligne maximum, directement la question suivante
- Ton simple et direct, pas de listes à puces sauf pour confirmer un résumé final
- Ne jamais reformuler ou résumer la réponse précédente — pose la question suivante directement
- Toujours en français sauf si le client écrit autrement
- N'explique pas ce que tu vas faire, fais-le directement
- Si le client donne plusieurs infos d'un coup, prends-les toutes et avance sans les redemander
- Adapte les questions au type de projet — n'interroge pas sur la gamification si c'est un site vitrine

INFORMATIONS À COLLECTER (dans l'ordre naturel) :

BLOC 1 — Vision & périmètre
- Nature du projet (site vitrine, e-commerce, application web, plateforme, refonte…)
- Problème concret que le projet résout / objectif business principal
- Public cible (qui sont les utilisateurs finaux ?)

BLOC 2 — Fonctionnel
- Fonctionnalités principales souhaitées (laisser le client lister librement)
- Rôles utilisateurs (ex : visiteur, membre, admin, super-admin) et ce que chaque rôle peut faire
- Pages ou écrans clés (combien, lesquels)
- Parcours utilisateur principal (comment l'utilisateur atteint son objectif)

BLOC 3 — Technique
- Authentification (email/mot de passe, réseaux sociaux, 2FA, accès par lien…)
- Gestion des données (quelles entités : utilisateurs, produits, commandes, contenus… avec quelles relations)
- Intégrations tierces nécessaires (paiement, email, SMS, maps, API externes…)
- Préférences technologiques ou contraintes (stack imposée, hébergement, domaine existant…)

BLOC 4 — Design & Contenu
- Style visuel souhaité (moderne, minimaliste, coloré, sobre, luxe…) et ambiance générale
- Logo : le client en possède-t-il un ou faut-il en créer un ?
- Textes du site : fournis par le client ou à rédiger par Ulrich ?
- Images et médias : fournis par le client, banque d'images ou à créer ?
- Sites de référence ou d'inspiration (URLs ou descriptions)
- Charte graphique existante (couleurs, typographies, éléments de marque)

BLOC 5 — Qualité & sécurité
- Exigences de sécurité (données sensibles, conformité RGPD, anti-fraude…)
- Exigences de performance (charge attendue, disponibilité, temps de réponse)
- Maintenance après livraison (qui gère ? formation prévue ? documentation ?)

BLOC 6 — Projet & budget
- Délai souhaité (date cible ou durée)
- Budget approximatif (fourchette) — utilise toujours le dollar canadien (CAD) par défaut

BLOC 7 — Documents & ressources
Après avoir couvert les blocs 1 à 6, propose EXACTEMENT une fois :
"Avez-vous des documents à joindre pour m'aider à mieux comprendre votre projet ? (charte graphique, maquettes, cahier des charges existant, exemples de sites…) Vous pouvez les glisser ici via le bouton 📎 ou répondre 'non' pour continuer."
- IMPORTANT : dans ce chat, les fichiers joints arrivent sous forme de texte extrait ou de métadonnées — tu PEUX les recevoir et les traiter
- Si tu vois "[Fichier joint : nom.pdf]" ou "[Image jointe : nom.jpg]" dans le message : accuse réception positivement ("J'ai bien reçu votre fichier..."), puis exploite les informations pour enrichir le dossier
- Si le client répond non ou passe : continue

BLOC 8 — Validation finale
Avant de faire le résumé final, pose EXACTEMENT cette question :
"Avez-vous quelque chose à ajouter, préciser ou corriger avant que je finalise votre dossier ?"
- Si le client ajoute des informations : intègre-les, puis fais le résumé
- Si le client dit non ou que tout est bon : fais le résumé directement

SIGNAL DE FIN : Quand tu as couvert tous les blocs pertinents et obtenu la validation finale, fais un résumé structuré en 8 à 12 lignes couvrant tous les points, puis ajoute EXACTEMENT "[[SPEC_READY]]" sur la dernière ligne, rien après.`;

const SPEC_GEN_SYSTEM = `Tu es un consultant technique senior. À partir de la conversation fournie, génère un cahier des charges professionnel, complet et structuré.

IMPORTANT: Réponds UNIQUEMENT avec du JSON valide, sans texte avant ou après, sans balises markdown.
Si une information n'a pas été donnée, utilise null ou un tableau vide — ne invente rien.

Structure JSON requise:
{
  "titre": "Titre descriptif du projet",
  "date": "YYYY-MM-DD",
  "version": "1.0",

  "client": {
    "nom": "...",
    "email": "...",
    "telephone": "..."
  },

  "vision": {
    "description": "Description générale en 2-3 phrases",
    "objectif_business": "Problème résolu / valeur créée",
    "type_projet": "Site vitrine | E-commerce | Application web | Plateforme | Refonte | Autre",
    "public_cible": "Description du public cible"
  },

  "roles_utilisateurs": [
    {
      "nom": "Admin",
      "description": "Gère l'ensemble de la plateforme",
      "permissions": ["Gérer les utilisateurs", "Voir les statistiques", "..."]
    }
  ],

  "pages_et_vues": [
    {
      "nom": "Tableau de bord Admin",
      "role": "Admin",
      "description": "Vue d'ensemble des métriques",
      "composants_cles": ["Graphiques", "Liste des utilisateurs", "..."]
    }
  ],

  "fonctionnalites": [
    {
      "nom": "Nom de la fonctionnalité",
      "description": "Description détaillée",
      "priorite": "haute | moyenne | basse",
      "role_concerne": "Tous | Admin | Utilisateur | ...",
      "regles_metier": ["Règle 1", "Règle 2"]
    }
  ],

  "parcours_utilisateur": [
    {
      "acteur": "Nouveau visiteur",
      "objectif": "S'inscrire et accéder au tableau de bord",
      "etapes": ["Arrive sur la landing page", "Clique sur S'inscrire", "..."]
    }
  ],

  "authentification": {
    "methodes": ["Email/mot de passe", "Google OAuth", "Lien magique"],
    "double_facteur": false,
    "gestion_sessions": "JWT avec refresh token",
    "notes": "..."
  },

  "modele_de_donnees": [
    {
      "table": "users",
      "description": "Utilisateurs de la plateforme",
      "champs": [
        { "nom": "id", "type": "uuid", "description": "Identifiant unique" },
        { "nom": "email", "type": "text", "description": "Adresse email" },
        { "nom": "role", "type": "enum", "description": "Admin | User" }
      ],
      "relations": ["profiles (1-1)", "orders (1-N)"]
    }
  ],

  "integrations_tierces": [
    {
      "service": "Stripe",
      "usage": "Paiement en ligne",
      "type": "Paiement | Email | SMS | Maps | API | Autre"
    }
  ],

  "securite": {
    "donnees_sensibles": ["Données bancaires", "Données personnelles RGPD"],
    "conformite": ["RGPD", "PCI-DSS"],
    "mesures": ["Chiffrement AES-256", "Rate limiting", "Validation côté serveur"],
    "notes": "..."
  },

  "performance": {
    "charge_attendue": "Ex: 500 utilisateurs simultanés",
    "disponibilite": "99.9%",
    "temps_reponse_cible": "< 500ms",
    "notes": "..."
  },

  "design_et_contenu": {
    "style_visuel": "Description du style souhaité (moderne, minimaliste, coloré…)",
    "logo": "Existant | À créer | Non précisé",
    "textes_site": "Fournis par le client | À rédiger | Mixte",
    "images_medias": "Fournis par le client | Banque d'images | À créer",
    "sites_inspiration": ["URL ou description 1", "URL ou description 2"],
    "charte_graphique": {
      "couleurs": ["#000000", "#ffffff"],
      "typographies": [],
      "notes": "..."
    }
  },

  "technologies": {
    "frontend": ["React", "Tailwind CSS"],
    "backend": ["Node.js", "Express"],
    "base_de_donnees": ["Supabase (PostgreSQL)"],
    "auth": ["Supabase Auth"],
    "paiement": [],
    "deploiement": ["Vercel (frontend)", "Vercel (backend)"],
    "autres": []
  },

  "jalons": [
    {
      "numero": 1,
      "titre": "Phase 1 — Conception & maquettes",
      "description": "Wireframes, architecture technique, validation client",
      "duree": "1 semaine",
      "livrables": ["Maquettes Figma", "Architecture validée"],
      "paiement_pourcentage": 30
    }
  ],

  "budget": {
    "min": 0,
    "max": 0,
    "devise": "CAD",
    "note": "Estimation selon complexité confirmée"
  },

  "delai_total": "X semaines",

  "livrables_finaux": [
    "Code source complet (GitHub privé)",
    "Documentation technique",
    "Guide d'utilisation",
    "Déploiement en production"
  ],

  "maintenance": {
    "incluse": false,
    "type": "Forfait mensuel | À la demande | Non prévue",
    "formation_prevue": false,
    "documentation_livree": true,
    "notes": "..."
  },

  "contraintes": ["...", "..."],
  "notes": "Remarques complémentaires"
}`;

// ─── CREATE SESSION ───────────────────────────────────────────────────────────
exports.createSession = async (req, res) => {
  const { email, name } = req.body || {};

  try {
    let insertData = { status: 'active' };
    let preVerified = false;
    let clientName = null;

    if (email) {
      const { data: existing } = await supabase
        .from('chat_sessions')
        .select('id, client_name')
        .eq('client_email', email.trim().toLowerCase())
        .eq('verified', true)
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      if (existing) {
        preVerified = true;
        clientName = name?.trim() || existing.client_name;
        insertData = {
          ...insertData,
          verified: true,
          client_email: email.trim().toLowerCase(),
          client_name: clientName,
        };
      }
    }

    const greeting = preVerified
      ? `Bonjour ${clientName} 👋\n\nPrêt pour votre nouveau projet ! Dites-moi en quelques mots : qu'avez-vous en tête cette fois-ci ?`
      : INITIAL_GREETING;

    const { data: session, error } = await supabase
      .from('chat_sessions')
      .insert(insertData)
      .select()
      .single();

    if (error) throw error;

    await supabase.from('chat_messages').insert({
      session_id: session.id,
      role: 'assistant',
      content: greeting,
    });

    res.json({ sessionId: session.id, greeting, preVerified, clientName });
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
  // Files sent as base64 JSON array: [{ name, type, data }]
  const files = (req.body.files || []).map((f) => ({
    originalname: f.name,
    mimetype: f.type,
    buffer: Buffer.from(f.data, 'base64'),
  }));

  // Verify session exists
  const { data: session } = await supabase
    .from('chat_sessions')
    .select('id, status, client_name, client_email, client_phone')
    .eq('id', sessionId)
    .single();

  if (!session) return res.status(404).json({ error: 'Session introuvable' });

  // Enforce message limit
  const { count: msgCount } = await supabase
    .from('chat_messages')
    .select('id', { count: 'exact', head: true })
    .eq('session_id', sessionId);

  if (msgCount >= 50) {
    return res.status(429).json({ error: 'Limite de conversation atteinte. Générez votre cahier des charges ou commencez une nouvelle session.' });
  }

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

    const knownInfo = [];
    if (session.client_name) knownInfo.push(`nom : "${session.client_name}"`);
    if (session.client_email) knownInfo.push(`email : "${session.client_email}"`);
    if (session.client_phone) knownInfo.push(`téléphone : "${session.client_phone}"`);

    const personalizedSystem = knownInfo.length > 0
      ? `${SYSTEM_PROMPT}\n\nINFO DÉJÀ CONNUE (collectée lors de l'identification, NE PAS redemander) : ${knownInfo.join(', ')}.`
      : SYSTEM_PROMPT;

    // Build current user message (text + files)
    // Note: llama-3.3-70b-versatile is text-only — images sent as descriptive text, PDFs parsed
    const fileTexts = [];

    for (const file of files) {
      if (file.mimetype.startsWith('image/')) {
        fileTexts.push(`[Image jointe : ${file.originalname}] — Le client a joint une image. Accuse réception et demande-lui de la décrire si le contenu est important pour le projet.`);
      } else if (file.mimetype === 'application/pdf') {
        try {
          const parsed = await pdfParse(file.buffer);
          fileTexts.push(`[Fichier PDF joint : ${file.originalname}]\nContenu extrait :\n${parsed.text.slice(0, 8000)}`);
        } catch {
          fileTexts.push(`[PDF joint : ${file.originalname} — lecture impossible]`);
        }
      }
    }

    const combinedText = [userText.trim(), ...fileTexts].filter(Boolean).join('\n\n');
    const userMessageContent = combinedText || userText;

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

    const chatParams = {
      max_tokens: 1024,
      messages: [
        { role: 'system', content: personalizedSystem },
        ...claudeMessages,
      ],
      stream: true,
    };

    let stream;
    try {
      stream = await groq.chat.completions.create({ model: CHAT_MODEL, ...chatParams });
    } catch (err) {
      if (err?.status === 429) {
        console.warn(`Rate limit on ${CHAT_MODEL}, falling back to ${CHAT_FALLBACK_MODEL}`);
        stream = await groq.chat.completions.create({ model: CHAT_FALLBACK_MODEL, ...chatParams });
      } else {
        throw err;
      }
    }

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || '';
      if (text) {
        fullText += text;
        res.write(`data: ${JSON.stringify({ text })}\n\n`);
      }
    }

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
      const userMsg = err?.status === 429
        ? 'Le service est momentanément surchargé. Veuillez réessayer dans quelques minutes.'
        : 'Une erreur est survenue. Veuillez réessayer.';
      res.write(`data: ${JSON.stringify({ error: userMsg })}\n\n`);
      res.end();
    }
  }
};

// ─── GENERATE SPEC ───────────────────────────────────────────────────────────
exports.generateSpec = async (req, res) => {
  const { sessionId } = req.params;

  try {
    // Load session — identification data is authoritative for client identity
    const { data: session } = await supabase
      .from('chat_sessions')
      .select('id, client_name, client_email, client_phone')
      .eq('id', sessionId)
      .single();

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

    // Ask AI to generate the spec as JSON
    const specResponse = await groqChatWithFallback({
      model: SPEC_MODEL,
      fallbackModel: SPEC_FALLBACK_MODEL,
      max_tokens: 4096,
      messages: [
        { role: 'system', content: SPEC_GEN_SYSTEM },
        ...history,
        {
          role: 'user',
          content:
            'Génère maintenant le cahier des charges complet au format JSON selon la structure fournie, basé sur toute notre conversation. Réponds UNIQUEMENT avec du JSON valide.',
        },
      ],
    });

    const specText = specResponse.choices[0].message.content.trim();

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

    // Enforce identified client data — identification is more reliable than AI extraction
    if (!specData.client) specData.client = {};
    if (session?.client_name) specData.client.nom = session.client_name;
    if (session?.client_email) specData.client.email = session.client_email;
    if (session?.client_phone) specData.client.telephone = session.client_phone;

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

    // Update session status only — don't overwrite identified client data
    await supabase
      .from('chat_sessions')
      .update({ status: 'spec_ready', updated_at: new Date().toISOString() })
      .eq('id', sessionId);

    // Send notification email to Ulrich
    await sendSpecNotificationEmail(specData);

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
async function sendSpecNotificationEmail(specData) {
  const adminUrl = process.env.ADMIN_DASHBOARD_URL || 'https://portfolio-ulrich-lontsi.vercel.app/admin';
  const clientName = specData.client?.nom || 'Inconnu';
  const clientEmail = specData.client?.email || '—';
  const clientPhone = specData.client?.telephone || '—';
  const typeProjet = specData.vision?.type_projet || specData.type_projet || 'Projet digital';
  const budget = specData.budget ? `${specData.budget.min || 0}–${specData.budget.max || 0} ${specData.budget.devise || 'EUR'}` : '—';
  const delai = specData.delai_total || '—';

  const html = `
<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<style>*{box-sizing:border-box;}</style></head>
<body style="margin:0;padding:0;background:#0d1117;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0d1117;padding:40px 20px;">
<tr><td align="center">
<table width="540" cellpadding="0" cellspacing="0" style="max-width:540px;width:100%;">

  <tr><td style="background:linear-gradient(135deg,#1a0533,#0f1923);border-radius:16px 16px 0 0;padding:28px 36px;border-bottom:2px solid #8b5cf6;">
    <p style="margin:0 0 6px;font-size:11px;color:#8b5cf6;text-transform:uppercase;letter-spacing:2px;font-weight:600;">Nouveau contact</p>
    <h1 style="margin:0;font-size:22px;font-weight:700;color:#fff;">📩 ${clientName} vous a contacté</h1>
  </td></tr>

  <tr><td style="background:#111827;padding:32px 36px;">

    <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;background:#1e2a3a;border-radius:10px;">
      <tr><td style="padding:18px 22px;">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td width="33%" style="padding-bottom:12px;"><p style="margin:0 0 3px;font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:1px;">Nom</p><p style="margin:0;font-size:14px;font-weight:700;color:#f1f5f9;">${clientName}</p></td>
            <td width="33%" style="padding-bottom:12px;"><p style="margin:0 0 3px;font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:1px;">Email</p><a href="mailto:${clientEmail}" style="font-size:13px;color:#00d4ff;text-decoration:none;">${clientEmail}</a></td>
            <td width="33%" style="padding-bottom:12px;"><p style="margin:0 0 3px;font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:1px;">Téléphone</p><p style="margin:0;font-size:13px;color:#f1f5f9;">${clientPhone}</p></td>
          </tr>
          <tr>
            <td><p style="margin:0 0 3px;font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:1px;">Projet</p><p style="margin:0;font-size:14px;font-weight:600;color:#f1f5f9;">${specData.titre || '—'}</p></td>
            <td><p style="margin:0 0 3px;font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:1px;">Type</p><p style="margin:0;font-size:13px;color:#8b5cf6;font-weight:600;">${typeProjet}</p></td>
            <td><p style="margin:0 0 3px;font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:1px;">Budget / Délai</p><p style="margin:0;font-size:13px;color:#06ffa5;font-weight:600;">${budget} · ${delai}</p></td>
          </tr>
        </table>
      </td></tr>
    </table>

    <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:20px;">
      <tr><td align="center">
        <a href="${adminUrl}" style="display:inline-block;background:linear-gradient(135deg,#00d4ff,#8b5cf6);color:#fff;text-decoration:none;font-size:15px;font-weight:700;padding:16px 44px;border-radius:10px;letter-spacing:0.3px;">Voir le rapport dans le dashboard →</a>
      </td></tr>
    </table>
    <p style="margin:0;text-align:center;font-size:12px;color:#334155;">Connectez-vous avec votre token admin pour consulter, modifier et envoyer le rapport.</p>

  </td></tr>

  <tr><td style="background:#0f1923;border-radius:0 0 16px 16px;padding:16px 36px;text-align:center;border-top:1px solid #1e2a3a;">
    <p style="margin:0;font-size:11px;color:#334155;">Portfolio Agent IA · Ulrich Lontsi</p>
  </td></tr>

</table></td></tr></table>
</body></html>`;

  await transporter.sendMail({
    from: `"Portfolio Bot" <${process.env.SMTP_FROM_EMAIL?.trim()}>`,
    to: process.env.BUSINESS_EMAIL_RECIPIENT?.trim(),
    subject: `📩 Nouveau contact — ${clientName} · ${specData.titre || 'Projet'}`,
    html,
  });
}

// ─── ADMIN: GET SPEC ──────────────────────────────────────────────────────────
exports.getSpec = async (req, res) => {
  const adminToken = process.env.ADMIN_TOKEN?.trim();
  const { token } = req.query;
  if (!token || !adminToken || token.trim() !== adminToken) {
    return res.status(403).json({ error: 'Token invalide' });
  }

  const { sessionId } = req.params;
  try {
    const [{ data: spec, error }, { data: session }] = await Promise.all([
      supabase
        .from('project_specs')
        .select('id, spec_data, status, created_at, updated_at')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single(),
      supabase
        .from('chat_sessions')
        .select('client_name, client_email, client_phone')
        .eq('id', sessionId)
        .single(),
    ]);

    if (error || !spec) return res.status(404).json({ error: 'Aucun rapport trouvé' });

    // Ensure spec_data.client always reflects the verified identification data
    if (spec.spec_data && session) {
      if (!spec.spec_data.client) spec.spec_data.client = {};
      if (session.client_name) spec.spec_data.client.nom = session.client_name;
      if (session.client_email) spec.spec_data.client.email = session.client_email;
      if (session.client_phone) spec.spec_data.client.telephone = session.client_phone;
    }

    res.json({ spec });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─── ADMIN: UPDATE SPEC ───────────────────────────────────────────────────────
exports.updateSpec = async (req, res) => {
  const adminToken = process.env.ADMIN_TOKEN?.trim();
  const { token } = req.query;
  if (!token || !adminToken || token.trim() !== adminToken) {
    return res.status(403).json({ error: 'Token invalide' });
  }

  const { specId } = req.params;
  const { spec_data } = req.body;
  if (!spec_data) return res.status(400).json({ error: 'spec_data requis' });

  try {
    const { error } = await supabase
      .from('project_specs')
      .update({ spec_data, updated_at: new Date().toISOString() })
      .eq('id', specId);

    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─── ADMIN: SEND SPEC TO CLIENT ───────────────────────────────────────────────
exports.sendSpec = async (req, res) => {
  const adminToken = process.env.ADMIN_TOKEN?.trim();
  const { token } = req.query;
  if (!token || !adminToken || token.trim() !== adminToken) {
    return res.status(403).json({ error: 'Token invalide' });
  }

  const { specId } = req.params;
  try {
    const { data: spec } = await supabase
      .from('project_specs')
      .select('*, chat_sessions(*)')
      .eq('id', specId)
      .single();

    if (!spec) return res.status(404).json({ error: 'Rapport introuvable' });

    const specData = spec.spec_data;
    const clientEmail = specData?.client?.email || spec.chat_sessions?.client_email;
    const clientName = specData?.client?.nom || spec.chat_sessions?.client_name || 'Client';

    if (!clientEmail) return res.status(400).json({ error: 'Email client introuvable dans le rapport' });

    await transporter.sendMail({
      from: `"Ulrich Lontsi" <${process.env.SMTP_FROM_EMAIL?.trim()}>`,
      to: clientEmail,
      subject: `📋 Votre cahier des charges — ${specData.titre || 'Votre projet'}`,
      html: specClientEmailTemplate(specData),
    });

    await supabase
      .from('project_specs')
      .update({ status: 'sent', updated_at: new Date().toISOString() })
      .eq('id', specId);

    await supabase
      .from('chat_sessions')
      .update({ status: 'sent', updated_at: new Date().toISOString() })
      .eq('id', spec.session_id);

    res.json({ success: true, clientName, clientEmail });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

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
        <p style="margin:0 0 4px;font-size:12px;color:#00d4ff;text-transform:uppercase;letter-spacing:2px;font-weight:600;">${specData.vision?.type_projet || specData.type_projet || 'Projet digital'}</p>
        <h3 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#fff;">${specData.titre || 'Votre projet'}</h3>
        <p style="margin:0;font-size:14px;color:#94a3b8;line-height:1.6;">${specData.vision?.description || specData.description || ''}</p>
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

// ─── EMAIL: Verification code to user ────────────────────────────────────────
function verificationEmailTemplate(name, code) {
  return `
<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<style>*{box-sizing:border-box;}</style></head>
<body style="margin:0;padding:0;background:#0d1117;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0d1117;padding:40px 20px;">
<tr><td align="center">
<table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">

  <tr><td style="background:linear-gradient(135deg,#0f1923,#1a2332);border-radius:16px 16px 0 0;padding:32px 40px;text-align:center;border-bottom:2px solid #00d4ff;">
    <div style="display:inline-block;background:linear-gradient(135deg,#00d4ff,#8b5cf6);border-radius:50%;width:52px;height:52px;line-height:52px;font-size:22px;font-weight:700;color:#fff;margin-bottom:14px;">UL</div>
    <h1 style="margin:0 0 4px;font-size:20px;font-weight:700;color:#fff;">Ulrich Lontsi</h1>
    <p style="margin:0;font-size:12px;color:#00d4ff;letter-spacing:2px;text-transform:uppercase;">Assistant Projet IA</p>
  </td></tr>

  <tr><td style="background:#111827;padding:40px;">
    <p style="margin:0 0 8px;font-size:16px;color:#f1f5f9;">Bonjour <strong style="color:#00d4ff;">${name}</strong>,</p>
    <p style="margin:0 0 32px;font-size:14px;color:#94a3b8;line-height:1.6;">Voici votre code de vérification pour accéder à l'assistant projet. Ce code expire dans <strong style="color:#f1f5f9;">10 minutes</strong>.</p>

    <table cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:32px;">
      <tr><td align="center">
        <div style="display:inline-block;background:#0d1117;border:2px solid #00d4ff;border-radius:16px;padding:24px 40px;">
          <p style="margin:0 0 8px;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:3px;font-weight:600;">Code de vérification</p>
          <p style="margin:0;font-size:42px;font-weight:700;color:#00d4ff;letter-spacing:12px;font-family:'Courier New',monospace;">${code}</p>
        </div>
      </td></tr>
    </table>

    <p style="margin:0;font-size:12px;color:#334155;text-align:center;">Si vous n'avez pas demandé ce code, ignorez cet email.</p>
  </td></tr>

  <tr><td style="background:#0f1923;border-radius:0 0 16px 16px;padding:18px 40px;text-align:center;border-top:1px solid #1e2a3a;">
    <p style="margin:0;font-size:11px;color:#334155;">Portfolio Agent IA · Ulrich Lontsi</p>
  </td></tr>

</table></td></tr></table>
</body></html>`;
}

// ─── IDENTIFY USER ────────────────────────────────────────────────────────────
exports.identifyUser = async (req, res) => {
  const { sessionId } = req.params;
  const { name, email, phone } = req.body;

  if (!name?.trim() || !email?.trim()) {
    return res.status(400).json({ error: 'Nom et email requis' });
  }

  try {
    const { data: session, error: sessionError } = await supabase
      .from('chat_sessions')
      .select('id')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return res.status(404).json({ error: 'Session introuvable' });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const updateData = {
      client_name: name.trim(),
      client_email: email.trim().toLowerCase(),
      verification_code: code,
      code_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    };
    if (phone && phone.trim()) updateData.client_phone = phone.trim();

    await supabase
      .from('chat_sessions')
      .update(updateData)
      .eq('id', sessionId);

    await transporter.sendMail({
      from: `"Assistant Ulrich Lontsi" <${process.env.SMTP_FROM_EMAIL?.trim()}>`,
      to: email.trim(),
      subject: `${code} — Votre code de vérification`,
      html: verificationEmailTemplate(name.trim(), code),
    });

    res.json({ success: true });
  } catch (err) {
    console.error('identifyUser error:', err);
    res.status(500).json({ error: err.message });
  }
};

// ─── VERIFY CODE ──────────────────────────────────────────────────────────────
exports.verifyCode = async (req, res) => {
  const { sessionId } = req.params;
  const { code } = req.body;

  if (!code?.trim()) {
    return res.status(400).json({ error: 'Code requis' });
  }

  try {
    const { data: session, error } = await supabase
      .from('chat_sessions')
      .select('verification_code, code_expires_at, client_name')
      .eq('id', sessionId)
      .single();

    if (error || !session) {
      return res.status(404).json({ error: 'Session introuvable' });
    }

    if (!session.verification_code) {
      return res.status(400).json({ error: 'Aucun code en attente' });
    }

    if (new Date() > new Date(session.code_expires_at)) {
      return res.status(400).json({ error: 'Code expiré. Recommencez l\'identification.' });
    }

    if (session.verification_code !== code.trim()) {
      return res.status(400).json({ error: 'Code incorrect.' });
    }

    await supabase
      .from('chat_sessions')
      .update({
        verified: true,
        verification_code: null,
        code_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId);

    res.json({ success: true, clientName: session.client_name });
  } catch (err) {
    console.error('verifyCode error:', err);
    res.status(500).json({ error: err.message });
  }
};

// ─── FIND RETURNING USER ──────────────────────────────────────────────────────
exports.findReturningUser = async (req, res) => {
  const { email } = req.params;

  if (!email?.trim()) {
    return res.status(400).json({ error: 'Email requis' });
  }

  try {
    const { data: session, error } = await supabase
      .from('chat_sessions')
      .select('id, client_name, status, updated_at')
      .eq('client_email', email.trim().toLowerCase())
      .eq('verified', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !session) {
      return res.json({ found: false });
    }

    const { count } = await supabase
      .from('chat_messages')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', session.id);

    res.json({
      found: true,
      sessionId: session.id,
      clientName: session.client_name,
      status: session.status,
      messageCount: count || 0,
      lastActivity: session.updated_at,
    });
  } catch (err) {
    console.error('findReturningUser error:', err);
    res.status(500).json({ error: err.message });
  }
};

// ─── ADMIN DASHBOARD ──────────────────────────────────────────────────────────
exports.getDashboard = async (req, res) => {
  const { token } = req.query;

  const adminToken = process.env.ADMIN_TOKEN?.trim();
  if (!token || !adminToken || token.trim() !== adminToken) {
    return res.status(403).json({ error: 'Token invalide' });
  }

  try {
    const { data: sessions, error } = await supabase
      .from('chat_sessions')
      .select('id, client_name, client_email, client_phone, verified, status, updated_at, created_at')
      .order('updated_at', { ascending: false });

    if (error) throw error;

    const { count: msgCountRaw } = await supabase
      .from('chat_messages')
      .select('session_id', { count: 'exact', head: true });

    const sessionIds = (sessions || []).map((s) => s.id);
    const messageCounts = {};

    if (sessionIds.length > 0) {
      const { data: msgRows } = await supabase
        .from('chat_messages')
        .select('session_id')
        .in('session_id', sessionIds);

      (msgRows || []).forEach((m) => {
        messageCounts[m.session_id] = (messageCounts[m.session_id] || 0) + 1;
      });
    }

    const enriched = (sessions || []).map((s) => ({
      ...s,
      message_count: messageCounts[s.id] || 0,
    }));

    const stats = {
      total: enriched.length,
      verified: enriched.filter((s) => s.verified).length,
      active: enriched.filter((s) => s.status === 'active').length,
      spec_ready: enriched.filter((s) => s.status === 'spec_ready').length,
      sent: enriched.filter((s) => s.status === 'sent').length,
    };

    res.json({ stats, sessions: enriched });
  } catch (err) {
    console.error('getDashboard error:', err);
    res.status(500).json({ error: err.message });
  }
};

// ─── GENERATE CLAUDE CODE PROMPT (.md) ───────────────────────────────────────
async function generateClaudeCodeMd(specData) {
  const response = await groqChatWithFallback({
    model: SPEC_MODEL,
    fallbackModel: SPEC_FALLBACK_MODEL,
    max_tokens: 8192,
    messages: [
      {
        role: 'user',
        content: `Tu es un expert en développement logiciel et en prompt engineering pour Claude Code.

Génère un fichier CLAUDE.md complet et détaillé pour guider Claude Code dans le développement de ce projet.

## Données du projet
${JSON.stringify(specData, null, 2)}

## Structure requise du CLAUDE.md

Le fichier doit contenir exactement ces sections (en Markdown) :

1. **Vue d'ensemble** — description, objectif business, public cible, type de projet
2. **Rôles utilisateurs** — chaque rôle avec ses permissions (basé sur roles_utilisateurs)
3. **Pages et vues** — liste complète par rôle avec composants clés attendus
4. **Stack technique** — frontend, backend, BDD, auth, paiement, déploiement
5. **Architecture & structure de dossiers** — arborescence complète avec tous les fichiers importants
6. **Modèle de données** — schéma de chaque table avec colonnes, types, contraintes et relations (basé sur modele_de_donnees)
7. **Fonctionnalités à implémenter** — liste priorisée par rôle avec règles métier
8. **Authentification & sécurité** — flux d'auth, gestion sessions, mesures de sécurité
9. **Intégrations tierces** — liste avec usage et notes d'implémentation
10. **Ordre d'implémentation** — roadmap en phases numérotées liées aux jalons
11. **API & endpoints** — méthode, route, auth requise, requête, réponse pour chaque endpoint
12. **Variables d'environnement** — toutes les env vars avec description et exemple
13. **Commandes de setup** — installation et lancement en local
14. **Conventions de code** — naming, formatage, patterns spécifiques à ce projet

Sois extrêmement précis et technique. Ce fichier est directement utilisé par Claude Code pour démarrer le développement sans questions supplémentaires.`,
      },
    ],
  });
  return response.choices[0].message.content;
}

// ─── GENERATE TECHNICAL SPEC (.md) ───────────────────────────────────────────
async function generateSpecTechniqueMd(specData) {
  const response = await groqChatWithFallback({
    model: SPEC_MODEL,
    fallbackModel: SPEC_FALLBACK_MODEL,
    max_tokens: 8192,
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
- Problème résolu, objectif business, public cible
- Valeur métier et indicateurs de succès attendus

## 2. Rôles et permissions
- Tableau récapitulatif de tous les rôles utilisateurs
- Matrice de permissions par fonctionnalité

## 3. Architecture système
- Diagramme en ASCII art (frontend ↔ backend ↔ BDD ↔ services tiers)
- Flux de données principaux par cas d'usage
- Décisions architecturales et justifications

## 4. Modèle de données
- Pour chaque table : nom, colonnes (type, contraintes, description), indexes, relations
- Diagramme de relations en ASCII
- Règles d'intégrité et contraintes métier

## 5. Authentification & sécurité
- Flux d'authentification complet (diagramme ASCII)
- Gestion des sessions et tokens
- Mesures de sécurité applicatives
- Conformité réglementaire (RGPD, etc.)

## 6. Spécification API REST
- Pour chaque endpoint : méthode HTTP, URL, description, authentification requise, corps de requête (JSON schema), réponse succès (JSON schema), codes d'erreur possibles

## 7. Pages et composants frontend
- Arborescence complète des pages par rôle
- Navigation et routing
- Composants clés de chaque page

## 8. Intégrations tierces
- Pour chaque service : usage, données échangées, notes d'implémentation

## 9. Performance et scalabilité
- Charge attendue et stratégie de cache
- Pagination et optimisations prévues

## 10. Jalons et livrables
- Tableau des phases avec durée, livrables et % de paiement
- Critères d'acceptation par phase

## 11. Déploiement
- Environnements et pipeline
- Variables d'environnement par environnement

## 12. Maintenance et transfert
- Protocole de handover
- Documentation livrée
- Conditions de maintenance post-livraison

Sois précis, professionnel et actionnable. Format Markdown propre avec tableaux, listes et blocs de code quand pertinent.`,
      },
    ],
  });
  return response.choices[0].message.content;
}
