# ins-cli

這是一個完全由 AI 做出來的 Instagram CLI 聊天工具。

我不知道當初為什麼想做這個，也不知道做好了現在可以幹嘛。總之就是可以在終端機裡跟人聊天，看起來很像在跟 agent 講話。

雖然我覺得應該沒有什麼安全性問題，但我沒看程式碼內容（完全沒看），所以也不知道到底有沒有什麼問題。這段話不是安全保證，有興趣的話就自己研究一下。

## 這東西可以幹嘛

把你已經登入的 Instagram 網頁，接到一個文字介面的聊天室。

- 用方向鍵或編號選擇聊天室，顯示名稱、最後一句話和可辨識的未讀狀態。
- 在聊天室直接打字、按 Enter 傳送，不需要 `/send`。
- 網頁有新訊息時更新 CLI，保留正在輸入的草稿與游標。
- 有新訊息時發出提示音，在終端機分頁標題顯示 `● (3) ins-cli · 聊天室`。
- 輸入 `/` 篩選指令，支援 Tab 補完與方向鍵選擇。
- 顯示 emoji，也可以用 `:pleading_face:` 這類短碼輸入 🥺。
- 收到分享的 Reel 或貼文時，盡量只顯示作者與連結。

主要走文字路線。圖片、貼圖和語音目前用文字標記表示，沒有做完整的附件瀏覽或傳送介面。

## 運作方式

```text
你已登入的 Instagram 分頁
            ↕
       Edge 擴充套件
            ↕
   本機橋接 127.0.0.1:17361
            ↕
         ins-cli
```

CLI 不另外登入 Instagram。擴充套件讀取你選定分頁上已載入的內容，並透過網頁上的輸入框和傳送按鈕操作訊息。

網頁內容改變時會主動推送更新，也保留定時輪詢作為備援。這不是 Instagram 官方 API，也不是官方客戶端。

## 開始使用

目前以 **Windows + Microsoft Edge** 為主要使用環境，需要 **Node.js 20 以上版本**。

1. 下載這個 repository 並解壓縮，或執行 `git clone https://github.com/JackChang92318/ins-cli.git`。
2. 在 Edge 開啟 `edge://extensions`，開啟「開發人員模式」。
3. 選擇「載入解壓縮」，選取專案裡的 [`extension`](extension) 資料夾。
4. 在 Edge 登入自己的 Instagram，開啟私訊收件匣。
5. 在專案資料夾執行 `start.bat`，也可以在終端機執行：

   ```powershell
   node src/cli.cjs
   ```

6. 複製 CLI 顯示的配對碼。在 Instagram 分頁開啟 ins-cli 擴充套件，貼上配對碼，按「連接此分頁」。
7. 回到終端機，配對完成後會自動顯示聊天室選單。用方向鍵或編號選人，按 Enter 開啟。
8. 直接輸入文字，按 Enter 傳送。

目前沒有 npm 相依套件，不需要執行 `npm install`。

### 配對碼是什麼

配對碼是這次 CLI 啟動時產生的本機連線憑證，**不是 Instagram 密碼**。擴充套件需要它才能跟本機橋接通訊。

每次重開 CLI 都會換一組，舊碼會失效，所以需要重新配對。使用時要保留 Instagram 分頁；關閉或休眠分頁可能讓同步中斷。

### 更新程式後

關閉舊 CLI，在 `edge://extensions` 重新載入 ins-cli，再重新整理 Instagram。接著啟動 `start.bat`，用新的配對碼連線。

## 操作方式

| 輸入／按鍵 | 功能 |
| --- | --- |
| 一般文字 + Enter | 在目前聊天室傳送訊息 |
| `/chat` 或 `/chats` | 選擇／切換聊天室 |
| `/r` | 手動更新畫面 |
| `/inspect` | 顯示連線及頁面結構診斷 |
| `/quit` | 停止同步並離開 CLI |
| `/` | 顯示指令候選，繼續輸入可依前綴篩選 |
| Tab、↑、↓ | 補完或選擇指令；聊天室選單也支援方向鍵 |
| Esc | 隱藏指令候選，或取消聊天室選擇 |

斜線開頭的輸入會被當成指令，未知指令不會當成訊息送出。訊息按 Enter 就會操作網頁送出，沒有第二次確認。

在獨立視窗執行 `start.bat` 時，正常離開不會要求再按任意鍵；若是在既有終端機內啟動，則會回到原本的 shell。

## 通知與未讀

聊天室列表會顯示類似以下內容：

