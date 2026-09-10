# YouthLM 前端

`apps/web` 是 YouthLM 的 React／Vite 應用程式。現在已串接以下 Contract v0
路徑：

- Source Registry → Chart：載入正式資料目錄與篩選條件，呼叫 Research Agent，
  顯示 ECharts／表格、摘要、警告、來源、版本與 provenance。
- Chart → Report：從完成或部分完成的分析模組產生、下載可編輯 DOCX。
- Chart → Presentation：從完成或部分完成的分析模組產生、下載可編輯 PPTX。
- Assistant：使用者明確勾選 Source、Analysis 或 Presentation 上下文後呼叫真實
  `/v1/assistant`，顯示解析後參照與精簡工具紀錄。

登入、整本 Notebook／Canvas 保存、檔案上傳、任意 API 來源與 Policy Radar
後端仍是原型或後續工作。重新整理頁面會重置前端記憶體狀態；SQLite 目前只
保存分析與生成 Artifact metadata，不等同使用者帳號或 Notebook 保存。

## 啟動與檢查

使用 Node.js 20 以上版本與 npm。從 repository 根目錄執行：

```sh
cd apps/web
npm ci
npm run check
npm run dev
```

`npm run check` 依序執行 strict TypeScript、正式 Vite build 與所有 Node tests。
Vite 開發伺服器把 `/v1` 轉送到 `http://127.0.0.1:8000`；跨 origin 部署可設定
`VITE_YOUTHLM_API_BASE_URL`。

Windows 上的完整互動環境可從 repository 根目錄啟動：

```powershell
.\scripts\run-local-demo.ps1
```

腳本會檢查模型與金鑰、執行品質門檻、啟動 API 與 Vite、開啟瀏覽器，並在
PowerShell 視窗按 Enter 後停止兩個程序。已通過品質門檻時可用
`-SkipQualityChecks` 快速重啟。

## 識別與輸入邊界

- `CanvasNode.id` 只用於白板節點與連線。
- Registry Source 使用 `SourceConfig.registrySourceId` 作為後端 `source_id`。
- Chart 直接使用已安裝來源與 filters。
- Report／Presentation 只使用已保存的 Analysis `module_id`，不接受 raw Source
  Node，也不從 ECharts DOM 截圖。
- Assistant 只傳使用者明確選取的後端 reference；座標、縮放、邊與顯示標籤
  不會進入 request。

來源或分析設定變更時，其下游分析、Report 與 Presentation 執行狀態會失效；
刪除卡片也會清除相依連線與 Assistant 的失效選取。複製 Notebook 會重新映射
Canvas ID，並深拷貝 filters、訊息與執行紀錄，避免兩本 Notebook 共用可變物件。

## 回應狀態

Chart adapter 將 API 回應轉為 `chart`、`table`、`blocked` 或 `error`。只有
Contract `result_data.records` 能供圖表與表格顯示；自然語言摘要不會被解析成
數值。Report 與 Presentation 使用本地 `running` 狀態，再轉為 ready 或明確的
`ErrorResponse`；ready 狀態顯示檔名、大小、SHA-256、警告與下載操作。

Assistant 不會默默捨棄失效引用。若被勾選的分析／簡報尚未 ready，送出前即
顯示錯誤；後端仍會按 `(project_id, reference_id)` 再驗證一次。

## 相關文件

- [前端整合契約](../../docs/frontend-integration-contract.md)
- [Chart Artifact](../../docs/frontend-chart-artifact.md)
- [Report Artifact](../../docs/report-contract.md)
- [Presentation Artifact](../../docs/presentation-contract.md)
- [Assistant Context](../../docs/assistant-contract.md)
- [完整 demo 驗收](../../docs/demo-readiness.md)
- [歷史後端待辦與資料稽核](./BACKEND_TODO.md)

原始 UI 匯出自 [YouthLM Workspace Layout](https://www.figma.com/design/23TpgZBRzPcl0lMrW7Vrq1/YouthLM-Workspace-Layout)。
第三方資源說明見 [ATTRIBUTIONS.md](./ATTRIBUTIONS.md)。
