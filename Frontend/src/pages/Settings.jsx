import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Settings as SettingsIcon,
  User,
  Lock,
  LogOut,
  Search,
  CheckCircle,
  XCircle,
  Eye,
  EyeOff,
  Shield,
  AlertCircle,
  Store,
  Tag,
  CreditCard,
  Percent,
  Pencil,
  Trash2,
  Receipt,
  X,
  ArrowLeft,
  ChevronRight,
  QrCode,
  Car,
  Truck,
  Home,
  Network,
  Star,
  Trash,
  Mail,
  UserCircle,
  Plus,
} from "lucide-react";

import visaLogo            from "../assets/payment/Visa.png";
import mastercardLogo      from "../assets/payment/MasterCard.png";
import amexLogo            from "../assets/payment/AmericanExpress.webp";
import paypalLogo          from "../assets/payment/PayPal.png";
import cashLogo            from "../assets/payment/Cash.jpg";
import debitLogo           from "../assets/payment/DebitCard.webp";
import dinersLogo          from "../assets/payment/DinersClub.png";
import discoverLogo        from "../assets/payment/discover.png";
import creditDebitCardIcon from "../assets/payment/Creditdebitcardicon.jpg";

import { QRCodeSVG } from "qrcode.react";
import Header from "../components/Header";
import LogoutConfirmationDialog from "../components/LogoutConfirmationDialog";
import ForgotPasswordModal from "./ForgotPasswordModel";
import { useNavigate } from "react-router-dom";
import { useData } from "../context/DataContext";

/* ─── Helpers ─────────────────────────────────────────── */
const getPaymentLogo = (name) => {
  const n = (name || "").toLowerCase();
  if (n.includes("visa"))                                return visaLogo;
  if (n.includes("mastercard") || n.includes("master")) return mastercardLogo;
  if (n.includes("amex") || n.includes("american"))     return amexLogo;
  if (n.includes("paypal"))                              return paypalLogo;
  if (n.includes("cash"))                                return cashLogo;
  if (n.includes("diners"))                              return dinersLogo;
  if (n.includes("discover"))                            return discoverLogo;
  if (n.includes("debit"))                               return debitLogo;
  return null;
};

const PAYMENT_CARD_TYPES = [
  { name: "Visa",             logo: visaLogo },
  { name: "MasterCard",       logo: mastercardLogo },
  { name: "American Express", logo: amexLogo },
  { name: "Discover",         logo: discoverLogo },
  { name: "Diners Club",      logo: dinersLogo },
  { name: "PayPal",           logo: paypalLogo },
  { name: "Debit Card",       logo: debitLogo },
  { name: "Cash",             logo: cashLogo },
  { name: "Other",            logo: creditDebitCardIcon },
];

/* ─── Shared styles ────────────────────────────────────── */
const inputCls = "w-full bg-white border border-gray-200 text-gray-900 text-sm rounded-xl px-4 py-2.5 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all";
const labelCls = "block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5";

/* ─── ItemLogo ─────────────────────────────────────────── */
const ItemLogo = ({ logo, name }) => {
  const [err, setErr] = useState(false);
  if (logo && !err)
    return <img src={logo} alt={name} onError={() => setErr(true)} className="w-9 h-9 rounded-lg object-contain bg-gray-100 p-1 flex-shrink-0" />;
  return (
    <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-xs font-bold text-blue-600 flex-shrink-0">
      {(name || "?")[0].toUpperCase()}
    </div>
  );
};

