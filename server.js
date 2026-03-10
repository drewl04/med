// server.js
const express = require('express');
const fs = require('fs');
const path = require('path');


const app = express();
const PORT = 3000;
const QUESTIONS_PATH = path.join(process.cwd(), 'questions.json');

// Serve static files (index.html, CSS, JS)
app.use(express.static('.'));

// Parse JSON request bodies
app.use(express.json());

// --- Get chapters ---
app.get('/api/chapters', (req, res) => {
  fs.readFile(QUESTIONS_PATH, 'utf-8', (err, data) => {
    if (err) return res.status(500).json({ error: err.message });
    try {
      res.json(JSON.parse(data));
    } catch (e) {
      res.status(500).json({ error: 'Invalid JSON in questions.json' });
    }
  });
});

// --- Save chapters ---
app.post('/api/chapters', (req, res) => {
  const chapters = req.body;
  fs.writeFile(
    QUESTIONS_PATH,
    JSON.stringify(chapters, null, 2),
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ status: 'ok' });
    }
  );
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});