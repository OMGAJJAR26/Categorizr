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

import visaLogo       from "../assets/payment/Visa.png";
import mastercardLogo from "../assets/payment/MasterCard.png";
import amexLogo       from "../assets/payment/AmericanExpress.webp";
import paypalLogo     from "../assets/payment/PayPal.png";
import cashLogo       from "../assets/payment/Cash.jpg";
import debitLogo      from "../assets/payment/DebitCard.webp";
import dinersLogo     from "../assets/payment/DinersClub.png";
import discoverLogo   from "../assets/payment/discover.png";

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
    if (type === "merchants")  return receiptMerchWImgRaw.map(m => ({ key: m.name, name: m.name, logo: m.image || null }));
    if (type === "categories") return receiptCategoriesRaw.map(c => ({ key: c, name: c, logo: null }));
    if (type === "payments")   return receiptPaymentsRaw.map(p => ({ key: p, name: p, logo: getPaymentLogo(p) }));
    return [];
  };
  const buildCustomItems = () => {
    if (type === "merchants")  return customMerchants.map(m => ({ key: m, name: m, logo: null }));
    if (type === "categories") return customCategories.map(c => ({ key: c, name: c, logo: null }));
    if (type === "payments")   return customPaymentMethods.map(p => ({ key: p, name: p, logo: getPaymentLogo(p) }));
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
          <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm py-2.5 rounded-xl transition-all">Update</button>
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
          <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm py-2.5 rounded-xl transition-all">Reset Password</button>
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
            {email ? <QRCodeSVG value={email} size={120} bgColor="#ffffff" fgColor="#1e293b" /> : (
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
  const { clearAllData, user, merchants, expenseCategories, paymentMethods, taxData } = useData();

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
                  <ReceiptInfoInline type={active} merchants={merchants} expenseCategories={expenseCategories} paymentMethods={paymentMethods} taxData={taxData} />
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

/* ─── Inline Manage (no modal, content directly in panel) ── */
const ReceiptInfoInline = ({ type, merchants, expenseCategories, paymentMethods, taxData: taxDataProp }) => {
  const {
    receiptMerchWImgRaw, customMerchants, hideMerchant, addCustomMerchant, editCustomMerchant, deleteCustomMerchant,
    receiptCategoriesRaw, customCategories, hideCategory, addCustomCategory, editCustomCategory, deleteCustomCategory,
    receiptPaymentsRaw, customPaymentMethods, hidePaymentMethod, addCustomPaymentMethod, editCustomPaymentMethod, deleteCustomPaymentMethod,
    taxData, addTax, updateTax, deleteTax, fetchTaxes,
  } = useData();

  useEffect(() => { if (type === "taxes") fetchTaxes(); }, [type, fetchTaxes]);

  const cfg    = MODAL_CFG[type];
  const colors = COLOR_MAP[cfg.color];
  const [search, setSearch]                 = useState("");
  const [addVal, setAddVal]                 = useState("");
  const [addTaxVal, setAddTaxVal]           = useState({ tax_name: "", tax_rate: "", tax_number: "" });
  const [editKey, setEditKey]               = useState(null);
  const [editVal, setEditVal]               = useState("");
  const [editTaxKey, setEditTaxKey]         = useState(null);
  const [editTaxVal, setEditTaxVal]         = useState({ tax_name: "", tax_rate: "", tax_number: "" });
  const [editReceiptKey, setEditReceiptKey] = useState(null);
  const [editReceiptVal, setEditReceiptVal] = useState("");
  const [msg, setMsg]                       = useState(null);

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
    if (type === "merchants")  return receiptMerchWImgRaw.map(m => ({ key: m.name, name: m.name, logo: m.image || null }));
    if (type === "categories") return receiptCategoriesRaw.map(c => ({ key: c, name: c, logo: null }));
    if (type === "payments")   return receiptPaymentsRaw.map(p => ({ key: p, name: p, logo: getPaymentLogo(p) }));
    return [];
  };
  const buildCustomItems = () => {
    if (type === "merchants")  return customMerchants.map(m => ({ key: m, name: m, logo: null }));
    if (type === "categories") return customCategories.map(c => ({ key: c, name: c, logo: null }));
    if (type === "payments")   return customPaymentMethods.map(p => ({ key: p, name: p, logo: getPaymentLogo(p) }));
    return [];
  };

  const receiptItems = buildReceiptItems().filter(i => i.name.toLowerCase().includes(search.toLowerCase()));
  const customItems  = buildCustomItems().filter(i => i.name.toLowerCase().includes(search.toLowerCase()));
  const taxItems     = type === "taxes" ? taxData.filter(t => (t.tax_name || "").toLowerCase().includes(search.toLowerCase())) : [];
  const mInput = "flex-1 min-w-0 bg-white border border-gray-200 text-gray-900 text-sm rounded-xl px-3 py-2 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all";
  const ab = (color, onClick, children) => (
    <button onClick={onClick} className={`flex items-center justify-center w-7 h-7 rounded-lg text-white text-xs transition-all ${color}`}>{children}</button>
  );

  return (
    <div className="max-w-lg flex flex-col gap-4">
      {/* Add form */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
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
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input className="w-full bg-white border border-gray-200 text-sm text-gray-900 rounded-xl pl-8 pr-8 py-2.5 placeholder-gray-400 focus:outline-none focus:border-blue-400 transition-all shadow-sm"
          placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
        {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={13}/></button>}
      </div>

      {/* List */}
      <div className="flex flex-col gap-2">
        {type === "taxes" ? (
          taxItems.length === 0 ? <p className="text-sm text-gray-400 text-center py-8">No tax types yet.</p> :
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
              <p className="text-sm text-gray-400 text-center py-8">No {cfg.label.toLowerCase()} yet.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Settings;
