# MUWEI FILM — Websites

Source projects are grouped into separate directories. GitHub Pages serves a generated `dist/` artifact, not the repository root, using the GitHub Actions workflow in `.github/workflows/deploy-pages.yml`.

```text
muweifilm/
├── muwei-website/             # 木尉影像官方網站
│   ├── index.html
│   ├── about.html
│   ├── works.html
│   ├── services.html
│   ├── contact.html
│   ├── 404.html
│   ├── site.css
│   ├── portrait.jpg
│   └── images/
├── photo-quest/               # PHOTO QUEST 攝影抽卡遊戲
├── scripts/
│   ├── build-site.sh          # 產生 dist/ 靜態站
│   ├── test-site.sh           # 檢查產出檔案及圖片內容
│   └── check-live-site.sh     # 部署後核對正式網站
├── .github/workflows/
│   ├── site-build-check.yml   # PR 建置檢查
│   └── deploy-pages.yml       # main push 自動發布 GitHub Pages
├── CNAME                      # www.muweifilm.com
├── .nojekyll
└── README.md
```

## 正式網址保持不變

- https://www.muweifilm.com/
- https://www.muweifilm.com/works.html
- https://www.muweifilm.com/about.html
- https://www.muweifilm.com/services.html
- https://www.muweifilm.com/contact.html
- https://www.muweifilm.com/photo-quest/

網站發布從 **GitHub → Settings → Pages → GitHub Actions**，透過 `deploy-pages.yml` 將 `dist/` 發布為公開網站；Squarespace 只負責網域的 DNS 與註冊（`www` CNAME 指向 `jyefrpg104.github.io`）。請勿改回 **Deploy from a branch → main /(root)**，因為原始碼中不再有根目錄的 `index.html`。

## 建置與驗證

```bash
bash scripts/build-site.sh
bash scripts/test-site.sh
```

`dist/` 內容含完整的木尉網站檔案（位於網站發布根目錄）、`photo-quest/`，以及 `CNAME` 和 `.nojekyll`；開發時則只編輯 `muwei-website/` 或 `photo-quest/`。

合併到 main 會啟動 GitHub Actions，自動將網站部署到 GitHub Pages，並比對真實正式網址上的 HTML、CSS、圖片與 Photo Quest 檔案。請在 GitHub Actions 確認完整 `deploy` 工作成功後，再確認瀏覽器畫面。

如需回退遷移，直接透過 Git revert 將官網原始碼還原至根目錄，Actions 會使用舊格式重新建置，且 DNS 不需改動。
