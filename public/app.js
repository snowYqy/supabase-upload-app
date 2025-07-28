async function uploadFile() {
  const file = document.getElementById("fileInput").files[0];
  if (!file) {
    alert("Please select a file");
    return; // 关键：没有文件时终止函数
  }
  const formData = new FormData();
  formData.append("file", file);

  const progressBar = document.getElementById("progressBar");
  const progress = document.getElementById("progress");
  const progressText = document.getElementById("progressText");

  progressBar.style.display = "block";
  progressText.style.display = "block";
  progress.style.width = "0%";

  const xhr = new XMLHttpRequest();
  xhr.open("POST", "upload");

  xhr.upload.onprogress = (e) => {
    if (e.lengthComputable) {
      const percent = (e.loaded / e.total) * 100;
      progress.style.width = percent + "%";

      progressText.textContent = percent.toFixed(2) + "%";
    }
  };

  xhr.onload = () => {
    if (xhr.status === 200) {
      alert("File uploaded successfully");
      loadFiles();
    } else {
      alert("File upload failed: " + xhr.responseText);
    }
    progressBar.style.display = "none";
    progressText.style.display = "none";
  };
  xhr.send(formData);
}

// ✅ 获取文件列表
async function loadFiles() {
  const res = await fetch("/files");
  const files = await res.json();
  const list = document.getElementById("fileList");

  if (files.length === 0) {
    list.innerHTML = '<div class="no-files">暂无文件</div>';
    return;
  }

  list.innerHTML = files
    .map(
      (f) => `
      <div class="file-item">
        <div class="file-info">
          <a href="${f.url}" target="_blank" class="file-name">${f.name}</a>
          <span class="file-size">${f.sizeFormatted}</span>
        </div>
        <div class="file-actions">
          <button onclick="deleteFile('${f.originalName}')" class="delete-btn" title="删除文件">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
    `
    )
    .join("");
}

// ✅ 删除文件
async function deleteFile(filename) {
  if (!confirm("确定要删除这个文件吗？")) {
    return;
  }

  try {
    const response = await fetch(`/files/${encodeURIComponent(filename)}`, {
      method: "DELETE",
    });

    if (response.ok) {
      alert("文件删除成功！");
      loadFiles(); // 重新加载文件列表
      loadStats(); // 重新加载统计信息
    } else {
      const error = await response.json();
      alert("删除失败: " + error.error);
    }
  } catch (error) {
    alert("删除失败: " + error.message);
  }
}

// ✅ 一键删除所有文件
async function deleteAllFiles() {
  if (!confirm("⚠️ 警告：这将删除所有文件！\n\n确定要继续吗？")) {
    return;
  }

  try {
    const response = await fetch("/files", {
      method: "DELETE",
    });

    if (response.ok) {
      const result = await response.json();
      alert(`✅ 删除成功！\n共删除了 ${result.deletedCount || 0} 个文件`);
      loadFiles(); // 重新加载文件列表
      loadStats(); // 重新加载统计信息
    } else {
      const error = await response.json();
      alert("删除失败: " + error.error);
    }
  } catch (error) {
    alert("删除失败: " + error.message);
  }
}

// ✅ 加载统计信息
async function loadStats() {
  try {
    const response = await fetch("/stats");
    if (response.ok) {
      const stats = await response.json();

      // 更新统计信息显示
      document.getElementById("totalFiles").textContent = stats.totalFiles;
      document.getElementById("totalSize").textContent =
        stats.totalSizeFormatted;

      // 更新最后上传时间（如果有的话）
      const lastUploadElement = document.getElementById("lastUpload");
      if (lastUploadElement) {
        lastUploadElement.textContent = new Date().toLocaleString("zh-CN");
      }
    }
  } catch (error) {
    console.error("加载统计信息失败:", error);
  }
}

// ✅ 刷新文件列表
async function refreshFiles() {
  await loadFiles();
  await loadStats();
}

// 初始化加载文件
loadFiles();
loadStats();
