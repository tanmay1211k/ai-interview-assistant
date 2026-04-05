const axios = require("axios");
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");

let pdfParse;
try {
    pdfParse = require("pdf-parse");
} catch (err) {
    pdfParse = require("pdf-parse/lib/pdf-parse.js");
}

const app = express();

app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });

const SECRET_KEY = process.env.JWT_SECRET || "fallback_secret";

/* ================== ROOT ROUTE (IMPORTANT) ================== */
app.get("/", (req, res) => {
    res.send("Backend running ✅");
});

/* ================== MONGODB ================== */
mongoose.connect("mongodb://127.0.0.1:27017/ai-interview")
.then(() => console.log("MongoDB Connected"))
.catch(err => console.log("MongoDB Error:", err));

/* ================== USER MODEL ================== */
const User = require("./models/User");

/* ================== PDF PARSER ================== */
const extractPdfText = async (buffer) => {
    try {
        const data = await pdfParse(buffer);
        console.log("PDF TEXT LENGTH:", data.text.length);
        return data.text;
    } catch (err) {
        console.error("PDF Parse Error:", err);
        return ""; // 🔥 prevent crash
    }
};

/* ================== AUTH ROUTES ================== */
app.post("/signup", async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password)
            return res.status(400).json({ msg: "All fields required" });

        let user = await User.findOne({ email });
        if (user)
            return res.status(400).json({ msg: "User already exists" });

        const hashedPassword = await bcrypt.hash(password, 10);
        user = new User({ name, email, password: hashedPassword });

        await user.save();

        res.json({ msg: "Signup successful" });
    } catch (err) {
        res.status(500).json({ msg: err.message });
    }
});

app.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password)
            return res.status(400).json({ msg: "All fields required" });

        const user = await User.findOne({ email });
        if (!user)
            return res.status(400).json({ msg: "Invalid email" });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch)
            return res.status(400).json({ msg: "Invalid password" });

        const token = jwt.sign({ userId: user._id }, SECRET_KEY, {
            expiresIn: "1h"
        });

        res.json({ msg: "Login successful", token });
    } catch (err) {
        res.status(500).json({ msg: err.message });
    }
});

/* ================== AUTH MIDDLEWARE ================== */
const authMiddleware = (req, res, next) => {
    const authHeader = req.header("Authorization");

    if (!authHeader)
        return res.status(401).json({ msg: "No token" });

    const token = authHeader.split(" ")[1];

    if (!token)
        return res.status(401).json({ msg: "Invalid token format" });

    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        req.user = decoded;
        next();
    } catch (err) {
        res.status(401).json({ msg: "Invalid token" });
    }
};

/* ================== ANSWER EVALUATION ================== */
app.post("/test", authMiddleware, async (req, res) => {
    const { answer } = req.body;

    try {
        const response = await axios.post(
            "https://openrouter.ai/api/v1/chat/completions",
            {
                model: "openai/gpt-3.5-turbo",
                messages: [
                    {
                        role: "system",
                        content: "Evaluate answer. Format:\nScore: X/10\nFeedback: short"
                    },
                    { role: "user", content: answer }
                ]
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
                    "Content-Type": "application/json"
                }
            }
        );

        res.json({ feedback: response.data.choices[0].message.content });

    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: "Evaluation failed" });
    }
});

/* ================== QUESTIONS ================== */
app.post("/questions", authMiddleware, upload.single("resume"), async (req, res) => {
    try {
        if (!req.file)
            return res.status(400).json({ msg: "No file uploaded" });

        let resumeText = "";

        if (req.file.mimetype === "application/pdf") {
            resumeText = await extractPdfText(req.file.buffer);
        } else {
            resumeText = req.file.buffer.toString("utf8");
        }

        const response = await axios.post(
            "https://openrouter.ai/api/v1/chat/completions",
            {
                model: "openai/gpt-3.5-turbo",
                messages: [
                    { role: "system", content: "Generate 5 interview questions" },
                    { role: "user", content: resumeText }
                ]
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
                    "Content-Type": "application/json"
                }
            }
        );

        const questions = response.data.choices[0].message.content
            .split("\n")
            .map(q => q.trim())
            .filter(q => q.length > 5);

        res.json({ questions });

    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: "Question generation failed" });
    }
});

/* ================== ANALYZE ================== */
app.post("/analyze-resume", authMiddleware, upload.single("resume"), async (req, res) => {
    try {
        if (!req.file)
            return res.status(400).json({ msg: "No file uploaded" });

        let resumeText = "";

        if (req.file.mimetype === "application/pdf") {
            resumeText = await extractPdfText(req.file.buffer);
        } else {
            resumeText = req.file.buffer.toString("utf8");
        }

        const response = await axios.post(
            "https://openrouter.ai/api/v1/chat/completions",
            {
                model: "openai/gpt-3.5-turbo",
                messages: [
                    {
                        role: "system",
                        content: `
Analyze the resume and return STRICT JSON in this format:

{
  "score": "number out of 100",
  "skills": "comma separated skills",
  "jobs": "suitable job roles",
  "weakAreas": "weak areas",
  "suggestions": "improvements"
}
`
                    },
                    { role: "user", content: resumeText }
                ]
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
                    "Content-Type": "application/json"
                }
            }
        );

        const text = response.data.choices[0].message.content;

        let parsed;

        try {
            let cleanText = text
    .replace(/```json/g, "")
    .replace(/```/g, "")
    .trim();

// Extract JSON part only (extra safe)
const jsonMatch = cleanText.match(/\{[\s\S]*\}/);

if (jsonMatch) {
    parsed = JSON.parse(jsonMatch[0]);
} else {
    throw new Error("No valid JSON found");
}
        } catch (err) {
            console.log("JSON parse failed, fallback...");
            parsed = {
                score: "N/A",
                skills: text,
                jobs: text,
                weakAreas: text,
                suggestions: text
            };
        }

        res.json(parsed);

    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: "Analysis failed" });
    }
});

/* ================== CHATBOT ================== */
app.post("/chat", authMiddleware, async (req, res) => {
    const { message } = req.body;

    try {
        const response = await axios.post(
            "https://openrouter.ai/api/v1/chat/completions",
            {
                model: "openai/gpt-3.5-turbo",
                messages: [
                    {
                        role: "system",
                        content: "You are an AI interview assistant helping users with interview preparation."
                    },
                    { role: "user", content: message }
                ]
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
                    "Content-Type": "application/json"
                }
            }
        );

        res.json({
            reply: response.data.choices[0].message.content
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: "Chat failed" });
    }
});

app.listen(5000, () => console.log("Server running on port 5000"));