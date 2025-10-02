import React, { useState } from "react";
import { Upload, Package, Trash2, FileSpreadsheet } from "lucide-react";
import * as XLSX from "xlsx";

function combo(name, c60 = 0, c250 = 0, c340 = 0, c750 = 0, onlyIfPure750 = false) {
  return { name, c60, c250, c340, c750, onlyIfPure750 };
}

function generateAllCombos(pure750) {
  const combos = [];
  combos.push(combo("10×60", 10, 0, 0, 0));
  combos.push(combo("8×250", 0, 8, 0, 0));
  combos.push(combo("8×340", 0, 0, 8, 0));
  combos.push(combo("2×750", 0, 0, 0, 2, false));
  for (let a60 = 0; a60 <= 2; a60++) {
    for (let a250 = 0; a250 <= 2 - a60; a250++) {
      const a340 = 2 - a60 - a250;
      if (a60 === 0 && a250 === 0 && a340 === 0) continue;
      combos.push(combo(`2×750 + (${a60}×60,${a250}×250,${a340}×340)`, a60, a250, a340, 2));
    }
  }
  for (let a250 = 0; a250 <= 5; a250++) {
    const a340 = 5 - a250;
    combos.push(combo(`1×750 + (${a250}×250,${a340}×340)`, 0, a250, a340, 1));
  }
  combos.push(combo("1×750 + 8×60", 8, 0, 0, 1));
  combos.push(combo("1×250 + 8×60", 8, 1, 0, 0));
  const pairs = [
    [8, 2], [6, 3], [6, 4], [5, 5], [3, 6], [1, 7],
  ];
  for (const [c60, k] of pairs) {
    for (let a250 = 0; a250 <= k; a250++) {
      const a340 = k - a250;
      combos.push(combo(`${k}×(250/340) + ${c60}×60 → (${a250}×250,${a340}×340,${c60}×60)`, c60, a250, a340, 0));
    }
  }
  const map = new Map();
  for (const cb of combos) {
    const key = `${cb.c60},${cb.c250},${cb.c340},${cb.c750},${cb.onlyIfPure750}`;
    if (!map.has(key) || cb.name.length < map.get(key).name.length) map.set(key, cb);
  }
  return Array.from(map.values());
}

function solveOptimal(counts) {
  const aInit = counts["60"] || 0;
  const bInit = counts["250"] || 0;
  const cInit = counts["340"] || 0;
  const dInit = counts["750"] || 0;

  const pure750 = aInit === 0 && bInit === 0 && cInit === 0 && dInit > 0;
  const combos = generateAllCombos(pure750);

  const CAP = { 60: 10, 250: 8, 340: 8, 750: 2 };
  const ceilDiv = (x, m) => (x <= 0 ? 0 : Math.floor((x + m - 1) / m));
  const partialCost = (a, b, c, d) =>
    ceilDiv(a, CAP[60]) + ceilDiv(b, CAP[250]) + ceilDiv(c, CAP[340]) + ceilDiv(d, CAP[750]);

  const memo = new Map();
  const key = (a, b, c, d) => `${a}|${b}|${c}|${d}`;
  const better = (x, y) => {
    if (x.cost !== y.cost) return x.cost < y.cost;
    if (x.fullCount !== y.fullCount) return x.fullCount > y.fullCount;
    return (x.tailPartial ?? 0) < (y.tailPartial ?? 0);
  };
  function dp(a, b, c, d) {
    const k = key(a, b, c, d);
    if (memo.has(k)) return memo.get(k);
    let best = {
      cost: partialCost(a, b, c, d),
      fullCount: 0,
      tailPartial: partialCost(a, b, c, d),
      picks: [],
    };
    for (let i = 0; i < combos.length; i++) {
      const cb = combos[i];
      if (cb.c60 <= a && cb.c250 <= b && cb.c340 <= c && cb.c750 <= d && (!cb.onlyIfPure750 || pure750)) {
        const child = dp(a - cb.c60, b - cb.c250, c - cb.c340, d - cb.c750);
        const cand = {
          cost: child.cost + 1,
          fullCount: child.fullCount + 1,
          tailPartial: child.tailPartial,
          picks: [...child.picks, i],
        };
        if (better(cand, best)) best = cand;
      }
    }
    memo.set(k, best);
    return best;
  }

  const res = dp(aInit, bInit, cInit, dInit);
  const boxes = [];
  const pushBox = (name, c60, c250, c340, c750) => boxes.push({ name, c60, c250, c340, c750, onlyIfPure750: false });

  let a = aInit, b = bInit, c = cInit, d = dInit;
  for (const idx of [...res.picks].reverse()) {
    const cb = combos[idx];
    pushBox(cb.name, cb.c60, cb.c250, cb.c340, cb.c750);
    a -= cb.c60; b -= cb.c250; c -= cb.c340; d -= cb.c750;
  }

  const drain = (label, amount, cap) => {
    let x = amount;
    while (x > 0) {
      const take = Math.min(cap, x);
      if (label === "60") pushBox(`Partial box: ${take}×60`, take, 0, 0, 0);
      else if (label === "250") pushBox(`Partial box: ${take}×250`, 0, take, 0, 0);
      else if (label === "340") pushBox(`Partial box: ${take}×340`, 0, 0, take, 0);
      else if (label === "750") pushBox(`Partial box: ${take}×750`, 0, 0, 0, take);
      x -= take;
    }
  };
  const CAP2 = { 60: 10, 250: 8, 340: 8, 750: 2 };
  drain("60", a, CAP2[60]);
  drain("250", b, CAP2[250]);
  drain("340", c, CAP2[340]);
  drain("750", d, CAP2[750]);

  return { boxes, summary: { boxes: boxes.length, left_60: 0, left_250: 0, left_340: 0, left_750: 0 } };
}

