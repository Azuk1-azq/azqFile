// Firebaseの設定情報
const firebaseConfig = {
  apiKey: "AIzaSyAuQGXQLhdkQ9IvJ4v3D14afdHmAgU3LOw",
  authDomain: "azqfile.firebaseapp.com",
  projectId: "azqfile",
  storageBucket: "azqfile.firebasestorage.app",
  messagingSenderId: "329891861242",
  appId: "1:329891861242:web:094003e12667039ff72f43"
};

const CHUNK_SIZE = 700 * 1024; 
const MAX_FILE_MB = 5;         

// Firebase SDKモジュールのインポート
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, addDoc, doc, setDoc, getDoc, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

let files = [];

// DOM要素の取得
const uploadContainer = document.getElementById('uploadContainer');
const downloadPanel = document.getElementById('downloadPanel');
const dropZone    = document.getElementById('dropZone');
const fileInput   = document.getElementById('fileInput');
const browseBtn   = document.getElementById('browseBtn');
const fileList    = document.getElementById('fileList');
const formSection = document.getElementById('formSection');
const warnBox     = document.getElementById('warnBox');
const warnText    = document.getElementById('warnText');
const progressWrap= document.getElementById('progressWrap');
const progressBar = document.getElementById('progressBar');
const progressText= document.getElementById('progressText');
const progressPct = document.getElementById('progressPct');
const progressFile= document.getElementById('progressFile');
const sendBtn     = document.getElementById('sendBtn');
const successBox  = document.getElementById('successBox');
const issuedUrlList = document.getElementById('issuedUrlList');
const errorBox    = document.getElementById('errorBox');

// URLパラメータ（?id=xxxxx）のチェック
const urlParams = new URLSearchParams(window.location.search);
const shareId = urlParams.get('id');

if (shareId) {
  // 【ダウンロードモード】
  uploadContainer.style.display = 'none';
  downloadPanel.style.display = 'flex';
  setupDownloadPage(shareId);
} else {
  // 【通常アップロードモード】
  setupUploadPage();
}

// 共通フォーマット・ヘルパー関数
function fmtSize(b) {
  if (b < 1024)         return b + ' B';
  if (b < 1024 * 1024)  return (b / 1024).toFixed(1) + ' KB';
  return (b / (1024 * 1024)).toFixed(1) + ' MB';
}

function fileIcon(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  const map = {
    pdf: 'ti-file-type-pdf', doc: 'ti-file-type-doc', docx: 'ti-file-type-doc',
    xls: 'ti-file-spreadsheet', xlsx: 'ti-file-spreadsheet',
    png: 'ti-photo', jpg: 'ti-photo', jpeg: 'ti-photo', gif: 'ti-photo',
    zip: 'ti-file-zip', rar: 'ti-file-zip', txt: 'ti-file-text'
  };
  return map[ext] || 'ti-file';
}

/* ---------------------------------------------------
    アップロードモードのロジック
--------------------------------------------------- */
function setupUploadPage() {
  browseBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', e => addFiles(Array.from(e.target.files)));
  dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('dragging'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragging'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault(); dropZone.classList.remove('dragging');
    addFiles(Array.from(e.dataTransfer.files));
  });
}

function addFiles(newFiles) {
  newFiles.forEach(f => {
    if (!files.find(x => x.name === f.name && x.size === f.size)) files.push(f);
  });
  render();
}

