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
  list.innerHTML = files
    .map((f) => `<p><a href="${f.url}" target="_blank">${f.name}</a></p>`)
    .join("");
}

// 初始化加载文件
loadFiles();
