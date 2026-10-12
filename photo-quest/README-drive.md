# Photo Quest personal Google Drive backup

Open https://www.muweifilm.com/photo-quest/#records, then choose **連接 Google Drive**.
Use the Google account configured as the sole OAuth test user. The first connection
requires Google's consent screen. Once connected, stable task changes are saved
locally first and automatically synchronized after a short debounce.

## Stored data

- Current task, shooting count, completed walks, favorites, and deletion/undo events.
- No photo bytes, access tokens, client secret, or Google password are stored in the backup.
- Completed tasks can additionally archive originals under `Photo Quest/Photo Walks/` through Quest Archive.
- A visible `Photo Quest` folder contains `latest.json`, per-device JSON files, and
  one immutable dated snapshot on the first successful synchronization of each day.
- Dated snapshots older than 30 calendar days (Asia/Taipei) move to Drive Trash.
  Current and per-device data retain all completed walks, independent of that window.
- JSON files use the existing export format and can be imported through the App.

## Restore and conflicts

Connecting merges completed walks and favorites while keeping this device's current
task. **還原雲端任務** previews the most recently edited cloud task before replacing
the current one; a different outgoing combination is retained as a favorite.

Archive and favorite changes use timestamped events. Deletions and undo travel across
devices instead of silently resurrecting old records. Per-device files retain writes
if devices race on `latest.json`; the next sync reconciles those files. This is
eventual reconciliation, not a transactional database. A second tab modifying the
same local storage pauses synchronization until reload.

## Authorization and availability

Google Identity Services uses the browser token model and `drive.file`, limited to
files used by this App. The OAuth client ID is public; there is no client secret in
the website. Account identity is checked against a hash of the personal account.
Tokens remain only in memory. Reopening the App or token expiry requires a user click
on **重新連線** before pending changes can upload. Failed requests retry up to three
times while the page stays open. **中斷連線** stops synchronization and leaves both
local and cloud data intact.

Offline edits are still saved in localStorage. This is not an offline-installable
PWA: loading the website for the first time requires a network connection.

## Daily backup when the App is closed

The browser version only creates dated snapshots while successfully synchronizing.
It cannot run after the App closes. A Google Apps Script daily trigger must be set up
separately to copy the already synchronized Drive data each day and retain 30 days.
That cloud schedule is **not yet installed**. It cannot copy edits that have never
left the device.

## Verification

Run:

```sh
node tests/photo-quest-drive.test.cjs
node tests/photo-quest-app-storage.test.cjs
node tests/photo-quest-archive.test.cjs
```

Tests cover local format migration, real App deletion/undo persistence, token expiry,
wrong-account rejection, offline retry, multi-device merge, edits during network
requests, cancellation, corrupt metadata, daily snapshots, and retention boundaries.


## Quest Archive 使用方式

完成任務後先保存原有本機紀錄。Google Drive 授權有效、且原有備份已找到
`Photo Quest` 根資料夾後，系統會自動封存。舊的已完成任務也會在重新連線後補傳。
在「任務紀錄 → 已完成任務」中，可查看六組條件及「攝影作品」：選擇多張圖片、
確認後上傳，失敗檔案可個別重試，也能開啟任務的 Drive 資料夾。

| 位置 | 內容與保留規則 |
| --- | --- |
| `Photo Quest/latest.json` | 原有最新備份，保持原合併機制 |
| `Photo Quest/device-<deviceId>.json` | 原有每裝置備份 |
| `Photo Quest/photo-quest-YYYY-MM-DD.json` | 原有每日快照，30 天規則只作用於 `kind=snapshot` |
| `Photo Quest/Photo Walks/YYYY-MM-DD_對象_故事/quest-card.png` | 重用 `makeTaskImage(completedSnapshot)` 的 1080 × 1350 PNG，已有完整檔案時不重傳 |
| 同一任務資料夾的 `quest.json` | 單次任務與攝影作品索引，獨立於既有系統備份 |
| 同一任務資料夾的原始照片 | JPEG、PNG、WebP、HEIC/HEIF，保留原始檔名、二進位內容與格式 |

日期以 Asia/Taipei 的完成日期命名；對象及故事各限制 45 個 Unicode 字元，
清除控制字元與常見非法檔名字元。資料夾名稱只供閱讀，同名任務不共用資料夾。

## 資料關聯與恢復

新增 `quest-archive.js` 管理 Drive 操作及狀態，`quest-archive-ui.js` 只負責任務
詳情、選取與預覽。原本任務 Snapshot 的 `id` 就是封存的 `taskId`，鏡頭的原始
`cards.frame` 映射成 `quest.json.lens`。JSON 保留原始卡片 ID、名稱及提示，
以及完整 `snapshot`、拍攝計數、固定／蓋牌狀態、器材搭配開關、日期與作品清單。
`extensions` 是未來欄位擴充空間，本版沒有地點或心得功能。

每件 Drive 資源使用 `appProperties.photoQuest=v1`，封存另用
`kind=walks/quest-folder/quest-card/quest-json/quest-photo` 及 `taskId`。
照片還會驗證其 parent 確實屬於該任務資料夾。不能用列表排序或卡片名稱當關聯。

