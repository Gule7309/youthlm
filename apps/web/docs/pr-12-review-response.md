# PR #12 review 回覆與交接清單（本機草稿）

整理日期：2026-09-06。這份文件是本輪 UI 修正的交接紀錄，不是已發布的 PR 留言，也不代表 reviewer 已核准。

## 核對基準與提交狀態

- 對應 [Gule7309 的 PR #12 review](https://github.com/Gule7309/youthlm/pull/12#pullrequestreview-5124038212)，提交時間為 2026-09-06 03:45:30 UTC。
- 本次查詢 GitHub：PR #12 仍開啟，最新人工 review 為 **Changes requested**；PR head 為 `3cac04b`，main 為 `4d94577`。PR 尚未包含這輪本機修正。
- 本機分支為 `codex/frontend-ui`，本輪修正的基底為 `471fba8`。使用者已同意先 commit、不 push；本輪以 `fix(web): address PR #12 frontend review` 保存目錄搬遷、程式修正、測試與交接文件，尚未更新 GitHub。
- 建立本輪 commit 前，分支相對本機的 `origin/codex/frontend-ui` 顯示 ahead 5／behind 1，與先前重整歷史有關。正式更新遠端前須重新核對遠端提交及協作者變更；若需要改寫遠端歷史，另取得同意並使用明確的 lease 保護，不使用無條件 force push。

## 六項 review 對照

| Review 要求 | 本機修正／處理方式 | 查核位置 |
| --- | --- | --- |
| 1. 正式前端放在 `apps/web`，保留 main 交接模組 | React UI 已搬遷，合併套件設定與 README；不保留第二套 `app/web`，不改 Python 核心 | [README](../README.md)、[package.json](../package.json)、[既有 adapter](../src/chart-artifact.js) |
| 2. 實際 TypeScript gate 與 ESM 設定 | strict／noEmit、相容的 Node／React 型別、React 直接依賴、ESM 路徑；`check` 串連型別、建置與測試 | [tsconfig](../tsconfig.json)、[Vite 設定](../vite.config.ts)、[package.json](../package.json) |
| 3. 校正後端及資料的待辦狀態 | 區分已有實作、前端未接與待設計；列出兩份官方資料的範圍、缺口與 AWS 未驗證事項 | [BACKEND_TODO](../BACKEND_TODO.md) |
| 4. 分離 Canvas ID 與 Source Registry ID | `sourceNodeIds` 只連白板；`registrySourceId`／filters 獨立預留。複製、刪除、換資料及雷達判斷已調整 | [types](../src/app/types.ts)、[狀態 helper](../src/app/workspace-state.ts)、[測試](../test/workspace-state.test.js) |
| 5. 保持 UI-only，另開 Source → Chart 小 PR | 本輪未加入 API 請求或 React 圖表呈現；下一階段依下方範圍拆分，待本輪重新 review／合併 | 本文件下一節、[圖表交接文件](../../../docs/frontend-chart-artifact.md) |
| 6. 簡報使用分析成果，不直接使用原始來源 | 簡報選項停用並說明原因；舊簡報卡不消費原始來源，助手新舊草稿都只允許建立圖表設定；助手與雷達仍明示模擬 | [分界 helper](../src/app/result-policy.ts)、[成果設定](../src/app/components/ResultInspector.tsx)、[測試](../test/result-policy.test.js) |

## 已執行驗證

- 本輪分步驗證包含新 lockfile 的獨立空目錄 `npm ci`；收尾再次執行 `npm run check`，typecheck、Vite build 及 25 個測試通過（6 個既有圖表交接、15 個白板狀態、4 個簡報分界，含子測試）。
- 前面各步瀏覽器回歸涵蓋登入、筆記本、來源及圖表設定、點空白處收合、複製與刪除連線、拖曳、Ctrl＋滾輪、雷達展開／收合及簡報停用；最後一次簡報回歸 Console 0 errors／0 warnings。這次文件收尾沒有再次操作瀏覽器。
- 使用者已逐步接受修改，最後回覆「應該是沒問題，請你繼續」；可重跑的人工檢查保留在 [README](../README.md)。
- `git diff --check` 無空白格式錯誤。相對 `origin/main`，`app/`、`apps/api/`、`contracts/` 無差異，既有 `src/chart-artifact.js` 與六個 adapter tests 也無差異。
- 本輪沒有執行真實模型、後端整合測試或 AWS 驗收；前端通過不等於完整產品已整合。未提交建置產物、秘密或私人會議檔案。

## 下一個小 PR：Source → Chart

依 reviewer 要求，先提交本輪修正、更新 PR、重新 request review，待乾淨 UI application 合併後再開下一個小 PR。各次實作仍一次完成一個可人工檢查的步驟。

1. **先做資料目錄選取。** 串接 `GET /v1/data-sources`，讓來源卡選正式 Registry 資料集並保存 Registry ID；提供載入中、空目錄及失敗狀態。暫不擴充通用上傳、清理 pipeline 或自訂資料註冊。
2. **再做分析請求。** 將已勾選且有 Registry 綁定的來源映射到正式 `AnalysisRequest`，呼叫 `POST /v1/analysis`。沒有綁定的本機檔案／網址不能假裝是 Registry 資料集；重複 Registry ID／篩選條件衝突需明確處理，不靜默合併。
3. **最後接成果呈現。** 把 JSON 與 HTTP status 交給既有 `buildChartArtifactView()`，呈現 `chart`、`table`、`blocked`、`error`。保留 partial 警告、來源及引用，使用正式 fixture 覆蓋各種狀態；真實 API／AWS 驗收另外協調。

請求欄位分界沿用 reviewer 與 [正式整合契約](../../../docs/frontend-integration-contract.md)：

- `contract_version`：`0.1.0`。
- `project_id`：目前筆記本 ID；這個映射不代表已具備登入授權或 Notebook 保存。
- `module_id`：成果卡片 ID；`query`：圖表生成需求。
- 第一條原始來源分析流程的 `upstream_module_ids` 為空陣列。
- `source_selections` 使用 `{ source_id: registrySourceId, filters }`，不是 Canvas `sourceNodeIds`。可用 filters 及預設值以正式契約／目錄為準。
- 不傳白板座標、縮放、平移或側欄狀態。不為簡報、助手或雷達自訂後端契約。

本文件只訂交接順序；上述三步均尚未實作。簡報生成、認證、整本筆記本持久化、地圖篩選及 AWS 部署仍列在 [BACKEND_TODO](../BACKEND_TODO.md)，不包含於本輪 UI review 修正。
