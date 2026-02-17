const express = require("express");
const multer = require("multer");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const session = require("express-session");
const bcrypt = require("bcryptjs");

const app = express();
const USERS_FILE = "users.json";
const UPLOADS_DIR = "uploads";

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR);
}

// Load or initialize users file
function getUsers() {
  if (fs.existsSync(USERS_FILE)) {
    return JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
  }
  return {};
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(session({
  secret: "your-secret-key-change-in-production",
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }
}));
app.use(express.static("public"));

// Authentication middleware
function isAuthenticated(req, res, next) {
  if (req.session.userId) {
    next();
  } else {
    res.status(401).json({ error: "Not authenticated" });
  }
}

// Auth Routes
app.post("/api/signup", (req, res) => {
  const { email, password } = req.body;
  const users = getUsers();

  if (users[email]) {
    return res.status(400).json({ error: "User already exists" });
  }

  const hashedPassword = bcrypt.hashSync(password, 8);
  users[email] = { password: hashedPassword };
  saveUsers(users);

  // Create user upload folder
  const userDir = path.join(UPLOADS_DIR, email);
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }

  req.session.userId = email;
  res.json({ message: "Signed up successfully!", user: email });
});

app.post("/api/login", (req, res) => {
  const { email, password } = req.body;
  const users = getUsers();

  if (!users[email] || !bcrypt.compareSync(password, users[email].password)) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  req.session.userId = email;
  res.json({ message: "Logged in successfully!", user: email });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy();
  res.json({ message: "Logged out successfully!" });
});

app.get("/api/user", isAuthenticated, (req, res) => {
  res.json({ user: req.session.userId });
});

// Multer configuration with user-specific uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const userDir = path.join(UPLOADS_DIR, req.session.userId);
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }
    cb(null, userDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({ storage });

// Photo routes
app.post("/api/upload", isAuthenticated, upload.single("photo"), (req, res) => {
  res.json({ message: "Photo uploaded!", file: req.file.filename });
});

app.get("/api/photos", isAuthenticated, (req, res) => {
  const userDir = path.join(UPLOADS_DIR, req.session.userId);
  
  if (!fs.existsSync(userDir)) {
    return res.json([]);
  }

  const files = fs.readdirSync(userDir).map(file => {
    const filePath = path.join(userDir, file);
    return {
      name: file,
      url: `/uploads/${req.session.userId}/${file}`,
      date: fs.statSync(filePath).mtime
    };
  });

  res.json(files.sort((a, b) => new Date(b.date) - new Date(a.date)));
});

app.delete("/api/delete/:name", isAuthenticated, (req, res) => {
  const filePath = path.join(UPLOADS_DIR, req.session.userId, req.params.name);
  
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    res.json({ message: "Photo deleted!" });
  } else {
    res.status(404).json({ error: "Photo not found" });
  }
});

// Serve user uploads
app.use("/uploads", express.static(UPLOADS_DIR));

app.listen(3000, () => {
  console.log("Running on http://localhost:3000");
});
