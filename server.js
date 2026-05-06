require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const app = express();

const corsOptions = {
  origin: 'https://portfolio-ulrich-lontsi.vercel.app',
  optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));
app.use(express.json());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

const contactController = require('./controllers/contactController');
const agentController = require('./controllers/agentController');

// Contact form
app.post('/api/contact', contactController.sendEmail);

// Agent AI
app.post('/api/agent/session', agentController.createSession);
app.get('/api/agent/history/:sessionId', agentController.getHistory);
app.post('/api/agent/chat/:sessionId', upload.array('files', 5), agentController.chat);
app.post('/api/agent/generate-spec/:sessionId', agentController.generateSpec);

// Admin (accessed via email link — no auth middleware, token in query)
app.get('/api/admin/validate/:specId', agentController.validateSpec);

app.get('/', (req, res) => {
  res.send('Hello from the backend!');
});

module.exports = app;