```text
朋友 A [未讀 2 則] — 2 new messages
朋友 B — 等等見
朋友 C [未讀] — 傳送了 1 個附件
```

未讀數量來自網頁上的標記或完整的系統摘要。只有小藍點、沒有數量時，就只顯示「未讀」，不猜訊息則數。

分頁標題的 `●` 是提醒標記；數字後面的 `+` 表示只能確認至少有這個數量。首次同步不響鈴，短時間連續的新訊息會合併提示。開啟對應聊天室，或在目前聊天室按 Enter 提交輸入後，會清除該對話的提醒。

提示音與分頁標題也受終端機設定影響。Windows Terminal 的 `bellStyle` 需要允許聲音，`suppressApplicationTitle` 需要設為 `false` 才能顯示程式提供的標題。可參考 [Windows Terminal 設定說明](https://learn.microsoft.com/en-us/windows/terminal/customize-settings/profile-advanced)；程式不會替你修改全域設定。

## 目前的限制

- 只能讀到 Instagram 網頁已載入的聊天室和訊息，不是完整歷史匯出，也無法保證取得所有聊天室的未讀總數。
- Instagram 改版、語言、視窗寬度或頁面狀態都可能影響辨識。發送者辨識失敗時會顯示「發送者未辨識」。
- 背景分頁休眠、網路中斷或網頁本身沒收到訊息時，CLI 也無法即時更新。
- 不支援所有 Instagram 訊息類型，也沒有完整的圖片、貼圖、語音、通話或群組管理介面。
- Emoji 的顯示仍取決於終端機與字型；短碼支援 Unicode emoji，不支援 Discord 伺服器自訂圖片。
- 網頁已經有草稿、輸入框或傳送按鈕無法唯一辨識時，程式會停止送出。送出逾時也不會自動重送；需要自己確認網頁上的結果。

## 資料與安全性

目前的程式設計不要求 Instagram 帳密，也不讀取或匯出 cookies。登入由瀏覽器管理；擴充套件仍能讀取及操作你選定分頁中的聊天內容。

橋接服務只監聽 `127.0.0.1:17361`，通訊需要本次配對碼。配對資料放在擴充套件的 session storage，聊天內容與命令在程式記憶體中處理，不主動把訊息或附件存成檔案。不過瀏覽器原有快取、終端機捲動歷史等仍可能保留內容。

選取聊天室可能會把訊息標示已讀。這些設計不等於做過完整的安全審查，也不保證網站會持續允許這種操作方式。

## 開發與測試

```powershell
npm test
```

測試涵蓋本機橋接驗證、命令交付與逾時、輸入編輯、聊天室切換、未讀與 emoji、即時推送，以及通知去重等流程。網頁操作主要使用模擬 DOM 驗證，通過測試不代表所有 Instagram 頁面都能正常使用。

| 檔案 | 用途 |
| --- | --- |
| [`src/cli.cjs`](src/cli.cjs) | CLI 主流程 |
| [`src/bridge.cjs`](src/bridge.cjs) | 本機橋接與配對驗證 |
| [`src/command-input.cjs`](src/command-input.cjs) | 輸入框與指令補完 |
| [`src/chat-picker.cjs`](src/chat-picker.cjs)、[`src/chat-view.cjs`](src/chat-view.cjs) | 聊天室選擇與對話顯示 |
| [`src/notifications.cjs`](src/notifications.cjs) | 新訊息提醒、提示音與分頁標記 |
| [`extension/`](extension) | Edge 擴充套件、網頁讀取與操作 |

專案結構：

```text
ins-cli/
├─ src/          CLI 程式碼
├─ extension/    Edge 擴充套件
├─ tests/        測試與測試執行器
├─ data/         Emoji 字典資料
├─ docs/         資料來源說明
├─ licenses/     第三方授權
├─ start.bat     Windows 啟動入口
├─ package.json
└─ README.md
```

本機的舊備份與早期範例集中在 `.local/legacy/`，由 `.gitignore` 排除，不會上傳 GitHub，也不會被正式程式或測試載入。

遇到問題可以附上錯誤文字和 `/inspect` 的輸出，回報前請自行檢查是否含有不想公開的資訊，不需要提供帳密、配對碼或聊天內容。

## 第三方資料

Emoji 短碼資料來自 GitHub 的 gemoji。來源與轉換說明見 [`docs/emoji-data.md`](docs/emoji-data.md)，授權文字保留於 [`licenses/gemoji-LICENSE`](licenses/gemoji-LICENSE)。
