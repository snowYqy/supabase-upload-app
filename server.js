const express = require("express");
const multer = require("multer");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const port = 3000;

// 🔑 替换为你的 Supabase URL 和 Service Role Key
const supabaseUrl = "https://uileaibnxsdahaoawqor.supabase.co";
const supabaseKey = "sb_secret_iIHJw5j-SoX12wrc9F1T-g_62-2L5qn";
const supabase = createClient(supabaseUrl, supabaseKey);
const bucketName = "uploads";

app.use(cors());
app.use(express.json());
app.use(express.static("public")); // 供前端访问

// Multer 临时文件存储
const upload = multer({ dest: "temp/" });

// 📌 上传接口
app.post("/upload", upload.single("file"), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: "No file uploaded" });

  // ✅ 生成安全文件名：时间戳 + 随机数 + 原始扩展名
  const ext = path.extname(file.originalname);
  const safeName = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;

  const fileBuffer = fs.readFileSync(file.path);
  const { data, error } = await supabase.storage
    .from(bucketName)
    .upload(safeName, fileBuffer, {
      contentType: file.mimetype,
      upsert: true,
      metadata: { originalName: file.originalname }   // ✅ 保存原始文件名
    });

  fs.unlinkSync(file.path);

  if (error) return res.status(500).json({ error: error.message });

  const { data: publicURL } = supabase.storage
    .from(bucketName)
    .getPublicUrl(safeName);

  res.json({ message: "Upload success", url: publicURL.publicUrl, name: safeName });

});

// 📌 获取文件列表接口
app.get("/files", async (req, res) => {
  const { data, error } = await supabase.storage.from(bucketName).list();
  const files = data.map(f => ({
    name: f.metadata?.originalName || f.name,  // ✅ 用 metadata 中的原始名
    url: supabase.storage.from(bucketName).getPublicUrl(f.name).data.publicUrl
  }));
  res.json(files);

});

app.listen(port, () =>
  console.log(`Server running at http://localhost:${port}`)
);
