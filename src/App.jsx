import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Plus, Trash2, Package, ShoppingCart, ClipboardList, Search,
  X, Loader2, AlertTriangle, Minus, Receipt, Pencil,
  LayoutGrid, LayoutList, CheckCircle2, ArrowUpCircle,
  Download, Upload, DatabaseBackup, ShieldCheck,
  ArrowDownCircle, ChevronDown, ChevronUp, Calendar,
  Share2, Copy, FileText, Send, ArrowRight
} from "lucide-react";

const C = {
  bg: "#1A2235",
  card: "#222D42",
  ink: "#E6EDF3",
  inkSoft: "#8B9BB4",
  line: "#2D3A52",
  coral: "#3B8BFF",
  coralSoft: "#1A2E55",
  teal: "#00C8FF",
  tealSoft: "#0D2A3A",
  amber: "#5B9BFF",
  amberSoft: "#192A4A",
  danger: "#F85149",
  dangerSoft: "#3D1515",
};

const TAGS = [C.coral, C.teal, C.amber, "#6C63FF", "#3AAFA9"];
const tagFor = (s) => TAGS[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % TAGS.length];

const fmtIDR = (n) => "Rp " + Math.round(Number(n) || 0).toLocaleString("id-ID");
const todayStr = () => new Date().toISOString().slice(0, 10);
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

// Helper for local storage compatibility
const storage = {
  get: async (key) => ({ value: localStorage.getItem(key) }),
  set: async (key, value) => { localStorage.setItem(key, value); return true; }
};

// ─────────────────────────── Toast system ───────────────────────────
function ToastContainer({ toasts }) {
  return (
    <div className="fixed bottom-6 left-1/2 flex flex-col items-center gap-2 pointer-events-none" style={{ transform: "translateX(-50%)", zIndex: 999 }}>
      {toasts.map((t) => (
        <div
          key={t.id}
          className="flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold shadow-xl"
          style={{ background: "#1C2D45", color: C.ink, border: `1px solid ${C.line}`, boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}
        >
          <CheckCircle2 size={15} color={C.teal} />
          {t.message}
        </div>
      ))}
    </div>
  );
}

function useToast() {
  const [toasts, setToasts] = useState([]);
  const showToast = useCallback((message) => {
    const id = uid();
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2500);
  }, []);
  return { toasts, showToast };
}

// ─────────────────────────── Category helpers ───────────────────────────
function groupByCategory(products) {
  const groups = {};
  products.forEach((p) => {
    const cat = p.category?.trim() || "";
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(p);
  });
  // Sort: named categories alphabetically, then "Lainnya" last
  const named = Object.keys(groups).filter((k) => k !== "").sort((a, b) => a.localeCompare(b, "id"));
  const others = groups[""] ? [""] : [];
  return [...named, ...others].map((key) => ({ label: key || "Lainnya", products: groups[key] }));
}

function getCategories(products) {
  const cats = [...new Set(products.map((p) => p.category?.trim() || ""))];
  const named = cats.filter((k) => k !== "").sort((a, b) => a.localeCompare(b, "id"));
  const others = cats.includes("") ? [""] : [];
  return [...named, ...others].map((k) => ({ key: k, label: k || "Lainnya" }));
}

