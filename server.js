const express = require("express");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const FormData = require("form-data");
const cors = require("cors");

const app = express();

// ✅ STRONG CORS FIX
app.use(cors({
  origin: "*",
  methods: ["GET", "POST"],
  allowedHeaders: ["Content-Type"]
}));
app.options("*", cors());

app.use(express.raw({ limit: "100mb", type: "*/*" }));

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.CHAT_ID;
const FIREBASE_URL = process.env.FIREBASE_URL;

// 📦 Upload chunk (✅ HEADERS हटाए → query use)
app.post("/upload-chunk", (req, res) => {
  try {
    const fileName = req.query.filename;
    const index = req.query.index;

    if (!fileName || index === undefined) {
      return res.status(400).send("Missing params");
    }

    const dir = path.join(__dirname, "uploads", fileName);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(path.join(dir, index), req.body);

    res.send({ status: "chunk ok" });

  } catch (err) {
    console.log("Chunk error:", err.message);
    res.status(500).send("chunk error");
  }
});

// 🔗 Merge + Upload + Save + Delete
app.post("/merge", async (req, res) => {
  const { filename, totalChunks } = req.query;

  const uploadDir = path.join(__dirname, "uploads", filename);
  const finalPath = path.join(__dirname, filename);

  const writeStream = fs.createWriteStream(finalPath);

  for (let i = 0; i < totalChunks; i++) {
    const chunkPath = path.join(uploadDir, i.toString());
    if (!fs.existsSync(chunkPath)) {
      return res.status(400).send("Missing chunk " + i);
    }
    writeStream.write(fs.readFileSync(chunkPath));
  }

  writeStream.end();

  writeStream.on("finish", async () => {
    let fileId = null;

    try {
      console.log("Uploading to Telegram...");

      const form = new FormData();
      form.append("chat_id", CHAT_ID);

      // ✅ IMPORTANT FIX (video → document)
      form.append("document", fs.createReadStream(finalPath));

      const tg = await axios.post(
        `https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`,
        form,
        { headers: form.getHeaders() }
      );

      console.log("Telegram response:", tg.data);

      fileId = tg.data.result.document.file_id;

      // 🔥 Firebase save
      await axios.post(`${FIREBASE_URL}/videos.json`, {
        file_id: fileId,
        name: filename,
        time: Date.now()
      });

      res.send({ status: "success", file_id: fileId });

    } catch (err) {
      console.log("Telegram error:", err.response?.data || err.message);
      res.send({ status: "failed but cleaned" });

    } finally {
      // 🧹 ALWAYS DELETE
      try {
        if (fs.existsSync(finalPath)) fs.unlinkSync(finalPath);
        if (fs.existsSync(uploadDir)) {
          fs.rmSync(uploadDir, { recursive: true, force: true });
        }
        console.log("Files deleted ✅");
      } catch (e) {
        console.log("Delete error:", e.message);
      }
    }
  });
});

// ✅ Root route (browser test)
app.get("/", (req, res) => {
  res.send("✅ Server running");
});

app.listen(3000, () => console.log("Server running 🚀"));
