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

  console.log("🔍 原始文件名:", file.originalname);
  console.log("🔍 文件编码:", file.encoding);

  // ✅ 正确处理中文文件名 - 尝试多种编码方式
  let originalName;
  try {
    // 方法1：直接使用原始文件名
    originalName = file.originalname;
    console.log("🔍 方法1 - 直接使用:", originalName);

    // 如果文件名包含乱码，尝试方法2
    if (originalName.includes("") || /[\uFFFD]/.test(originalName)) {
      originalName = Buffer.from(file.originalname, "latin1").toString("utf8");
      console.log("🔍 方法2 - latin1转utf8:", originalName);
    }

    // 如果还是有问题，尝试方法3
    if (originalName.includes("") || /[\uFFFD]/.test(originalName)) {
      originalName = decodeURIComponent(escape(file.originalname));
      console.log("🔍 方法3 - decodeURIComponent:", originalName);
    }
  } catch (error) {
    console.log("❌ 文件名处理错误:", error);
    originalName = file.originalname; // 回退到原始文件名
  }

  console.log("🔍 处理后的文件名:", originalName);

  // ✅ 生成安全文件名：时间戳 + 随机数 + 原始扩展名
  const ext = path.extname(originalName);
  const safeName = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;

  console.log("🔍 安全文件名:", safeName);
  console.log("🔍 要保存的metadata:", { originalName: originalName });

  const fileBuffer = fs.readFileSync(file.path);
  const { data, error } = await supabase.storage
    .from(bucketName)
    .upload(safeName, fileBuffer, {
      contentType: file.mimetype,
      upsert: true,
      metadata: {
        originalName: originalName, // ✅ 保存原始中文文件名
        customMetadata: { originalName: originalName }, // ✅ 同时保存到自定义metadata
      },
    });

  fs.unlinkSync(file.path);

  if (error) {
    console.log("❌ 上传错误:", error);
    return res.status(500).json({ error: error.message });
  }

  // ✅ 上传成功后，插入映射表
  try {
    const { error: dbError } = await supabase
      .from("file_map")
      .insert([{ safe_name: safeName, original_name: originalName }]);
    if (dbError) {
      console.log("❌ 映射表插入失败:", dbError);
      // 不影响主流程
    } else {
      console.log("✅ 映射表插入成功:", safeName, originalName);
    }
  } catch (e) {
    console.log("❌ 映射表插入异常:", e);
  }

  console.log("✅ 上传成功，返回的data:", data);

  const { data: publicURL } = supabase.storage
    .from(bucketName)
    .getPublicUrl(safeName);

  res.json({
    message: "Upload success",
    url: publicURL.publicUrl,
    name: safeName,
  });
});

// 📌 获取文件列表接口
app.get("/files", async (req, res) => {
  const { data, error } = await supabase.storage.from(bucketName).list();

  console.log("🔍 从Supabase获取的原始文件列表:", data);

  if (error) {
    console.log("❌ 获取文件列表错误:", error);
    return res.status(500).json({ error: error.message });
  }

  // 1. 获取所有 safeName
  const safeNames = data.map((f) => f.name);

  // 2. 查询 file_map 表，获取映射
  let fileMap = [];
  try {
    const { data: mapData, error: mapError } = await supabase
      .from("file_map")
      .select("safe_name, original_name")
      .in("safe_name", safeNames);
    if (mapError) {
      console.log("❌ 查询映射表失败:", mapError);
    } else {
      fileMap = mapData || [];
    }
  } catch (e) {
    console.log("❌ 查询映射表异常:", e);
  }

  // 3. 构建映射对象
  const mapObj = {};
  fileMap.forEach((item) => {
    mapObj[item.safe_name] = item.original_name;
  });

  // 4. 合并 storage 和映射表
  const files = data.map((f) => {
    const originalName = mapObj[f.name] || f.name;
    const fileSize = f.metadata?.size || 0;
    const fileSizeFormatted = formatFileSize(fileSize);
    return {
      name: originalName, // 用原始名
      originalName: f.name, // 安全名用于删除
      url: supabase.storage.from(bucketName).getPublicUrl(f.name).data
        .publicUrl,
      size: fileSize,
      sizeFormatted: fileSizeFormatted,
    };
  });

  console.log("🔍 处理后的文件列表:", files);
  res.json(files);
});

