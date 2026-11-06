# MUWEI FILM — Websites

一個 repo、三個站，共用 `www.muweifilm.com`：

| 原始碼資料夾 | 正式網址 | 內容 |
|---|---|---|
| `muwei-website/` | https://www.muweifilm.com/ | 木尉影像官方網站 |
| `photo-quest/` | https://www.muweifilm.com/photo-quest/ | PHOTO QUEST 攝影抽卡遊戲 |
| `reifo/` | https://www.muweifilm.com/reifo/ | reifo 創作空間 |

```text
muweifilm/
├── muwei-website/        # 官網（index / about / works / services / contact / 404 / site.css / images/）
├── photo-quest/          # Photo Quest App
├── reifo/                # reifo 創作空間
├── tests/                # Photo Quest 單元測試
├── scripts/
│   ├── run-checks.sh     # 全部檢查：測試 → build → 比對 dist/
│   ├── preview.sh        # 本機預覽（http://localhost:8000）
│   ├── build-site.sh     # 產生 dist/
│   ├── test-site.sh      # 驗證 dist/
│   └── check-live-site.sh# 正式上線後逐檔比對正式網址
├── .github/workflows/
│   ├── dev-preview.yml   # DEV：非 main 分支 → 檢查 + Cloudflare 預覽網址
│   └── deploy-pages.yml  # PROD：main → GitHub Pages 正式站 + 上線驗證
├── docs/                 # 過去的遷移紀錄
├── CNAME                 # www.muweifilm.com
└── .nojekyll
```

## 發布流程：先 dev，再正式站

```text
開 branch → 修改 → push
        ↓
  DEV：verify 檢查 + 預覽網址（https://<branch>.muweifilm-dev.pages.dev）
        ↓  手機、電腦都看過
開 PR → 合併到 main
        ↓
  PROD：GitHub Pages 部署 www.muweifilm.com，並逐檔比對正式網址
```

規則：

1. **main = 正式站。** main 受保護，不能直接 push，只能透過 PR 合併，而且 `verify` 必須通過。
2. **每個改動一個 branch**，命名 `類型/站名-簡述`：
   - `feature/photo-quest-share-sheet`
   - `fix/reifo-card-snap`
   - `design/site-about-spacing`
   - `chore/ci-cache`
3. 合併後 branch 會自動刪除。
4. 給 AI coding agent 的指示一律是「開 branch 和 PR」，不要「推到 main」。

### 本機預覽

```bash
bash scripts/preview.sh        # 跑完全部檢查後開 http://localhost:8000
bash scripts/run-checks.sh     # 只跑檢查
```

### Dev 預覽網址

- 分支固定網址：`https://<branch 名稱轉小寫、斜線變 ->.muweifilm-dev.pages.dev`（實際網址以 Actions 摘要或 PR 的 **View deployment** 為準）
- 預覽網址是公開連結，但設了 `noindex`，不會被搜尋引擎收錄。
- Photo Quest 的 Google Drive 備份在預覽網址上無法登入（OAuth 只授權正式網域）；其他功能都是本機儲存，可以正常測。

### Dev 預覽設定（一次性）

1. 到 Cloudflare 免費註冊，在 **Workers & Pages** 頁面右側複製 **Account ID**。
2. **My Profile → API Tokens → Create Token → Custom token**，權限選 **Account · Cloudflare Pages · Edit**，建立後複製 token。
3. GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**，新增：
   - `CLOUDFLARE_ACCOUNT_ID`
   - `CLOUDFLARE_API_TOKEN`
4. 到 Actions 重新執行任一 branch 的 **Dev check and preview**。第一次執行會自動建立 `muweifilm-dev` 專案。

在設定完成前，`preview` 工作會略過並顯示提示，`verify` 照常執行。

## 正式站部署

- GitHub → **Settings → Pages → Source** 必須維持 **GitHub Actions**。不要改回 *Deploy from a branch*，因為根目錄沒有 `index.html`。
- DNS 在 Squarespace：`www` 的 CNAME 指向 `jyefrpg104.github.io`。
- 上線後到 Actions 確認 `build` 和 `deploy` 兩個工作都是綠燈。`deploy` 會逐檔比對正式網址上的內容。
- 出問題要回退：在 GitHub 對該 PR 按 **Revert** 開一個回退 PR，合併後就會自動重新部署。
