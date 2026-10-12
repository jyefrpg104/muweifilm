# MUWEI FILM — 網站與攝影抽卡遊戲

原始碼以獨立專案資料夾管理；**正式網站透過 GitHub Actions 建置成根目錄內容，並以 GitHub Pages 發布**。

```text
muweifilm/
├── muwei-website/            # 木尉網站 HTML、CSS、圖片
│   ├── index.html
│   ├── works.html
│   ├── about.html
│   ├── services.html
│   ├── contact.html
│   ├── 404.html
│   ├── site.css
│   ├── portrait.jpg
│   └── images/
├── photo-quest/              # 攝影抽卡遊戲（獨立專案）
├── scripts/
│   ├── build-site.sh         # 將網站組合成 dist/
│   └── test-site.sh          # 確認檔案、素材及網域
├── .github/workflows/
│   ├── site-build-check.yml  # PR 自動測試（不部署）
│   └── deploy-pages.yml      # GitHub Pages 人工啟動部署
├── CNAME                     # www.muweifilm.com
├── .nojekyll
└── README.md
```

正式網站 URL 仍然維持：
- https://www.muweifilm.com/
- https://www.muweifilm.com/works.html
- https://www.muweifilm.com/about.html
- https://www.muweifilm.com/services.html
- https://www.muweifilm.com/contact.html
- https://www.muweifilm.com/photo-quest/

## 如何產生網站

```bash
bash scripts/build-site.sh
bash scripts/test-site.sh
```

建置後的 `dist/` 結構包含官網的 `index.html`、`site.css`、`images/` 與完整 `photo-quest/`。此 `dist/` 是發布用產物，不是原始碼資料夾。

**重要：** 本儲存庫使用 GitHub Pages，而不是 Cloudflare Pages。根目錄沒有 `index.html` 時，**不能再使用** GitHub Pages 的「Deploy from a branch → main /(root)」。必須先改成 Actions 模式並完成一次成功部署，才可合併這個資料夾遷移。

DNS 由 Squarespace 管理，`www` CNAME 指向 `jyefrpg104.github.io`；本次整理不需要變更 DNS。詳細切換順序見 `MIGRATION-PLAN.md`。
