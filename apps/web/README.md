# YouthLM 前端互動原型與圖表交接模組

這是 YouthLM 的 React／Vite 前端，包含筆記本、白板、來源卡、成果卡、小幫手與政策雷達。Source Node → Chart Artifact 已串接正式的 `GET /v1/data-sources` 與 `POST /v1/analysis`：使用者可選擇已安裝資料集與篩選條件，呼叫 Research Agent，並在成果設定面板看到 ECharts 圖表、表格、摘要、來源、警告或錯誤。登入、整本筆記本保存、檔案上傳、任意 API、小幫手與政策雷達仍是前端原型。

## 目錄與啟動

正式前端目錄為 `apps/web/`，React UI 與原有的 Chart Artifact 交接模組共同放在這個 application 中。既有 Python 核心留在 `app/`，FastAPI application 留在 `apps/api/`；不再保留 `app/web/` 作為第二套前端。

使用 Node.js 20 以上版本與 npm。從 repository 根目錄執行：

```sh
cd apps/web
npm ci
npm run dev
```

請先在另一個終端用根目錄的 `scripts/run-gemini-api.ps1` 啟動 API，再開啟 Vite 顯示的網址（通常是 `http://localhost:5173/`）。開發伺服器會把 `/v1` 轉送至 `http://127.0.0.1:8000`；若部署時 API 不在同一個 origin，可設定 `VITE_YOUTHLM_API_BASE_URL`。

執行完整前端品質檢查：

```sh
npm run check
```

這個指令依序執行 `npm run typecheck`、`npm run build`、`npm test`，任一步失敗都會停止並回傳非零退出碼。也可分別執行三個指令定位問題；型別檢查成功時不一定有額外訊息，會直接回到終端提示符號。

產物位於 `apps/web/dist/`，不提交到 Git。沿用 `package-lock.json` 與 npm；保留的 `pnpm-workspace.yaml` 是原始匯出設定，尚未建立 pnpm lockfile 或 repository 級 JavaScript workspace。

`tsconfig.json` 對全部 `src/**/*.ts`、`src/**/*.tsx` 及 `vite.config.ts` 啟用 `strict`／`noEmit`，涵蓋未被目前畫面引用的 UI 元件；只略過第三方宣告檔的內部檢查，不略過本專案程式碼。無框架 JavaScript 圖表模組維持由原有六個 Node tests 驗證。

React／ReactDOM 18.3.1 已列為應用程式直接依賴，React 型別也固定為相容的 18.x。Vite 使用 `import.meta.url`／`fileURLToPath` 計算專案路徑。單獨執行 `npm run build` 仍只代表建置成功，請使用 `npm run check` 完成整組品質檢查。

## 人工驗收（型別檢查這一步）

請在 `apps/web` 的終端執行 `npm run check`，確認沒有 `error TS...`、建置錯誤或失敗測試。目前包含圖表交接、白板狀態、簡報分界、Tooltip 與前後端 request mapping 測試，共 36 個測試。若要重測乾淨安裝，先停止原本的開發伺服器，再執行 `npm ci` 與 `npm run check`。

啟動 `npm run dev`，開啟終端顯示的網址，檢查：

1. 用測試用電子郵件與至少 8 個字元的密碼登入，可開啟「青年教育與就業研究」。帳號仍是前端模擬，不會傳送到後端。
2. 新增一張來源卡，選「已安裝資料集」、資料集與篩選條件後儲存。
3. 卡片可拖動，`Ctrl`＋滾輪可縮放，政策雷達仍固定在左上標題右側，展開／收合正常。
4. 新增圖表成果，選取來源、輸入需求、儲存後按「執行分析」；確認成果面板能呈現圖表或明確的 blocked/error 狀態，Console 沒有新的紅色錯誤。

重新整理頁面仍會重置前端模擬資料，這不是本次型別調整造成的新問題。Canvas ID 已分離；簡報已明示不可用，不再使用原始來源。使用者已逐步接受上一輪修正，並以 `24b7f5d` 推送；以上步驟保留供重測。本次追加 Tooltip／空白修正，提交檢查結果與 review／合併狀態以 PR #12 為準。

## Tooltip 零值回歸與 PR 空白檢查

從 `apps/web` 執行 `node --test test/chart-tooltip.test.js`，應有 6 個測試通過。測試直接渲染真正的 Tooltip，確認 `0` 位於有樣式的數值 `<span>` 中、正負數維持格式化、缺值省略，以及自訂 formatter 仍收到零值。元件目前尚未接到白板圖表，因此這一步沒有新增可從白板開啟的 Tooltip 測試畫面。

除了 `npm run check`，PR 提交後還要在 repository 根目錄執行：

```sh
git diff --check origin/main...HEAD
```

必須為 exit code 0。單獨的 `git diff --check` 只看未暫存差異，工作目錄乾淨時不會檢查 PR 中已有的空白問題。若修正尚未提交，可先執行 `git merge-base origin/main HEAD` 取得基底 SHA，再以 `git diff --check <基底SHA>` 檢查包含本機修改的已追蹤檔案；新增檔案需另外檢查，提交後仍需重跑上述三點比較指令。

## 卡片 ID 與資料來源 ID

- `CanvasNode.id`：白板卡片的識別碼；成果和小幫手草稿透過 `sourceNodeIds` 連到來源卡片。
- `SourceConfig.registrySourceId`：後端 Source Registry 的正式資料集識別碼；只由「已安裝資料集」選擇器設定。
- `SourceConfig.filters`：送進 Contract v0 `source_selections[].filters` 的篩選條件。Canvas ID、x/y、zoom 等 UI state 不會進入 API request。

