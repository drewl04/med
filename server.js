// server.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const IMAGE_FOLDER = path.join(process.cwd(), 'images');

if (!fs.existsSync(IMAGE_FOLDER)) {
  fs.mkdirSync(IMAGE_FOLDER);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, IMAGE_FOLDER);
  },
  filename: (req, file, cb) => {

  const chapterId = req.query.chapterId || "unknown";

  const ext = path.extname(file.originalname);

  const files = fs.readdirSync(IMAGE_FOLDER);

  const existing = files.filter(f => f.startsWith(`chapter-${chapterId}-img-`));

  const number = existing.length + 1;

  const filename = `chapter-${chapterId}-img-${number}${ext}`;

  cb(null, filename);
}
});

const upload = multer({ storage });

const app = express();
const PORT = 3000;
const QUESTIONS_PATH = path.join(process.cwd(), 'questions.json');

// Serve static files (index.html, CSS, JS)
app.use(express.static('.'));

app.use('/images', express.static(path.join(process.cwd(), 'images')));

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
app.post('/api/upload-image', upload.single('image'), (req, res) => {
  const filePath = '/images/' + req.file.filename;
  res.json({ path: filePath });
});

app.delete('/api/delete-image', (req, res) => {

  const imagePath = req.body.path;

  if (!imagePath) {
    return res.status(400).json({ error: "Missing path" });
  }

  const fullPath = path.join(process.cwd(), imagePath.replace(/^\/+/,''));

  fs.unlink(fullPath, (err) => {
    if (err) {
      console.error("Delete failed:", err);
      return res.status(500).json({ error: "Delete failed" });
    }

    res.json({ status: "deleted" });
  });

});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});