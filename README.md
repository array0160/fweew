# TimePortal 修正版

這一版修正兩個問題：

1. **人物遮罩方向反了**
   - 使用 `segmentationMask → source-in → 原始影像`
   - 結果是「保留人物、背景透明」，不再是把人物挖掉。

2. **連線失敗與相機錯誤看不到真正原因**
   - 所有主要錯誤都會 `console.error(...)`
   - 手機畫面會顯示 `error.name`、`error.message`、安全環境、瀏覽器能力、LINE WebView 與 userAgent。
   - 偵測到 LINE 內建瀏覽器時，會提示改用系統 Chrome 或 Safari。

## 上傳方式

把以下檔案放在 GitHub Pages 專案根目錄：

- `index.html`
- `style.css`
- `script.js`
- `background.jpg`（請沿用你自己的老照片）

## 測試網址

首頁：
`https://array0160.github.io/TimePortal/`

大螢幕：
首頁按「我是工作人員」，系統會自動進入 `?mode=screen`。

手機：
掃大螢幕產生的 QR Code，會自動進入 `?mode=mobile&room=...`。

## 重要限制

目前程式仍使用 PeerJS Cloud 來驗證流程。正式展覽要改成自己的 PeerJS signaling server，
需要提供 server 的 `host`、`port`、`path`、是否使用 TLS，才能填入正式設定。


## v2 修正
上一版 `script.js` 第一個字元誤多出 `\`，瀏覽器因此產生 JavaScript SyntaxError，
導致首頁內容沒有渲染，只看到黑色背景。v2 已移除該字元。

本機直接以 `file:///` 開啟只能檢查首頁版面；相機與完整連線請部署到 GitHub Pages 的 HTTPS 網址測試。


## v3 修正
- QR Code 套件改為 qrcodejs CDN，避免原本 QRCode.toCanvas 未載入而只出現白框。
- 背景照片由 cover 改成 contain，完整照片會限制在螢幕內，不再裁切放大。
