
# YouthLM 前端互動原型

這是 YouthLM 的 React／Vite 前端，包含筆記本、白板、來源卡、成果卡、小幫手與政策雷達的互動 UI。目前尚未串接正式 AI、登入認證、資料上傳或資料庫；畫面中的對話、草稿與雷達內容是前端模擬結果，不代表後端已執行分析。重新整理頁面不會從後端還原整本筆記本。

## 目錄與啟動

前端位於 `app/web/`。既有 Python 核心仍在 `app/`，新版後端 API 仍在 `apps/api/`；此次只加入前端，不搬動後端程式。

從 repository 根目錄執行：

```sh
cd app/web
npm ci
npm run dev
```

開啟終端顯示的本機網址，通常是 `http://localhost:5173/`。`app/web` 是程式目錄，不是瀏覽器網址前綴。

建立正式版靜態檔案：

```sh
cd app/web
npm run build
```

產物位於 `app/web/dist/`，不提交到 Git。此次沿用 `package-lock.json` 與 npm；保留的 `pnpm-workspace.yaml` 是原始匯出設定，尚未建立 pnpm lockfile 或 repository 級 JavaScript workspace。

## 串接與交接文件

- 正式前後端資料格式以根目錄的 [contracts](../../contracts/README.md) 與 [前端整合契約](../../docs/frontend-integration-contract.md) 為準。
- [BACKEND_TODO.md](./BACKEND_TODO.md) 記錄前端原型階段的待辦，尚未全面同步後端 repository 的最新進度；未勾選不等於後端完全沒有實作。
- [9/1 前端規劃](./docs/frontend-plan-2026-09-01.md) 是歷史提案，其中的 API 路徑、架構與功能優先序不視為目前已凍結的契約。
- 後續串接建議先使用正式 fixtures 完成成果呈現與狀態處理，再改接新版 `apps/api`。本次提交不包含真實 API 串接或 AWS 部署。

## 原始設計與授權

原始 UI 匯出自 [YouthLM Workspace Layout](https://www.figma.com/design/23TpgZBRzPcl0lMrW7Vrq1/YouthLM-Workspace-Layout)。第三方資源說明見 [ATTRIBUTIONS.md](./ATTRIBUTIONS.md)。

私人錄音、逐字稿、模型、環境秘密、套件目錄與建置產物不在這次提交範圍。