function parseCountsFromSheet(sheet) {
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
  const wanted = rows.filter((r) => String(r.Enhed || "").toLowerCase().trim() === "kolli");
  const sizeFromName = (name) => {
    const m = String(name || "").match(/(60|250|340|750)\s*ml/i);
    return m ? m[1] : null;
  };
  const counts = { "60": 0, "250": 0, "340": 0, "750": 0 };
  for (const r of wanted) {
    const ml = sizeFromName(r.Navn);
    if (!ml) continue;
    const antal = Number(r.Antal || 0);
    counts[ml] = (counts[ml] || 0) + (isFinite(antal) ? antal : 0);
  }
  return counts;
}

function prettyCounts(counts) {
  return `60ml ${counts["60"] || 0}, 250ml ${counts["250"] || 0}, 340ml ${counts["340"] || 0}, 750ml ${counts["750"] || 0}`;
}

export default function App() {
  const [file, setFile] = useState(null);
  const [counts, setCounts] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  async function handleFile(e) {
    const f = e.target.files?.[0];
    setFile(f || null);
    setError("");
    setCounts(null);
    setResult(null);
    if (!f) return;

    try {
      const data = await f.arrayBuffer();
      const wb = XLSX.read(data, { cellStyles: false, cellHTML: false, WTF: false });
      const sheetName = wb.SheetNames[0];
      const sheet = wb.Sheets[sheetName];
      const c = parseCountsFromSheet(sheet);
      setCounts(c);
      const res = solveOptimal(c);
      setResult(res);
    } catch (err) {
      console.error(err);
      setError("Could not read the spreadsheet. Ensure columns 'Enhed', 'Navn', and 'Antal' exist.");
    }
  }

  function reset() {
    setFile(null); setCounts(null); setResult(null); setError("");
  }

  function onDownloadCSV() {
    if (!result) return;
    const rows = [["Box", "Combination", "60", "250", "340", "750"]];
    result.boxes.forEach((b, i) => rows.push([String(i + 1), b.name, String(b.c60), String(b.c250), String(b.c340), String(b.c750)]));
    const csv = rows.map((r) => r.map((cell) => String(cell).replace(/;/g, ",")).join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "packing-plan.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6 print:bg-white">
      <div className="max-w-5xl mx-auto">
        <header className="flex items-center gap-3 mb-6 print:mb-2">
          <Package className="w-8 h-8 print:hidden" />
          <h1 className="text-2xl font-bold">Box Planner</h1>
        </header>

        <div className="bg-white rounded-2xl shadow p-6 print:shadow-none print:p-0">
          <div className="flex flex-col md:flex-row md:items-center gap-4 print:hidden">
            <label className="inline-flex items-center gap-2">
              <Upload className="w-5 h-5" />
              <input type="file" accept=".xlsx" onChange={handleFile} className="block" />
            </label>
            {file && (
              <button onClick={reset} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200">
                <Trash2 className="w-4 h-4" /> Clear
              </button>
            )}
            {result && (
              <div className="flex gap-2">
                <button onClick={onDownloadCSV} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700">
                  ⇩ Download CSV
                </button>
                <button onClick={() => window.print()} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-purple-600 text-white hover:bg-purple-700">
                  🖨️ Print
                </button>
              </div>
            )}
          </div>

          {error && <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-xl">{error}</div>}

          {counts && (
            <div className="mt-6">
              <h2 className="font-semibold mb-2 flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5" /> Detected units
              </h2>
              <div className="rounded-xl border p-3 bg-gray-50">{prettyCounts(counts)}</div>
            </div>
          )}

          {result && (
            <div className="mt-8">
              <h3 className="text-lg font-semibold mb-2">Result</h3>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="rounded-2xl border p-4 bg-gradient-to-b from-white to-gray-50">
                  <div className="text-sm text-gray-500">Total boxes</div>
                  <div className="text-3xl font-bold">{result.summary.boxes}</div>
                </div>
                <div className="rounded-2xl border p-4 bg-gradient-to-b from-white to-gray-50">
                  <div className="text-sm text-gray-500">Leftovers</div>
                  <div className="mt-1 text-sm">
                    60 ml: <b>{result.summary.left_60}</b> · 250 ml: <b>{result.summary.left_250}</b> · 340 ml: <b>{result.summary.left_340}</b> · 750 ml: <b>{result.summary.left_750}</b>
                  </div>
                </div>
              </div>

              <div className="mt-6 overflow-x-auto">
                <table className="min-w-full border rounded-xl overflow-hidden">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="p-2 border">#</th>
                      <th className="p-2 border">Combination</th>
                      <th className="p-2 border">60</th>
                      <th className="p-2 border">250</th>
                      <th className="p-2 border">340</th>
                      <th className="p-2 border">750</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.boxes.map((b, i) => (
                      <tr key={i} className="odd:bg-white even:bg-gray-50">
                        <td className="border p-2 text-center">{i + 1}</td>
                        <td className="border p-2">{b.name}</td>
                        <td className="border p-2 text-center">{b.c60}</td>
                        <td className="border p-2 text-center">{b.c250}</td>
                        <td className="border p-2 text-center">{b.c340}</td>
                        <td className="border p-2 text-center">{b.c750}</td>
                      </tr>
                    ))}
                    {result.boxes.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-4 text-center text-gray-500">No boxes – nothing to pack</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