本機封存中繼資料使用獨立 `photo-quest:quest-archive:v1` key，不改動原本 v5
任務 envelope、v2 備份、收藏指紋或刪除／復原事件。新裝置先透過原有備份取得
完成任務，再用 `taskId` 搜尋資料夾與作品，無須依賴前一裝置的 localStorage。
手動 JSON 匯出仍是原有任務備份；照片及封存 cache 不塞進備份檔。

建立前先查標記，並將 Drive `generateIds` 取得的 ID 保存至本機後才送出建立。
所以建立成功但回應／寫回 folderId 中斷時，可藉標記搜尋或同一 ID 的 409 恢復，
不重新生成資料夾。頁面內及同源支援 Web Locks 的頁籤會序列化任務與 Photo Walks 建立。

照片以名稱、大小、lastModified 的 SHA-256 key 保存保留 ID，重試及同一裝置重新
選取同一原始檔時會重用 ID。這是重試辨識，不是影像內容雜湊；相同名稱、大小及
lastModified 的不同檔案會視為同一檔案，跨裝置另行上傳同一照片不做內容去重。

## 狀態與上傳穩定性

- `pending`：待授權／待連線補傳。任務完成不受雲端失敗影響。
- `uploading`：正在建立任務檔案或上傳照片。重新開啟時恢復為 pending。
- `completed`：卡片、獨立 JSON 及已確認作品索引已保存。
- `failed`：連線仍有效但 Drive、容量或資料寫入失敗。保留錯誤與補傳操作。

使用現有 `cloud-backup.js` 提供的 verified OAuth transport，不建立第二套登入。
每個封存請求使用自己的 AbortController；中斷連線或其他頁籤更改原任務資料會
停止後續請求。封存 cache 被其他頁籤寫入時，本頁暫停封存，重新整理後再繼續。
Token 只存在原有模組的記憶體中，不寫入 localStorage、JSON 或圖片網址。

原圖採 Drive Resumable Upload，直接傳送 4 MiB Blob chunks，進度顯示已由 Drive
確認的位元組（不代表每個封包的即時進度）。模糊的網路錯誤先查詢上傳 offset，
最多嘗試三次；逐檔成功即保存可辨識的 Drive fileId。JSON 更新失敗時，下一次
封存會從已完整上傳的 `quest-photo` 檔案重建清單，避免漏掉已成功的作品。
多裝置同時更新 JSON 時，最後一筆寫入可能暫時較舊；下次開啟任務／補傳會以
Drive 原始作品重新合併，不會因 JSON 的舊索引刪除照片。

File 物件、選取預覽及 resumable session URL 只保留於目前頁面。刷新或關閉後，
未完成的照片需要重新選取；任務卡與 JSON 可在下次授權後自動補傳。網頁關閉後
不執行上傳。此版未增加 PWA、後端、中央資料庫、轉檔或 RAW 預覽。

Drive 官方文件指出 `thumbnailLink` 不適合在網頁直接使用（CORS）。本版改用
同一授權的 `files.get?alt=media` 讀取原圖，在記憶體產生最長邊 360px 的預覽。
原始 Drive 檔案不受影響，預覽不上傳、不寫入 JSON。只在作品進入可見區域後載入，每次至多處理兩張；原圖
超過 20 MiB 或瀏覽器無法解碼 HEIC 時保留檔名與 Drive 開啟操作。瀏覽預覽會
下載原圖，行動網路流量需留意；關閉任務詳情後會釋放預覽。沒有公開分享，也
沒有把 Token 加入 URL。

官方參考：https://developers.google.com/workspace/drive/api/reference/rest/v3/files

刪除或復原任務只更改原有紀錄與同步事件，不刪除、移動或清理原始照片；
封存模組沒有 DELETE 或 trash 流程。30 天快照規則完全不套用於 Photo Walks。

## Google Cloud 設定與第一版限制

現有 OAuth client、個人帳號驗證、Drive API 及 `drive.file` scope 全部沿用。
不需要新增 scope、Client Secret 或 Apps Script。正式網址維持不變，因此不需
修改正式 origin；若要在不同 localhost／PR 網域測試真正 OAuth，需將該精確
origin 加入同一 OAuth client's Authorized JavaScript origins，並使用原本測試帳號。

Google Drive 沒有以 appProperties 強制唯一的跨裝置交易。兩台尚未封存同一任務
的裝置若「完全同時首次建立」，仍可能留下同 taskId 的第二個資料夾。下次讀取
會穩定選最早建立（同時則 ID 排序）的 canonical folder，合併所有同 taskId
資料夾中的作品，且不自動刪除或移動原圖。這個罕見並行邊界無法在純瀏覽器與
Drive 架構下宣稱完全消除；一般補傳、重開、回應中斷及序列跨裝置使用已有去重。

真正的 Google OAuth、Drive CORS/resumable Location/Range headers、私人縮圖
以及 iPhone Safari／Android Chrome 實機選檔與 HEIC 預覽，仍需在可授權的 HTTP(S)
預覽來源做端到端驗證。自動化使用 Mock API，不建立真實 Drive 測試作品。