/* ─── ItemRow ──────────────────────────────────────────── */
const ItemRow = ({ logo, name, sublabel, badge, badgeCls, actions }) => (
  <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2.5 border border-gray-100">
    <ItemLogo logo={logo} name={name} />
    <div className="flex-1 min-w-0">
      <p className="text-sm font-medium text-gray-900 truncate">{name}</p>
      {sublabel && <p className="text-xs text-gray-400 truncate">{sublabel}</p>}
    </div>
    {badge && <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md border flex-shrink-0 ${badgeCls}`}>{badge}</span>}
    <div className="flex items-center gap-1 flex-shrink-0">{actions}</div>
  </div>
);

/* ─── Manage Modal (Merchants / Categories / Payments / Taxes) ─────────── */
const MODAL_CFG = {
  merchants:  { icon: Store,      label: "Merchants",          color: "blue",    addPlaceholder: "New merchant name…" },
  categories: { icon: Tag,        label: "Expense Categories", color: "violet",  addPlaceholder: "New category name…" },
  payments:   { icon: CreditCard, label: "Payment Methods",    color: "emerald", addPlaceholder: "e.g. Visa *1234, Cash…" },
  taxes:      { icon: Percent,    label: "Tax Types",          color: "amber",   addPlaceholder: "Tax name (e.g. GST)" },
};
const COLOR_MAP = {
  blue:    { badge: "bg-blue-100 text-blue-600 border-blue-200",         btn: "bg-blue-600 hover:bg-blue-700" },
  violet:  { badge: "bg-violet-100 text-violet-600 border-violet-200",   btn: "bg-violet-600 hover:bg-violet-700" },
  emerald: { badge: "bg-emerald-100 text-emerald-600 border-emerald-200",btn: "bg-emerald-600 hover:bg-emerald-700" },
  amber:   { badge: "bg-amber-100 text-amber-700 border-amber-200",      btn: "bg-amber-500 hover:bg-amber-600" },
};

const ManageModal = ({ type, onClose }) => {
  const {
    receiptMerchWImgRaw, customMerchants, hideMerchant, addCustomMerchant, editCustomMerchant, deleteCustomMerchant,
    receiptCategoriesRaw, customCategories, hideCategory, addCustomCategory, editCustomCategory, deleteCustomCategory,
    receiptPaymentsRaw, customPaymentMethods, hidePaymentMethod, addCustomPaymentMethod, editCustomPaymentMethod, deleteCustomPaymentMethod,
    taxData, addTax, updateTax, deleteTax, fetchTaxes,
    hiddenMerchants, hiddenCategories, hiddenPaymentMethods,
  } = useData();

  useEffect(() => { if (type === "taxes") fetchTaxes(); }, [type, fetchTaxes]);

  const cfg = MODAL_CFG[type]; const colors = COLOR_MAP[cfg.color];
  const [search, setSearch]                     = useState("");
  const [addVal, setAddVal]                     = useState("");
  const [addTaxVal, setAddTaxVal]               = useState({ tax_name: "", tax_rate: "", tax_number: "" });
  const [editKey, setEditKey]                   = useState(null);
  const [editVal, setEditVal]                   = useState("");
  const [editTaxKey, setEditTaxKey]             = useState(null);
  const [editTaxVal, setEditTaxVal]             = useState({ tax_name: "", tax_rate: "", tax_number: "" });
  const [editReceiptKey, setEditReceiptKey]     = useState(null);
  const [editReceiptVal, setEditReceiptVal]     = useState("");
  const [msg, setMsg]                           = useState(null);

  const toast = (t, text) => { setMsg({ type: t, text }); setTimeout(() => setMsg(null), 3000); };

  const handleAdd = async () => {
    if (type === "taxes") {
      const n = addTaxVal.tax_name.trim(), r = addTaxVal.tax_rate.toString().trim();
      if (!n || !r) return toast("error", "Name and rate are required.");
      try {
        const fk_user_id = localStorage.getItem("fk_user_id") || "";
        await addTax({ tax_name: n, tax_rate: r, tax_number: addTaxVal.tax_number.trim(), fk_user_id });
        setAddTaxVal({ tax_name: "", tax_rate: "", tax_number: "" });
        toast("success", `"${n}" added.`);
      } catch (e) { toast("error", e.message || "Failed."); }
      return;
    }
    if (!addVal.trim()) return;
    if (type === "merchants")  addCustomMerchant(addVal);
    if (type === "categories") addCustomCategory(addVal);
    if (type === "payments")   addCustomPaymentMethod(addVal);
    setAddVal("");
  };

  const handleEdit = async (key) => {
    if (type === "taxes") {
      const n = editTaxVal.tax_name.trim(), r = editTaxVal.tax_rate.toString().trim();
      if (!n || !r) return;
      try { await updateTax({ ...taxData.find(t => t.id === key), tax_name: n, tax_rate: r, tax_number: editTaxVal.tax_number.trim() }); setEditTaxKey(null); }
      catch (e) { toast("error", e.message || "Failed."); }
      return;
    }
    if (!editVal.trim()) return;
    if (type === "merchants")  editCustomMerchant(key, editVal);
    if (type === "categories") editCustomCategory(key, editVal);
    if (type === "payments")   editCustomPaymentMethod(key, editVal);
    setEditKey(null);
  };

  const handleDelete = async (key) => {
    if (type === "taxes") { try { await deleteTax(key); } catch (e) { toast("error", e.message || "Failed."); } return; }
    if (type === "merchants")  deleteCustomMerchant(key);
    if (type === "categories") deleteCustomCategory(key);
    if (type === "payments")   deleteCustomPaymentMethod(key);
  };

  const handleReceiptEdit = (key, currentName) => {
    const newName = editReceiptVal.trim();
    if (!newName || newName === currentName) { setEditReceiptKey(null); return; }
    if (type === "merchants")  { hideMerchant(key);      addCustomMerchant(newName); }
    if (type === "categories") { hideCategory(key);      addCustomCategory(newName); }
    if (type === "payments")   { hidePaymentMethod(key); addCustomPaymentMethod(newName); }
    setEditReceiptKey(null); setEditReceiptVal("");
  };

  const buildReceiptItems = () => {
    if (type === "merchants")  return receiptMerchWImgRaw.filter(m => !hiddenMerchants.has(m.name)).map(m => ({ key: m.name, name: m.name, logo: m.image || null }));
    if (type === "categories") return receiptCategoriesRaw.filter(c => !hiddenCategories.has(c)).map(c => ({ key: c, name: c, logo: null }));
    if (type === "payments")   return receiptPaymentsRaw.filter(p => !hiddenPaymentMethods.has(p)).map(p => ({ key: p, name: p, logo: getPaymentLogo(p) }));
    return [];
  };
  const buildCustomItems = () => {
    if (type === "merchants")  return customMerchants.filter(m => !hiddenMerchants.has(m)).map(m => ({ key: m, name: m, logo: null }));
    if (type === "categories") return customCategories.filter(c => !hiddenCategories.has(c)).map(c => ({ key: c, name: c, logo: null }));
    if (type === "payments")   return customPaymentMethods.filter(p => !hiddenPaymentMethods.has(p)).map(p => ({ key: p, name: p, logo: getPaymentLogo(p) }));
    return [];
  };

  const receiptItems = buildReceiptItems().filter(i => i.name.toLowerCase().includes(search.toLowerCase()));
  const customItems  = buildCustomItems().filter(i => i.name.toLowerCase().includes(search.toLowerCase()));
  const taxItems     = type === "taxes" ? taxData.filter(t => (t.tax_name || "").toLowerCase().includes(search.toLowerCase())) : [];
  const Icon = cfg.icon;
  const mInput = "flex-1 min-w-0 bg-white border border-gray-200 text-gray-900 text-sm rounded-xl px-3 py-2 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all";
  const ab = (color, onClick, children) => (
    <button onClick={onClick} className={`flex items-center justify-center w-7 h-7 rounded-lg text-white text-xs transition-all ${color}`}>{children}</button>
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12 }} transition={{ duration: 0.22 }}
        className="relative bg-white rounded-2xl w-full max-w-lg shadow-2xl border border-gray-200 flex flex-col" style={{ maxHeight: "88vh" }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colors.badge}`}><Icon size={15} /></div>
          <h2 className="flex-1 text-base font-bold text-gray-900">Manage {cfg.label}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1 transition-colors"><X size={18} /></button>
        </div>
        {/* Add */}
        <div className="px-5 pt-4 pb-3 border-b border-gray-100 flex-shrink-0">
          {type === "taxes" ? (
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <input className={mInput} placeholder="Tax name (e.g. GST)" value={addTaxVal.tax_name} onChange={e => setAddTaxVal(p => ({ ...p, tax_name: e.target.value }))} />
                <input className={`${mInput} max-w-[80px]`} placeholder="Rate %" value={addTaxVal.tax_rate} onChange={e => setAddTaxVal(p => ({ ...p, tax_rate: e.target.value }))} />
              </div>
              <div className="flex gap-2">
                <input className={mInput} placeholder="Tax number (optional)" value={addTaxVal.tax_number} onChange={e => setAddTaxVal(p => ({ ...p, tax_number: e.target.value }))} />
                <button onClick={handleAdd} className={`px-4 py-2 rounded-xl text-white text-sm font-semibold flex-shrink-0 ${colors.btn}`}>Add</button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <input className={mInput} placeholder={cfg.addPlaceholder} value={addVal} onChange={e => setAddVal(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAdd()} />
              <button onClick={handleAdd} className={`px-4 py-2 rounded-xl text-white text-sm font-semibold flex-shrink-0 ${colors.btn}`}>Add</button>
            </div>
          )}
          <AnimatePresence>
            {msg && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className={`flex items-center gap-2 mt-2 text-xs px-3 py-2 rounded-xl ${msg.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-600 border border-red-200"}`}>
                {msg.type === "success" ? <CheckCircle size={13}/> : <AlertCircle size={13}/>} {msg.text}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {/* Search */}
        <div className="px-5 py-3 border-b border-gray-100 flex-shrink-0">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input className="w-full bg-gray-50 border border-gray-200 text-sm text-gray-900 rounded-xl pl-8 pr-8 py-2 placeholder-gray-400 focus:outline-none focus:border-blue-400 transition-all"
              placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
            {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={13}/></button>}
          </div>
        </div>
        {/* List */}
        <div className="flex-1 overflow-y-auto px-5 py-3 flex flex-col gap-2">
          {type === "taxes" ? (
            taxItems.length === 0 ? <p className="text-sm text-gray-400 text-center py-6">No tax types yet.</p> :
            taxItems.map(tax => {
              const isEd = editTaxKey === tax.id;
              return (
                <div key={tax.id}>
                  {isEd ? (
                    <div className="flex flex-col gap-2 bg-blue-50 border border-blue-200 rounded-xl p-3">
                      <div className="flex gap-2">
                        <input className={mInput} value={editTaxVal.tax_name} onChange={e => setEditTaxVal(p => ({ ...p, tax_name: e.target.value }))} placeholder="Name" />
                        <input className={`${mInput} max-w-[80px]`} value={editTaxVal.tax_rate} onChange={e => setEditTaxVal(p => ({ ...p, tax_rate: e.target.value }))} placeholder="Rate %" />
                      </div>
                      <div className="flex gap-2">
                        <input className={mInput} value={editTaxVal.tax_number} onChange={e => setEditTaxVal(p => ({ ...p, tax_number: e.target.value }))} placeholder="Tax number (optional)" />
                        <button onClick={() => handleEdit(tax.id)} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg">Save</button>
                        <button onClick={() => setEditTaxKey(null)} className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-semibold rounded-lg">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <ItemRow name={tax.tax_name} sublabel={tax.tax_number ? `#${tax.tax_number}` : undefined} badge={`${tax.tax_rate}%`} badgeCls={colors.badge}
                      actions={<>
                        {ab("bg-blue-500 hover:bg-blue-600", () => { setEditTaxKey(tax.id); setEditTaxVal({ tax_name: tax.tax_name, tax_rate: tax.tax_rate, tax_number: tax.tax_number || "" }); }, <Pencil size={13}/>)}
                        {ab("bg-red-400 hover:bg-red-500", () => handleDelete(tax.id), <Trash2 size={13}/>)}
                      </>}
                    />
                  )}
                </div>
              );
            })
          ) : (
            <>
              {receiptItems.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">From your receipts</p>
                  <div className="flex flex-col gap-1.5">
                    {receiptItems.map(item => {
                      const isEd = editReceiptKey === item.key;
                      return (
                        <div key={item.key}>
                          {isEd ? (
                            <div className="flex gap-2 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2">
                              <input className={mInput} value={editReceiptVal} onChange={e => setEditReceiptVal(e.target.value)} placeholder={item.name} />
                              <button onClick={() => handleReceiptEdit(item.key, item.name)} className="px-3 py-1 bg-blue-600 text-white text-xs font-semibold rounded-lg">Save</button>
                              <button onClick={() => setEditReceiptKey(null)} className="px-3 py-1 bg-gray-100 text-gray-600 text-xs font-semibold rounded-lg">Cancel</button>
                            </div>
                          ) : (
                            <ItemRow logo={item.logo} name={item.name} badgeCls={colors.badge}
                              actions={<>
                                {ab("bg-blue-500 hover:bg-blue-600", () => { setEditReceiptKey(item.key); setEditReceiptVal(item.name); }, <Pencil size={13}/>)}
                                {ab("bg-red-400 hover:bg-red-500", () => { if (type === "merchants") hideMerchant(item.key); if (type === "categories") hideCategory(item.key); if (type === "payments") hidePaymentMethod(item.key); }, <Trash2 size={13}/>)}
                              </>}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {customItems.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5 mt-2">Custom</p>
                  <div className="flex flex-col gap-1.5">
                    {customItems.map(item => {
                      const isEd = editKey === item.key;
                      return (
                        <div key={item.key}>
                          {isEd ? (
                            <div className="flex gap-2 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2">
                              <input className={mInput} value={editVal} onChange={e => setEditVal(e.target.value)} placeholder={item.name} />
                              <button onClick={() => handleEdit(item.key)} className="px-3 py-1 bg-blue-600 text-white text-xs font-semibold rounded-lg">Save</button>
                              <button onClick={() => setEditKey(null)} className="px-3 py-1 bg-gray-100 text-gray-600 text-xs font-semibold rounded-lg">Cancel</button>
                            </div>
                          ) : (
                            <ItemRow logo={item.logo} name={item.name} badgeCls={colors.badge}
                              actions={<>
                                {ab("bg-blue-500 hover:bg-blue-600", () => { setEditKey(item.key); setEditVal(item.name); }, <Pencil size={13}/>)}
                                {ab("bg-red-400 hover:bg-red-500", () => handleDelete(item.key), <Trash2 size={13}/>)}
                              </>}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {receiptItems.length === 0 && customItems.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-6">No {cfg.label.toLowerCase()} yet.</p>
              )}
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
};

/* ─── Content Panels ─────────────────────────────────────── */

/* My Account panel — menu → sub-view */
const MyAccountPanel = ({ user, onLogoutRequest }) => {
  const [view, setView] = useState("menu"); // menu | editProfile | changePassword | deleteConfirm
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  const [profile, setProfile] = useState({
    firstName: user?.firstName || "", lastName: user?.lastName || "",
    recoveryEmail: user?.email || "", receiptEmail: "", sameAsRecovery: false,
  });
  const [profileMsg, setProfileMsg] = useState(null);

  // Sync profile from user once user data arrives (handles async load)
  useEffect(() => {
    if (user) {
      setProfile(p => ({
        ...p,
        firstName:     p.firstName     || user.firstName || "",
        lastName:      p.lastName      || user.lastName  || "",
        recoveryEmail: p.recoveryEmail || user.email     || "",
      }));
    }
  }, [user]);

  const [passwords, setPasswords] = useState({ newPassword: "", confirmPassword: "" });
  const [showNew, setShowNew]     = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState(null);

  const handleProfileUpdate = (e) => {
    e.preventDefault();
    setProfileMsg({ type: "success", text: "Profile updated successfully!" });
    setTimeout(() => setProfileMsg(null), 3000);
  };

  const handlePasswordReset = (e) => {
    e.preventDefault();
    if (passwords.newPassword.length < 8) { setPasswordMsg({ type: "error", text: "Minimum 8 characters." }); return; }
    if (passwords.newPassword !== passwords.confirmPassword) { setPasswordMsg({ type: "error", text: "Passwords do not match." }); return; }
    setPasswordMsg({ type: "success", text: "Password reset successfully!" });
    setPasswords({ newPassword: "", confirmPassword: "" });
    setTimeout(() => setPasswordMsg(null), 3000);
  };

  const strengthLevel = passwords.newPassword.length === 0 ? null : passwords.newPassword.length < 8 ? "weak" : passwords.newPassword.length < 12 ? "medium" : "strong";
  const strengthColor = strengthLevel === "weak" ? "bg-red-500" : strengthLevel === "medium" ? "bg-yellow-400" : "bg-green-500";
  const strengthWidth = strengthLevel === "weak" ? "w-1/3" : strengthLevel === "medium" ? "w-2/3" : "w-full";

  const menuItems = [
    { icon: UserCircle, label: "Edit Profile",    sub: "Update your name and email",      view: "editProfile",    color: "text-blue-600",   bg: "bg-blue-50" },
    { icon: Lock,       label: "Change Password", sub: "Set a new secure password",        view: "changePassword", color: "text-violet-600", bg: "bg-violet-50" },
    { icon: Trash,      label: "Delete Account",  sub: "Permanently remove your account",  view: "deleteConfirm",  color: "text-red-500",    bg: "bg-red-50" },
    { icon: LogOut,     label: "Logoff",           sub: "Sign out of Categorizr",           view: "logoff",         color: "text-gray-500",   bg: "bg-gray-100" },
  ];

  return (
    <>
      {/* Sub-view back button */}
      {view !== "menu" && (
        <button onClick={() => setView("menu")} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-5 transition-colors">
          <ArrowLeft size={15} /> Back
        </button>
      )}

      {/* ── Menu ── */}
      {view === "menu" && (
        <div className="flex flex-col gap-2">
          {menuItems.map(({ icon: Icon, label, sub, view: target, color, bg }) => (
            <button key={target}
              onClick={() => target === "logoff" ? onLogoutRequest() : setView(target)}
              className="flex items-center gap-4 bg-white border border-gray-200 rounded-xl px-4 py-3.5 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm text-left group"
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${bg}`}>
                <Icon size={18} className={color} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold ${target === "deleteConfirm" ? "text-red-500" : "text-gray-900"}`}>{label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
              </div>
              <ChevronRight size={16} className="text-gray-300 group-hover:text-gray-500 transition-colors flex-shrink-0" />
            </button>
          ))}
        </div>
      )}

      {/* ── Edit Profile ── */}
      {view === "editProfile" && (
        <form onSubmit={handleProfileUpdate} className="flex flex-col gap-4 max-w-md">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>First Name</label>
              <input className={inputCls} type="text" value={profile.firstName} onChange={e => setProfile(p => ({ ...p, firstName: e.target.value }))} placeholder="e.g. John" />
            </div>
            <div>
              <label className={labelCls}>Last Name</label>
              <input className={inputCls} type="text" value={profile.lastName} onChange={e => setProfile(p => ({ ...p, lastName: e.target.value }))} placeholder="e.g. Smith" />
            </div>
          </div>
          <div>
            <label className={labelCls}>Password Recovery Email</label>
            <input className={inputCls} type="email" value={profile.recoveryEmail} onChange={e => setProfile(p => ({ ...p, recoveryEmail: e.target.value, sameAsRecovery: false }))} placeholder="recovery@email.com" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className={`${labelCls} mb-0`}>
                Duplicate eReceipt Email
                <span className="normal-case font-normal text-blue-500 ml-1">(Recommended)</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <span className="text-[11px] text-gray-400">Same as recovery</span>
                <div onClick={() => setProfile(p => ({ ...p, sameAsRecovery: !p.sameAsRecovery, receiptEmail: !p.sameAsRecovery ? p.recoveryEmail : p.receiptEmail }))}
                  className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${profile.sameAsRecovery ? "bg-blue-500" : "bg-gray-200"}`}>
                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${profile.sameAsRecovery ? "left-4" : "left-0.5"}`} />
                </div>
              </label>
            </div>
            <input className={inputCls} type="email" value={profile.sameAsRecovery ? profile.recoveryEmail : profile.receiptEmail} disabled={profile.sameAsRecovery}
              onChange={e => setProfile(p => ({ ...p, receiptEmail: e.target.value }))} placeholder="receipts@email.com" />
            <p className="text-[11px] text-gray-400 mt-1.5">Note: Categorizr will send you a duplicate copy of your eReceipt to this email address.</p>
          </div>
          <AnimatePresence>
            {profileMsg && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className={`flex items-center gap-2 text-sm px-3 py-2.5 rounded-xl ${profileMsg.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-600 border border-red-200"}`}>
                {profileMsg.type === "success" ? <CheckCircle size={14}/> : <AlertCircle size={14}/>} {profileMsg.text}
              </motion.div>
            )}
          </AnimatePresence>
          <button type="submit" className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl transition-all">Update</button>
        </form>
      )}

      {/* ── Change Password ── */}
      {view === "changePassword" && (
        <form onSubmit={handlePasswordReset} className="flex flex-col gap-4 max-w-md">
          <div>
            <label className={labelCls}>New Password</label>
            <div className="relative">
              <input className={`${inputCls} pr-10`} type={showNew ? "text" : "password"} value={passwords.newPassword}
                onChange={e => setPasswords(p => ({ ...p, newPassword: e.target.value }))} placeholder="Enter new password" />
              <button type="button" onClick={() => setShowNew(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showNew ? <EyeOff size={16}/> : <Eye size={16}/>}
              </button>
            </div>
            {strengthLevel && (
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1 h-1 rounded-full bg-gray-200 overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-300 ${strengthColor} ${strengthWidth}`} />
                </div>
                <span className="text-xs text-gray-400 capitalize">{strengthLevel}</span>
              </div>
            )}
          </div>
          <div>
            <label className={labelCls}>Confirm New Password</label>
            <div className="relative">
              <input className={`${inputCls} pr-10`} type={showConfirm ? "text" : "password"} value={passwords.confirmPassword}
                onChange={e => setPasswords(p => ({ ...p, confirmPassword: e.target.value }))} placeholder="Re-enter new password" />
              <button type="button" onClick={() => setShowConfirm(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showConfirm ? <EyeOff size={16}/> : <Eye size={16}/>}
              </button>
            </div>
            {passwords.confirmPassword.length > 0 && (
              <div className={`flex items-center gap-1.5 mt-1.5 text-xs font-medium ${passwords.newPassword === passwords.confirmPassword ? "text-green-600" : "text-red-500"}`}>
                {passwords.newPassword === passwords.confirmPassword ? <><CheckCircle size={12}/> Passwords match</> : <><XCircle size={12}/> Passwords do not match</>}
              </div>
            )}
          </div>
          <AnimatePresence>
            {passwordMsg && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className={`flex items-center gap-2 text-sm px-3 py-2.5 rounded-xl ${passwordMsg.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-600 border border-red-200"}`}>
                {passwordMsg.type === "success" ? <CheckCircle size={14}/> : <AlertCircle size={14}/>} {passwordMsg.text}
              </motion.div>
            )}
          </AnimatePresence>
          <button type="submit" className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl transition-all">Reset Password</button>
          <button type="button" onClick={() => setShowForgotPassword(true)} className="text-xs text-blue-500 hover:text-blue-700 text-center">Forgot Password?</button>
        </form>
      )}

      {/* ── Delete Confirm ── */}
      {view === "deleteConfirm" && (
        <div className="max-w-md flex flex-col items-center gap-4 text-center py-4">
          <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center">
            <Trash size={28} className="text-red-500" />
          </div>
          <div>
            <p className="text-lg font-bold text-gray-900">Are you sure?</p>
            <p className="text-sm text-gray-500 mt-1 max-w-xs">This will permanently delete your account and all data. This cannot be undone.</p>
          </div>
          <div className="flex gap-3 w-full max-w-xs">
            <button onClick={() => setView("menu")} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-700 text-sm font-semibold hover:bg-gray-50 transition-all">No, Keep It</button>
            <button className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition-all">Yes, Delete</button>
          </div>
        </div>
      )}

      <AnimatePresence>
        {showForgotPassword && <ForgotPasswordModal onClose={() => setShowForgotPassword(false)} />}
      </AnimatePresence>
    </>
  );
};

/* My Network panel */
const MyNetworkPanel = () => {
  const [search, setSearch] = useState("");
  const networkList = []; // UI only
  const filtered = networkList.filter(u => u?.username?.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="max-w-md flex flex-col gap-4">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input className="w-full bg-white border border-gray-200 text-sm text-gray-900 rounded-xl pl-8 pr-8 py-2.5 placeholder-gray-400 focus:outline-none focus:border-blue-400 transition-all shadow-sm"
          placeholder="Search network…" value={search} onChange={e => setSearch(e.target.value)} />
        {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={13}/></button>}
      </div>
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
          <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center">
            <Network size={24} className="text-gray-300" />
          </div>
          <p className="text-sm font-medium text-gray-500">{search ? "No users found." : "You don't have a network"}</p>
          {!search && <p className="text-xs text-gray-400">Please search for network</p>}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(u => (
            <div key={u.id} className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl px-3 py-2.5 shadow-sm">
              <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">{(u.username || "?")[0].toUpperCase()}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{u.username}</p>
                <p className="text-xs text-gray-400 truncate">{u.status || "Connected"}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/* Receipt Info panel — wraps a manage section inline */
const ReceiptInfoPanel = ({ type, merchants, expenseCategories, paymentMethods, taxData, onOpen }) => {
  const items = [
    { type: "merchants",  icon: Store,      label: "Manage Merchants",          count: merchants.length,         iconBg: "bg-blue-50",    iconColor: "text-blue-600",    countBg: "bg-blue-100 text-blue-600 border-blue-200" },
    { type: "categories", icon: Tag,        label: "Manage Expense Categories", count: expenseCategories.length, iconBg: "bg-violet-50",  iconColor: "text-violet-600",  countBg: "bg-violet-100 text-violet-600 border-violet-200" },
    { type: "payments",   icon: CreditCard, label: "Manage Payment Methods",    count: paymentMethods.length,    iconBg: "bg-emerald-50", iconColor: "text-emerald-600", countBg: "bg-emerald-100 text-emerald-600 border-emerald-200" },
    { type: "taxes",      icon: Percent,    label: "Manage Tax Types",          count: taxData.length,           iconBg: "bg-amber-50",   iconColor: "text-amber-600",   countBg: "bg-amber-100 text-amber-700 border-amber-200" },
  ];

  const activeItem = items.find(i => i.type === type);
  if (activeItem) {
    // show just that type's full list
    return <ManageModal type={type} onClose={() => onOpen(null)} />;
  }

  return (
    <div className="flex flex-col gap-2 max-w-lg">
      <p className="text-xs text-gray-400 mb-2">Deleting a merchant linked to existing receipts will reassign them to Miscellaneous.</p>
      {items.map(({ type: t, icon: Icon, label, count, iconBg, iconColor, countBg }) => (
        <button key={t} onClick={() => onOpen(t)}
          className="w-full flex items-center gap-4 bg-white border border-gray-200 rounded-xl px-4 py-3.5 hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm text-left group">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}><Icon size={18} className={iconColor} /></div>
          <span className="flex-1 text-sm font-semibold text-gray-900">{label}</span>
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border flex-shrink-0 ${countBg}`}>{count}</span>
          <ChevronRight size={16} className="text-gray-300 group-hover:text-gray-500 flex-shrink-0 transition-colors" />
        </button>
      ))}
    </div>
  );
};

/* My Information panel */
const MyInformationPanel = ({ user }) => {
  const email       = user?.email || "";
  const displayName = user?.userName || user?.username || user?.firstName || email.split("@")[0] || "User";
  return (
    <div className="flex flex-col gap-6 max-w-lg">
      {/* Profile card + QR */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm flex flex-col sm:flex-row items-center gap-5">
        <div className="flex-shrink-0 flex flex-col items-center gap-2">
          <div className="p-3 bg-white border border-gray-200 rounded-xl shadow-sm">
            {email ? <QRCodeSVG value={`mailto:${email}`} size={120} bgColor="#ffffff" fgColor="#1e293b" /> : (
              <div className="w-[120px] h-[120px] bg-gray-100 rounded-lg flex items-center justify-center"><QrCode size={40} className="text-gray-300" /></div>
            )}
          </div>
          <p className="text-[11px] text-gray-400">Scan to see email</p>
        </div>
        <div className="flex-1 min-w-0 text-center sm:text-left">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-xl font-bold mx-auto sm:mx-0 mb-3">
            {displayName[0].toUpperCase()}
          </div>
          <p className="text-base font-bold text-gray-900 truncate">{displayName}</p>
          {email && <p className="text-sm text-gray-500 truncate mt-0.5">{email}</p>}
        </div>
      </div>
      {/* Coming soon cards */}
      {[
        { icon: Car,   label: "Driver Information",   sub: "Driver license, insurance, and more" },
        { icon: Truck, label: "Vehicle Information",  sub: "Vehicle details and registration" },
        { icon: Home,  label: "Property Information", sub: "Property records and details" },
      ].map(({ icon: Icon, label, sub }) => (
        <div key={label} className="flex items-center gap-4 bg-white border border-gray-200 rounded-xl px-4 py-3.5 opacity-60 cursor-not-allowed shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0"><Icon size={18} className="text-gray-400" /></div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-500">{label}</p>
            <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
          </div>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-600 border border-yellow-200 flex-shrink-0">Coming Soon</span>
        </div>
      ))}
    </div>
  );
};

/* ─── Sidebar nav config ─────────────────────────────────── */
const NAV = [
  {
    group: "Account",
    items: [
      { id: "myaccount",  icon: User,    label: "My Account"  },
      { id: "mynetwork",  icon: Network, label: "My Network"  },
    ],
  },
  {
    group: "Receipt Information",
    items: [
      { id: "merchants",  icon: Store,      label: "Manage Merchants"          },
      { id: "categories", icon: Tag,        label: "Manage Expense Categories" },
      { id: "payments",   icon: CreditCard, label: "Manage Payment Methods"    },
      { id: "taxes",      icon: Percent,    label: "Manage Tax Types"          },
    ],
  },
  {
    group: "My Information",
    items: [
      { id: "myinfo", icon: QrCode, label: "Profile & QR Code" },
      { id: "driver",   icon: Car,   label: "Driver Information",   soon: true },
      { id: "vehicle",  icon: Truck, label: "Vehicle Information",  soon: true },
      { id: "property", icon: Home,  label: "Property Information", soon: true },
    ],
  },
];

const MANAGE_TYPES = ["merchants", "categories", "payments", "taxes"];

const TITLES = {
  myaccount:  "My Account",
  mynetwork:  "My Network",
  merchants:  "Manage Merchants",
  categories: "Manage Expense Categories",
  payments:   "Manage Payment Methods",
  taxes:      "Manage Tax Types",
  myinfo:     "My Information",
  driver:     "Driver Information",
  vehicle:    "Vehicle Information",
  property:   "Property Information",
};

/* ─── Main Settings Component ───────────────────────────── */
const Settings = () => {
  const navigate = useNavigate();
  const { clearAllData, user } = useData();

  const [active, setActive]               = useState("myaccount");
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [sidebarOpen, setSidebarOpen]     = useState(false); // mobile toggle

  const handleLogout = () => {
    clearAllData();
    localStorage.clear();
    navigate("/login", { replace: true });
  };

  const handleNavClick = (id, soon) => {
    if (soon) return;
    setActive(id);
    setSidebarOpen(false);
  };

  /* breadcrumb label */
  const crumbLabel = TITLES[active] || active;

  /* Sidebar */
  const Sidebar = () => (
    <aside className="flex flex-col h-full bg-white border-r border-gray-200 w-64 flex-shrink-0">
      {/* Sidebar header */}
      <div className="px-4 py-5 border-b border-gray-100">
        <button onClick={() => navigate("/homepage")}
          className="flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors mb-4">
          <ArrowLeft size={16} /> Settings
        </button>
      </div>
      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 flex flex-col gap-5">
        {NAV.map(({ group, items }) => (
          <div key={group}>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-2 mb-1.5">{group}</p>
            <div className="flex flex-col gap-0.5">
              {items.map(({ id, icon: Icon, label, soon }) => {
                const isActive = active === id;
                return (
                  <button key={id} onClick={() => handleNavClick(id, soon)}
                    disabled={soon}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all text-left w-full
                      ${soon ? "opacity-40 cursor-not-allowed text-gray-500" : ""}
                      ${!soon && isActive ? "bg-blue-50 text-blue-700" : ""}
                      ${!soon && !isActive ? "text-gray-600 hover:bg-gray-50 hover:text-gray-900" : ""}`}
                  >
                    <Icon size={15} className={isActive && !soon ? "text-blue-600" : ""} />
                    <span className="flex-1">{label}</span>
                    {soon && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-600 border border-yellow-200">Soon</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      {/* Logout at bottom of sidebar */}
      <div className="px-3 py-4 border-t border-gray-100">
        <button onClick={() => setShowLogoutConfirm(true)}
          className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-red-500 hover:bg-red-50 transition-all w-full">
          <LogOut size={15} /> Log out
        </button>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header />

      {/* Page body */}
      <div className="flex flex-1 overflow-hidden" style={{ minHeight: "calc(100vh - 60px)" }}>

        {/* ── Desktop Sidebar ── */}
        <div className="hidden lg:flex flex-col h-auto sticky top-0 self-start" style={{ minHeight: "calc(100vh - 60px)" }}>
          <Sidebar />
        </div>

        {/* ── Mobile sidebar overlay ── */}
        <AnimatePresence>
          {sidebarOpen && (
            <>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setSidebarOpen(false)} className="fixed inset-0 z-40 bg-black/40 lg:hidden" />
              <motion.div initial={{ x: -256 }} animate={{ x: 0 }} exit={{ x: -256 }} transition={{ type: "tween", duration: 0.22 }}
                className="fixed left-0 top-0 z-50 h-full lg:hidden">
                <Sidebar />
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* ── Main content ── */}
        <main className="flex-1 overflow-y-auto">
          {/* Top bar */}
          <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-3 sticky top-0 z-10">
            {/* Mobile menu button */}
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden flex items-center justify-center w-8 h-8 rounded-lg hover:bg-gray-100 transition-colors text-gray-500">
              <SettingsIcon size={16} />
            </button>
            {/* Breadcrumb */}
            <nav className="flex items-center gap-1.5 text-sm text-gray-400">
              <button onClick={() => navigate("/homepage")} className="hover:text-gray-700 transition-colors flex items-center gap-1">
                <Home size={13} /> Home
              </button>
              <ChevronRight size={12} />
              <span className="text-gray-400">Settings</span>
              <ChevronRight size={12} />
              <span className="text-gray-900 font-semibold">{crumbLabel}</span>
            </nav>
          </div>

          {/* Panel content */}
          <div className="px-6 py-7">
            <h1 className="text-xl font-bold text-gray-900 mb-1">{crumbLabel}</h1>
            <div className="w-10 h-0.5 bg-blue-500 rounded-full mb-6" />

            <AnimatePresence mode="wait">
              <motion.div key={active} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>
                {active === "myaccount" && (
                  <MyAccountPanel user={user} onLogoutRequest={() => setShowLogoutConfirm(true)} />
                )}
                {active === "mynetwork" && <MyNetworkPanel />}
                {MANAGE_TYPES.includes(active) && (
                  <ReceiptInfoInline type={active} />
                )}
                {active === "myinfo" && <MyInformationPanel user={user} />}
                {(active === "driver" || active === "vehicle" || active === "property") && (
                  <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
                    <div className="w-16 h-16 rounded-full bg-yellow-50 flex items-center justify-center">
                      <Star size={28} className="text-yellow-400" />
                    </div>
                    <p className="text-base font-bold text-gray-700">Coming Soon</p>
                    <p className="text-sm text-gray-400">This feature is under development.</p>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>

      <LogoutConfirmationDialog isOpen={showLogoutConfirm} onClose={() => setShowLogoutConfirm(false)} onConfirm={handleLogout} />
    </div>
  );
};

/* ─── Logo grid sub-component ───────────────────────────── */
const LogoGrid = ({ options, selectedIndex, onSelect }) => {
  if (!options || options.length === 0) return null;
  return (
    <div>
      <p className="text-xs text-gray-400 mb-2">Select a logo (optional):</p>
      <div className="grid grid-cols-4 gap-2">
        {options.map((opt, i) => {
          const url = opt.displayUrl || opt.storeUrl;
          return (
            <button key={i} type="button"
              style={{ margin: 0, padding: 0, aspectRatio: "1" }}
              onClick={() => onSelect(i === selectedIndex ? null : i)}
              className={`relative rounded-xl border-2 overflow-hidden bg-gray-50 flex items-center justify-center transition-all ${selectedIndex === i ? "border-blue-500 ring-2 ring-blue-200" : "border-gray-200 hover:border-blue-300"}`}
            >
              <img src={url} alt="" style={{ width: "80%", height: "80%", objectFit: "contain" }} onError={e => { e.target.style.visibility = "hidden"; }} />
              {selectedIndex === i && (
                <div className="absolute bottom-0.5 right-0.5"><CheckCircle size={14} className="text-blue-600 bg-white rounded-full" /></div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

/* ─── Inline Manage (no modal, content directly in panel) ── */
const ReceiptInfoInline = ({ type }) => {
  const {
    receipts, updateReceipt,
    receiptMerchWImgRaw, customMerchants, hideMerchant, addCustomMerchant, editCustomMerchant, deleteCustomMerchant,
    receiptCategoriesRaw, customCategories, hideCategory, addCustomCategory, editCustomCategory, deleteCustomCategory,
    receiptPaymentsRaw, customPaymentMethods, hidePaymentMethod, addCustomPaymentMethod, editCustomPaymentMethod, deleteCustomPaymentMethod,
    taxData, addTax, updateTax, deleteTax, fetchTaxes,
    apiMerchants, fetchApiMerchants, addApiMerchant, updateApiMerchant, deleteApiMerchant,
    apiPaymentMethods, fetchApiPaymentMethods, addApiPaymentMethod, updateApiPaymentMethod, deleteApiPaymentMethod,
    apiExpenseCategories, fetchApiExpenseCategories, addApiExpenseCategory, updateApiExpenseCategory, deleteApiExpenseCategory,
  } = useData();

  useEffect(() => { if (type === "taxes") fetchTaxes(); }, [type, fetchTaxes]);
  useEffect(() => { if (type === "merchants") fetchApiMerchants(); }, [type]);
  useEffect(() => { if (type === "payments") fetchApiPaymentMethods(); }, [type]);
  useEffect(() => { if (type === "categories") fetchApiExpenseCategories(); }, [type]);

  const cfg    = MODAL_CFG[type];
  const colors = COLOR_MAP[cfg.color];

  const [search, setSearch]     = useState("");
  const [addVal, setAddVal]     = useState("");
  const [addTaxVal, setAddTaxVal] = useState({ tax_name: "", tax_rate: "", tax_number: "" });
  const [msg, setMsg]           = useState(null);

  // Edit state (unified for all non-tax item types)
  const [editKey, setEditKey]             = useState(null);   // item.key being edited
  const [editIsReceipt, setEditIsReceipt] = useState(false);  // is it a receipt-derived item?
  const [editVal, setEditVal]             = useState("");
  const [editOrigLogo, setEditOrigLogo]   = useState(null);   // logo before edit
  const [editLogoOpts, setEditLogoOpts]   = useState([]);
  const [editLogoSel, setEditLogoSel]     = useState(null);
  const [isFetchEditLogo, setIsFetchEditLogo] = useState(false);

  // Tax edit state
  const [editTaxKey, setEditTaxKey] = useState(null);
  const [editTaxVal, setEditTaxVal] = useState({ tax_name: "", tax_rate: "", tax_number: "" });

  // Merchant confirmation dialog state
  const [showMerchantEditConfirm, setShowMerchantEditConfirm] = useState(false);
  const [pendingMerchantEdit, setPendingMerchantEdit] = useState(null); // { item, newName, keepLogo }
  const [showMerchantDeleteConfirm, setShowMerchantDeleteConfirm] = useState(false);
  const [pendingMerchantDelete, setPendingMerchantDelete] = useState(null); // item

  // Add-merchant state
  const [newMerchantName, setNewMerchantName] = useState("");
  const [addLogoOpts, setAddLogoOpts]         = useState([]);
  const [addLogoSel, setAddLogoSel]           = useState(null);
  const [isFetchAddLogo, setIsFetchAddLogo]   = useState(false);

  // Add-payment state
  const [newCardType, setNewCardType]     = useState("");
  const [newIssuerName, setNewIssuerName] = useState("");
  const [newLast4, setNewLast4]           = useState("");

  // localStorage: merchant name → logo URL
  const [merchLogos, setMerchLogos] = useState(() => {
    try { return JSON.parse(localStorage.getItem("cat_merch_logos") || "{}"); } catch { return {}; }
  });
  const saveMerchLogo = (name, url) => {
    setMerchLogos(prev => {
      const next = { ...prev, [name]: url };
      localStorage.setItem("cat_merch_logos", JSON.stringify(next));
      return next;
    });
  };

  // localStorage: payment display string → card type name
  const [payCardMap, setPayCardMap] = useState(() => {
    try { return JSON.parse(localStorage.getItem("cat_pay_card_types") || "{}"); } catch { return {}; }
  });
  const savePayCard = (payStr, cardTypeName) => {
    setPayCardMap(prev => {
      const next = { ...prev, [payStr]: cardTypeName };
      localStorage.setItem("cat_pay_card_types", JSON.stringify(next));
      return next;
    });
  };

  // Build a map: display string (e.g. "My Card *4567") → card brand (e.g. "Diners Club")
  // derived from all receipts. This lets us resolve logos for custom-named payment methods
  // that were added via the Add/Edit Receipt modal (where the brand is in paymentType but
  // the display name is in card_issuer_name).
  const receiptDisplayToCardType = (() => {
    const map = {};
    (receipts || []).forEach(r => {
      const issuer = (r.card_issuer_name || r.cardIssuerName || "").toString().trim();
      const last4  = (r.last_4_digit_card || r.last4DigitCard || "").toString().trim();
      const brand  = (r.paymentType || r.payment_type || "").toString().trim();
      if (!issuer || issuer === "0" || !brand || brand === "0") return;
      const alreadyHasLast4 = last4 && last4 !== "0" && issuer.includes(`*${last4}`);
      const displayKey = (last4 && last4 !== "0" && !alreadyHasLast4)
        ? `${issuer} *${last4}`
        : issuer;
      if (!map[displayKey.toLowerCase()]) map[displayKey.toLowerCase()] = brand;
    });
    return map;
  })();

  // Get the correct logo for a payment string
  const getPayLogoResolved = (payStr) => {
    // Priority 1: localStorage mapping (saved when added via Settings)
    const stored = payCardMap[payStr];
    if (stored) {
      const found = PAYMENT_CARD_TYPES.find(c => c.name === stored);
      if (found) return found.logo;
    }
    // Priority 2: keyword detection on the display string itself
    const logo = getPaymentLogo(payStr);
    if (logo) return logo;
    // Priority 3: look up the card brand from receipts (covers custom-named payment methods
    // added via Add/Edit Receipt modal where brand is stored in paymentType, not display name)
    const brand = receiptDisplayToCardType[(payStr || "").toLowerCase()];
    if (brand) return getPaymentLogo(brand);
    return null;
  };

  const toast = (t, text) => { setMsg({ type: t, text }); setTimeout(() => setMsg(null), 3000); };

  // Generic logo fetch
  const doFetch = async (keyword, setFetching, setOpts, setSel) => {
    if (!keyword.trim()) return;
    setFetching(true); setOpts([]); setSel(null);
    try {
      const query = `${keyword.trim()} logo`;
      const res = await fetch(`/imagesearch?searchkeyword=${encodeURIComponent(query)}`, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`API returned ${res.status}`);

      let data;
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        data = await res.json();
      } else {
        const text = await res.text();
        try { data = JSON.parse(text); }
        catch {
          const urlMatch = text.match(/(https?:\/\/[^\s"']+\.(jpg|jpeg|png|gif|webp))/i);
          if (urlMatch) { setOpts([{ displayUrl: urlMatch[1], storeUrl: urlMatch[1] }]); return; }
          throw new Error("No valid image URL found");
        }
      }

      const isValidHttpUrl = (u) => u && /^https?:\/\//i.test(u);
      const logoEntries = [];

      // Primary format: array of {fullurl, thumburl, ...}
      if (Array.isArray(data) && data.length > 0) {
        for (const item of data) {
          if (item && typeof item === "object") {
            const fullUrl  = item.fullurl || item.url || item.image || item.src || item.link;
            const thumbUrl = item.thumburl || fullUrl;
            const storeUrl = fullUrl || thumbUrl;
            if (isValidHttpUrl(storeUrl)) {
              logoEntries.push({ displayUrl: isValidHttpUrl(thumbUrl) ? thumbUrl : storeUrl, storeUrl });
            }
          }
        }
      }

      // Object response: {images/results/data: [...]}
      if (typeof data === "object" && !Array.isArray(data)) {
        const arr = data.images || data.results || data.data || data.items || [];
        if (Array.isArray(arr) && arr.length > 0) {
          for (const item of arr) {
            if (item && typeof item === "object") {
              const fullUrl  = item.fullurl || item.url || item.image || item.src || item.link;
              const thumbUrl = item.thumburl || fullUrl;
              if (isValidHttpUrl(fullUrl)) {
                logoEntries.push({ displayUrl: isValidHttpUrl(thumbUrl) ? thumbUrl : fullUrl, storeUrl: fullUrl });
              }
            }
          }
        }
        const directUrl = data.url || data.image || data.src || data.link || data.fullurl;
        if (isValidHttpUrl(directUrl)) logoEntries.push({ displayUrl: directUrl, storeUrl: directUrl });
      }

      setOpts(logoEntries.slice(0, 8));
    } catch (e) { console.error("Logo fetch error:", e); }
    finally { setFetching(false); }
  };

  // ── Close edit helper ──
  const closeEdit = () => {
    setEditKey(null); setEditIsReceipt(false); setEditVal("");
    setEditOrigLogo(null); setEditLogoOpts([]); setEditLogoSel(null);
  };

  // ── ADD ──
  const handleAdd = async () => {
    if (type === "taxes") {
      const n = addTaxVal.tax_name.trim(), r = addTaxVal.tax_rate.toString().trim();
      if (!n || !r) return toast("error", "Name and rate are required.");
      try {
        await addTax({ tax_name: n, tax_rate: r, tax_number: addTaxVal.tax_number.trim(), fk_user_id: localStorage.getItem("fk_user_id") || "" });
        setAddTaxVal({ tax_name: "", tax_rate: "", tax_number: "" });
        toast("success", `"${n}" added.`);
      } catch (e) { toast("error", e.message || "Failed."); }
      return;
    }
    if (type === "merchants") {
      const name = newMerchantName.trim();
      if (!name) return toast("error", "Please enter Merchant Name");
      // Duplicate check (case-insensitive across all existing items)
      const allExisting = buildAllItems();
      if (allExisting.some(i => i.name.toLowerCase() === name.toLowerCase())) {
        return toast("error", "Merchant already exists");
      }
      const selectedUrl = addLogoSel !== null ? (addLogoOpts[addLogoSel]?.displayUrl || addLogoOpts[addLogoSel]?.storeUrl || null) : null;
      addCustomMerchant(name);
      if (selectedUrl) saveMerchLogo(name, selectedUrl);
      await addApiMerchant(name, selectedUrl || "");
      setNewMerchantName(""); setAddLogoOpts([]); setAddLogoSel(null);
      toast("success", "Merchant Added");
      return;
    }
    if (type === "payments") {
      const ct     = newCardType.trim();
      const issuer = newIssuerName.trim();
      const last4  = newLast4.trim();
      let payStr   = issuer ? (last4 ? `${issuer} *${last4}` : issuer) : (ct ? (last4 ? `${ct} *${last4}` : ct) : "");
      if (!payStr) return toast("error", "Select a card type or enter issuer name.");
      addCustomPaymentMethod(payStr);
      if (ct) savePayCard(payStr, ct);
      // Also persist to API
      await addApiPaymentMethod(payStr, "");
      setNewCardType(""); setNewIssuerName(""); setNewLast4("");
      toast("success", `"${payStr}" added.`);
      return;
    }
    if (type === "categories") {
      if (!addVal.trim()) return;
      const catName = addVal.trim();
      addCustomCategory(catName);
      await addApiExpenseCategory(catName);
      setAddVal("");
      toast("success", `"${catName}" added.`);
      return;
    }
    if (!addVal.trim()) return;
    setAddVal("");
  };

  // ── Merchant edit confirmed ──
  const doConfirmMerchantEdit = async () => {
    setShowMerchantEditConfirm(false);
    if (!pendingMerchantEdit) return;
    const { item, newName, keepLogo } = pendingMerchantEdit;
    try {
      if (item.isReceiptItem) {
        const matching = (receipts || []).filter(r => (r.storeName || r.store_name || "") === item.name);
        await Promise.all(matching.map(r => updateReceipt(r.id, { storeName: newName })));
        if (keepLogo) saveMerchLogo(newName, keepLogo);
        hideMerchant(item.key); addCustomMerchant(newName);
      } else if (item.isApiItem) {
        await updateApiMerchant(item.apiId, newName, keepLogo || "");
        if (keepLogo) saveMerchLogo(newName, keepLogo);
      } else {
        editCustomMerchant(item.key, newName);
        if (keepLogo) saveMerchLogo(newName, keepLogo);
      }
      toast("success", "Merchant Updated");
    } catch (e) { toast("error", e.message || "Update failed."); }
    closeEdit();
    setPendingMerchantEdit(null);
  };

  // ── Merchant delete confirmed ──
  const doConfirmMerchantDelete = async () => {
    setShowMerchantDeleteConfirm(false);
    if (!pendingMerchantDelete) return;
    const item = pendingMerchantDelete;
    try {
      if (item.isReceiptItem) {
        const matching = (receipts || []).filter(r => (r.storeName || r.store_name || "") === item.name);
        await Promise.all(matching.map(r => updateReceipt(r.id, { storeName: "Miscellaneous" })));
        hideMerchant(item.key);
      } else if (item.isApiItem) {
        await deleteApiMerchant(item.apiId);
      } else {
        deleteCustomMerchant(item.key);
      }
      toast("success", "Merchant deleted. Receipts updated to Miscellaneous.");
    } catch (e) { toast("error", e.message || "Delete failed."); }
    setPendingMerchantDelete(null);
  };

  // ── SAVE EDIT ──
  const handleSaveEdit = async (item) => {
    const newName = editVal.trim();
    if (!newName) return;
    const newLogoUrl = editLogoSel !== null ? (editLogoOpts[editLogoSel]?.displayUrl || editLogoOpts[editLogoSel]?.storeUrl || null) : null;
    const keepLogo   = newLogoUrl || editOrigLogo; // use new if picked, else keep original

    if (type === "taxes") {
      const n = editTaxVal.tax_name.trim(), r = editTaxVal.tax_rate.toString().trim();
      if (!n || !r) return;
      try { await updateTax({ ...taxData.find(t => t.id === editKey), tax_name: n, tax_rate: r, tax_number: editTaxVal.tax_number.trim() }); setEditTaxKey(null); }
      catch (e) { toast("error", e.message || "Failed."); }
      return;
    }

    // Merchants always require duplicate check + confirmation popup
    if (type === "merchants") {
      const allExisting = buildAllItems();
      if (allExisting.some(i => i.name.toLowerCase() === newName.toLowerCase() && i.key !== item.key)) {
        return toast("error", "Merchant already exists");
      }
      setPendingMerchantEdit({ item, newName, keepLogo });
      setShowMerchantEditConfirm(true);
      return;
    }

    try {
      if (item.isReceiptItem) {
        const currentName = item.name;
        if (type === "merchants") {
          const matching = (receipts || []).filter(r => (r.storeName || r.store_name || "") === currentName);
          await Promise.all(matching.map(r => updateReceipt(r.id, { storeName: newName })));
          if (keepLogo) saveMerchLogo(newName, keepLogo);
          hideMerchant(item.key); addCustomMerchant(newName);
        }
        if (type === "categories") {
          const matching = (receipts || []).filter(r => (r.expense_type || r.expenseType || "") === currentName);
          await Promise.all(matching.map(r => updateReceipt(r.id, { expense_type: newName })));
          hideCategory(item.key); addCustomCategory(newName);
        }
        if (type === "payments") {
          const matching = (receipts || []).filter(r => {
            const iss  = (r.card_issuer_name || r.cardIssuerName || "").trim();
            const l4   = (r.last_4_digit_card || r.last4DigitCard || "").trim();
            const disp = iss ? (l4 ? `${iss} *${l4}` : iss) : (r.paymentType || r.payment_type || "");
            return disp === currentName;
          });
          await Promise.all(matching.map(r => updateReceipt(r.id, { paymentType: newName })));
          hidePaymentMethod(item.key); addCustomPaymentMethod(newName);
        }
        toast("success", "Updated across all receipts.");
      } else if (item.isApiItem) {
        // API-backed item — update on server
        if (type === "merchants") {
          await updateApiMerchant(item.apiId, newName, keepLogo || "");
          if (keepLogo) saveMerchLogo(newName, keepLogo);
        }
        if (type === "payments") {
          await updateApiPaymentMethod(item.apiId, newName, "");
          if (newCardType) savePayCard(newName, newCardType);
        }
        if (type === "categories") {
          await updateApiExpenseCategory(item.apiId, newName);
        }
        toast("success", "Updated.");
      } else {
        // Custom item
        if (type === "merchants") {
          editCustomMerchant(item.key, newName);
          if (keepLogo) saveMerchLogo(newName, keepLogo);
        }
        if (type === "categories") editCustomCategory(item.key, newName);
        if (type === "payments")   editCustomPaymentMethod(item.key, newName);
      }
    } catch (e) { toast("error", e.message || "Update failed."); }
    closeEdit();
  };

  // ── DELETE ──
  const handleDelete = async (item) => {
    if (type === "taxes") { try { await deleteTax(item.key); } catch (e) { toast("error", e.message || "Failed."); } return; }

    // Merchants: block Miscellaneous deletion + require confirmation
    if (type === "merchants") {
      if ((item.name || "").toLowerCase() === "miscellaneous") {
        toast("error", '"Miscellaneous" cannot be deleted.');
        return;
      }
      setPendingMerchantDelete(item);
      setShowMerchantDeleteConfirm(true);
      return;
    }

    try {
      if (item.isReceiptItem) {
        const name = item.name;
        if (type === "merchants") {
          const matching = (receipts || []).filter(r => (r.storeName || r.store_name || "") === name);
          await Promise.all(matching.map(r => updateReceipt(r.id, { storeName: "Miscellaneous" })));
          hideMerchant(item.key);
        }
        if (type === "categories") {
          const matching = (receipts || []).filter(r => (r.expense_type || r.expenseType || "") === name);
          await Promise.all(matching.map(r => updateReceipt(r.id, { expense_type: "Miscellaneous" })));
          hideCategory(item.key);
        }
        if (type === "payments") {
          const matching = (receipts || []).filter(r => {
            const iss  = (r.card_issuer_name || r.cardIssuerName || "").trim();
            const l4   = (r.last_4_digit_card || r.last4DigitCard || "").trim();
            const disp = iss ? (l4 ? `${iss} *${l4}` : iss) : (r.paymentType || r.payment_type || "");
            return disp === name;
          });
          await Promise.all(matching.map(r => updateReceipt(r.id, { paymentType: "Cash" })));
          hidePaymentMethod(item.key);
        }
        toast("success", "Removed and reassigned in all receipts.");
      } else if (item.isApiItem) {
        // API-backed item — remove from local state (no server delete endpoint)
        if (type === "payments")    deleteApiPaymentMethod(item.apiId);
        if (type === "categories")  deleteApiExpenseCategory(item.apiId);
      } else {
        if (type === "merchants")  deleteCustomMerchant(item.key);
        if (type === "categories") deleteCustomCategory(item.key);
        if (type === "payments")   deleteCustomPaymentMethod(item.key);
      }
    } catch (e) { toast("error", e.message || "Delete failed."); }
  };

  // Build unified list (receipt-derived + custom + API, no dupes, no "Custom" label)
  const buildAllItems = () => {
    if (type === "merchants") {
      const rItems = receiptMerchWImgRaw.map(m => ({
        key: m.name, name: m.name,
        logo: merchLogos[m.name] || m.image || null,
        isReceiptItem: true,
        isApiItem: false,
      }));
      const rKeys = new Set(receiptMerchWImgRaw.map(m => m.name.toLowerCase()));
      const cItems = customMerchants
        .filter(m => !rKeys.has(m.toLowerCase()))
        .map(m => ({ key: m, name: m, logo: merchLogos[m] || null, isReceiptItem: false, isApiItem: false }));
      // API merchants (server-stored, shown below receipt-derived and custom)
      const allExistingKeys = new Set([...rItems.map(m => m.name.toLowerCase()), ...cItems.map(m => m.name.toLowerCase())]);
      const apiItems = (apiMerchants || [])
        .filter(m => m.store_name && !allExistingKeys.has((m.store_name || "").toLowerCase()))
        .map(m => ({
          key: `api_${m.id}`,
          name: m.store_name,
          logo: m.store_image_url || null,
          isReceiptItem: false,
          apiId: m.id,
          isApiItem: true,
        }));
      return [...rItems, ...cItems, ...apiItems];
    }
    if (type === "categories") {
      const rItems = receiptCategoriesRaw.map(c => ({ key: c, name: c, logo: null, isReceiptItem: true, isApiItem: false }));
      const rKeys  = new Set(receiptCategoriesRaw.map(c => c.toLowerCase()));
      const cItems = customCategories
        .filter(c => !rKeys.has(c.toLowerCase()))
        .map(c => ({ key: c, name: c, logo: null, isReceiptItem: false, isApiItem: false }));
      // API expense categories not already present from receipts or custom
      const allExistingCatKeys = new Set([...rItems.map(c => c.name.toLowerCase()), ...cItems.map(c => c.name.toLowerCase())]);
      const apiItems = (apiExpenseCategories || [])
        .filter(c => c.expense_category_name && !allExistingCatKeys.has((c.expense_category_name || "").toLowerCase()))
        .map(c => ({
          key: `api_${c.id}`,
          name: c.expense_category_name,
          logo: null,
          isReceiptItem: false,
          isApiItem: true,
          apiId: c.id,
        }));
      return [...rItems, ...cItems, ...apiItems];
    }
    if (type === "payments") {
      const rItems = receiptPaymentsRaw.map(p => ({ key: p, name: p, logo: getPayLogoResolved(p), isReceiptItem: true, isApiItem: false }));
      const rKeys  = new Set(receiptPaymentsRaw.map(p => p.toLowerCase()));
      const cItems = customPaymentMethods
        .filter(p => !rKeys.has(p.toLowerCase()))
        .map(p => ({ key: p, name: p, logo: getPayLogoResolved(p), isReceiptItem: false, isApiItem: false }));
      // API payment methods not already in receipt-derived or custom lists
      const allExistingPayKeys = new Set([...rItems.map(p => p.name.toLowerCase()), ...cItems.map(p => p.name.toLowerCase())]);
      const apiItems = (apiPaymentMethods || [])
        .filter(m => m.card_number && !allExistingPayKeys.has((m.card_number || "").toLowerCase()))
        .map(m => ({
          key: `api_${m.id}`,
          name: m.card_number,
          logo: getPayLogoResolved(m.card_number),
          isReceiptItem: false,
          isApiItem: true,
          apiId: m.id,
        }));
      return [...rItems, ...cItems, ...apiItems];
    }
    return [];
  };

  const taxItems = type === "taxes"
    ? taxData.filter(t => (t.tax_name || "").toLowerCase().includes(search.toLowerCase()))
    : [];
  const allItems = type !== "taxes"
    ? buildAllItems().filter(i => i.name.toLowerCase().includes(search.toLowerCase()))
    : [];

  const mInput = "flex-1 min-w-0 bg-white border border-gray-200 text-gray-900 text-sm rounded-xl px-3 py-2 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all";
  const Btn = ({ color, onClick, children }) => (
    <button type="button" onClick={onClick} style={{ margin: 0, padding: 0, width: 28, height: 28, flexShrink: 0 }}
      className={`flex items-center justify-center rounded-lg text-white text-xs transition-all ${color}`}>
      {children}
    </button>
  );

  return (
    <>
    <div className="max-w-lg flex flex-col gap-4">

      {/* ── Add form ── */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col gap-3">

        {type === "taxes" && (
          <>
            <div className="flex gap-2">
              <input className={mInput} placeholder="Tax name (e.g. GST)" value={addTaxVal.tax_name} onChange={e => setAddTaxVal(p => ({ ...p, tax_name: e.target.value }))} />
              <input className={`${mInput} max-w-[80px]`} placeholder="Rate %" value={addTaxVal.tax_rate} onChange={e => setAddTaxVal(p => ({ ...p, tax_rate: e.target.value }))} />
            </div>
            <div className="flex gap-2">
              <input className={mInput} placeholder="Tax number (optional)" value={addTaxVal.tax_number} onChange={e => setAddTaxVal(p => ({ ...p, tax_number: e.target.value }))} />
              <button type="button" onClick={handleAdd} className={`px-4 py-2 rounded-xl text-white text-sm font-semibold flex-shrink-0 ${colors.btn}`}>Add</button>
            </div>
          </>
        )}

        {type === "merchants" && (
          <>
            <div className="flex gap-2">
              <input className={mInput} placeholder="New merchant name…" value={newMerchantName}
                onChange={e => { setNewMerchantName(e.target.value); setAddLogoOpts([]); setAddLogoSel(null); }}
                onKeyDown={e => e.key === "Enter" && handleAdd()} />
              <button type="button"
                onClick={() => doFetch(newMerchantName, setIsFetchAddLogo, setAddLogoOpts, setAddLogoSel)}
                disabled={!newMerchantName.trim() || isFetchAddLogo}
                className="px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-medium flex-shrink-0 disabled:opacity-40 transition-all flex items-center gap-1.5">
                {isFetchAddLogo
                  ? <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                  : <Search size={14} />} Logo
              </button>
              <button type="button" onClick={handleAdd}  className={`px-4 py-2 rounded-xl text-white text-sm font-semibold flex-shrink-0 ${colors.btn}`}>Add</button>
            </div>
            <LogoGrid options={addLogoOpts} selectedIndex={addLogoSel} onSelect={setAddLogoSel} />
          </>
        )}

        {type === "payments" && (
          <>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Select Card Type</p>
            <div className="grid grid-cols-3 gap-2">
              {PAYMENT_CARD_TYPES.map(ct => (
                <button key={ct.name} type="button"
                  style={{ margin: 0, padding: 0 }}
                  onClick={() => setNewCardType(prev => prev === ct.name ? "" : ct.name)}
                  className={`flex flex-col items-center gap-1 py-2 px-1 rounded-xl border-2 transition-all cursor-pointer ${newCardType === ct.name ? "border-blue-500 bg-blue-50 ring-2 ring-blue-200" : "border-gray-200 bg-white hover:border-blue-300"}`}>
                  <img src={ct.logo} alt={ct.name} style={{ height: 30, width: 52, objectFit: "contain", display: "block", margin: 0, padding: 0 }} />
                  <span className="text-[10px] font-medium text-gray-600 text-center leading-tight block">{ct.name}</span>
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input className={mInput} placeholder="Card issuer / bank name (optional)" value={newIssuerName} onChange={e => setNewIssuerName(e.target.value)} />
              <input className={`${mInput} max-w-[110px]`} placeholder="Last 4 digits" value={newLast4} maxLength={4}
                onChange={e => setNewLast4(e.target.value.replace(/\D/g, "").slice(0, 4))} />
            </div>
            <button type="button" onClick={handleAdd}  className={`px-4 py-2 rounded-xl text-white text-sm font-semibold self-start ${colors.btn}`}>Add Payment Method</button>
          </>
        )}

        {type === "categories" && (
          <div className="flex gap-2">
            <input className={mInput} placeholder={cfg.addPlaceholder} value={addVal} onChange={e => setAddVal(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAdd()} />
            <button type="button" onClick={handleAdd}  className={`px-4 py-2 rounded-xl text-white text-sm font-semibold flex-shrink-0 ${colors.btn}`}>Add</button>
          </div>
        )}

        <AnimatePresence>
          {msg && (
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className={`flex items-center gap-2 text-xs px-3 py-2 rounded-xl ${msg.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-600 border border-red-200"}`}>
              {msg.type === "success" ? <CheckCircle size={13}/> : <AlertCircle size={13}/>} {msg.text}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Search ── */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input className="w-full bg-white border border-gray-200 text-sm text-gray-900 rounded-xl pl-8 pr-8 py-2.5 placeholder-gray-400 focus:outline-none focus:border-blue-400 transition-all shadow-sm"
          placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
        {search && <button type="button" onClick={() => setSearch("")}  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 w-5 h-5 flex items-center justify-center"><X size={13}/></button>}
      </div>

      {/* ── List ── */}
      <div className="flex flex-col gap-1.5">

        {/* Taxes */}
        {type === "taxes" && (
          taxItems.length === 0
            ? <p className="text-sm text-gray-400 text-center py-8">No tax types yet.</p>
            : taxItems.map(tax => {
                const isEd = editTaxKey === tax.id;
                return (
                  <div key={tax.id}>
                    {isEd ? (
                      <div className="flex flex-col gap-2 bg-blue-50 border border-blue-200 rounded-xl p-3">
                        <div className="flex gap-2">
                          <input className={mInput} value={editTaxVal.tax_name} onChange={e => setEditTaxVal(p => ({ ...p, tax_name: e.target.value }))} placeholder="Name" />
                          <input className={`${mInput} max-w-[80px]`} value={editTaxVal.tax_rate} onChange={e => setEditTaxVal(p => ({ ...p, tax_rate: e.target.value }))} placeholder="Rate %" />
                        </div>
                        <div className="flex gap-2">
                          <input className={mInput} value={editTaxVal.tax_number} onChange={e => setEditTaxVal(p => ({ ...p, tax_number: e.target.value }))} placeholder="Tax number (optional)" />
                          <button type="button" onClick={async () => {
                            const n = editTaxVal.tax_name.trim(), r = editTaxVal.tax_rate.toString().trim();
                            if (!n || !r) return;
                            try { await updateTax({ ...taxData.find(t => t.id === editTaxKey), tax_name: n, tax_rate: r, tax_number: editTaxVal.tax_number.trim() }); setEditTaxKey(null); }
                            catch (e) { toast("error", e.message || "Failed."); }
                          }} style={{ margin: 0 }} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg flex-shrink-0">Save</button>
                          <button type="button" onClick={() => setEditTaxKey(null)} style={{ margin: 0 }} className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-semibold rounded-lg flex-shrink-0">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <ItemRow name={tax.tax_name} sublabel={tax.tax_number ? `#${tax.tax_number}` : undefined} badge={`${tax.tax_rate}%`} badgeCls={colors.badge}
                        actions={<>
                          <Btn color="bg-blue-500 hover:bg-blue-600" onClick={() => { setEditTaxKey(tax.id); setEditTaxVal({ tax_name: tax.tax_name, tax_rate: tax.tax_rate, tax_number: tax.tax_number || "" }); }}><Pencil size={13}/></Btn>
                          <Btn color="bg-red-400 hover:bg-red-500" onClick={async () => { try { await deleteTax(tax.id); } catch (e) { toast("error", e.message || "Failed."); } }}><Trash2 size={13}/></Btn>
                        </>}
                      />
                    )}
                  </div>
                );
              })
        )}

        {/* Merchants / Categories / Payments — unified list */}
        {type !== "taxes" && (
          allItems.length === 0
            ? <p className="text-sm text-gray-400 text-center py-8">No {cfg.label.toLowerCase()} yet.</p>
            : allItems.map(item => {
                const isEd = editKey === item.key;
                // resolve logo shown in list: prefer merchant logo map, then item logo
                const displayLogo = type === "merchants"
                  ? (merchLogos[item.name] || item.logo)
                  : item.logo;
                return (
                  <div key={item.key}>
                    {isEd ? (
                      <div className="flex flex-col gap-2 bg-blue-50 border border-blue-200 rounded-xl p-3">
                        {/* Edit row */}
                        <div className="flex items-center gap-2">
                          {/* Show current/new logo preview */}
                          {type === "merchants" && (
                            <ItemLogo
                              logo={editLogoSel !== null ? (editLogoOpts[editLogoSel]?.displayUrl || editLogoOpts[editLogoSel]?.storeUrl) : editOrigLogo}
                              name={editVal || item.name}
                            />
                          )}
                          <input className={mInput} value={editVal} onChange={e => setEditVal(e.target.value)} placeholder={item.name} />
                          {/* Logo search button (merchants only) */}
                          {type === "merchants" && (
                            <button type="button" style={{ margin: 0 }}
                              onClick={() => doFetch(editVal || item.name, setIsFetchEditLogo, setEditLogoOpts, setEditLogoSel)}
                              disabled={isFetchEditLogo}
                              className="p-2 rounded-xl bg-white border border-gray-200 text-gray-500 flex-shrink-0 disabled:opacity-40 flex items-center justify-center">
                              {isFetchEditLogo
                                ? <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                                : <Search size={13} />}
                            </button>
                          )}
                          <button type="button" onClick={() => handleSaveEdit(item)} style={{ margin: 0 }} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg flex-shrink-0">Save</button>
                          <button type="button" onClick={closeEdit} style={{ margin: 0 }} className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-semibold rounded-lg flex-shrink-0">Cancel</button>
                        </div>
                        {/* Logo search results (edit mode, merchants) */}
                        {type === "merchants" && <LogoGrid options={editLogoOpts} selectedIndex={editLogoSel} onSelect={setEditLogoSel} />}
                      </div>
                    ) : (
                      <ItemRow logo={displayLogo} name={item.name} badgeCls={colors.badge}
                        actions={<>
                          <Btn color="bg-blue-500 hover:bg-blue-600" onClick={() => {
                            setEditKey(item.key); setEditIsReceipt(item.isReceiptItem);
                            setEditVal(item.name); setEditOrigLogo(displayLogo);
                            setEditLogoOpts([]); setEditLogoSel(null);
                          }}><Pencil size={13}/></Btn>
                          <Btn color="bg-red-400 hover:bg-red-500" onClick={() => handleDelete(item)}><Trash2 size={13}/></Btn>
                        </>}
                      />
                    )}
                  </div>
                );
              })
        )}

      </div>
    </div>

    {/* Merchant Edit Confirmation Popup */}
    <AnimatePresence>
      {showMerchantEditConfirm && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <motion.div initial={{ scale: 0.95, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 12 }}
            className="bg-white rounded-2xl p-6 max-w-xs w-full shadow-2xl text-center">
            <p className="text-sm font-medium text-gray-800 leading-relaxed mb-5">
              When editing a Merchant<br />
              all receipts associated with that<br />
              Merchant will also be updated.
            </p>
            <div className="flex gap-3">
              <button type="button"
                onClick={() => { setShowMerchantEditConfirm(false); setPendingMerchantEdit(null); }}
                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 rounded-xl text-gray-700 font-semibold text-sm transition-colors">
                Cancel
              </button>
              <button type="button" onClick={doConfirmMerchantEdit}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-xl text-white font-semibold text-sm transition-colors">
                Okay
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>

    {/* Merchant Delete Confirmation Popup */}
    <AnimatePresence>
      {showMerchantDeleteConfirm && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <motion.div initial={{ scale: 0.95, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 12 }}
            className="bg-white rounded-2xl p-6 max-w-xs w-full shadow-2xl text-center">
            <p className="text-sm font-medium text-gray-800 leading-relaxed mb-5">
              Are you sure you want to delete this<br />
              Merchant? If so, then all Receipts<br />
              associated with this Merchant will<br />
              now be associated with the<br />
              &quot;Miscellaneous&quot; Merchant.
            </p>
            <div className="flex gap-3">
              <button type="button"
                onClick={() => { setShowMerchantDeleteConfirm(false); setPendingMerchantDelete(null); }}
                className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 rounded-xl text-gray-700 font-semibold text-sm transition-colors">
                Cancel
              </button>
              <button type="button" onClick={doConfirmMerchantDelete}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 rounded-xl text-white font-semibold text-sm transition-colors">
                Delete
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    </>
  );
};

export default Settings;