複製筆記本只重建 Canvas ID 與連線，保留 Registry ID 並深拷貝篩選條件。一般來源名稱／啟用／清理選項編輯會保留既有綁定；更換檔案 metadata、來源方式或 API 網址則清除舊綁定及 filters。這是目前 metadata 原型的防護，真正上傳後仍需後端提供版本／內容識別，不能只靠檔名與大小判斷資料一致。

### 人工驗收（本次 ID 分離）

1. 先啟動 YouthLM API，再重新整理頁面並建立測試筆記本。新增兩張來源，使用「已安裝資料集」選擇資料與篩選條件並儲存。
2. 新增圖表成果，勾選兩張來源，填名稱與生成需求後儲存；確認兩條連線與來源數量正確。點空白處收合後再開啟，設定應仍保留。
3. 新增小幫手，送出需求並建立圖表草稿，確認草稿沿用來源連線。簡報不可用，不會另外建立簡報卡片。
4. 返回列表、建立此筆記本的副本；開啟副本後刪除其中一張來源，成果應只剩另一張的連線。返回原筆記本，兩張來源及連線都應仍在。

程式測試另涵蓋 Registry 綁定／巢狀 filters，包含複製後互不影響、替換資料清除綁定、request mapping 及雷達過期判斷。`npm test` 使用 Node 內建 runner；完整測試需先 `npm ci`，純前端測試不需模型金鑰。

## 簡報輸入分界與人工驗收

圖表使用原始來源，簡報需使用已完成／部分完成的結構化分析成果。現在 UI 只有設定草稿，沒有真實 AnalysisResult；因此簡報按鈕停用並顯示原因，不提供假的成果選擇器、下載或生成狀態，也不自訂簡報 API。

1. 新增成果卡片，確認「洞察簡報」顯示「尚未提供」且不能選取，旁邊說明需要分析成果。
2. 選「洞察圖表」，勾選來源、填入名稱與需求後仍可儲存、收合及重新編輯。
3. 小幫手輸入「請分析並製作簡報」：有來源時只提供 1 項圖表設定草稿，並說明簡報限制；沒有來源時不提供可執行草稿。
4. 若開發熱更新保留了舊簡報卡，應顯示不可用，不顯示原始來源連線／選擇器，不能儲存為簡報。可明確改選圖表並重新勾選來源；舊小幫手簡報草稿不能執行。

同步的 main `9430470` 已提供獨立簡報契約、`POST /v1/presentations` 與 PPTX 下載服務。前端仍需先完成 Source → Chart，再串接同一 project 下 completed／partial 分析模組；只有名稱和 Prompt 的圖表卡不能當成已完成分析，因此這次仍維持簡報停用。

## Chart Artifact 交接模組

保留從 main 合併的無框架模組 `src/chart-artifact.js` 與 `test/chart-artifact.test.js`，包含六個使用正式契約 fixtures 的測試。不需 AI、API、資料庫或模型金鑰；若尚未安裝前端依賴，可單獨執行 `node --test test/chart-artifact.test.js`。請在完整 repository 中執行，因為測試會讀取根目錄 `contracts/fixtures/frontend-integration/`。

`buildChartArtifactView(payload, { httpStatus })` 把 Contract v0 回應轉成四種明確狀態：

- `chart`：使用 Apache ECharts 呈現 `chartOption`，並保留摘要、警告與來源。
- `table`：呈現宣告的資料欄位與確定性查詢結果。
- `blocked`：顯示無法分析的原因，不繪製空圖。
- `error`：顯示 HTTP／API 錯誤，只有 `retriable` 為 true 時提供重試。

React 成果設定面板已使用 Apache ECharts 呈現 `view.kind === "chart"` 的結果；`partial` 結果保留警告，`blocked` 不畫空圖，HTTP/API error 會明確顯示。圖表數值只取自 `result_data.records`，不從 AI 摘要猜測。

詳細規則見 [圖表交接文件](../../docs/frontend-chart-artifact.md)，包含互動、可追溯性、無障礙與未來簡報輸入的分界。UI 的座標、縮放、側欄與節點尺寸不屬於後端分析契約。

## 串接與交接文件

- 正式前後端資料格式以根目錄的 [contracts](../../contracts/README.md) 與 [前端整合契約](../../docs/frontend-integration-contract.md) 為準。
- [BACKEND_TODO.md](./BACKEND_TODO.md) 已依 2026-09-06 的 main／PR 狀態校正，分開後端已實作、前端未串接及待設計事項，並列出兩份官方資料的範圍與缺口；不把本機分析保存或 provider adapter 視為整本筆記本恢復或 AWS 已驗收。
- [PR #12 review 回覆與交接清單](./docs/pr-12-review-response.md) 對照第一輪六項 review 要求、已執行檢查，以及下一個 Source → Chart PR 的範圍；已隨 `24b7f5d` 推送，保留提交時的紀錄。最新修正進度以 BACKEND_TODO 為準。
- [9/1 前端規劃](./docs/frontend-plan-2026-09-01.md) 是歷史提案，其中的 API 路徑、架構與功能優先序不視為目前已凍結的契約。
- Source → Chart 已在本 checkpoint 接上真實 API。簡報 UI、Assistant API、檔案上傳與 AWS 部署仍是後續獨立 checkpoint。

## 原始設計與授權

原始 UI 匯出自 [YouthLM Workspace Layout](https://www.figma.com/design/23TpgZBRzPcl0lMrW7Vrq1/YouthLM-Workspace-Layout)。第三方資源說明見 [ATTRIBUTIONS.md](./ATTRIBUTIONS.md)。

私人錄音、逐字稿、模型、環境秘密、套件目錄與建置產物不在提交範圍。
