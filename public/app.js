const STORAGE_KEY = "power-billing-records-v1";
const BARK_ENDPOINT_KEY = "power-billing-bark-endpoint-v1";
const CLOUD_META_KEY = "power-billing-cloud-updated-v1";
const CLOUD_API = "/api/records";
const homes = ["A", "B", "C", "D"];
const colors = ["#2563eb", "#db2777", "#f59e0b", "#059669"];

const seedRecords = [
  { month: "26.1", meters: { A: 19001, B: 9629, C: 11513, D: 10073 }, totalAmount: 0 },
  { month: "26.3", meters: { A: 19370, B: 9728, C: 11662, D: 10438 }, totalAmount: 605.1 },
  { month: "26.4", meters: { A: 19419, B: 9769, C: 11692, D: 10563 }, totalAmount: 223.4 },
  { month: "26.5", meters: { A: 19543, B: 9804, C: 11746, D: 10688 }, totalAmount: 266 },
];

const el = {
  form: document.querySelector("#recordForm"),
  month: document.querySelector("#month"),
  totalAmount: document.querySelector("#totalAmount"),
  meters: {
    A: document.querySelector("#meterA"),
    B: document.querySelector("#meterB"),
    C: document.querySelector("#meterC"),
    D: document.querySelector("#meterD"),
  },
  currentUsage: document.querySelector("#currentUsage"),
  currentAmount: document.querySelector("#currentAmount"),
  currentRate: document.querySelector("#currentRate"),
  previewUsage: document.querySelector("#previewUsage"),
  previewCheck: document.querySelector("#previewCheck"),
  recordsBody: document.querySelector("#recordsBody"),
  chart: document.querySelector("#usageChart"),
  resetBtn: document.querySelector("#resetBtn"),
  copyMessageBtn: document.querySelector("#copyMessageBtn"),
  copyFallback: document.querySelector("#copyFallback"),
  sendBarkBtn: document.querySelector("#sendBarkBtn"),
  barkEndpoint: document.querySelector("#barkEndpoint"),
  barkStatus: document.querySelector("#barkStatus"),
  exportBtn: document.querySelector("#exportBtn"),
  importFile: document.querySelector("#importFile"),
  syncStatus: document.querySelector("#syncStatus"),
  pagination: document.querySelector("#pagination"),
  pageInfo: document.querySelector("#pageInfo"),
  newerBtn: document.querySelector("#newerBtn"),
  olderBtn: document.querySelector("#olderBtn"),
  statUsage: document.querySelector("#statUsage"),
  statAmount: document.querySelector("#statAmount"),
  statRate: document.querySelector("#statRate"),
  statPeak: document.querySelector("#statPeak"),
  chartScope: document.querySelector("#chartScope"),
};

let records = loadRecords();
let editingMonth = "";
const PAGE_SIZE = 6;
let page = 1;
el.barkEndpoint.value = localStorage.getItem(BARK_ENDPOINT_KEY) || "";

function loadRecords() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (Array.isArray(saved) && saved.length) return normalizeRecords(saved);
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
  return normalizeRecords(seedRecords);
}

function normalizeRecords(nextRecords) {
  return nextRecords
    .filter((record) => record && record.month && record.meters)
    .map((record) => ({
      month: String(record.month),
      meters: Object.fromEntries(homes.map((home) => [home, Number(record.meters[home]) || 0])),
      totalAmount: Number(record.totalAmount) || 0,
    }))
    .sort(compareMonth);
}

// 月份格式为 "YY.M"，必须按「年」「月」两段分别比较，
// 不能用 parseFloat：parseFloat("26.10") === 26.1，会把 10 月和 1 月当成同一个月。
function monthKey(month) {
  const text = String(month).trim();
  const dot = text.indexOf(".");
  const year = Number(dot === -1 ? text : text.slice(0, dot));
  const mon = Number(dot === -1 ? 0 : text.slice(dot + 1));
  if (!Number.isFinite(year) || !Number.isFinite(mon)) return Number.POSITIVE_INFINITY;
  return year * 100 + mon;
}

function compareMonth(a, b) {
  return monthKey(a.month) - monthKey(b.month);
}

function saveRecords() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  pushToCloud();
}

function setSyncStatus(message, state = "") {
  if (!el.syncStatus) return;
  el.syncStatus.textContent = message;
  el.syncStatus.dataset.state = state;
}