// ─────────────────────────── Main App ───────────────────────────
export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [products, setProducts] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [tab, setTab] = useState("kasir");
  const [productModal, setProductModal] = useState(null);
  const [incomingModalOpen, setIncomingModalOpen] = useState(false);
  const [quickStockProduct, setQuickStockProduct] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [saveError, setSaveError] = useState(false);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState([]);
  const [payMethod, setPayMethod] = useState("Tunai");

  // Layout toggle: "grid" | "list", persisted to localStorage
  const [layout, setLayout] = useState(() => localStorage.getItem("kasir-layout") || "grid");
  const toggleLayout = (val) => {
    setLayout(val);
    localStorage.setItem("kasir-layout", val);
  };

  const { toasts, showToast } = useToast();

  useEffect(() => {
    (async () => {
      const db = window.storage || storage;
      try { const p = await db.get("toko-produk"); if (p?.value) setProducts(JSON.parse(p.value)); } catch (e) { }
      try { const i = await db.get("toko-barang-masuk"); if (i?.value) setIncoming(JSON.parse(i.value)); } catch (e) { }
      try { const t = await db.get("toko-transaksi"); if (t?.value) setTransactions(JSON.parse(t.value)); } catch (e) { }
      setLoaded(true);
    })();
  }, []);

  const save = async (key, setter, value) => {
    setter(value);
    const db = window.storage || storage;
    try { const res = await db.set(key, JSON.stringify(value)); setSaveError(!res); }
    catch (e) { setSaveError(true); }
  };
  const saveProducts = (list) => save("toko-produk", setProducts, list);
  const saveIncoming = (list) => save("toko-barang-masuk", setIncoming, list);
  const saveTransactions = (list) => save("toko-transaksi", setTransactions, list);

  const upsertProduct = (prod) => {
    if (prod.id) saveProducts(products.map((p) => (p.id === prod.id ? prod : p)));
    else saveProducts([{ ...prod, id: uid(), stock: 0 }, ...products]);
    setProductModal(null);
  };
  const deleteProduct = (p) => { saveProducts(products.filter((x) => x.id !== p.id)); setConfirmDelete(null); };

  const addIncoming = (entry) => {
    saveIncoming([{ ...entry, id: uid() }, ...incoming]);
    saveProducts(products.map((p) => p.id === entry.productId ? { ...p, stock: (Number(p.stock) || 0) + Number(entry.qty) } : p));
    setIncomingModalOpen(false);
  };
  const deleteIncoming = (entry) => {
    saveProducts(products.map((p) => p.id === entry.productId ? { ...p, stock: (Number(p.stock) || 0) - Number(entry.qty) } : p));
    saveIncoming(incoming.filter((x) => x.id !== entry.id));
    setConfirmDelete(null);
  };

  // Quick stock in: saves entry and updates product stock
  const addQuickStock = (productId, qty, date, supplier) => {
    const entry = { productId, qty: Number(qty), buyPrice: 0, date, supplier, id: uid() };
    saveIncoming([entry, ...incoming]);
    saveProducts(products.map((p) => p.id === productId ? { ...p, stock: (Number(p.stock) || 0) + Number(qty) } : p));
    setQuickStockProduct(null);
    showToast("Stok berhasil ditambahkan!");
  };

  const filteredProducts = products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
  const cartWithData = cart.map((c) => {
    const p = products.find((x) => x.id === c.productId);
    return p ? { ...c, product: p, subtotal: p.sellPrice * c.qty } : null;
  }).filter(Boolean);
  const cartTotal = cartWithData.reduce((s, c) => s + c.subtotal, 0);

  const addToCart = (product) => {
    const inStock = Number(product.stock) || 0;
    setCart((prev) => {
      const existing = prev.find((c) => c.productId === product.id);
      const currentQty = existing ? existing.qty : 0;
      if (currentQty + 1 > inStock) return prev;
      if (existing) return prev.map((c) => c.productId === product.id ? { ...c, qty: c.qty + 1 } : c);
      return [...prev, { productId: product.id, qty: 1 }];
    });
    showToast(`${product.name} ditambahkan ke keranjang`);
  };
  const changeCartQty = (productId, delta) => {
    setCart((prev) => prev.map((c) => {
      if (c.productId !== productId) return c;
      const product = products.find((p) => p.id === productId);
      const maxStock = Number(product?.stock) || 0;
      const newQty = Math.min(maxStock, Math.max(0, c.qty + delta));
      return { ...c, qty: newQty };
    }).filter((c) => c.qty > 0));
  };
  const removeFromCart = (productId) => setCart((prev) => prev.filter((c) => c.productId !== productId));

  const checkout = (uangDiterima) => {
    if (cartWithData.length === 0) return;
    for (const c of cartWithData) {
      if (c.qty > (Number(c.product.stock) || 0)) { alert(`Stok ${c.product.name} tidak cukup.`); return; }
    }
    const tx = {
      id: uid(), date: todayStr(),
      time: new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }),
      receiptNo: "TRX-" + Date.now().toString().slice(-8),
      payMethod,
      items: cartWithData.map((c) => ({ productId: c.productId, name: c.product.name, qty: c.qty, price: c.product.sellPrice, subtotal: c.subtotal })),
      total: cartTotal,
      uangDiterima: payMethod === "Tunai" ? Number(uangDiterima) || cartTotal : cartTotal,
    };
    saveTransactions([tx, ...transactions]);
    saveProducts(products.map((p) => {
      const c = cartWithData.find((x) => x.productId === p.id);
      return c ? { ...p, stock: (Number(p.stock) || 0) - c.qty } : p;
    }));
    setReceipt(tx);
    setCart([]);
    showToast("Transaksi berhasil!");
  };

  const lowStock = products.filter((p) => (Number(p.stock) || 0) <= (Number(p.minStock) || 5));

  // ─── Backup & Restore: Export & Import ───
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const importRef = useRef(null);
  const [restoreConfirm, setRestoreConfirm] = useState(null); // holds parsed backup

  const getBackupData = () => ({
    version: 1,
    exportedAt: new Date().toISOString(),
    appName: "Kembar Jaya Elektronik",
    products,
    incoming,
    transactions,
  });

  // 1. Share via Android Share Sheet (bisa langsung pilih WhatsApp di HP)
  const handleShareData = async () => {
    const backup = getBackupData();
    const jsonString = JSON.stringify(backup, null, 2);
    const dateStr = todayStr().replace(/-/g, "");
    const fileName = `kasir-backup-${dateStr}.json`;

    if (navigator.canShare) {
      try {
        const file = new File([jsonString], fileName, { type: "application/json" });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            title: "Backup Kasir Kembar Jaya",
            text: `Backup data kasir (${products.length} produk, ${transactions.length} transaksi).`,
          });
          showToast("Berhasil dibagikan!");
          setExportModalOpen(false);
          return;
        }
      } catch (e) {
        if (e.name === "AbortError") return;
      }
    }

    if (navigator.share) {
      try {
        await navigator.share({
          title: "Backup Kasir Kembar Jaya",
          text: jsonString,
        });
        showToast("Berhasil dibagikan!");
        setExportModalOpen(false);
        return;
      } catch (e) {
        if (e.name === "AbortError") return;
      }
    }

    // Jika tidak didukung, fallback salin ke clipboard
    await handleCopyBackup();
  };

  // 2. Salin teks data ke clipboard (mudah dipaste di chat WhatsApp)
  const handleCopyBackup = async () => {
    const backup = getBackupData();
    const jsonString = JSON.stringify(backup);
    let ok = false;
    try {
      await navigator.clipboard.writeText(jsonString);
      ok = true;
    } catch (e) {
      try {
        const ta = document.createElement("textarea");
        ta.value = jsonString;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand("copy");
        document.body.removeChild(ta);
      } catch (e2) { }
    }
    if (ok) {
      showToast("Data disalin! Buka WA lalu Tempel (Paste).");
      setExportModalOpen(false);
    } else {
      alert("Gagal menyalin otomatis. Silakan gunakan tombol Download File.");
    }
  };

  // 3. Download File (untuk browser laptop/komputer)
  const handleDownloadFile = () => {
    const backup = getBackupData();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const dateStr = todayStr().replace(/-/g, "");
    a.href = url;
    a.download = `kasir-backup-${dateStr}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("File di-download (untuk browser/PC)");
    setExportModalOpen(false);
  };

  // Handle file import dari input file
  const handleImportFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!data.products || !Array.isArray(data.products)) {
          alert("File tidak valid. Pastikan file adalah backup dari aplikasi ini.");
          return;
        }
        setRestoreConfirm(data);
        setImportModalOpen(false);
      } catch {
        alert("File tidak bisa dibaca. Pastikan formatnya JSON yang benar.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  // Handle paste text import dari WhatsApp
  const handleProcessImportText = (rawText) => {
    if (!rawText || !rawText.trim()) {
      alert("Teks data masih kosong. Silakan tempel teks dari WhatsApp terlebih dahulu.");
      return;
    }
    try {
      const data = JSON.parse(rawText.trim());
      if (!data.products || !Array.isArray(data.products)) {
        alert("Format data tidak sesuai. Pastikan teks yang ditempel adalah data backup dari aplikasi ini.");
        return;
      }
      setRestoreConfirm(data);
      setImportModalOpen(false);
    } catch (e) {
      alert("Teks tidak dapat dibaca. Pastikan seluruh teks pesan di WhatsApp disalin lengkap tanpa terpotong.");
    }
  };

  const handleRestoreConfirm = () => {
    if (!restoreConfirm) return;
    saveProducts(restoreConfirm.products || []);
    saveIncoming(restoreConfirm.incoming || []);
    saveTransactions(restoreConfirm.transactions || []);
    setRestoreConfirm(null);
    showToast("Data kasir berhasil diperbarui!");
  };

  if (!loaded) {
    return (
      <div className="w-full min-h-[500px] flex items-center justify-center" style={{ background: C.bg, color: C.inkSoft }}>
        <Loader2 className="animate-spin mr-2" size={18} /> Memuat data...
      </div>
    );
  }

  const NAV = [
    { id: "kasir", label: "Kasir", icon: ShoppingCart },
    { id: "produk", label: "Barang", icon: Package },
    { id: "masuk", label: "Stok Masuk", icon: ClipboardList },
    { id: "laporan", label: "Laporan", icon: Receipt },
  ];

  return (
    <div className="w-full min-h-screen overflow-x-hidden" style={{ background: C.bg, color: C.ink, fontFamily: "'Inter', ui-sans-serif, system-ui" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap');
        .display { font-family: 'Baloo 2', ui-rounded, sans-serif; }
        .num { font-feature-settings: "tnum"; }
        .tile:hover { transform: translateY(-2px); box-shadow: 0 8px 24px -8px rgba(26,109,255,0.4); }
        .tile { transition: all .15s ease; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      <div className="px-5 md:px-8 pt-6 pb-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-2xl overflow-hidden flex items-center justify-center">
              <img src="/icon.png" alt="Kembar Jaya Elektronik" className="w-full h-full object-cover" />
            </div>
            <h1 className="display text-2xl md:text-3xl" style={{ color: C.ink }}>Kembar Jaya Elektronik</h1>
          </div>
          {/* Backup & Restore buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setExportModalOpen(true)}
              title="Kirim / Bagikan data kasir"
              className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold shadow-sm"
              style={{ background: "#059669", color: "white" }}
            >
              <Share2 size={13} /> Kirim Data
            </button>
            <button
              onClick={() => setImportModalOpen(true)}
              title="Terima / Masukkan data kasir"
              className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold"
              style={{ background: C.card, color: "#60A5FA", border: `1px solid ${C.line}` }}
            >
              <Download size={13} /> Terima Data
            </button>
            <input ref={importRef} type="file" accept=".json" className="hidden" onChange={handleImportFile} />
          </div>
        </div>
        {saveError && <p className="text-xs mt-2" style={{ color: C.danger }}>Gagal menyimpan data. Coba lagi.</p>}
        {lowStock.length > 0 && (
          <div className="flex items-center gap-2 mt-3 px-3 py-2 rounded-xl text-xs font-medium" style={{ background: C.amberSoft, color: "#60A5FA" }}>
            <AlertTriangle size={14} /> Stok menipis: {lowStock.map((p) => p.name).join(", ")}
          </div>
        )}
      </div>

      <div className="px-5 md:px-8 flex overflow-x-auto no-scrollbar gap-2 mb-2 pb-2">
        {NAV.map((n) => {
          const Icon = n.icon;
          const active = tab === n.id;
          return (
            <button
              key={n.id}
              onClick={() => setTab(n.id)}
              className="flex shrink-0 whitespace-nowrap items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-semibold transition-colors"
              style={{ background: active ? C.coral : C.card, color: active ? "white" : C.ink, border: `1px solid ${active ? C.coral : C.line}` }}
            >
              <Icon size={15} /> {n.label}
            </button>
          );
        })}
      </div>

      <div className="px-5 md:px-8 py-5">
        {tab === "kasir" && (
          <Kasir C={C} products={filteredProducts} allProducts={products} search={search} setSearch={setSearch}
            cart={cartWithData} cartTotal={cartTotal} addToCart={addToCart}
            changeCartQty={changeCartQty} removeFromCart={removeFromCart}
            payMethod={payMethod} setPayMethod={setPayMethod} checkout={checkout} fmtIDR={fmtIDR}
            layout={layout} toggleLayout={toggleLayout} />
        )}
        {tab === "produk" && (
          <MasterBarang C={C} products={products} fmtIDR={fmtIDR}
            onAdd={() => setProductModal({})} onEdit={(p) => setProductModal(p)}
            onDelete={(p) => setConfirmDelete({ kind: "product", item: p })}
            onQuickStock={(p) => setQuickStockProduct(p)}
            layout={layout} toggleLayout={toggleLayout} />
        )}
        {tab === "masuk" && (
          <BarangMasuk C={C} products={products} incoming={incoming} fmtIDR={fmtIDR}
            onAdd={() => setIncomingModalOpen(true)} onDelete={(e) => setConfirmDelete({ kind: "incoming", item: e })} />
        )}
        {tab === "laporan" && (
          <Laporan C={C} transactions={transactions} fmtIDR={fmtIDR} lowStock={lowStock} onShowReceipt={setReceipt} />
        )}
      </div>

      {productModal !== null && <ProductModal C={C} product={productModal} onClose={() => setProductModal(null)} onSave={upsertProduct} />}
      {incomingModalOpen && <IncomingModal C={C} products={products} onClose={() => setIncomingModalOpen(false)} onSave={addIncoming} />}
      {quickStockProduct && (
        <QuickStockModal C={C} product={quickStockProduct}
          onClose={() => setQuickStockProduct(null)}
          onSave={addQuickStock} />
      )}
      {confirmDelete && (
        <ConfirmModal C={C}
          text={confirmDelete.kind === "product"
            ? `Hapus produk "${confirmDelete.item.name}"?`
            : `Hapus catatan ini? Stok akan dikurangi kembali sebanyak ${confirmDelete.item.qty}.`}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => confirmDelete.kind === "product" ? deleteProduct(confirmDelete.item) : deleteIncoming(confirmDelete.item)} />
      )}
      {receipt && <ReceiptModal C={C} tx={receipt} fmtIDR={fmtIDR} onClose={() => setReceipt(null)} />}

      {/* Export Modal */}
      {exportModalOpen && (
        <ExportModal
          C={C}
          products={products}
          incoming={incoming}
          transactions={transactions}
          onClose={() => setExportModalOpen(false)}
          onShare={handleShareData}
          onCopy={handleCopyBackup}
          onDownload={handleDownloadFile}
        />
      )}

      {/* Import Modal */}
      {importModalOpen && (
        <ImportModal
          C={C}
          onClose={() => setImportModalOpen(false)}
          onProcessText={handleProcessImportText}
          onOpenFilePicker={() => importRef.current?.click()}
        />
      )}

      {/* Restore confirm modal */}
      {restoreConfirm && (
        <div className="fixed inset-0 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)", zIndex: 60 }}>
          <div className="w-full max-w-sm rounded-2xl p-5" style={{ background: C.card }}>
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck size={20} color="#60A5FA" />
              <h3 className="display text-lg" style={{ color: "#60A5FA" }}>Konfirmasi Import</h3>
            </div>
            <div className="rounded-xl p-3 mb-4 text-sm space-y-1" style={{ background: C.bg }}>
              <p style={{ color: C.inkSoft }}>
                File backup dari:{" "}
                <span style={{ color: C.ink, fontWeight: 600 }}>
                  {restoreConfirm.exportedAt ? new Date(restoreConfirm.exportedAt).toLocaleString("id-ID") : "—"}
                </span>
              </p>
              <p style={{ color: C.inkSoft }}>
                Produk: <span style={{ color: C.ink, fontWeight: 600 }}>{restoreConfirm.products?.length ?? 0}</span>
                {" · "}Transaksi: <span style={{ color: C.ink, fontWeight: 600 }}>{restoreConfirm.transactions?.length ?? 0}</span>
                {" · "}Stok masuk: <span style={{ color: C.ink, fontWeight: 600 }}>{restoreConfirm.incoming?.length ?? 0}</span>
              </p>
            </div>
            <div className="rounded-xl p-3 mb-4 text-xs" style={{ background: C.dangerSoft, color: "#F87171" }}>
              ⚠️ <strong>Perhatian:</strong> Data yang ada sekarang akan <strong>diganti sepenuhnya</strong> dengan data dari file ini. Pastikan file benar sebelum lanjut.
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setRestoreConfirm(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold"
                style={{ border: `1px solid ${C.line}`, color: C.ink }}
              >
                Batal
              </button>
              <button
                onClick={handleRestoreConfirm}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white"
                style={{ background: "#3B8BFF" }}
              >
                Ya, Import Sekarang
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast notifications */}
      <ToastContainer toasts={toasts} />
    </div>
  );
}

// ─────────────────────────── StockBadge ───────────────────────────
function StockBadge({ stock, minStock, C }) {
  const s = Number(stock) || 0, m = Number(minStock) || 5;
  const state = s <= 0 ? "danger" : s <= m ? "amber" : "teal";
  const map = {
    danger: { bg: C.dangerSoft, fg: "#F85149", text: "Habis" },
    amber: { bg: C.amberSoft, fg: "#60A5FA", text: "Menipis" },
    teal: { bg: C.tealSoft, fg: C.teal, text: "Tersedia" },
  };
  const st = map[state];
  return <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: st.bg, color: st.fg }}>{st.text} · {s}</span>;
}

// ─────────────────────────── Category Filter Chips ───────────────────────────
function CategoryChips({ C, categories, activeCat, setActiveCat }) {
  return (
    <div className="flex overflow-x-auto no-scrollbar gap-2 mb-4 pb-1">
      <button
        onClick={() => setActiveCat("__all__")}
        className="shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors"
        style={{
          background: activeCat === "__all__" ? C.coral : C.card,
          color: activeCat === "__all__" ? "white" : C.inkSoft,
          border: `1px solid ${activeCat === "__all__" ? C.coral : C.line}`
        }}
      >
        Semua
      </button>
      {categories.map((cat) => (
        <button
          key={cat.key}
          onClick={() => setActiveCat(cat.key)}
          className="shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors"
          style={{
            background: activeCat === cat.key ? C.teal : C.card,
            color: activeCat === cat.key ? C.bg : C.inkSoft,
            border: `1px solid ${activeCat === cat.key ? C.teal : C.line}`
          }}
        >
          {cat.label}
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────── Layout Toggle Button ───────────────────────────
function LayoutToggle({ C, layout, toggleLayout }) {
  return (
    <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: C.bg, border: `1px solid ${C.line}` }}>
      <button
        onClick={() => toggleLayout("grid")}
        className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
        style={{ background: layout === "grid" ? C.coral : "transparent", color: layout === "grid" ? "white" : C.inkSoft }}
        title="Tampilan Grid"
      >
        <LayoutGrid size={14} />
      </button>
      <button
        onClick={() => toggleLayout("list")}
        className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
        style={{ background: layout === "list" ? C.coral : "transparent", color: layout === "list" ? "white" : C.inkSoft }}
        title="Tampilan List"
      >
        <LayoutList size={14} />
      </button>
    </div>
  );
}

// ─────────────────────────── Kasir ───────────────────────────
function Kasir({ C, products, allProducts, search, setSearch, cart, cartTotal, addToCart, changeCartQty, removeFromCart, payMethod, setPayMethod, checkout, fmtIDR, layout, toggleLayout }) {
  const [activeCat, setActiveCat] = useState("__all__");
  const [uangDiterima, setUangDiterima] = useState("");

  const categories = useMemo(() => getCategories(products), [products]);

  // Filter by category
  const catFiltered = useMemo(() => {
    if (activeCat === "__all__") return products;
    return products.filter((p) => (p.category?.trim() || "") === activeCat);
  }, [products, activeCat]);

  const grouped = useMemo(() => groupByCategory(catFiltered), [catFiltered]);

  const kembalian = payMethod === "Tunai" ? (Number(uangDiterima) || 0) - cartTotal : 0;
  const canPay = cart.length > 0 && (payMethod !== "Tunai" || (Number(uangDiterima) || 0) >= cartTotal);

  return (
    <div className="grid md:grid-cols-3 gap-5">
      <div className="md:col-span-2">
        {/* Search bar */}
        <div className="flex items-center gap-2 mb-4 px-4 py-3 rounded-2xl" style={{ background: C.card, border: `1px solid ${C.line}` }}>
          <Search size={16} style={{ color: C.inkSoft }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari produk..." className="flex-1 text-sm outline-none" style={{ background: "transparent", color: C.ink }} />
        </div>

        {/* Category chips + layout toggle */}
        <div className="flex items-start justify-between gap-3 mb-1">
          <div className="flex-1 min-w-0">
            <CategoryChips C={C} categories={categories} activeCat={activeCat} setActiveCat={setActiveCat} />
          </div>
          <div className="shrink-0 mt-0.5">
            <LayoutToggle C={C} layout={layout} toggleLayout={toggleLayout} />
          </div>
        </div>

        {/* Products grouped by category */}
        {activeCat === "__all__" ? (
          grouped.map((group) => (
            <div key={group.label} className="mb-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.inkSoft }}>{group.label}</span>
                <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: C.card, color: C.inkSoft, border: `1px solid ${C.line}` }}>{group.products.length}</span>
              </div>
              <ProductGrid C={C} products={group.products} layout={layout} addToCart={addToCart} fmtIDR={fmtIDR} />
            </div>
          ))
        ) : (
          <ProductGrid C={C} products={catFiltered} layout={layout} addToCart={addToCart} fmtIDR={fmtIDR} />
        )}

        {products.length === 0 && (
          <p className="text-sm text-center py-10" style={{ color: C.inkSoft }}>Belum ada produk. Tambahkan dulu di menu Barang.</p>
        )}
      </div>

      {/* Cart panel */}
      <div className="rounded-2xl p-4 flex flex-col sticky top-4" style={{ background: C.card, border: `1px solid ${C.line}`, height: "fit-content" }}>
        <p className="display text-base mb-3">Keranjang</p>
        <div className="flex-1 space-y-3 mb-3" style={{ maxHeight: 320, overflowY: "auto" }}>
          {cart.length === 0 && <p className="text-xs" style={{ color: C.inkSoft }}>Belum ada item. Klik produk di sebelah kiri.</p>}
          {cart.map((c) => (
            <div key={c.productId} className="flex items-center justify-between text-sm">
              <div className="flex-1 pr-2">
                <p className="font-medium">{c.product.name}</p>
                <p className="num text-xs" style={{ color: C.inkSoft }}>{fmtIDR(c.subtotal)}</p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => changeCartQty(c.productId, -1)} className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: C.bg }}><Minus size={12} /></button>
                <span className="num text-xs w-6 text-center font-semibold">{c.qty}</span>
                <button onClick={() => changeCartQty(c.productId, 1)} className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: C.bg }}><Plus size={12} /></button>
                <button onClick={() => removeFromCart(c.productId)} className="ml-1" style={{ color: C.danger }}><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
        </div>
        <div className="pt-3" style={{ borderTop: `1px dashed ${C.line}` }}>
          <div className="flex justify-between items-baseline mb-3">
            <span className="text-sm font-medium" style={{ color: C.inkSoft }}>Total</span>
            <span className="display num text-2xl">{fmtIDR(cartTotal)}</span>
          </div>
          <select value={payMethod} onChange={(e) => { setPayMethod(e.target.value); setUangDiterima(""); }} className="w-full mb-3 px-3 py-2.5 rounded-xl text-sm" style={{ border: `1px solid ${C.line}`, background: C.card, color: C.ink }}>
            <option>Tunai</option><option>QRIS</option><option>Transfer</option><option>Debit/Kredit</option>
          </select>

          {/* Hitung kembalian — hanya untuk Tunai */}
          {payMethod === "Tunai" && (
            <div className="mb-3 space-y-2">
              <div>
                <label className="text-xs font-medium uppercase" style={{ color: C.inkSoft }}>Uang Diterima</label>
                <input
                  type="number"
                  value={uangDiterima}
                  onChange={(e) => setUangDiterima(e.target.value)}
                  placeholder={String(cartTotal)}
                  className="w-full mt-1 px-3 py-2.5 rounded-xl text-sm num"
                  style={{ border: `1px solid ${C.line}`, background: C.bg, color: C.ink }}
                />
              </div>
              <div className="flex justify-between items-center px-3 py-2 rounded-xl" style={{ background: kembalian >= 0 ? C.tealSoft : C.dangerSoft }}>
                <span className="text-xs font-medium" style={{ color: kembalian >= 0 ? C.teal : C.danger }}>Kembalian</span>
                <span className="num text-sm font-semibold" style={{ color: kembalian >= 0 ? C.teal : C.danger }}>
                  {fmtIDR(Math.max(0, kembalian))}
                </span>
              </div>
            </div>
          )}

          <button
            disabled={!canPay}
            onClick={() => checkout(uangDiterima)}
            className="w-full py-3 rounded-xl font-semibold text-sm text-white disabled:opacity-40"
            style={{ background: C.coral, boxShadow: `0 6px 16px -4px ${C.coral}66` }}
          >
            Bayar &amp; Cetak Struk
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── Product Grid / List (shared) ───────────────────────────
function ProductGrid({ C, products, layout, addToCart, fmtIDR, onEdit, onDelete, onQuickStock, showActions }) {
  if (layout === "list") {
    return (
      <div className="rounded-2xl overflow-hidden" style={{ background: C.card, border: `1px solid ${C.line}` }}>
        {products.length === 0 && <p className="p-4 text-sm text-center" style={{ color: C.inkSoft }}>Tidak ada produk.</p>}
        {products.map((p, idx) => {
          const out = (Number(p.stock) || 0) <= 0;
          const tag = tagFor(p.name);
          return (
            <div
              key={p.id}
              className="flex items-center justify-between px-4 py-3 text-sm"
              style={{ borderTop: idx ? `1px solid ${C.line}` : "none", opacity: out ? 0.5 : 1 }}
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: tag + "22" }}>
                  <Package size={15} color={tag} />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold truncate">{p.name}</p>
                  {p.category && <p className="text-xs" style={{ color: C.inkSoft }}>{p.category}</p>}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0 ml-3">
                <span className="num text-sm font-semibold hidden sm:block" style={{ color: C.coral }}>{fmtIDR(p.sellPrice)}</span>
                <StockBadge stock={p.stock} minStock={p.minStock} C={C} />
                {/* Kasir mode: add to cart button */}
                {addToCart && !showActions && (
                  <button
                    onClick={() => !out && addToCart(p)}
                    disabled={out}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold text-white disabled:opacity-40"
                    style={{ background: C.coral }}
                  >
                    <Plus size={12} /> Keranjang
                  </button>
                )}
                {/* Barang mode: edit, quick stock, delete */}
                {showActions && (
                  <div className="flex items-center gap-1">
                    <button onClick={() => onQuickStock(p)} className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: C.tealSoft, color: C.teal }} title="Tambah Stok Cepat">
                      <ArrowUpCircle size={13} />
                    </button>
                    <button onClick={() => onEdit(p)} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: C.bg }}><Pencil size={13} /></button>
                    <button onClick={() => onDelete(p)} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: C.dangerSoft, color: C.danger }}><Trash2 size={13} /></button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Grid layout
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {products.length === 0 && <p className="text-sm col-span-full text-center py-6" style={{ color: C.inkSoft }}>Tidak ada produk.</p>}
      {products.map((p) => {
        const out = (Number(p.stock) || 0) <= 0;
        const tag = tagFor(p.name);
        return (
          <div
            key={p.id}
            className={`tile text-left p-4 rounded-2xl ${addToCart && !showActions ? "cursor-pointer" : ""}`}
            style={{ background: C.card, border: `1px solid ${C.line}`, opacity: out && addToCart && !showActions ? 0.4 : 1 }}
            onClick={() => addToCart && !showActions && !out && addToCart(p)}
          >
            <div className="w-8 h-8 rounded-xl mb-2 flex items-center justify-center" style={{ background: tag + "22" }}>
              <Package size={15} color={tag} />
            </div>
            <p className="text-sm font-semibold leading-tight">{p.name}</p>
            {showActions && p.category && <p className="text-xs mt-0.5" style={{ color: C.inkSoft }}>{p.category}</p>}
            <p className="display num text-lg mt-1" style={{ color: C.coral }}>{fmtIDR(p.sellPrice)}</p>
            <div className="mt-2"><StockBadge stock={p.stock} minStock={p.minStock} C={C} /></div>
            {showActions && (
              <div className="flex items-center gap-1 mt-3 pt-2" style={{ borderTop: `1px solid ${C.line}` }}>
                <button
                  onClick={(e) => { e.stopPropagation(); onQuickStock(p); }}
                  className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-semibold"
                  style={{ background: C.tealSoft, color: C.teal }}
                  title="Tambah Stok Cepat"
                >
                  <ArrowUpCircle size={12} /> Stok
                </button>
                <button onClick={(e) => { e.stopPropagation(); onEdit(p); }} className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: C.bg }}><Pencil size={12} /></button>
                <button onClick={(e) => { e.stopPropagation(); onDelete(p); }} className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: C.dangerSoft, color: C.danger }}><Trash2 size={12} /></button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────── MasterBarang ───────────────────────────
function MasterBarang({ C, products, fmtIDR, onAdd, onEdit, onDelete, onQuickStock, layout, toggleLayout }) {
  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState("__all__");

  const filtered = useMemo(() => {
    return products.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
  }, [products, search]);

  const categories = useMemo(() => getCategories(filtered), [filtered]);

  const catFiltered = useMemo(() => {
    if (activeCat === "__all__") return filtered;
    return filtered.filter((p) => (p.category?.trim() || "") === activeCat);
  }, [filtered, activeCat]);

  const grouped = useMemo(() => groupByCategory(catFiltered), [catFiltered]);

  return (
    <div>
      {/* Top bar: search + add button */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 flex items-center gap-2 px-4 py-3 rounded-2xl" style={{ background: C.card, border: `1px solid ${C.line}` }}>
          <Search size={16} style={{ color: C.inkSoft }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari produk..."
            className="flex-1 text-sm outline-none"
            style={{ background: "transparent", color: C.ink }}
          />
          {search && (
            <button onClick={() => setSearch("")} style={{ color: C.inkSoft }}>
              <X size={14} />
            </button>
          )}
        </div>
        <button onClick={onAdd} className="shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-semibold text-white" style={{ background: C.teal }}>
          <Plus size={15} /> Tambah Produk
        </button>
      </div>

      {/* Category chips + layout toggle */}
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="flex-1 min-w-0">
          <CategoryChips C={C} categories={categories} activeCat={activeCat} setActiveCat={setActiveCat} />
        </div>
        <div className="shrink-0 mt-0.5">
          <LayoutToggle C={C} layout={layout} toggleLayout={toggleLayout} />
        </div>
      </div>

      {/* Products grouped by category */}
      {activeCat === "__all__" ? (
        grouped.length === 0
          ? <p className="text-sm text-center py-10" style={{ color: C.inkSoft }}>Belum ada produk.</p>
          : grouped.map((group) => (
            <div key={group.label} className="mb-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: C.inkSoft }}>{group.label}</span>
                <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: C.card, color: C.inkSoft, border: `1px solid ${C.line}` }}>{group.products.length}</span>
              </div>
              <ProductGrid
                C={C} products={group.products} layout={layout} fmtIDR={fmtIDR}
                onEdit={onEdit} onDelete={onDelete} onQuickStock={onQuickStock}
                showActions={true}
              />
            </div>
          ))
      ) : (
        <ProductGrid
          C={C} products={catFiltered} layout={layout} fmtIDR={fmtIDR}
          onEdit={onEdit} onDelete={onDelete} onQuickStock={onQuickStock}
          showActions={true}
        />
      )}
    </div>
  );
}

// ─────────────────────────── BarangMasuk ───────────────────────────
function BarangMasuk({ C, products, incoming, fmtIDR, onAdd, onDelete }) {
  const sorted = [...incoming].sort((a, b) => (a.date < b.date ? 1 : -1));
  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={onAdd} className="flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-semibold text-white" style={{ background: C.amber }}>
          <Plus size={15} /> Input Stok Masuk
        </button>
      </div>
      <div className="rounded-2xl overflow-hidden" style={{ background: C.card, border: `1px solid ${C.line}` }}>
        {sorted.length === 0 && <p className="p-6 text-center text-sm" style={{ color: C.inkSoft }}>Belum ada catatan barang masuk.</p>}
        {sorted.map((e, idx) => {
          const p = products.find((x) => x.id === e.productId);
          return (
            <div key={e.id} className="flex items-center justify-between px-4 py-3 text-sm" style={{ borderTop: idx ? `1px solid ${C.line}` : "none" }}>
              <div>
                <p className="font-medium">{p ? p.name : "(produk dihapus)"}</p>
                <p className="text-xs" style={{ color: C.inkSoft }}>{e.date}{e.supplier ? ` · ${e.supplier}` : ""}</p>
              </div>
              <div className="flex items-center gap-4">
                <span className="num font-semibold" style={{ color: C.teal }}>+{e.qty} {p?.unit}</span>
                <button onClick={() => onDelete(e)} style={{ color: C.inkSoft }}><Trash2 size={14} /></button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────── Date Formatter Helper ───────────────────────────
const formatDateIndo = (dateStr) => {
  if (!dateStr) return "";
  try {
    const parts = dateStr.split("-");
    if (parts.length !== 3) return dateStr;
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    const dt = new Date(y, m, d);
    return dt.toLocaleDateString("id-ID", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch (e) {
    return dateStr;
  }
};

// ─────────────────────────── Laporan ───────────────────────────
function Laporan({ C, transactions, fmtIDR, lowStock, onShowReceipt }) {
  const today = todayStr();
  const [period, setPeriod] = useState("today"); // "today" | "7days" | "month" | "custom" | "all"
  const [startDate, setStartDate] = useState(todayStr());
  const [endDate, setEndDate] = useState(todayStr());
  const [viewTab, setViewTab] = useState("barangKeluar"); // "barangKeluar" | "transaksi"
  const [expandedTx, setExpandedTx] = useState({});

  const toggleExpand = (id) => {
    setExpandedTx((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const filteredTx = useMemo(() => {
    if (period === "today") {
      return transactions.filter((t) => t.date === today);
    }
    if (period === "7days") {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      const start = d.toISOString().slice(0, 10);
      return transactions.filter((t) => t.date >= start && t.date <= today);
    }
    if (period === "month") {
      const currentMonth = today.slice(0, 7);
      return transactions.filter((t) => (t.date || "").startsWith(currentMonth));
    }
    if (period === "custom") {
      return transactions.filter((t) => {
        if (startDate && t.date < startDate) return false;
        if (endDate && t.date > endDate) return false;
        return true;
      });
    }
    return transactions;
  }, [transactions, period, today, startDate, endDate]);

  const currentSales = filteredTx.reduce((s, t) => s + t.total, 0);

  // Rekapitulasi barang yang keluar (terjual)
  const outgoingSummary = useMemo(() => {
    const map = {};
    filteredTx.forEach((t) => {
      (t.items || []).forEach((it) => {
        const key = it.productId || it.name;
        if (!map[key]) {
          map[key] = {
            name: it.name,
            qty: 0,
            total: 0,
            price: it.price || 0,
            txCount: 0,
          };
        }
        map[key].qty += Number(it.qty) || 0;
        map[key].total += Number(it.subtotal) || ((Number(it.price) || 0) * (Number(it.qty) || 0));
        map[key].txCount += 1;
      });
    });
    return Object.values(map).sort((a, b) => b.qty - a.qty);
  }, [filteredTx]);

  const totalItemsOut = outgoingSummary.reduce((acc, it) => acc + it.qty, 0);

  const getPeriodLabel = () => {
    if (period === "today") return `Hari Ini (${formatDateIndo(today)})`;
    if (period === "7days") return "7 Hari Terakhir";
    if (period === "month") {
      const [y, m] = today.split("-").map(Number);
      const dt = new Date(y, m - 1, 1);
      return `Bulan Ini (${dt.toLocaleDateString("id-ID", { month: "long", year: "numeric" })})`;
    }
    if (period === "custom") {
      if (startDate === endDate) return formatDateIndo(startDate);
      return `${formatDateIndo(startDate)} — ${formatDateIndo(endDate)}`;
    }
    return "Semua Waktu";
  };

  return (
    <div className="space-y-5">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="p-4 rounded-2xl" style={{ background: C.dangerSoft }}>
          <p className="text-xs font-medium" style={{ color: "#F87171" }}>Barang Keluar</p>
          <p className="display num text-2xl font-bold mt-0.5" style={{ color: C.danger }}>{totalItemsOut} <span className="text-sm font-normal">pcs</span></p>
          <p className="text-xs truncate mt-1" style={{ color: C.inkSoft }}>{getPeriodLabel()}</p>
        </div>
        <div className="p-4 rounded-2xl" style={{ background: C.tealSoft }}>
          <p className="text-xs font-medium" style={{ color: "#00C8FF" }}>Pendapatan</p>
          <p className="display num text-xl mt-0.5" style={{ color: C.teal }}>{fmtIDR(currentSales)}</p>
          <p className="text-xs truncate mt-1" style={{ color: C.inkSoft }}>{getPeriodLabel()}</p>
        </div>
        <div className="p-4 rounded-2xl" style={{ background: C.card, border: `1px solid ${C.line}` }}>
          <p className="text-xs font-medium" style={{ color: C.inkSoft }}>Jumlah Nota</p>
          <p className="display num text-xl mt-0.5" style={{ color: C.ink }}>{filteredTx.length} <span className="text-sm font-normal" style={{ color: C.inkSoft }}>transaksi</span></p>
          <p className="text-xs truncate mt-1" style={{ color: C.inkSoft }}>{getPeriodLabel()}</p>
        </div>
        <div className="p-4 rounded-2xl" style={{ background: lowStock.length ? C.amberSoft : C.card, border: `1px solid ${C.line}` }}>
          <p className="text-xs font-medium" style={{ color: lowStock.length ? "#60A5FA" : C.inkSoft }}>Stok Menipis</p>
          <p className="display num text-xl mt-0.5" style={{ color: lowStock.length ? "#60A5FA" : C.ink }}>{lowStock.length} <span className="text-sm font-normal">produk</span></p>
          <p className="text-xs mt-1" style={{ color: C.inkSoft }}>Perlu ditambah stok</p>
        </div>
      </div>

      {/* Filter Periode Tanggal */}
      <div className="p-3 rounded-2xl space-y-2.5" style={{ background: C.card, border: `1px solid ${C.line}` }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: C.inkSoft }}>
            <Calendar size={14} color={C.teal} />
            <span>FILTER WAKTU / TANGGAL:</span>
          </div>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-md" style={{ background: C.bg, color: C.teal }}>
            {getPeriodLabel()}
          </span>
        </div>

        {/* Buttons Preset Periode */}
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: "today", label: "Hari Ini" },
            { id: "7days", label: "7 Hari Terakhir" },
            { id: "month", label: "Bulan Ini" },
            { id: "custom", label: "Pilih Tanggal..." },
            { id: "all", label: "Semua Waktu" },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setPeriod(item.id)}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
              style={{
                background: period === item.id ? C.coral : C.bg,
                color: period === item.id ? "white" : C.inkSoft,
                border: `1px solid ${period === item.id ? C.coral : C.line}`,
              }}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Custom Date Range Picker */}
        {period === "custom" && (
          <div className="pt-2 flex flex-wrap items-center gap-3" style={{ borderTop: `1px dashed ${C.line}` }}>
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: C.inkSoft }}>Dari Tanggal:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl text-xs outline-none"
                style={{ background: C.bg, color: C.ink, border: `1px solid ${C.line}` }}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: C.inkSoft }}>Sampai Tanggal:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-2.5 py-1.5 rounded-xl text-xs outline-none"
                style={{ background: C.bg, color: C.ink, border: `1px solid ${C.line}` }}
              />
            </div>
            <button
              onClick={() => { setStartDate(todayStr()); setEndDate(todayStr()); }}
              className="px-2.5 py-1.5 rounded-xl text-xs font-medium"
              style={{ background: C.bg, color: C.inkSoft, border: `1px solid ${C.line}` }}
            >
              Set Hari Ini
            </button>
          </div>
        )}
      </div>

      {/* Toggle View Mode: Rekap Barang Keluar vs Riwayat Transaksi */}
      <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
        <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: C.card, border: `1px solid ${C.line}` }}>
          <button
            onClick={() => setViewTab("barangKeluar")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
            style={{
              background: viewTab === "barangKeluar" ? C.tealSoft : "transparent",
              color: viewTab === "barangKeluar" ? C.teal : C.inkSoft,
              border: viewTab === "barangKeluar" ? `1px solid ${C.teal}55` : "1px solid transparent",
            }}
          >
            <ArrowDownCircle size={13} />
            Rekap Barang Keluar
          </button>
          <button
            onClick={() => setViewTab("transaksi")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
            style={{
              background: viewTab === "transaksi" ? C.amberSoft : "transparent",
              color: viewTab === "transaksi" ? "#60A5FA" : C.inkSoft,
              border: viewTab === "transaksi" ? `1px solid #60A5FA55` : "1px solid transparent",
            }}
          >
            <Receipt size={13} />
            Riwayat Nota & Transaksi
          </button>
        </div>
      </div>

      {/* VIEW 1: REKAP BARANG KELUAR */}
      {viewTab === "barangKeluar" && (
        <div className="rounded-2xl overflow-hidden" style={{ background: C.card, border: `1px solid ${C.line}` }}>
          <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: `1px solid ${C.line}`, background: "#1C263B" }}>
            <div className="flex items-center gap-2">
              <ArrowDownCircle size={16} style={{ color: C.danger }} />
              <p className="font-semibold text-sm">Daftar Barang Keluar ({outgoingSummary.length} Jenis Produk)</p>
            </div>
            <span className="text-xs font-medium" style={{ color: C.inkSoft }}>
              Total: <strong style={{ color: C.ink }}>{totalItemsOut} pcs</strong> keluar
            </span>
          </div>

          {outgoingSummary.length === 0 ? (
            <p className="p-8 text-center text-sm" style={{ color: C.inkSoft }}>
              Tidak ada catatan barang keluar pada periode <strong>{getPeriodLabel()}</strong>.
            </p>
          ) : (
            <div className="divide-y" style={{ borderColor: C.line }}>
              {outgoingSummary.map((item, idx) => (
                <div key={item.name} className="px-4 py-3 flex items-center justify-between gap-3 text-sm hover:bg-[#25324B] transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ background: C.bg, color: C.inkSoft }}>
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate" style={{ color: C.ink }}>{item.name}</p>
                      <p className="text-xs" style={{ color: C.inkSoft }}>
                        Terjual dalam {item.txCount} transaksi · Satuan {fmtIDR(item.price)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="flex items-center justify-end gap-1.5">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: C.dangerSoft, color: "#F87171" }}>
                        -{item.qty} pcs
                      </span>
                    </div>
                    <p className="num text-xs font-semibold mt-1" style={{ color: C.teal }}>
                      {fmtIDR(item.total)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: RIWAYAT TRANSAKSI DENGAN DETAIL BARANG */}
      {viewTab === "transaksi" && (
        <div className="rounded-2xl overflow-hidden" style={{ background: C.card, border: `1px solid ${C.line}` }}>
          <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: `1px solid ${C.line}`, background: "#1C263B" }}>
            <p className="font-semibold text-sm">Riwayat Transaksi ({filteredTx.length})</p>
            <span className="text-xs" style={{ color: C.inkSoft }}>Klik transaksi untuk melihat rincian barang</span>
          </div>

          {filteredTx.length === 0 ? (
            <p className="p-8 text-center text-sm" style={{ color: C.inkSoft }}>
              Tidak ada transaksi pada periode <strong>{getPeriodLabel()}</strong>.
            </p>
          ) : (
            <div className="divide-y" style={{ borderColor: C.line }}>
              {filteredTx.slice(0, 100).map((t) => {
                const isExpanded = !!expandedTx[t.id];
                return (
                  <div key={t.id} className="transition-colors">
                    {/* Header Row */}
                    <div
                      onClick={() => toggleExpand(t.id)}
                      className="px-4 py-3.5 flex items-center justify-between text-sm cursor-pointer hover:bg-[#25324B] transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <button className="text-xs shrink-0" style={{ color: C.inkSoft }}>
                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                        <div className="min-w-0">
                          <p className="font-semibold text-sm">{t.receiptNo}</p>
                          <p className="text-xs" style={{ color: C.inkSoft }}>
                            <strong style={{ color: C.ink }}>{formatDateIndo(t.date)}</strong> · {t.time} · {t.items?.length || 0} barang · <span className="font-medium" style={{ color: "#60A5FA" }}>{t.payMethod}</span>
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="num font-semibold text-sm" style={{ color: C.coral }}>{fmtIDR(t.total)}</span>
                      </div>
                    </div>

                    {/* Detail Items Accordion */}
                    {isExpanded && (
                      <div className="px-5 py-3 text-xs" style={{ background: "#172033", borderTop: `1px dashed ${C.line}` }}>
                        <p className="font-semibold mb-2 uppercase tracking-wider" style={{ color: C.inkSoft }}>
                          Rincian Barang Keluar:
                        </p>
                        <div className="space-y-1.5 mb-3">
                          {(t.items || []).map((it, idx) => (
                            <div key={idx} className="flex justify-between items-center py-0.5">
                              <span className="flex items-center gap-1.5" style={{ color: C.ink }}>
                                <span className="w-1.5 h-1.5 rounded-full" style={{ background: C.danger }}></span>
                                <strong>{it.name}</strong> × {it.qty} pcs
                              </span>
                              <span className="num font-medium" style={{ color: C.inkSoft }}>
                                {fmtIDR(it.subtotal || (it.price * it.qty))}
                              </span>
                            </div>
                          ))}
                        </div>
                        {onShowReceipt && (
                          <div className="pt-2 flex justify-end" style={{ borderTop: `1px solid ${C.line}` }}>
                            <button
                              onClick={() => onShowReceipt(t)}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold"
                              style={{ background: C.tealSoft, color: C.teal }}
                            >
                              <Receipt size={12} /> Buka Struk
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── ProductModal ───────────────────────────
function ProductModal({ C, product, onClose, onSave }) {
  const isEdit = !!product.id;
  const [name, setName] = useState(product.name || "");
  const [category, setCategory] = useState(product.category || "");
  const [sellPrice, setSellPrice] = useState(product.sellPrice || "");
  const [unit, setUnit] = useState(product.unit || "pcs");
  const [minStock, setMinStock] = useState(product.minStock ?? 5);
  const valid = name.trim() && Number(sellPrice) > 0;

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)", zIndex: 50 }}>
      <div className="w-full max-w-sm rounded-2xl p-5" style={{ background: C.card }}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="display text-lg">{isEdit ? "Edit Produk" : "Tambah Produk"}</h3>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="space-y-3">
          <Field label="Nama Produk" C={C}><input value={name} onChange={(e) => setName(e.target.value)} className="w-full mt-1 px-3 py-2.5 rounded-xl text-sm" style={{ border: `1px solid ${C.line}`, background: C.bg, color: C.ink }} /></Field>
          <Field label="Kategori" C={C}><input value={category} onChange={(e) => setCategory(e.target.value)} className="w-full mt-1 px-3 py-2.5 rounded-xl text-sm" style={{ border: `1px solid ${C.line}`, background: C.bg, color: C.ink }} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Harga Jual" C={C}><input type="number" value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} className="w-full mt-1 px-3 py-2.5 rounded-xl text-sm num" style={{ border: `1px solid ${C.line}`, background: C.bg, color: C.ink }} /></Field>
            <Field label="Satuan" C={C}><input value={unit} onChange={(e) => setUnit(e.target.value)} className="w-full mt-1 px-3 py-2.5 rounded-xl text-sm" style={{ border: `1px solid ${C.line}`, background: C.bg, color: C.ink }} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Stok Minimum" C={C}><input type="number" value={minStock} onChange={(e) => setMinStock(e.target.value)} className="w-full mt-1 px-3 py-2.5 rounded-xl text-sm num" style={{ border: `1px solid ${C.line}`, background: C.bg, color: C.ink }} /></Field>
          </div>
        </div>
        <button disabled={!valid}
          onClick={() => onSave({ ...product, name, category, sellPrice: Number(sellPrice), unit, minStock: Number(minStock) })}
          className="w-full mt-5 py-3 rounded-xl font-semibold text-sm text-white disabled:opacity-40" style={{ background: C.teal }}>
          Simpan
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────── IncomingModal ───────────────────────────
function IncomingModal({ C, products, onClose, onSave }) {
  const [productId, setProductId] = useState(products[0]?.id || "");
  const [qty, setQty] = useState("");
  const [buyPrice, setBuyPrice] = useState("");
  const [date, setDate] = useState(todayStr());
  const [supplier, setSupplier] = useState("");
  const valid = productId && Number(qty) > 0;

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)", zIndex: 50 }}>
      <div className="w-full max-w-sm rounded-2xl p-5" style={{ background: C.card }}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="display text-lg" style={{ color: "#60A5FA" }}>Input Stok Masuk</h3>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        {products.length === 0 ? (
          <p className="text-sm" style={{ color: C.inkSoft }}>Tambahkan produk dulu di menu Barang.</p>
        ) : (
          <div className="space-y-3">
            <Field label="Produk" C={C}>
              <select value={productId} onChange={(e) => setProductId(e.target.value)} className="w-full mt-1 px-3 py-2.5 rounded-xl text-sm" style={{ border: `1px solid ${C.line}`, background: C.bg, color: C.ink }}>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="Tanggal" C={C}><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full mt-1 px-3 py-2.5 rounded-xl text-sm" style={{ border: `1px solid ${C.line}`, background: C.bg, color: C.ink }} /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Jumlah" C={C}><input type="number" value={qty} onChange={(e) => setQty(e.target.value)} className="w-full mt-1 px-3 py-2.5 rounded-xl text-sm num" style={{ border: `1px solid ${C.line}`, background: C.bg, color: C.ink }} /></Field>
              <Field label="Harga Beli/Satuan" C={C}><input type="number" value={buyPrice} onChange={(e) => setBuyPrice(e.target.value)} className="w-full mt-1 px-3 py-2.5 rounded-xl text-sm num" style={{ border: `1px solid ${C.line}`, background: C.bg, color: C.ink }} /></Field>
            </div>
            <Field label="Supplier (opsional)" C={C}><input value={supplier} onChange={(e) => setSupplier(e.target.value)} className="w-full mt-1 px-3 py-2.5 rounded-xl text-sm" style={{ border: `1px solid ${C.line}`, background: C.bg, color: C.ink }} /></Field>
          </div>
        )}
        <button disabled={!valid} onClick={() => onSave({ productId, qty: Number(qty), buyPrice: Number(buyPrice) || 0, date, supplier })}
          className="w-full mt-5 py-3 rounded-xl font-semibold text-sm text-white disabled:opacity-40" style={{ background: C.amber }}>
          Simpan
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────── QuickStockModal ───────────────────────────
function QuickStockModal({ C, product, onClose, onSave }) {
  const [qty, setQty] = useState(1);
  const [date, setDate] = useState(todayStr());
  const [supplier, setSupplier] = useState("");
  const valid = Number(qty) > 0;

  const decrement = () => setQty((q) => Math.max(1, Number(q) - 1));
  const increment = () => setQty((q) => Number(q) + 1);

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)", zIndex: 50 }}>
      <div className="w-full max-w-sm rounded-2xl p-5" style={{ background: C.card }}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="display text-lg" style={{ color: C.teal }}>+ Stok Cepat</h3>
          <button onClick={onClose}><X size={18} /></button>
        </div>

        {/* Product info */}
        <div className="mb-4 px-4 py-3 rounded-2xl" style={{ background: C.bg, border: `1px solid ${C.line}` }}>
          <p className="font-semibold text-sm">{product.name}</p>
          <p className="text-xs mt-1" style={{ color: C.inkSoft }}>
            Stok sekarang: <span className="font-semibold" style={{ color: C.teal }}>{Number(product.stock) || 0}</span>
            {product.unit && <span> {product.unit}</span>}
          </p>
        </div>

        {/* Big quantity stepper */}
        <div className="mb-4">
          <label className="text-xs font-medium uppercase" style={{ color: C.inkSoft }}>Jumlah Tambah</label>
          <div className="flex items-center gap-3 mt-2">
            <button
              onClick={decrement}
              className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl font-bold"
              style={{ background: C.bg, border: `1px solid ${C.line}`, color: C.ink }}
            >
              −
            </button>
            <input
              type="number"
              value={qty}
              onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
              className="flex-1 text-center text-2xl font-bold num py-2 rounded-2xl"
              style={{ border: `1px solid ${C.line}`, background: C.bg, color: C.ink }}
            />
            <button
              onClick={increment}
              className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl font-bold"
              style={{ background: C.coral, color: "white" }}
            >
              +
            </button>
          </div>
        </div>

        <div className="space-y-3">
          <Field label="Tanggal" C={C}>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full mt-1 px-3 py-2.5 rounded-xl text-sm" style={{ border: `1px solid ${C.line}`, background: C.bg, color: C.ink }} />
          </Field>
          <Field label="Supplier (opsional)" C={C}>
            <input value={supplier} onChange={(e) => setSupplier(e.target.value)} className="w-full mt-1 px-3 py-2.5 rounded-xl text-sm" style={{ border: `1px solid ${C.line}`, background: C.bg, color: C.ink }} placeholder="Nama supplier..." />
          </Field>
        </div>

        <button
          disabled={!valid}
          onClick={() => onSave(product.id, qty, date, supplier)}
          className="w-full mt-5 py-3 rounded-xl font-semibold text-sm text-white disabled:opacity-40"
          style={{ background: C.teal }}
        >
          Simpan Stok
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────── ReceiptModal ───────────────────────────
function ReceiptModal({ C, tx, fmtIDR, onClose }) {
  const kembalian = tx.payMethod === "Tunai" && tx.uangDiterima ? tx.uangDiterima - tx.total : null;
  return (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)", zIndex: 50 }}>
      <div className="w-full max-w-xs rounded-2xl p-5" style={{ background: C.card }}>
        <div className="flex justify-between items-center mb-3">
          <p className="display text-base flex items-center gap-1.5"><Receipt size={16} color={C.coral} /> Struk</p>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <p className="text-xs" style={{ color: C.inkSoft }}>{tx.receiptNo}</p>
        <p className="text-xs mb-3" style={{ color: C.inkSoft }}>{tx.date} {tx.time} · {tx.payMethod}</p>
        <div className="pt-2 mb-2" style={{ borderTop: `1px dashed ${C.line}` }}>
          {tx.items.map((it, idx) => (
            <div key={idx} className="flex justify-between text-xs mb-1 num">
              <span>{it.name} x{it.qty}</span><span>{fmtIDR(it.subtotal)}</span>
            </div>
          ))}
        </div>
        <div className="pt-2 flex justify-between font-semibold text-sm num" style={{ borderTop: `1px dashed ${C.line}` }}>
          <span>Total</span><span style={{ color: C.coral }}>{fmtIDR(tx.total)}</span>
        </div>
        {kembalian !== null && (
          <div className="pt-2 mt-1 flex justify-between text-sm num" style={{ borderTop: `1px dashed ${C.line}` }}>
            <span style={{ color: C.inkSoft }}>Uang Diterima</span><span>{fmtIDR(tx.uangDiterima)}</span>
          </div>
        )}
        {kembalian !== null && (
          <div className="flex justify-between text-sm font-semibold num mt-1">
            <span style={{ color: C.teal }}>Kembalian</span><span style={{ color: C.teal }}>{fmtIDR(Math.max(0, kembalian))}</span>
          </div>
        )}
        <button onClick={onClose} className="w-full mt-4 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: C.teal }}>Selesai</button>
      </div>
    </div>
  );
}

// ─────────────────────────── ConfirmModal ───────────────────────────
function ConfirmModal({ C, text, onCancel, onConfirm }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)", zIndex: 50 }}>
      <div className="w-full max-w-sm rounded-2xl p-5" style={{ background: C.card }}>
        <p className="text-sm mb-5">{text}</p>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-4 py-2 rounded-full text-sm font-medium" style={{ border: `1px solid ${C.line}`, color: C.ink }}>Batal</button>
          <button onClick={onConfirm} className="px-4 py-2 rounded-full text-sm font-medium text-white" style={{ background: C.danger }}>Hapus</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── Field ───────────────────────────
function Field({ label, C, children }) {
  return (
    <div>
      <label className="text-xs font-medium uppercase" style={{ color: C.inkSoft }}>{label}</label>
      {children}
    </div>
  );
}

// ─────────────────────────── ExportModal ───────────────────────────
function ExportModal({ C, products, incoming, transactions, onClose, onShare, onCopy, onDownload }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)", zIndex: 60 }}>
      <div className="w-full max-w-sm rounded-2xl p-5" style={{ background: C.card, border: `1px solid ${C.line}` }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Share2 size={18} color="#10B981" />
            <h3 className="display text-lg" style={{ color: C.ink }}>Kirim / Bagikan Data</h3>
          </div>
          <button onClick={onClose}><X size={18} style={{ color: C.inkSoft }} /></button>
        </div>

        <div className="rounded-xl p-3 mb-4 text-xs space-y-1" style={{ background: C.bg }}>
          <p className="font-semibold text-xs" style={{ color: C.ink }}>Data yang siap dikirim:</p>
          <div className="flex items-center gap-2 pt-1 font-medium" style={{ color: C.inkSoft }}>
            <span className="px-2 py-0.5 rounded-md" style={{ background: C.card }}>📦 {products.length} Produk</span>
            <span className="px-2 py-0.5 rounded-md" style={{ background: C.card }}>🧾 {transactions.length} Nota</span>
          </div>
        </div>

        <p className="text-xs font-semibold mb-2 uppercase tracking-wider" style={{ color: C.inkSoft }}>
          Pilih Cara Kirim ke HP Lain:
        </p>

        <div className="space-y-2.5">
          {/* Cara 1: Share langsung ke WhatsApp */}
          <button
            onClick={onShare}
            className="w-full py-3 px-3.5 rounded-xl text-left flex items-center justify-between transition-transform active:scale-95 shadow-md"
            style={{ background: "#059669", color: "white" }}
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "rgba(255,255,255,0.2)" }}>
                <Send size={15} />
              </div>
              <div>
                <p className="font-bold text-sm">Kirim ke WhatsApp</p>
                <p className="text-xs opacity-90">Buka menu kirim WhatsApp di HP</p>
              </div>
            </div>
            <ArrowRight size={16} />
          </button>

          {/* Cara 2: Salin Teks Data (WhatsApp) */}
          <button
            onClick={onCopy}
            className="w-full py-3 px-3.5 rounded-xl text-left flex items-center justify-between transition-transform active:scale-95"
            style={{ background: C.coralSoft, color: "#60A5FA", border: `1px solid ${C.coral}44` }}
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "#223966" }}>
                <Copy size={15} color="#60A5FA" />
              </div>
              <div>
                <p className="font-bold text-sm">Salin Pesan Teks (WA)</p>
                <p className="text-xs" style={{ color: C.inkSoft }}>Tersalin otomatis, tinggal tempel di chat WA</p>
              </div>
            </div>
            <ArrowRight size={16} />
          </button>

          {/* Cara 3: Unduh File .json */}
          <button
            onClick={onDownload}
            className="w-full py-2.5 px-3.5 rounded-xl text-left flex items-center justify-between text-xs transition-colors hover:bg-[#25324B]"
            style={{ background: C.bg, color: C.inkSoft, border: `1px solid ${C.line}` }}
          >
            <div className="flex items-center gap-2">
              <Download size={14} />
              <span>Simpan sebagai file .json (Laptop/PC)</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── ImportModal ───────────────────────────
function ImportModal({ C, onClose, onProcessText, onOpenFilePicker }) {
  const [tab, setTab] = useState("paste"); // "paste" | "file"
  const [rawText, setRawText] = useState("");

  const handlePasteClipboard = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text && text.trim()) {
          setRawText(text);
          onProcessText(text);
          return;
        }
      }
    } catch (e) { }
    alert("Silakan tempel (paste) manual di dalam kotak teks.");
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)", zIndex: 60 }}>
      <div className="w-full max-w-sm rounded-2xl p-5" style={{ background: C.card, border: `1px solid ${C.line}` }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Download size={18} color="#60A5FA" />
            <h3 className="display text-lg" style={{ color: C.ink }}>Terima / Masukkan Data</h3>
          </div>
          <button onClick={onClose}><X size={18} style={{ color: C.inkSoft }} /></button>
        </div>

        {/* Tab switcher */}
        <div className="flex rounded-xl p-1 mb-4" style={{ background: C.bg, border: `1px solid ${C.line}` }}>
          <button
            onClick={() => setTab("paste")}
            className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors"
            style={{
              background: tab === "paste" ? C.coral : "transparent",
              color: tab === "paste" ? "white" : C.inkSoft,
            }}
          >
            📋 Tempel dari WA (Mudah)
          </button>
          <button
            onClick={() => setTab("file")}
            className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors"
            style={{
              background: tab === "file" ? C.coral : "transparent",
              color: tab === "file" ? "white" : C.inkSoft,
            }}
          >
            📁 Pilih File .json
          </button>
        </div>

        {tab === "paste" && (
          <div className="space-y-3">
            <div className="rounded-xl p-3 text-xs" style={{ background: C.bg, color: C.inkSoft }}>
              <p>
                <strong>Cara Mudah:</strong> Salin (Copy) pesan data di WhatsApp, lalu tekan tombol hijau di bawah:
              </p>
            </div>

            <button
              onClick={handlePasteClipboard}
              className="w-full py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-transform active:scale-95"
              style={{ background: "#059669", color: "white" }}
            >
              <Copy size={14} /> Tempel Otomatis dari Salinan
            </button>

            <div>
              <p className="text-xs font-medium mb-1" style={{ color: C.inkSoft }}>Atau tempel manual di sini:</p>
              <textarea
                rows={3}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="Tahan jari di sini lalu ketuk 'Tempel' / 'Paste'..."
                className="w-full p-2.5 rounded-xl text-xs outline-none font-mono"
                style={{ background: C.bg, color: C.ink, border: `1px solid ${C.line}` }}
              />
            </div>

            <button
              disabled={!rawText.trim()}
              onClick={() => onProcessText(rawText)}
              className="w-full py-2.5 rounded-xl text-xs font-bold disabled:opacity-40 transition-opacity"
              style={{ background: C.coral, color: "white" }}
            >
              Periksa & Masukkan Data
            </button>
          </div>
        )}

        {tab === "file" && (
          <div className="space-y-4 py-3 text-center">
            <p className="text-xs" style={{ color: C.inkSoft }}>
              Jika Anda memiliki file cadangan <code>.json</code> yang tersimpan di HP / folder Download:
            </p>
            <button
              onClick={onOpenFilePicker}
              className="w-full py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2"
              style={{ background: C.coral, color: "white" }}
            >
              <Upload size={15} /> Pilih File dari HP
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
