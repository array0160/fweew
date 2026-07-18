(() => {
  "use strict";

  const app = document.getElementById("app");
  const params = new URLSearchParams(location.search);
  const mode = params.get("mode") || "home";
  const room = params.get("room") || "";

  const $ = (selector, root = document) => root.querySelector(selector);

  function go(nextMode, extra = {}) {
    const q = new URLSearchParams({ mode: nextMode, ...extra });
    location.href = `${location.pathname}?${q.toString()}`;
  }

  function browserInfo() {
    const ua = navigator.userAgent || "";
    return {
      ua,
      isLine: /Line\/|LIFF/i.test(ua),
      isIOS: /iPhone|iPad|iPod/i.test(ua),
      isAndroid: /Android/i.test(ua),
      secure: window.isSecureContext,
      mediaDevices: !!navigator.mediaDevices,
      getUserMedia: !!navigator.mediaDevices?.getUserMedia,
    };
  }

  function errorText(error, title = "發生錯誤") {
    const info = browserInfo();
    const name = error?.name || "UnknownError";
    const message = error?.message || String(error || "未知錯誤");
    return [
      title,
      `error.name: ${name}`,
      `error.message: ${message}`,
      `secureContext: ${info.secure}`,
      `mediaDevices: ${info.mediaDevices}`,
      `getUserMedia: ${info.getUserMedia}`,
      `LINE WebView: ${info.isLine}`,
      `URL: ${location.href}`,
      `userAgent: ${info.ua}`,
    ].join("\n");
  }

  function showError(error, target = "#errorBox", title) {
    console.error(title || "TimePortal error", error);
    const box = $(target);
    if (box) {
      box.textContent = errorText(error, title);
      box.classList.remove("hidden");
    }
  }

  function renderHome() {
    app.innerHTML = `
      <section class="page">
        <div class="panel">
          <h1>TimePortal</h1>
          <p>老照片互動穿越</p>
          <div class="actions">
            <button class="primary" id="screenBtn">我是工作人員</button>
            <button id="mobileBtn">我是觀眾</button>
          </div>
          <p class="note">工作人員請在大螢幕開啟；觀眾通常直接掃描大螢幕上的 QR Code。</p>
        </div>
      </section>`;
    $("#screenBtn").onclick = () => go("screen");
    $("#mobileBtn").onclick = () => go("mobile");
  }

  async function createPeer(options = undefined) {
    if (!window.Peer) throw new Error("PeerJS 尚未載入，請檢查網路或 CDN。");
    return new Promise((resolve, reject) => {
      const peer = new Peer(options);
      const timer = setTimeout(() => reject(new Error("PeerJS 連線逾時。")), 12000);
      peer.once("open", () => {
        clearTimeout(timer);
        resolve(peer);
      });
      peer.once("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  async function renderScreen() {
    app.innerHTML = `
      <section class="screen-stage">
        <video id="remoteVideo" autoplay playsinline muted></video>
        <div class="screen-overlay">
          <h2>掃描 QR Code</h2>
          <div id="qrCode" aria-label="手機連線 QR Code"></div>
          <p class="room" id="roomText">正在建立房間…</p>
          <div class="status-pill" id="screenStatus">連線：初始化</div>
          <div class="error-box hidden" id="errorBox"></div>
        </div>
      </section>`;

    const status = $("#screenStatus");
    const remoteVideo = $("#remoteVideo");

    try {
      status.textContent = "連線：建立房間";
      const peer = await createPeer();
      const roomId = peer.id;
      const mobileUrl = new URL(location.href);
      mobileUrl.search = new URLSearchParams({ mode: "mobile", room: roomId }).toString();

      $("#roomText").textContent = `Room: ${roomId}`;
      if (!window.QRCode) {
        throw new Error("QR Code 函式庫尚未載入，請重新整理頁面或檢查 CDN 網路連線。");
      }
      const qrTarget = $("#qrCode");
      qrTarget.innerHTML = "";
      new QRCode(qrTarget, {
        text: mobileUrl.toString(),
        width: 260,
        height: 260,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.M,
      });

      status.textContent = "連線：等待手機";

      peer.on("call", (call) => {
        status.textContent = "連線：接收手機影像";
        call.answer();
        call.on("stream", async (stream) => {
          remoteVideo.srcObject = stream;
          try {
            await remoteVideo.play();
            status.textContent = "連線：成功";
          } catch (err) {
            showError(err, "#errorBox", "大螢幕無法播放串流");
          }
        });
        call.on("close", () => {
          status.textContent = "連線：手機已離線";
          remoteVideo.srcObject = null;
        });
        call.on("error", (err) => {
          status.textContent = "連線：failed";
          showError(err, "#errorBox", "WebRTC 通話錯誤");
        });
      });

      peer.on("disconnected", () => {
        status.textContent = "連線：重新連接";
        try { peer.reconnect(); } catch (err) {
          showError(err, "#errorBox", "PeerJS 重新連線失敗");
        }
      });

      peer.on("error", (err) => {
        status.textContent = "連線：failed";
        showError(err, "#errorBox", "PeerJS 錯誤");
      });
    } catch (err) {
      status.textContent = "連線：failed";
      showError(err, "#errorBox", "大螢幕房間建立失敗");
    }
  }

  async function getCameraStream(facingMode) {
    if (!window.isSecureContext) {
      const err = new Error("目前不是安全環境。相機必須使用 HTTPS 或 localhost。");
      err.name = "SecurityError";
      throw err;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      const err = new Error("此瀏覽器不支援 navigator.mediaDevices.getUserMedia。請改用系統 Chrome 或 Safari。");
      err.name = "NotSupportedError";
      throw err;
    }

    const preferred = {
      audio: false,
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    };

    try {
      return await navigator.mediaDevices.getUserMedia(preferred);
    } catch (firstError) {
      // 某些 Android WebView 不接受 facingMode constraint，退回最基本設定再試一次。
      console.warn("Preferred camera constraints failed; retrying basic video.", firstError);
      return await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
    }
  }

  function renderMobile() {
    const info = browserInfo();
    app.innerHTML = `
      <section class="mobile-stage">
        <video id="cameraVideo" autoplay playsinline muted></video>
        <canvas id="personCanvas"></canvas>

        <div class="floating">
          <button id="switchBtn" disabled>切換前／後鏡頭</button>
          <div class="status-pill" id="mobileStatus">尚未開啟相機</div>
        </div>

        <section class="page" id="startLayer">
          <div class="panel">
            <h2>手機相機</h2>
            <p>開啟後，畫面只保留人物，背景會變透明並傳送到大螢幕。</p>
            <div class="actions">
              <button class="primary" id="startBtn">開啟相機</button>
            </div>
            ${info.isLine ? `
              <div class="warning">
                偵測到 LINE 內建瀏覽器。請使用右上角選單，改用系統 Chrome 或 Safari 開啟，否則相機或 MediaPipe 可能失敗。
              </div>` : ""}
            <div class="error-box hidden" id="errorBox"></div>
            <div class="debug-box">${[
              `secureContext: ${info.secure}`,
              `mediaDevices: ${info.mediaDevices}`,
              `getUserMedia: ${info.getUserMedia}`,
              `LINE WebView: ${info.isLine}`,
              `room: ${room || "(未指定)"}`,
            ].join("\n")}</div>
          </div>
        </section>
      </section>`;

    const video = $("#cameraVideo");
    const canvas = $("#personCanvas");
    const ctx = canvas.getContext("2d", { alpha: true });
    const startBtn = $("#startBtn");
    const switchBtn = $("#switchBtn");
    const startLayer = $("#startLayer");
    const status = $("#mobileStatus");

    let cameraStream = null;
    let outputStream = null;
    let peer = null;
    let call = null;
    let segmentation = null;
    let facingMode = "user";
    let running = false;
    let frameBusy = false;

    function resizeCanvas() {
      const w = video.videoWidth || 720;
      const h = video.videoHeight || 1280;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    }

    async function initSegmentation() {
      if (!window.SelfieSegmentation) {
        throw new Error("MediaPipe Selfie Segmentation 尚未載入，請檢查網路或 CDN。");
      }

      segmentation = new SelfieSegmentation({
        locateFile: (file) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`,
      });

      segmentation.setOptions({
        modelSelection: 1,
        selfieMode: false,
      });

      segmentation.onResults((results) => {
        resizeCanvas();
        ctx.save();
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        /*
          正確去背順序：
          1. 先畫 segmentationMask
          2. source-in
          3. 再畫原始人物
          最終 canvas：人物保留、背景透明。
          若使用 source-out / destination-out，效果就會變成「去人」。
        */
        ctx.drawImage(results.segmentationMask, 0, 0, canvas.width, canvas.height);
        ctx.globalCompositeOperation = "source-in";
        ctx.drawImage(results.image, 0, 0, canvas.width, canvas.height);
        ctx.restore();

        frameBusy = false;
      });

      await segmentation.initialize();
    }

    async function frameLoop() {
      if (!running) return;
      if (!frameBusy && video.readyState >= 2) {
        frameBusy = true;
        try {
          await segmentation.send({ image: video });
        } catch (err) {
          frameBusy = false;
          running = false;
          showError(err, "#errorBox", "MediaPipe 人物去背失敗");
          status.textContent = "去背：failed";
          return;
        }
      }
      requestAnimationFrame(frameLoop);
    }

    async function connectToScreen() {
      if (!room) {
        status.textContent = "相機成功；未指定大螢幕房間";
        return;
      }

      status.textContent = "連線：建立 PeerJS";
      peer = await createPeer();

      outputStream = canvas.captureStream(20);
      call = peer.call(room, outputStream);

      if (!call) throw new Error("無法建立 WebRTC 通話。");

      call.on("stream", () => {
        status.textContent = "連線：成功";
      });
      call.on("close", () => {
        status.textContent = "連線：大螢幕已離線";
      });
      call.on("error", (err) => {
        status.textContent = "連線：failed";
        showError(err, "#errorBox", "手機 WebRTC 通話錯誤");
      });

      // PeerJS 單向串流不一定會收到 remote stream，因此用 signaling 狀態補強提示。
      setTimeout(() => {
        if (status.textContent.includes("建立")) {
          status.textContent = "連線：已送出影像";
        }
      }, 1500);

      peer.on("error", (err) => {
        status.textContent = "連線：failed";
        showError(err, "#errorBox", "PeerJS 錯誤");
      });
    }

    async function startCamera() {
      startBtn.disabled = true;
      $("#errorBox").classList.add("hidden");
      status.textContent = "相機：請求權限";

      try {
        cameraStream = await getCameraStream(facingMode);
        video.srcObject = cameraStream;
        await video.play();

        status.textContent = "去背：初始化";
        await initSegmentation();

        running = true;
        frameLoop();
        startLayer.classList.add("hidden");
        switchBtn.disabled = false;
        status.textContent = "相機：成功";

        await connectToScreen();
      } catch (err) {
        status.textContent = "啟動：failed";
        showError(err, "#errorBox", "手機相機啟動失敗");
        startBtn.disabled = false;
      }
    }

    async function switchCamera() {
      switchBtn.disabled = true;
      facingMode = facingMode === "user" ? "environment" : "user";
      try {
        cameraStream?.getTracks().forEach((track) => track.stop());
        cameraStream = await getCameraStream(facingMode);
        video.srcObject = cameraStream;
        await video.play();
        status.textContent = `鏡頭：${facingMode === "user" ? "前鏡頭" : "後鏡頭"}`;
      } catch (err) {
        showError(err, "#errorBox", "切換鏡頭失敗");
        status.textContent = "切換鏡頭：failed";
      } finally {
        switchBtn.disabled = false;
      }
    }

    startBtn.onclick = startCamera;
    switchBtn.onclick = switchCamera;

    window.addEventListener("beforeunload", () => {
      running = false;
      cameraStream?.getTracks().forEach((track) => track.stop());
      outputStream?.getTracks().forEach((track) => track.stop());
      call?.close();
      peer?.destroy();
      segmentation?.close?.();
    });
  }

  if (mode === "screen") {
    renderScreen();
  } else if (mode === "mobile") {
    renderMobile();
  } else {
    renderHome();
  }
})();