function render() {
  fileList.innerHTML = '';
  let oversized = [];

  files.forEach((f, i) => {
    if (f.size > MAX_FILE_MB * 1024 * 1024) oversized.push(f.name);
    const item = document.createElement('div');
    item.className = 'file-item';
    item.innerHTML = `
      <i class="ti ${fileIcon(f.name)} fi-icon"></i>
      <div class="fi-info">
        <div class="fi-name" title="${f.name}">${f.name}</div>
        <div class="fi-size">${fmtSize(f.size)}</div>
      </div>
      <button class="fi-remove" data-i="${i}"><i class="ti ti-x"></i></button>`;
    fileList.appendChild(item);
  });

  const hasFiles = files.length > 0;
  formSection.style.display = hasFiles ? 'flex' : 'none';
  sendBtn.disabled = !hasFiles || oversized.length > 0;

  if (oversized.length > 0) {
    warnBox.style.display = 'flex';
    warnText.textContent = `以下のファイルは${MAX_FILE_MB}MBを超えているため送信できません: ${oversized.join(', ')}`;
  } else {
    warnBox.style.display = 'none';
  }

  document.querySelectorAll('.fi-remove').forEach(btn => {
    btn.addEventListener('click', () => { files.splice(parseInt(btn.dataset.i), 1); render(); });
  });
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function chunkBase64(b64) {
  const chunks = [];
  for (let i = 0; i < b64.length; i += CHUNK_SIZE) {
    chunks.push(b64.slice(i, i + CHUNK_SIZE));
  }
  return chunks;
}

sendBtn.addEventListener('click', async () => {
  if (!files.length) return;
  const name = document.getElementById('senderName').value.trim();
  const note = document.getElementById('msgNote').value.trim();

  sendBtn.disabled = true;
  progressWrap.style.display = 'flex';
  errorBox.style.display = 'none';
  successBox.style.display = 'none';
  issuedUrlList.innerHTML = '';

  try {
    for (let fi = 0; fi < files.length; fi++) {
      const file = files[fi];
      progressFile.textContent = `${fi + 1} / ${files.length}: ${file.name}`;
      progressText.textContent = 'Base64変換中...';
      setProgress(0);

      const b64    = await fileToBase64(file);
      const chunks = chunkBase64(b64);

      const uploadRef = await addDoc(collection(db, 'uploads'), {
        senderName:  name  || '匿名さん',
        note:        note  || 'メモなし',
        fileName:    file.name,
        fileType:    file.type || 'application/octet-stream',
        fileSize:    file.size,
        chunkCount:  chunks.length,
        uploadedAt:  serverTimestamp(),
        status:      'uploading',
      });

      for (let ci = 0; ci < chunks.length; ci++) {
        await setDoc(doc(db, 'uploads', uploadRef.id, 'chunks', String(ci)), {
          data: chunks[ci],
        });
        setProgress(Math.round(((ci + 1) / chunks.length) * 100));
      }

      await setDoc(doc(db, 'uploads', uploadRef.id), { status: 'complete' }, { merge: true });
      
      // ★ ダウンロード用共有URLの作成
      const shareUrl = `${window.location.origin}${window.location.pathname}?id=${uploadRef.id}`;
      
      // 画面にURLコピー用の枠を表示
      const urlCard = document.createElement('div');
      urlCard.className = 'url-card';
      urlCard.innerHTML = `
        <div class="url-filename"><i class="ti ${fileIcon(file.name)}"></i> ${file.name}</div>
        <div class="url-input-wrap">
          <input type="text" class="url-input" value="${shareUrl}" readonly>
          <button type="button" class="copy-btn">URLをコピー</button>
        </div>
      `;
      issuedUrlList.appendChild(urlCard);
    }

    // コピーボタンのイベント有効化
    issuedUrlList.querySelectorAll('.copy-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const input = e.target.previousElementSibling;
        input.select();
        navigator.clipboard.writeText(input.value);
        e.target.textContent = "コピー完了！";
        setTimeout(() => e.target.textContent = "URLをコピー", 2000);
      });
    });

    progressWrap.style.display = 'none';
    successBox.style.display   = 'flex';
    files = [];
    render();
    document.getElementById('senderName').value = '';
    document.getElementById('msgNote').value    = '';

  } catch (err) {
    progressWrap.style.display = 'none';
    errorBox.style.display     = 'block';
    errorBox.textContent       = `アップロード失敗: ${err.message}`;
    sendBtn.disabled = false;
  }
});

function setProgress(pct) {
  progressBar.style.width = pct + '%';
  progressPct.textContent = pct + '%';
}

/* ---------------------------------------------------
    ダウンロードモードのロジック（URLから開かれた場合）
--------------------------------------------------- */
async function setupDownloadPage(id) {
  const dlFileName = document.getElementById('dlFileName');
  const dlFileInfo = document.getElementById('dlFileInfo');
  const dlFileNote = document.getElementById('dlFileNote');
  const dlFileIcon = document.getElementById('dlFileIcon');
  const dlStartBtn = document.getElementById('dlStartBtn');

  dlStartBtn.disabled = true;
  dlFileName.textContent = "情報を読み込み中...";

  try {
    const metaRef = doc(db, 'uploads', id);
    const metaSnap = await getDoc(metaRef);
    
    if (!metaSnap.exists()) {
      throw new Error('ファイルが存在しないか、すでに削除されています。');
    }

    const metaData = metaSnap.data();
    
    if (metaData.status !== 'complete') {
      throw new Error('このファイルはまだアップロードの途中です。');
    }

    // 画面をファイル情報に書き換え
    dlFileName.textContent = metaData.fileName;
    dlFileInfo.textContent = `サイズ: ${fmtSize(metaData.fileSize)} | アップロード者: ${metaData.senderName}`;
    dlFileNote.textContent = `メモ: ${metaData.note}`;
    
    // アイコンクラスを変更
    dlFileIcon.className = `ti ${fileIcon(metaData.fileName)} dl-file-icon`;
    dlStartBtn.disabled = false;

    // ダウンロード実行イベント
    dlStartBtn.addEventListener('click', () => executeDownload(id, metaData, dlStartBtn));

  } catch (err) {
    dlFileName.textContent = "エラー";
    errorBox.style.display = 'block';
    errorBox.textContent = err.message;
  }
}

async function executeDownload(id, meta, btn) {
  const originalText = btn.innerHTML;
  btn.disabled = true;

  try {
    let fullBase64 = "";
    const chunkCount = meta.chunkCount;

    for (let ci = 0; ci < chunkCount; ci++) {
      btn.innerHTML = `<i class="ti ti-loader"></i> データをダウンロード中 (${Math.round((ci/chunkCount)*100)}%)`;
      const chunkRef = doc(doc(db, 'uploads', id), 'chunks', String(ci));
      const chunkSnap = await getDoc(chunkRef);
      if (chunkSnap.exists()) {
        fullBase64 += chunkSnap.data().data;
      } else {
        throw new Error('ファイルの一部が見つかりませんでした。');
      }
    }

    btn.innerHTML = `<i class="ti ti-loader"></i> ファイルを復元中...`;

    // バイナリ変換処理
    const byteCharacters = atob(fullBase64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: meta.fileType });

    // 自動ダウンロード発火
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = meta.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);

    btn.innerHTML = `<i class="ti ti-check"></i> 完了！`;
  } catch (err) {
    alert("ダウンロード失敗: " + err.message);
  } finally {
    setTimeout(() => {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }, 2000);
  }
}