async function pushToCloud() {
  setSyncStatus("正在保存到云端…", "syncing");
  try {
    const response = await fetch(CLOUD_API, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(records),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    localStorage.setItem(CLOUD_META_KEY, String(Date.now()));
    setSyncStatus("已同步到云端", "ok");
  } catch {
    setSyncStatus("云端保存失败，已存本机", "error");
  }
}

async function pullFromCloud() {
  setSyncStatus("正在从云端加载…", "syncing");
  try {
    const response = await fetch(CLOUD_API, { method: "GET" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const cloud = await response.json();
    if (Array.isArray(cloud) && cloud.length) {
      records = normalizeRecords(cloud);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
      setSyncStatus("已从云端同步", "ok");
      render();
    } else {
      // 云端还没有数据，把本机数据推上去作为初始值
      setSyncStatus("云端暂无数据，正在上传本机记录…", "syncing");
      await pushToCloud();
    }
  } catch {
    setSyncStatus("云端不可用，使用本机数据", "error");
  }
}

function money(value) {
  return `${round(value, 2).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 元`;
}

function kwh(value) {
  return `${round(value, 2).toLocaleString("zh-CN", { maximumFractionDigits: 2 })} 度`;
}

function round(value, digits = 2) {
  const base = 10 ** digits;
  return Math.round((Number(value) + Number.EPSILON) * base) / base;
}

function getCalculatedRows() {
  const rows = records.map((record, index) => {
    const previous = records[index - 1];
    const usage = {};
    homes.forEach((home) => {
      usage[home] = previous ? record.meters[home] - previous.meters[home] : 0;
    });
    const totalUsage = homes.reduce((sum, home) => sum + usage[home], 0);
    const amounts = {};
    homes.forEach((home) => {
      amounts[home] = totalUsage > 0 ? (usage[home] / totalUsage) * record.totalAmount : 0;
    });
    return { ...record, usage, totalUsage, amounts };
  });

  // 环比：与上一条记录比较，每户单独计算。月份不连续时百分比会失真，改标记跨月数。
  return rows.map((row, index) => {
    const previous = rows[index - 1];
    if (!previous) return { ...row, change: {}, gap: 0 };
    const gap = monthIndex(row.month) - monthIndex(previous.month);
    const change = {};
    homes.forEach((home) => {
      const previousUsage = previous.usage[home];
      change[home] = gap === 1 && previousUsage > 0 ? (row.usage[home] - previousUsage) / previousUsage : null;
    });
    return { ...row, change, gap };
  });
}

function monthIndex(month) {
  const key = monthKey(month);
  if (!Number.isFinite(key)) return 0;
  const year = Math.floor(key / 100);
  return year * 12 + (key % 100);
}

function formatChange(value) {
  if (value === null || value === undefined) return { text: "—", state: "idle" };
  const percent = round(value * 100, 0);
  if (percent === 0) return { text: "持平", state: "flat" };
  const arrow = percent > 0 ? "↑" : "↓";
  return { text: `${arrow} ${Math.abs(percent)}%`, state: percent > 0 ? "up" : "down" };
}

function render() {
  const rows = getCalculatedRows();
  const latest = rows.at(-1);
  el.currentUsage.textContent = latest ? kwh(latest.totalUsage) : "0 度";
  el.currentAmount.textContent = latest ? money(latest.totalAmount) : "0 元";
  el.currentRate.textContent =
    latest && latest.totalUsage > 0 ? `${round(latest.totalAmount / latest.totalUsage, 4)} 元/度` : "0 元/度";

  renderTable(rows);
  updatePreview();
}

function renderTable(rows) {
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  if (page > totalPages) page = totalPages;
  if (page < 1) page = 1;

  // 记录按时间升序存储（用量要用「前一条」计算），展示时倒序：最新月份在最上面。
  const descRows = rows.slice().reverse();
  const pageRows = descRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const baseMonth = rows.length ? rows[0].month : "";

  el.recordsBody.innerHTML = pageRows
    .map((row) => {
      const isBase = row.month === baseMonth;
      const gapNote = row.gap > 1 ? `<div class="month-sub change gap">跨${row.gap}月</div>` : "";
      const cells = homes
        .map(
          (home, homeIndex) => {
            // 跨月时百分比失真，每户都不显示，只在月份格标注跨月数。
            const change = formatChange(row.change[home]);
            const tag = isBase || row.gap > 1 ? "" : `<span class="change-tag ${change.state}">${change.text}</span>`;
            return `
            <td>
              <div class="home-line" style="--home-color: ${colors[homeIndex]}">
                <span class="home-dot" aria-hidden="true"></span>
                <span class="usage">${kwh(row.usage[home])}</span>
                ${tag}
              </div>
              <div class="amount">${money(row.amounts[home])}</div>
              <div class="meter-sub">表 ${plainNumber(row.meters[home], 1)}</div>
            </td>
          `;
          },
        )
        .join("");

      return `
        <tr>
          <td>
            <strong>${row.month}</strong>
            ${isBase ? `<div class="month-sub change idle">基准月</div>` : gapNote}
          </td>
          ${cells}
          <td>${isBase ? "基准月" : kwh(row.totalUsage)}</td>
          <td>${isBase ? "-" : money(row.totalAmount)}</td>
          <td>
            <div class="row-actions">
              <button class="mini-btn" type="button" data-edit="${row.month}">编辑</button>
              <button class="mini-btn danger" type="button" data-delete="${row.month}">删除</button>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  el.pageInfo.textContent = `第 ${page} / ${totalPages} 页 · 共 ${rows.length} 条`;
  el.newerBtn.disabled = page <= 1;
  el.olderBtn.disabled = page >= totalPages;
  el.pagination.hidden = rows.length <= PAGE_SIZE;

  // 图表与统计跟随当前页，和表格看到的是同一批月份。
  const pageRowsAsc = pageRows.slice().reverse();
  if (el.chartScope) {
    el.chartScope.textContent =
      totalPages > 1 ? `当前显示第 ${page} 页的 ${pageRowsAsc.length} 个月` : `共 ${pageRowsAsc.length} 个月`;
  }
  drawChart(pageRowsAsc);
  updateChartStats(pageRowsAsc);
}

function updateChartStats(rows) {
  // 基准月没有用量（无法与上月相减），统计时排除。
  const valid = rows.filter((row) => row.totalUsage > 0);
  if (!valid.length) {
    el.statUsage.textContent = "-";
    el.statAmount.textContent = "-";
    el.statRate.textContent = "-";
    el.statPeak.textContent = "-";
    return;
  }

  const totalUsage = valid.reduce((sum, row) => sum + row.totalUsage, 0);
  const totalAmount = valid.reduce((sum, row) => sum + row.totalAmount, 0);
  const peak = valid.reduce((max, row) => (row.totalUsage > max.totalUsage ? row : max), valid[0]);

  el.statUsage.textContent = `${plainNumber(totalUsage, 1)} 度`;
  el.statAmount.textContent = money(totalAmount);
  el.statRate.textContent = totalUsage > 0 ? `${round(totalAmount / totalUsage, 3)} 元/度` : "-";
  el.statPeak.textContent = `${peak.month}（${plainNumber(peak.totalUsage, 0)} 度）`;
}

function drawChart(rows) {
  const canvas = el.chart;
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  // 左右双轴：左=用电量（度），右=单价（元/度）
  const pad = { left: 74, right: 76, top: 34, bottom: 58 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;

  const maxUsage = Math.max(10, ...rows.map((row) => row.totalUsage));
  // 多留一档给柱顶数值标签，避免最高柱的数字画出画布。
  const usageTop = Math.ceil((maxUsage * 1.12) / 4) * 4 || 4;
  const rates = rows.map((row) => (row.totalUsage > 0 ? row.totalAmount / row.totalUsage : 0)).filter((v) => v > 0);
  const maxRate = rates.length ? Math.max(...rates) : 0;
  const rateTop = maxRate > 0 ? Math.ceil((maxRate * 1.15) / 0.2) * 0.2 : 1;

  // 横向网格 + 左右轴刻度
  ctx.strokeStyle = "#e4ebf3";
  ctx.lineWidth = 1;
  ctx.font = "20px Microsoft YaHei, sans-serif";
  for (let i = 0; i <= 4; i += 1) {
    const y = pad.top + (chartH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + chartW, y);
    ctx.stroke();

    ctx.fillStyle = "#8896a6";
    ctx.textAlign = "right";
    ctx.fillText(String(Math.round(usageTop - (usageTop / 4) * i)), pad.left - 12, y + 7);

    ctx.fillStyle = "#b45309";
    ctx.textAlign = "left";
    ctx.fillText((rateTop - (rateTop / 4) * i).toFixed(2), pad.left + chartW + 12, y + 7);
  }
  ctx.textAlign = "left";

  if (!rows.length) {
    ctx.fillStyle = "#526071";
    ctx.font = "20px Microsoft YaHei, sans-serif";
    ctx.fillText("录入至少两个月读数后显示趋势", pad.left, height / 2);
    return;
  }

  const slot = chartW / rows.length;
  const barW = Math.min(56, slot * 0.52);
  const centerX = (index) => pad.left + slot * index + slot / 2;
  const usageY = (value) => pad.top + chartH - (value / usageTop) * chartH;
  const rateY = (value) => pad.top + chartH - (value / rateTop) * chartH;

  // 柱子：每月总用电量
  rows.forEach((row, index) => {
    const x = centerX(index) - barW / 2;
    const y = usageY(row.totalUsage);
    const barH = Math.max(0, pad.top + chartH - y);
    const gradient = ctx.createLinearGradient(0, y, 0, pad.top + chartH);
    gradient.addColorStop(0, "#3b82f6");
    gradient.addColorStop(1, "#bfdbfe");
    ctx.fillStyle = gradient;
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") {
      ctx.roundRect(x, y, barW, barH, [6, 6, 0, 0]);
    } else {
      // 老版本 Safari 不支持 roundRect，退回直角柱子。
      ctx.rect(x, y, barW, barH);
    }
    ctx.fill();

    // 柱顶标数值，标签在柱子左右居中
    ctx.fillStyle = "#1e40af";
    ctx.font = "bold 18px Microsoft YaHei, sans-serif";
    ctx.textAlign = "center";
    if (row.totalUsage > 0) ctx.fillText(String(Math.round(row.totalUsage)), centerX(index), y - 10);
  });

  // 折线：单价
  const ratePoints = rows.map((row, index) => ({
    x: centerX(index),
    y: row.totalUsage > 0 ? rateY(row.totalAmount / row.totalUsage) : null,
    rate: row.totalUsage > 0 ? row.totalAmount / row.totalUsage : 0,
  }));
  const drawable = ratePoints.filter((point) => point.y !== null);

  if (drawable.length > 1) {
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 8;
    ctx.lineJoin = "round";
    ctx.beginPath();
    drawable.forEach((point, i) => (i === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)));
    ctx.stroke();

    ctx.strokeStyle = "#d97706";
    ctx.lineWidth = 4;
    ctx.beginPath();
    drawable.forEach((point, i) => (i === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)));
    ctx.stroke();
  }

  drawable.forEach((point) => {
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(point.x, point.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#d97706";
    ctx.beginPath();
    ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
    ctx.fill();
  });

  // x 轴月份标签：首尾贴边时改为内对齐，避免被裁切
  ctx.fillStyle = "#526071";
  ctx.font = "19px Microsoft YaHei, sans-serif";
  rows.forEach((row, index) => {
    const x = centerX(index);
    const textW = ctx.measureText(row.month).width;
    const half = textW / 2;
    if (x - half < pad.left - 8) ctx.textAlign = "left";
    else if (x + half > pad.left + chartW + 8) ctx.textAlign = "right";
    else ctx.textAlign = "center";
    const drawX = ctx.textAlign === "left" ? pad.left : ctx.textAlign === "right" ? pad.left + chartW : x;
    ctx.fillText(row.month, drawX, height - 18);
  });
  ctx.textAlign = "left";
}

function readForm() {
  return {
    month: el.month.value.trim(),
    totalAmount: Number(el.totalAmount.value) || 0,
    meters: Object.fromEntries(homes.map((home) => [home, Number(el.meters[home].value) || 0])),
  };
}

function updatePreview() {
  const draft = readForm();
  const comparisonRecords = normalizeRecords([
    ...records.filter((record) => record.month !== editingMonth && record.month !== draft.month),
    draft,
  ]);
  const draftIndex = comparisonRecords.findIndex((record) => record.month === draft.month);
  const previous = draftIndex > 0 ? comparisonRecords[draftIndex - 1] : null;
  const usage = previous ? homes.reduce((sum, home) => sum + draft.meters[home] - previous.meters[home], 0) : 0;
  el.previewUsage.textContent = kwh(usage);
  el.previewCheck.textContent = money(usage > 0 ? draft.totalAmount : 0);
}

function fillForm(record) {
  editingMonth = record.month;
  el.month.value = record.month;
  el.totalAmount.value = record.totalAmount || "";
  homes.forEach((home) => {
    el.meters[home].value = record.meters[home] || "";
  });
  updatePreview();
  el.month.focus();
}

function clearForm() {
  editingMonth = "";
  el.form.reset();
  updatePreview();
}

function downloadJson() {
  const blob = new Blob([JSON.stringify(records, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `电费记录-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function plainNumber(value, digits = 2) {
  return round(value, digits).toLocaleString("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function buildGroupMessage() {
  const latest = getCalculatedRows().filter((row) => row.totalUsage > 0).at(-1);
  if (!latest) return "暂无可复制的本月电费数据";
  const lines = [`${latest.month}月电费：`];
  homes.forEach((home) => {
    lines.push(`${home}户 用电量${plainNumber(latest.usage[home], 0)}度，金额${plainNumber(latest.amounts[home])}元`);
  });
  lines.push(`总用电量${plainNumber(latest.totalUsage, 0)}度，总金额${plainNumber(latest.totalAmount)}元`);
  return lines.join("\n");
}

async function copyGroupMessage() {
  const message = buildGroupMessage();
  try {
    await navigator.clipboard.writeText(message);
  } catch {
    el.copyFallback.value = message;
    el.copyFallback.hidden = false;
    el.copyFallback.select();
    document.execCommand("copy");
    el.copyFallback.hidden = true;
  }

  const original = el.copyMessageBtn.textContent;
  el.copyMessageBtn.textContent = "已复制";
  el.copyMessageBtn.classList.add("copied");
  setTimeout(() => {
    el.copyMessageBtn.textContent = original;
    el.copyMessageBtn.classList.remove("copied");
  }, 1200);
}

function normalizeBarkEndpoint(input) {
  const value = input.trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value.replace(/\/$/, "");
  return `https://api.day.app/${encodeURIComponent(value)}`;
}

function setBarkStatus(message, isError = false) {
  el.barkStatus.textContent = message;
  el.barkStatus.classList.toggle("error", isError);
}

async function sendBarkMessage() {
  const endpoint = normalizeBarkEndpoint(el.barkEndpoint.value);
  if (!endpoint) {
    setBarkStatus("先填写 Bark 地址或 Key。", true);
    el.barkEndpoint.focus();
    return;
  }

  localStorage.setItem(BARK_ENDPOINT_KEY, el.barkEndpoint.value.trim());
  const message = buildGroupMessage();
  const title = "本月电费";
  const url = `${endpoint}/${encodeURIComponent(title)}/${encodeURIComponent(message)}?group=${encodeURIComponent("电费")}&copy=${encodeURIComponent(message)}`;

  el.sendBarkBtn.disabled = true;
  setBarkStatus("正在发送到手机...");
  try {
    const response = await fetch(url, { method: "GET" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    setBarkStatus("已发送到 iPhone，可直接从 Bark 里复制。");
  } catch {
    setBarkStatus("发送失败，请检查 Bark 地址/Key，或确认 Cloudflare 页面可联网。", true);
  } finally {
    el.sendBarkBtn.disabled = false;
  }
}

el.form.addEventListener("input", updatePreview);
el.form.addEventListener("submit", (event) => {
  event.preventDefault();
  const draft = readForm();
  if (!draft.month) return;
  const existingIndex = records.findIndex((record) => record.month === editingMonth || record.month === draft.month);
  if (existingIndex >= 0) records[existingIndex] = draft;
  else records.push(draft);
  records = normalizeRecords(records);
  saveRecords();
  page = 1;
  clearForm();
  render();
});

el.recordsBody.addEventListener("click", (event) => {
  const editMonth = event.target.dataset.edit;
  const deleteMonth = event.target.dataset.delete;
  if (editMonth) {
    const record = records.find((item) => item.month === editMonth);
    if (record) fillForm(record);
  }
  if (deleteMonth) {
    records = records.filter((item) => item.month !== deleteMonth);
    saveRecords();
    render();
  }
});

el.resetBtn.addEventListener("click", clearForm);
el.copyMessageBtn.addEventListener("click", copyGroupMessage);
el.newerBtn.addEventListener("click", () => {
  if (page > 1) {
    page -= 1;
    renderTable(getCalculatedRows());
  }
});
el.olderBtn.addEventListener("click", () => {
  page += 1;
  renderTable(getCalculatedRows());
});
el.sendBarkBtn.addEventListener("click", sendBarkMessage);
el.barkEndpoint.addEventListener("change", () => {
  localStorage.setItem(BARK_ENDPOINT_KEY, el.barkEndpoint.value.trim());
  setBarkStatus("Bark 设置已保存。");
});
el.exportBtn.addEventListener("click", downloadJson);
el.importFile.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const text = await file.text();
  records = normalizeRecords(JSON.parse(text));
  saveRecords();
  clearForm();
  render();
  event.target.value = "";
});
window.addEventListener("resize", () => renderTable(getCalculatedRows()));

render();
pullFromCloud();
