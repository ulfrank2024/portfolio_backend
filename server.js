require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();

const corsOptions = {
  origin: 'https://portfolio-ulrich-lontsi.vercel.app',
  optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));
app.use(express.json({ limit: '15mb' }));

const contactController = require('./controllers/contactController');
const agentController = require('./controllers/agentController');

// Contact form
app.post('/api/contact', contactController.sendEmail);

// Agent AI
app.post('/api/agent/session', agentController.createSession);
app.get('/api/agent/history/:sessionId', agentController.getHistory);
app.post('/api/agent/chat/:sessionId', agentController.chat);
app.post('/api/agent/generate-spec/:sessionId', agentController.generateSpec);

// Agent identification
app.post('/api/agent/identify/:sessionId', agentController.identifyUser);
app.post('/api/agent/verify-code/:sessionId', agentController.verifyCode);
app.get('/api/agent/returning/:email', agentController.findReturningUser);

// Admin (token in query)
app.get('/api/admin/validate/:specId', agentController.validateSpec);
app.get('/api/admin/dashboard', agentController.getDashboard);
app.get('/api/admin/spec/:sessionId', agentController.getSpec);
app.put('/api/admin/spec/:specId', agentController.updateSpec);
app.post('/api/admin/send/:specId', agentController.sendSpec);

app.get('/', (req, res) => {
  res.send('Hello from the backend!');
});

module.exports = app;
