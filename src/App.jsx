import React, { useState, useEffect, useMemo } from "react";
import {
  Plus, Trash2, Package, ShoppingCart, ClipboardList, Search,
  X, Loader2, AlertTriangle, Minus, Receipt, Pencil
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

export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [products, setProducts] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [tab, setTab] = useState("kasir");
  const [productModal, setProductModal] = useState(null);
  const [incomingModalOpen, setIncomingModalOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [saveError, setSaveError] = useState(false);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState([]);
  const [payMethod, setPayMethod] = useState("Tunai");

  useEffect(() => {
    (async () => {
      const db = window.storage || storage;
      try { const p = await db.get("toko-produk"); if (p?.value) setProducts(JSON.parse(p.value)); } catch (e) {}
      try { const i = await db.get("toko-barang-masuk"); if (i?.value) setIncoming(JSON.parse(i.value)); } catch (e) {}
      try { const t = await db.get("toko-transaksi"); if (t?.value) setTransactions(JSON.parse(t.value)); } catch (e) {}
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

  const checkout = () => {
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
    };
    saveTransactions([tx, ...transactions]);
    saveProducts(products.map((p) => {
      const c = cartWithData.find((x) => x.productId === p.id);
      return c ? { ...p, stock: (Number(p.stock) || 0) - c.qty } : p;
    }));
    setReceipt(tx);
    setCart([]);
  };

  const lowStock = products.filter((p) => (Number(p.stock) || 0) <= (Number(p.minStock) || 5));

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
    <div className="w-full min-h-screen" style={{ background: C.bg, color: C.ink, fontFamily: "'Inter', ui-sans-serif, system-ui" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap');
        .display { font-family: 'Baloo 2', ui-rounded, sans-serif; }
        .num { font-feature-settings: "tnum"; }
        .tile:hover { transform: translateY(-2px); box-shadow: 0 8px 24px -8px rgba(26,109,255,0.4); }
        .tile { transition: all .15s ease; }
      `}</style>

      <div className="px-5 md:px-8 pt-6 pb-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-2xl overflow-hidden flex items-center justify-center">
              <img src="/icon.png" alt="Kembar Jaya Elektronik" className="w-full h-full object-cover" />
            </div>
            <h1 className="display text-2xl md:text-3xl" style={{ color: C.ink }}>Kembar Jaya Elektronik</h1>
          </div>
        </div>
        {saveError && <p className="text-xs mt-2" style={{ color: C.danger }}>Gagal menyimpan data. Coba lagi.</p>}
        {lowStock.length > 0 && (
          <div className="flex items-center gap-2 mt-3 px-3 py-2 rounded-xl text-xs font-medium" style={{ background: C.amberSoft, color: "#60A5FA" }}>
            <AlertTriangle size={14} /> Stok menipis: {lowStock.map((p) => p.name).join(", ")}
          </div>
        )}
      </div>

      <div className="px-5 md:px-8 flex gap-2 mb-2">
        {NAV.map((n) => {
          const Icon = n.icon;
          const active = tab === n.id;
          return (
            <button
              key={n.id}
              onClick={() => setTab(n.id)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-semibold transition-colors"
              style={{ background: active ? C.coral : C.card, color: active ? "white" : C.ink, border: `1px solid ${active ? C.coral : C.line}` }}
            >
              <Icon size={15} /> {n.label}
            </button>
          );
        })}
      </div>

      <div className="px-5 md:px-8 py-5">
        {tab === "kasir" && (
          <Kasir C={C} products={filteredProducts} search={search} setSearch={setSearch}
            cart={cartWithData} cartTotal={cartTotal} addToCart={addToCart}
            changeCartQty={changeCartQty} removeFromCart={removeFromCart}
            payMethod={payMethod} setPayMethod={setPayMethod} checkout={checkout} fmtIDR={fmtIDR} />
        )}
        {tab === "produk" && (
          <MasterBarang C={C} products={products} fmtIDR={fmtIDR}
            onAdd={() => setProductModal({})} onEdit={(p) => setProductModal(p)}
            onDelete={(p) => setConfirmDelete({ kind: "product", item: p })} />
        )}
        {tab === "masuk" && (
          <BarangMasuk C={C} products={products} incoming={incoming} fmtIDR={fmtIDR}
            onAdd={() => setIncomingModalOpen(true)} onDelete={(e) => setConfirmDelete({ kind: "incoming", item: e })} />
        )}
        {tab === "laporan" && (
          <Laporan C={C} transactions={transactions} fmtIDR={fmtIDR} lowStock={lowStock} />
        )}
      </div>

      {productModal !== null && <ProductModal C={C} product={productModal} onClose={() => setProductModal(null)} onSave={upsertProduct} />}
      {incomingModalOpen && <IncomingModal C={C} products={products} onClose={() => setIncomingModalOpen(false)} onSave={addIncoming} />}
      {confirmDelete && (
        <ConfirmModal C={C}
          text={confirmDelete.kind === "product"
            ? `Hapus produk "${confirmDelete.item.name}"?`
            : `Hapus catatan ini? Stok akan dikurangi kembali sebanyak ${confirmDelete.item.qty}.`}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => confirmDelete.kind === "product" ? deleteProduct(confirmDelete.item) : deleteIncoming(confirmDelete.item)} />
      )}
      {receipt && <ReceiptModal C={C} tx={receipt} fmtIDR={fmtIDR} onClose={() => setReceipt(null)} />}
    </div>
  );
}

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

function Kasir({ C, products, search, setSearch, cart, cartTotal, addToCart, changeCartQty, removeFromCart, payMethod, setPayMethod, checkout, fmtIDR }) {
  return (
    <div className="grid md:grid-cols-3 gap-5">
      <div className="md:col-span-2">
        <div className="flex items-center gap-2 mb-4 px-4 py-3 rounded-2xl" style={{ background: C.card, border: `1px solid ${C.line}` }}>
          <Search size={16} style={{ color: C.inkSoft }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari produk..." className="flex-1 text-sm outline-none" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {products.map((p) => {
            const out = (Number(p.stock) || 0) <= 0;
            const tag = tagFor(p.name);
            return (
              <button key={p.id} onClick={() => !out && addToCart(p)} disabled={out}
                className="tile text-left p-4 rounded-2xl disabled:opacity-40"
                style={{ background: C.card, border: `1px solid ${C.line}` }}>
                <div className="w-8 h-8 rounded-xl mb-2 flex items-center justify-center" style={{ background: tag + "22" }}>
                  <Package size={15} color={tag} />
                </div>
                <p className="text-sm font-semibold leading-tight">{p.name}</p>
                <p className="display num text-lg mt-1" style={{ color: C.coral }}>{fmtIDR(p.sellPrice)}</p>
                <div className="mt-2"><StockBadge stock={p.stock} minStock={p.minStock} C={C} /></div>
              </button>
            );
          })}
          {products.length === 0 && <p className="text-sm col-span-full text-center py-10" style={{ color: C.inkSoft }}>Belum ada produk. Tambahkan dulu di menu Barang.</p>}
        </div>
      </div>

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
          <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} className="w-full mb-3 px-3 py-2.5 rounded-xl text-sm" style={{ border: `1px solid ${C.line}`, background: C.card, color: C.ink }}>
            <option>Tunai</option><option>QRIS</option><option>Transfer</option><option>Debit/Kredit</option>
          </select>
          <button disabled={cart.length === 0} onClick={checkout}
            className="w-full py-3 rounded-xl font-semibold text-sm text-white disabled:opacity-40"
            style={{ background: C.coral, boxShadow: `0 6px 16px -4px ${C.coral}66` }}>
            Bayar & Cetak Struk
          </button>
        </div>
      </div>
    </div>
  );
}

function MasterBarang({ C, products, fmtIDR, onAdd, onEdit, onDelete }) {
  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={onAdd} className="flex items-center gap-1.5 px-4 py-2.5 rounded-full text-sm font-semibold text-white" style={{ background: C.teal }}>
          <Plus size={15} /> Tambah Produk
        </button>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        {products.length === 0 && <p className="text-sm col-span-full text-center py-10" style={{ color: C.inkSoft }}>Belum ada produk.</p>}
        {products.map((p) => (
          <div key={p.id} className="p-4 rounded-2xl flex items-center justify-between" style={{ background: C.card, border: `1px solid ${C.line}` }}>
            <div>
              <p className="font-semibold text-sm">{p.name}</p>
              <p className="text-xs mb-1" style={{ color: C.inkSoft }}>{p.category || "Tanpa kategori"}</p>
              <p className="num text-xs" style={{ color: C.inkSoft }}>Harga {fmtIDR(p.sellPrice)}</p>
              <div className="mt-2"><StockBadge stock={p.stock} minStock={p.minStock} C={C} /></div>
            </div>
            <div className="flex flex-col gap-2">
              <button onClick={() => onEdit(p)} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: C.bg }}><Pencil size={13} /></button>
              <button onClick={() => onDelete(p)} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: C.dangerSoft, color: C.danger }}><Trash2 size={13} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

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

function Laporan({ C, transactions, fmtIDR, lowStock }) {
  const today = todayStr();
  const todaySales = transactions.filter((t) => t.date === today).reduce((s, t) => s + t.total, 0);
  const totalSales = transactions.reduce((s, t) => s + t.total, 0);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="p-4 rounded-2xl" style={{ background: C.tealSoft }}>
          <p className="text-xs font-medium" style={{ color: "#00C8FF" }}>Penjualan Hari Ini</p>
          <p className="display num text-xl" style={{ color: C.teal }}>{fmtIDR(todaySales)}</p>
        </div>
        <div className="p-4 rounded-2xl" style={{ background: C.card, border: `1px solid ${C.line}` }}>
          <p className="text-xs font-medium" style={{ color: C.inkSoft }}>Total Penjualan</p>
          <p className="display num text-xl" style={{ color: C.ink }}>{fmtIDR(totalSales)}</p>
        </div>
        <div className="p-4 rounded-2xl" style={{ background: lowStock.length ? C.dangerSoft : C.card, border: `1px solid ${C.line}` }}>
          <p className="text-xs font-medium" style={{ color: lowStock.length ? "#F85149" : C.inkSoft }}>Stok Menipis</p>
          <p className="display num text-xl" style={{ color: lowStock.length ? C.danger : C.ink }}>{lowStock.length}</p>
        </div>
      </div>
      <div>
        <p className="display text-base mb-2">Riwayat Transaksi</p>
        <div className="rounded-2xl overflow-hidden" style={{ background: C.card, border: `1px solid ${C.line}` }}>
          {transactions.length === 0 && <p className="p-6 text-center text-sm" style={{ color: C.inkSoft }}>Belum ada transaksi.</p>}
          {transactions.slice(0, 30).map((t, idx) => (
            <div key={t.id} className="flex items-center justify-between px-4 py-3 text-sm" style={{ borderTop: idx ? `1px solid ${C.line}` : "none" }}>
              <div>
                <p className="font-medium">{t.receiptNo}</p>
                <p className="text-xs" style={{ color: C.inkSoft }}>{t.date} {t.time} · {t.items.length} item · {t.payMethod}</p>
              </div>
              <span className="num font-semibold">{fmtIDR(t.total)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

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

function ReceiptModal({ C, tx, fmtIDR, onClose }) {
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
        <button onClick={onClose} className="w-full mt-4 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: C.teal }}>Selesai</button>
      </div>
    </div>
  );
}

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

function Field({ label, C, children }) {
  return (
    <div>
      <label className="text-xs font-medium uppercase" style={{ color: C.inkSoft }}>{label}</label>
      {children}
    </div>
  );
}