// 📌 删除文件接口
app.delete("/files/:filename", async (req, res) => {
  const filename = req.params.filename;

  console.log("🗑️ 尝试删除文件:", filename);

  try {
    const { error } = await supabase.storage
      .from(bucketName)
      .remove([filename]);

    if (error) {
      console.log("❌ 删除文件错误:", error);
      return res.status(500).json({ error: error.message });
    }

    // 同步删除映射表记录
    try {
      const { error: dbError } = await supabase
        .from("file_map")
        .delete()
        .eq("safe_name", filename);
      if (dbError) {
        console.log("❌ 映射表删除失败:", dbError);
      } else {
        console.log("✅ 映射表删除成功:", filename);
      }
    } catch (e) {
      console.log("❌ 映射表删除异常:", e);
    }

    console.log("✅ 文件删除成功:", filename);
    res.json({ message: "File deleted successfully" });
  } catch (error) {
    console.log("❌ 删除文件异常:", error);
    res.status(500).json({ error: error.message });
  }
});

// 📌 一键删除所有文件接口
app.delete("/files", async (req, res) => {
  console.log("🗑️ 尝试删除所有文件");

  try {
    // 先获取所有文件列表
    const { data: files, error: listError } = await supabase.storage
      .from(bucketName)
      .list();

    if (listError) {
      console.log("❌ 获取文件列表错误:", listError);
      return res.status(500).json({ error: listError.message });
    }

    if (!files || files.length === 0) {
      console.log("ℹ️ 没有文件需要删除");
      return res.json({ message: "No files to delete" });
    }

    // 提取所有文件名
    const filenames = files.map((f) => f.name);
    console.log("🗑️ 要删除的文件:", filenames);

    // 删除所有文件
    const { error: deleteError } = await supabase.storage
      .from(bucketName)
      .remove(filenames);

    if (deleteError) {
      console.log("❌ 删除所有文件错误:", deleteError);
      return res.status(500).json({ error: deleteError.message });
    }

    // 同步批量删除映射表记录
    try {
      const { error: dbError } = await supabase
        .from("file_map")
        .delete()
        .in("safe_name", filenames);
      if (dbError) {
        console.log("❌ 映射表批量删除失败:", dbError);
      } else {
        console.log("✅ 映射表批量删除成功:", filenames.length, "条");
      }
    } catch (e) {
      console.log("❌ 映射表批量删除异常:", e);
    }

    console.log("✅ 所有文件删除成功，共删除", filenames.length, "个文件");
    res.json({
      message: "All files deleted successfully",
      deletedCount: filenames.length,
    });
  } catch (error) {
    console.log("❌ 删除所有文件异常:", error);
    res.status(500).json({ error: error.message });
  }
});

// 📌 获取文件统计信息接口
app.get("/stats", async (req, res) => {
  try {
    const { data: files, error } = await supabase.storage
      .from(bucketName)
      .list();

    if (error) {
      console.log("❌ 获取文件列表错误:", error);
      return res.status(500).json({ error: error.message });
    }

    // 计算总大小和文件数量
    let totalSize = 0;
    let fileCount = 0;

    files.forEach((file) => {
      const size = file.metadata?.size || 0;
      totalSize += size;
      fileCount++;
    });

    const stats = {
      totalFiles: fileCount,
      totalSize: totalSize,
      totalSizeFormatted: formatFileSize(totalSize),
    };

    console.log("📊 文件统计:", stats);
    res.json(stats);
  } catch (error) {
    console.log("❌ 获取统计信息异常:", error);
    res.status(500).json({ error: error.message });
  }
});

// ✅ 格式化文件大小的辅助函数
function formatFileSize(bytes) {
  if (bytes === 0) return "0 B";

  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

app.listen(port, () =>
  console.log(`Server running at http://localhost:${port}`)
);
