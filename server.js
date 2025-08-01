require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 3000;

// Configure CORS to allow requests from your Firebase Hosting domain
const corsOptions = {
  origin: 'https://ulrichlontsi2024.web.app',
  optionsSuccessStatus: 200 // some legacy browsers (IE11, various SmartTVs) choke on 204
};
app.use(cors(corsOptions));
app.use(express.json());

const contactController = require('./controllers/contactController'); // Chemin corrigé
app.post('/api/contact', contactController.sendEmail); // Utiliser la fonction sendEmail directement

app.get('/', (req, res) => {
  res.send('Hello from the backend!');
});

app.listen(port, () => {
  console.log(`Backend listening at http://localhost:${port}`);
});