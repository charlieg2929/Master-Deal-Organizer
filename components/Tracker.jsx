"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import Papa from "papaparse";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabaseClient";

const CATEGORIES = ["Multifamily", "Lots", "Single-Family", "Commercial"];
const STATUSES = ["New", "Attempted", "Contacted", "Nurturing", "Under Contract", "Not Interested", "Dead"];
const TOUCH_TYPES = ["Call", "Text", "Email", "Door Knock", "Voicemail", "Note"];
const IMPORT_FIELDS = ["Ignore", "Address", "Owner Name", "Phone", "Email", "Category", "Unit Count", "Notes"];

function toPropertyRow(p) {
  return {
    id: p.id,
    address: p.address,
    category: p.category,
    status: p.status,
    owner_name: p.ownerName || null,
    phone: p.phone || null,
    email: p.email || null,
    unit_count: p.unitCount || null,
    lot_size: p.lotSize || null,
    opportunity_score: p.opportunityScore || null,
    initial_thoughts: p.initialThoughts || null,
    created_at: p.createdAt,
    touchpoints: p.touchpoints || [],
  };
}

function fromPropertyRow(r) {
  return {
    id: r.id,
    address: r.address || "",
    category: r.category || "Multifamily",
    status: r.status || "New",
    ownerName: r.owner_name || "",
    phone: r.phone || "",
    email: r.email || "",
    unitCount: r.unit_count || "",
    lotSize: r.lot_size || "",
    opportunityScore: r.opportunity_score || "",
    initialThoughts: r.initial_thoughts || "",
    createdAt: r.created_at,
    touchpoints: r.touchpoints || [],
  };
}

function toContactRow(c) {
  return {
    id: c.id,
    name: c.name,
    role: c.role,
    company: c.company || null,
    phone: c.phone || null,
    email: c.email || null,
    notes: c.notes || null,
    created_at: c.createdAt,
    touchpoints: c.touchpoints || [],
  };
}

function fromContactRow(r) {
  return {
    id: r.id,
    name: r.name || "",
    role: r.role || "Broker",
    company: r.company || "",
    phone: r.phone || "",
    email: r.email || "",
    notes: r.notes || "",
    createdAt: r.created_at,
    touchpoints: r.touchpoints || [],
  };
}

function uid() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Date.now() + "-" + Math.random().toString(36).slice(2);
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function daysSince(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((now - d) / 86400000);
}

function formatDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function lastTouch(p) {
  if (!p.touchpoints || p.touchpoints.length === 0) return null;
  return p.touchpoints.reduce((max, t) => (t.date > max ? t.date : max), p.touchpoints[0].date);
}

function urgency(p) {
  const lt = lastTouch(p);
  if (!lt) return "never";
  const d = daysSince(lt);
  if (d <= 7) return "fresh";
  if (d <= 21) return "due";
  return "overdue";
}

function urgencyLabel(p) {
  const lt = lastTouch(p);
  if (!lt) return "Never contacted";
  const d = daysSince(lt);
  if (d === 0) return "Touched today";
  if (d === 1) return "1 day ago";
  return d + " days ago";
}

function normalizePhone(s) {
  return (s || "").replace(/\D/g, "");
}

function sortWeight(p) {
  const u = urgency(p);
  if (u === "never") return 99999;
  const lt = lastTouch(p);
  return daysSince(lt);
}

function scoreTier(score) {
  if (!score) return "never";
  const s = Number(score);
  if (s >= 8) return "fresh";
  if (s >= 5) return "due";
  return "overdue";
}

const UNIT_COUNTS = ["2", "3", "4", "5", "6-9", "10-19", "20-49", "50+"];
const LOT_SIZES = ["0.25 acre", "0.5 acre", "1 acre", "2 acres", "5 acres", "10+ acres"];
const CONTACT_ROLES = ["Broker", "Investor", "Lender", "Attorney", "Contractor", "Other"];

const emptyProspect = () => ({
  id: uid(),
  address: "",
  category: "Multifamily",
  status: "New",
  ownerName: "",
  phone: "",
  email: "",
  unitCount: "",
  lotSize: "",
  opportunityScore: "",
  initialThoughts: "",
  createdAt: todayStr(),
  touchpoints: [],
});

const emptyContact = () => ({
  id: uid(),
  name: "",
  role: "Broker",
  company: "",
  phone: "",
  email: "",
  notes: "",
  createdAt: todayStr(),
  touchpoints: [],
});

export default function FieldLedger() {
  const [activeTab, setActiveTab] = useState("properties");

  const [prospects, setProspects] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [filterCat, setFilterCat] = useState("All");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [quickLog, setQuickLog] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [toast, setToast] = useState("");
  const toastTimer = useRef(null);

  const [contacts, setContacts] = useState([]);
  const [contactsLoaded, setContactsLoaded] = useState(false);
  const [filterRole, setFilterRole] = useState("All");
  const [contactSearch, setContactSearch] = useState("");
  const [selectedContactId, setSelectedContactId] = useState(null);
  const [editingContact, setEditingContact] = useState(null);
  const [contactQuickLog, setContactQuickLog] = useState(null);

  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.from("properties").select("*").order("created_at", { ascending: false });
        if (!error && data) setProspects(data.map(fromPropertyRow));
      } catch (e) {
        console.error("Load error", e);
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase.from("contacts").select("*").order("created_at", { ascending: false });
        if (!error && data) setContacts(data.map(fromContactRow));
      } catch (e) {
        console.error("Load error", e);
      } finally {
        setContactsLoaded(true);
      }
    })();
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  function showToast(msg) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2200);
  }

  function upsertProspect(data) {
    setProspects((prev) => {
      const exists = prev.some((p) => p.id === data.id);
      return exists ? prev.map((p) => (p.id === data.id ? data : p)) : [data, ...prev];
    });
    supabase.from("properties").upsert(toPropertyRow(data)).then(({ error }) => {
      if (error) { console.error("Save error", error); showToast("Couldn't save — check your connection"); }
    });
  }

  function deleteProspect(id) {
    setProspects((prev) => prev.filter((p) => p.id !== id));
    setSelectedId(null);
    showToast("Prospect removed");
    supabase.from("properties").delete().eq("id", id).then(({ error }) => {
      if (error) console.error("Delete error", error);
    });
  }

  function addTouchpoint(prospectId, tp) {
    let updatedRow = null;
    setProspects((prev) =>
      prev.map((p) => {
        if (p.id !== prospectId) return p;
        updatedRow = { ...p, touchpoints: [...p.touchpoints, { ...tp, id: uid() }] };
        return updatedRow;
      })
    );
    if (updatedRow) {
      supabase.from("properties").update({ touchpoints: updatedRow.touchpoints }).eq("id", prospectId).then(({ error }) => {
        if (error) console.error("Save error", error);
      });
    }
  }

  function upsertContact(data) {
    setContacts((prev) => {
      const exists = prev.some((c) => c.id === data.id);
      return exists ? prev.map((c) => (c.id === data.id ? data : c)) : [data, ...prev];
    });
    supabase.from("contacts").upsert(toContactRow(data)).then(({ error }) => {
      if (error) { console.error("Save error", error); showToast("Couldn't save — check your connection"); }
    });
  }

  function deleteContact(id) {
    setContacts((prev) => prev.filter((c) => c.id !== id));
    setSelectedContactId(null);
    showToast("Contact removed");
    supabase.from("contacts").delete().eq("id", id).then(({ error }) => {
      if (error) console.error("Delete error", error);
    });
  }

  function addContactTouchpoint(contactId, tp) {
    let updatedRow = null;
    setContacts((prev) =>
      prev.map((c) => {
        if (c.id !== contactId) return c;
        updatedRow = { ...c, touchpoints: [...c.touchpoints, { ...tp, id: uid() }] };
        return updatedRow;
      })
    );
    if (updatedRow) {
      supabase.from("contacts").update({ touchpoints: updatedRow.touchpoints }).eq("id", contactId).then(({ error }) => {
        if (error) console.error("Save error", error);
      });
    }
  }

  const stats = useMemo(() => {
    const total = prospects.length;
    const overdue = prospects.filter((p) => urgency(p) === "overdue" || urgency(p) === "never").length;
    const weekAgo = todayStr();
    const touchedThisWeek = prospects.filter((p) => {
      const lt = lastTouch(p);
      return lt && daysSince(lt) <= 7;
    }).length;
    return { total, overdue, touchedThisWeek };
  }, [prospects]);

  const filtered = useMemo(() => {
    let list = prospects;
    if (filterCat !== "All") list = list.filter((p) => p.category === filterCat);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.address.toLowerCase().includes(q) ||
          (p.ownerName || "").toLowerCase().includes(q) ||
          (p.phone || "").includes(q)
      );
    }
    return [...list].sort((a, b) => sortWeight(b) - sortWeight(a));
  }, [prospects, filterCat, search]);

  const selected = prospects.find((p) => p.id === selectedId) || null;

  const contactStats = useMemo(() => {
    const total = contacts.length;
    const overdue = contacts.filter((c) => urgency(c) === "overdue" || urgency(c) === "never").length;
    const touchedThisWeek = contacts.filter((c) => {
      const lt = lastTouch(c);
      return lt && daysSince(lt) <= 7;
    }).length;
    return { total, overdue, touchedThisWeek };
  }, [contacts]);

  const filteredContacts = useMemo(() => {
    let list = contacts;
    if (filterRole !== "All") list = list.filter((c) => c.role === filterRole);
    if (contactSearch.trim()) {
      const q = contactSearch.trim().toLowerCase();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.company || "").toLowerCase().includes(q) ||
          (c.phone || "").includes(q)
      );
    }
    return [...list].sort((a, b) => sortWeight(b) - sortWeight(a));
  }, [contacts, filterRole, contactSearch]);

  const selectedContact = contacts.find((c) => c.id === selectedContactId) || null;

  if (!loaded || !contactsLoaded) {
    return (
      <div className="flt" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 200 }}>
        <p style={{ color: "#9FB2C3", fontFamily: "'Inter', sans-serif", fontSize: 14 }}>Loading your ledger…</p>
      </div>
    );
  }

  return (
    <div className="flt">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Special+Elite&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
        .flt {
          --ink: #16283A;
          --ink-soft: #2C4A63;
          --parchment: #F3EEDF;
          --parchment-dim: #E9E2CC;
          --brass: #C1863A;
          --brass-deep: #9C6B28;
          --sage: #5C8A66;
          --sage-bg: #E4EDE3;
          --clay: #A8452F;
          --clay-bg: #F2E0D8;
          --slate: #6E8299;
          --slate-bg: #E4E9EE;
          --amber-bg: #F3E4CB;
          font-family: 'Inter', sans-serif;
          background: var(--ink);
          color: var(--parchment);
          border-radius: 14px;
          padding: 20px;
          box-sizing: border-box;
          width: 100%;
        }
        .flt * { box-sizing: border-box; }
        .flt-header {
          display: flex; justify-content: space-between; align-items: flex-start;
          flex-wrap: wrap; gap: 14px; margin-bottom: 16px;
        }
        .flt-title {
          font-family: 'Special Elite', monospace;
          font-size: 22px; letter-spacing: 0.5px; margin: 0; color: var(--parchment);
        }
        .flt-subtitle { font-size: 12px; color: #9FB2C3; margin: 4px 0 0; letter-spacing: 0.3px; }
        .flt-stats { display: flex; gap: 18px; margin-top: 10px; flex-wrap: wrap; }
        .flt-stat { display: flex; flex-direction: column; }
        .flt-stat-num { font-family: 'IBM Plex Mono', monospace; font-size: 18px; font-weight: 500; }
        .flt-stat-label { font-size: 11px; color: #9FB2C3; text-transform: uppercase; letter-spacing: 0.5px; }
        .flt-actions { display: flex; gap: 8px; flex-wrap: wrap; }
        .flt-btn {
          font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 500;
          padding: 8px 14px; border-radius: 6px; cursor: pointer;
          border: 1px solid rgba(243,238,223,0.25); background: transparent; color: var(--parchment);
          transition: background 0.15s, transform 0.1s;
        }
        .flt-btn:hover { background: rgba(243,238,223,0.08); }
        .flt-btn:active { transform: scale(0.97); }
        .flt-btn-primary { background: var(--brass); border-color: var(--brass); color: #23150A; }
        .flt-btn-primary:hover { background: var(--brass-deep); }
        .flt-btn-danger { border-color: var(--clay); color: #F2C9BC; }
        .flt-btn-danger:hover { background: rgba(168,69,47,0.25); }
        .flt-tabs {
          display: flex; gap: 4px; margin-bottom: 16px; background: rgba(243,238,223,0.06);
          border-radius: 8px; padding: 4px; width: fit-content;
        }
        .flt-tab {
          font-family: 'Inter', sans-serif; font-size: 13px; font-weight: 500; padding: 7px 16px;
          border-radius: 6px; cursor: pointer; border: none; background: transparent; color: #9FB2C3;
        }
        .flt-tab.active { background: var(--parchment); color: var(--ink); }
        .flt-filters {
          display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 16px;
          padding-bottom: 14px; border-bottom: 1px solid rgba(243,238,223,0.15);
        }
        .flt-chip {
          font-size: 12px; padding: 6px 12px; border-radius: 20px; cursor: pointer;
          border: 1px solid rgba(243,238,223,0.25); background: transparent; color: #C7D4DE;
          white-space: nowrap;
        }
        .flt-chip.active { background: var(--parchment); color: var(--ink); border-color: var(--parchment); font-weight: 500; }
        .flt-search {
          font-family: 'Inter', sans-serif; font-size: 13px; padding: 7px 12px; border-radius: 6px;
          border: 1px solid rgba(243,238,223,0.25); background: rgba(243,238,223,0.06); color: var(--parchment);
          flex: 1; min-width: 160px;
        }
        .flt-search::placeholder { color: #7E92A3; }
        .flt-grid {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 14px;
        }
        .flt-card {
          background: var(--parchment); color: var(--ink); border-radius: 10px; padding: 14px 14px 12px;
          cursor: pointer; position: relative; border: 1px solid var(--parchment-dim);
          transition: transform 0.12s, box-shadow 0.12s;
        }
        .flt-card:hover { transform: translateY(-2px); box-shadow: 0 6px 16px rgba(0,0,0,0.25); }
        .flt-stamp {
          position: absolute; top: 12px; right: 12px; width: 40px; height: 40px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center; flex-direction: column;
          border: 2px solid; font-family: 'IBM Plex Mono', monospace;
        }
        .flt-stamp-count {
          right: 58px; border-color: var(--ink-soft); background: rgba(22,40,58,0.06); color: var(--ink-soft);
        }
        .flt-stamp-score { right: 104px; }
        .flt-stamp-num { font-size: 13px; font-weight: 500; line-height: 1; }
        .flt-stamp-unit { font-size: 7px; text-transform: uppercase; letter-spacing: 0.3px; }
        .u-fresh { border-color: var(--sage); background: var(--sage-bg); color: #2E4A33; }
        .u-due { border-color: var(--brass); background: var(--amber-bg); color: #5C4110; }
        .u-overdue { border-color: var(--clay); background: var(--clay-bg); color: #5E2317; }
        .u-never { border-color: var(--slate); background: var(--slate-bg); color: #38495A; }
        .flt-card-address {
          font-family: 'IBM Plex Mono', monospace; font-size: 13px; font-weight: 500;
          padding-right: 142px; margin: 0 0 8px; line-height: 1.35;
        }
        .flt-badges { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
        .flt-badge {
          font-size: 10px; padding: 3px 8px; border-radius: 4px; text-transform: uppercase;
          letter-spacing: 0.3px; font-weight: 500; background: rgba(22,40,58,0.08); color: var(--ink-soft);
        }
        .flt-card-owner { font-size: 12px; color: var(--ink-soft); margin: 0 0 4px; }
        .flt-card-touch { font-size: 11px; color: #6C5B3D; font-weight: 500; margin-top: 8px; }
        .flt-empty {
          text-align: center; padding: 50px 20px; color: #9FB2C3;
        }
        .flt-empty-title { font-family: 'Special Elite', monospace; font-size: 16px; color: var(--parchment); margin-bottom: 6px; }
        .flt-toast {
          position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
          background: var(--parchment); color: var(--ink); padding: 9px 18px; border-radius: 20px;
          font-size: 13px; font-weight: 500; z-index: 200; box-shadow: 0 4px 14px rgba(0,0,0,0.3);
        }
        .flt-overlay {
          position: absolute; inset: 0; background: rgba(10,18,26,0.7); border-radius: 14px;
          display: flex; align-items: flex-start; justify-content: center; padding: 30px 16px;
          overflow-y: auto; z-index: 100;
        }
        .flt-modal {
          background: var(--parchment); color: var(--ink); border-radius: 12px; padding: 20px;
          width: 100%; max-width: 480px; max-height: 100%;
        }
        .flt-modal-title { font-family: 'Special Elite', monospace; font-size: 16px; margin: 0 0 4px; }
        .flt-modal-sub { font-size: 12px; color: var(--ink-soft); margin: 0 0 16px; }
        .flt-field { margin-bottom: 12px; }
        .flt-label { display: block; font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.3px; color: var(--ink-soft); margin-bottom: 4px; }
        .flt-input, .flt-select, .flt-textarea {
          width: 100%; font-family: 'Inter', sans-serif; font-size: 13px; padding: 8px 10px;
          border-radius: 6px; border: 1px solid rgba(22,40,58,0.25); background: #FFFDF6; color: var(--ink);
        }
        .flt-textarea { resize: vertical; min-height: 60px; font-family: 'Inter', sans-serif; }
        .flt-row { display: flex; gap: 10px; }
        .flt-row > * { flex: 1; }
        .flt-modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
        .flt-modal-btn {
          font-size: 13px; font-weight: 500; padding: 8px 16px; border-radius: 6px; cursor: pointer; border: 1px solid rgba(22,40,58,0.25); background: transparent; color: var(--ink);
        }
        .flt-modal-btn-primary { background: var(--ink); color: var(--parchment); border-color: var(--ink); }
        .flt-close { position: absolute; top: 14px; right: 14px; background: none; border: none; cursor: pointer; color: var(--ink-soft); font-size: 18px; line-height: 1; }
        .flt-detail-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; margin-bottom: 4px; padding-right: 20px; }
        .flt-detail-address { font-family: 'IBM Plex Mono', monospace; font-size: 16px; font-weight: 500; margin: 0; }
        .flt-detail-meta { font-size: 12px; color: var(--ink-soft); margin: 6px 0 14px; }
        .flt-detail-section { border-top: 1px solid rgba(22,40,58,0.15); padding-top: 12px; margin-top: 12px; }
        .flt-detail-section-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px; color: var(--ink-soft); margin: 0 0 8px; }
        .flt-timeline-item { display: flex; gap: 10px; padding: 8px 0; border-bottom: 1px dashed rgba(22,40,58,0.12); }
        .flt-timeline-item:last-child { border-bottom: none; }
        .flt-timeline-date { font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: var(--ink-soft); min-width: 70px; }
        .flt-timeline-body { flex: 1; }
        .flt-timeline-type { font-size: 12px; font-weight: 500; margin-bottom: 2px; }
        .flt-timeline-notes { font-size: 12px; color: var(--ink-soft); line-height: 1.4; white-space: pre-wrap; }
        .flt-timeline-source { font-size: 10px; color: #9C8A5F; text-transform: uppercase; margin-left: 6px; }
        .flt-import-table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 10px; }
        .flt-import-table th, .flt-import-table td { text-align: left; padding: 5px 6px; border-bottom: 1px solid rgba(22,40,58,0.12); }
        .flt-import-table select { font-size: 11px; padding: 3px 4px; }
        .flt-import-scroll { max-height: 200px; overflow: auto; border: 1px solid rgba(22,40,58,0.15); border-radius: 6px; }
        .flt-status-select { font-size: 12px; padding: 5px 8px; border-radius: 5px; border: 1px solid rgba(22,40,58,0.25); background: #FFFDF6; color: var(--ink); }
        @media (max-width: 520px) {
          .flt-grid { grid-template-columns: 1fr; }
          .flt-row { flex-direction: column; }
        }
      `}</style>

      <div className="flt-header">
        <div>
          <p className="flt-title">Field Ledger</p>
          <p className="flt-subtitle">Off-market prospecting — Tier 1 Properties</p>
          <div className="flt-stats">
            <div className="flt-stat">
              <span className="flt-stat-num">{activeTab === "properties" ? stats.total : contactStats.total}</span>
              <span className="flt-stat-label">Tracked</span>
            </div>
            <div className="flt-stat">
              <span
                className="flt-stat-num"
                style={{ color: (activeTab === "properties" ? stats.overdue : contactStats.overdue) > 0 ? "#E8A98F" : "inherit" }}
              >
                {activeTab === "properties" ? stats.overdue : contactStats.overdue}
              </span>
              <span className="flt-stat-label">Need follow-up</span>
            </div>
            <div className="flt-stat">
              <span className="flt-stat-num">{activeTab === "properties" ? stats.touchedThisWeek : contactStats.touchedThisWeek}</span>
              <span className="flt-stat-label">Touched this week</span>
            </div>
          </div>
        </div>
        <div className="flt-actions">
          {activeTab === "properties" && <button className="flt-btn" onClick={() => setShowImport(true)}>Import</button>}
          {activeTab === "properties" ? (
            <>
              <button className="flt-btn" onClick={() => setQuickLog({ prospectId: prospects[0] ? prospects[0].id : "", type: "Call", date: todayStr(), notes: "" })}>
                Log touchpoint
              </button>
              <button className="flt-btn flt-btn-primary" onClick={() => setEditing(emptyProspect())}>+ New prospect</button>
            </>
          ) : (
            <>
              <button className="flt-btn" onClick={() => setContactQuickLog({ contactId: contacts[0] ? contacts[0].id : "", type: "Call", date: todayStr(), notes: "" })}>
                Log touchpoint
              </button>
              <button className="flt-btn flt-btn-primary" onClick={() => setEditingContact(emptyContact())}>+ New contact</button>
            </>
          )}
          <button className="flt-btn" onClick={handleLogout}>Log out</button>
        </div>
      </div>

      <div className="flt-tabs">
        <button className={"flt-tab" + (activeTab === "properties" ? " active" : "")} onClick={() => setActiveTab("properties")}>Properties</button>
        <button className={"flt-tab" + (activeTab === "contacts" ? " active" : "")} onClick={() => setActiveTab("contacts")}>Contacts</button>
      </div>

      {activeTab === "properties" && (
      <>
      <div className="flt-filters">
        {["All", ...CATEGORIES].map((c) => (
          <button key={c} className={"flt-chip" + (filterCat === c ? " active" : "")} onClick={() => setFilterCat(c)}>
            {c}
          </button>
        ))}
        <input
          className="flt-search"
          placeholder="Search address, owner, or phone"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="flt-empty">
          <p className="flt-empty-title">{prospects.length === 0 ? "No prospects yet" : "Nothing matches"}</p>
          <p>{prospects.length === 0 ? "Add your first property to start tracking touchpoints." : "Try a different filter or search term."}</p>
        </div>
      ) : (
        <div className="flt-grid">
          {filtered.map((p) => {
            const u = urgency(p);
            const lt = lastTouch(p);
            const d = lt ? daysSince(lt) : null;
            return (
              <div key={p.id} className="flt-card" onClick={() => setSelectedId(p.id)}>
                <div className={"flt-stamp flt-stamp-score u-" + scoreTier(p.opportunityScore)}>
                  <span className="flt-stamp-num">{p.opportunityScore || "–"}</span>
                  <span className="flt-stamp-unit">score</span>
                </div>
                <div className="flt-stamp flt-stamp-count">
                  <span className="flt-stamp-num">{p.touchpoints.length}</span>
                  <span className="flt-stamp-unit">{p.touchpoints.length === 1 ? "touch" : "touches"}</span>
                </div>
                <div className={"flt-stamp u-" + u}>
                  <span className="flt-stamp-num">{u === "never" ? "—" : d}</span>
                  <span className="flt-stamp-unit">{u === "never" ? "new" : "days"}</span>
                </div>
                <p className="flt-card-address">{p.address || "Untitled property"}</p>
                <div className="flt-badges">
                  <span className="flt-badge">{p.category}</span>
                  {p.category === "Multifamily" && p.unitCount && (
                    <span className="flt-badge">{p.unitCount} units</span>
                  )}
                  {p.category === "Lots" && p.lotSize && (
                    <span className="flt-badge">{p.lotSize}</span>
                  )}
                  <span className="flt-badge">{p.status}</span>
                </div>
                {p.ownerName && <p className="flt-card-owner">{p.ownerName}{p.phone ? " · " + p.phone : ""}</p>}
                <p className="flt-card-touch">{urgencyLabel(p)}</p>
              </div>
            );
          })}
        </div>
      )}
      </>
      )}

      {activeTab === "contacts" && (
      <>
      <div className="flt-filters">
        {["All", ...CONTACT_ROLES].map((r) => (
          <button key={r} className={"flt-chip" + (filterRole === r ? " active" : "")} onClick={() => setFilterRole(r)}>
            {r}
          </button>
        ))}
        <input
          className="flt-search"
          placeholder="Search name, company, or phone"
          value={contactSearch}
          onChange={(e) => setContactSearch(e.target.value)}
        />
      </div>

      {filteredContacts.length === 0 ? (
        <div className="flt-empty">
          <p className="flt-empty-title">{contacts.length === 0 ? "No contacts yet" : "Nothing matches"}</p>
          <p>{contacts.length === 0 ? "Add brokers, investors, and other people you want to keep in touch with." : "Try a different filter or search term."}</p>
        </div>
      ) : (
        <div className="flt-grid">
          {filteredContacts.map((c) => {
            const u = urgency(c);
            const lt = lastTouch(c);
            const d = lt ? daysSince(lt) : null;
            return (
              <div key={c.id} className="flt-card" onClick={() => setSelectedContactId(c.id)}>
                <div className="flt-stamp flt-stamp-count">
                  <span className="flt-stamp-num">{c.touchpoints.length}</span>
                  <span className="flt-stamp-unit">{c.touchpoints.length === 1 ? "touch" : "touches"}</span>
                </div>
                <div className={"flt-stamp u-" + u}>
                  <span className="flt-stamp-num">{u === "never" ? "—" : d}</span>
                  <span className="flt-stamp-unit">{u === "never" ? "new" : "days"}</span>
                </div>
                <p className="flt-card-address">{c.name || "Unnamed contact"}</p>
                <div className="flt-badges">
                  <span className="flt-badge">{c.role}</span>
                </div>
                {(c.company || c.phone) && <p className="flt-card-owner">{c.company}{c.company && c.phone ? " · " : ""}{c.phone}</p>}
                <p className="flt-card-touch">{urgencyLabel(c)}</p>
              </div>
            );
          })}
        </div>
      )}
      </>
      )}

      {toast && <div className="flt-toast">{toast}</div>}

      {editing && (
        <ProspectForm
          data={editing}
          onCancel={() => setEditing(null)}
          onSave={(data) => {
            upsertProspect(data);
            setEditing(null);
            showToast("Prospect saved");
          }}
        />
      )}

      {selected && !editing && (
        <DetailView
          prospect={selected}
          onClose={() => setSelectedId(null)}
          onEdit={() => setEditing(selected)}
          onDelete={() => deleteProspect(selected.id)}
          onAddTouchpoint={(tp) => {
            addTouchpoint(selected.id, tp);
            showToast("Touchpoint logged");
          }}
          onStatusChange={(status) => upsertProspect({ ...selected, status })}
          onScoreChange={(opportunityScore) => upsertProspect({ ...selected, opportunityScore })}
        />
      )}

      {quickLog && (
        <QuickLogModal
          data={quickLog}
          prospects={prospects}
          onCancel={() => setQuickLog(null)}
          onCreateNew={() => {
            const np = emptyProspect();
            setQuickLog(null);
            setEditing(np);
          }}
          onSave={(prospectId, tp) => {
            addTouchpoint(prospectId, tp);
            setQuickLog(null);
            showToast("Touchpoint logged");
          }}
        />
      )}

      {editingContact && (
        <ContactForm
          data={editingContact}
          onCancel={() => setEditingContact(null)}
          onSave={(data) => {
            upsertContact(data);
            setEditingContact(null);
            showToast("Contact saved");
          }}
        />
      )}

      {selectedContact && !editingContact && (
        <ContactDetailView
          contact={selectedContact}
          onClose={() => setSelectedContactId(null)}
          onEdit={() => setEditingContact(selectedContact)}
          onDelete={() => deleteContact(selectedContact.id)}
          onAddTouchpoint={(tp) => {
            addContactTouchpoint(selectedContact.id, tp);
            showToast("Touchpoint logged");
          }}
        />
      )}

      {contactQuickLog && (
        <ContactQuickLogModal
          data={contactQuickLog}
          contacts={contacts}
          onCancel={() => setContactQuickLog(null)}
          onCreateNew={() => {
            const nc = emptyContact();
            setContactQuickLog(null);
            setEditingContact(nc);
          }}
          onSave={(contactId, tp) => {
            addContactTouchpoint(contactId, tp);
            setContactQuickLog(null);
            showToast("Touchpoint logged");
          }}
        />
      )}

      {showImport && (
        <ImportModal
          existing={prospects}
          onCancel={() => setShowImport(false)}
          onImport={(newOnes, updates) => {
            setProspects((prev) => {
              let next = [...prev];
              updates.forEach((u) => {
                next = next.map((p) => (p.id === u.id ? u : p));
              });
              return [...newOnes, ...next];
            });
            setShowImport(false);
            showToast(newOnes.length + " added, " + updates.length + " updated");
            const rows = [...newOnes, ...updates].map(toPropertyRow);
            supabase.from("properties").upsert(rows).then(({ error }) => {
              if (error) { console.error("Import save error", error); showToast("Import saved locally but failed to sync"); }
            });
          }}
        />
      )}
    </div>
  );
}

function ProspectForm({ data, onCancel, onSave }) {
  const [form, setForm] = useState(data);
  const isNew = !form.address && form.touchpoints.length === 0;
  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }
  return (
    <div className="flt-overlay" onClick={onCancel}>
      <div className="flt-modal" onClick={(e) => e.stopPropagation()}>
        <button className="flt-close" onClick={onCancel}>&times;</button>
        <p className="flt-modal-title">{isNew ? "New prospect" : "Edit prospect"}</p>
        <p className="flt-modal-sub">Capture what you think about it now — you can add notes as the conversation develops.</p>

        <div className="flt-field">
          <label className="flt-label">Property address</label>
          <input className="flt-input" value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="123 Main St, Covington KY" />
        </div>

        <div className="flt-row">
          <div className="flt-field">
            <label className="flt-label">Category</label>
            <select
              className="flt-select"
              value={form.category}
              onChange={(e) => {
                const cat = e.target.value;
                setForm((f) => ({
                  ...f,
                  category: cat,
                  unitCount: cat === "Multifamily" ? f.unitCount : "",
                  lotSize: cat === "Lots" ? f.lotSize : "",
                }));
              }}
            >
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="flt-field">
            <label className="flt-label">Status</label>
            <select className="flt-select" value={form.status} onChange={(e) => set("status", e.target.value)}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>

        {form.category === "Multifamily" && (
          <div className="flt-field">
            <label className="flt-label">Unit count</label>
            <input
              className="flt-input"
              list="flt-unit-count-options"
              value={form.unitCount}
              onChange={(e) => set("unitCount", e.target.value)}
              placeholder="e.g. 4, 12, 6-9..."
            />
            <datalist id="flt-unit-count-options">
              {UNIT_COUNTS.map((u) => <option key={u} value={u} />)}
            </datalist>
          </div>
        )}

        {form.category === "Lots" && (
          <div className="flt-field">
            <label className="flt-label">Size</label>
            <input
              className="flt-input"
              list="flt-lot-size-options"
              value={form.lotSize}
              onChange={(e) => set("lotSize", e.target.value)}
              placeholder="e.g. 0.75 acre, 30,000 sqft..."
            />
            <datalist id="flt-lot-size-options">
              {LOT_SIZES.map((s) => <option key={s} value={s} />)}
            </datalist>
          </div>
        )}

        <div className="flt-field">
          <label className="flt-label">Opportunity score</label>
          <select className="flt-select" value={form.opportunityScore} onChange={(e) => set("opportunityScore", e.target.value)}>
            <option value="">Not scored</option>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>

        <div className="flt-row">
          <div className="flt-field">
            <label className="flt-label">Owner name</label>
            <input className="flt-input" value={form.ownerName} onChange={(e) => set("ownerName", e.target.value)} placeholder="Jane Smith" />
          </div>
          <div className="flt-field">
            <label className="flt-label">Phone</label>
            <input className="flt-input" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="(859) 555-0134" />
          </div>
        </div>

        <div className="flt-field">
          <label className="flt-label">Email</label>
          <input className="flt-input" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="owner@email.com" />
        </div>

        <div className="flt-field">
          <label className="flt-label">Notes / what you think about it</label>
          <textarea className="flt-textarea" value={form.initialThoughts} onChange={(e) => set("initialThoughts", e.target.value)} placeholder="Lot size, condition, motivation signals, asking price guess, etc." />
        </div>

        <div className="flt-modal-actions">
          <button className="flt-modal-btn" onClick={onCancel}>Cancel</button>
          <button
            className="flt-modal-btn flt-modal-btn-primary"
            onClick={() => {
              if (!form.address.trim()) return;
              onSave(form);
            }}
          >
            Save prospect
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailView({ prospect, onClose, onEdit, onDelete, onAddTouchpoint, onStatusChange, onScoreChange }) {
  const [tpType, setTpType] = useState("Call");
  const [tpDate, setTpDate] = useState(todayStr());
  const [tpNotes, setTpNotes] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const timeline = [...prospect.touchpoints].sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <div className="flt-overlay" onClick={onClose}>
      <div className="flt-modal" onClick={(e) => e.stopPropagation()}>
        <button className="flt-close" onClick={onClose}>&times;</button>
        <div className="flt-detail-head">
          <p className="flt-detail-address">{prospect.address}</p>
        </div>
        <div className="flt-badges">
          <span className="flt-badge">{prospect.category}</span>
          {prospect.category === "Multifamily" && prospect.unitCount && (
            <span className="flt-badge">{prospect.unitCount} units</span>
          )}
          {prospect.category === "Lots" && prospect.lotSize && (
            <span className="flt-badge">{prospect.lotSize}</span>
          )}
        </div>
        <p className="flt-detail-meta">
          {prospect.ownerName || "No owner name on file"}
          {prospect.phone ? " · " + prospect.phone : ""}
          {prospect.email ? " · " + prospect.email : ""}
        </p>

        <div className="flt-row">
          <div className="flt-field">
            <label className="flt-label">Status</label>
            <select className="flt-status-select" value={prospect.status} onChange={(e) => onStatusChange(e.target.value)}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="flt-field">
            <label className="flt-label">Opportunity score</label>
            <select className="flt-status-select" value={prospect.opportunityScore} onChange={(e) => onScoreChange(e.target.value)}>
              <option value="">Not scored</option>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>

        {prospect.initialThoughts && (
          <div className="flt-detail-section">
            <p className="flt-detail-section-title">Notes</p>
            <p className="flt-timeline-notes">{prospect.initialThoughts}</p>
          </div>
        )}

        <div className="flt-detail-section">
          <p className="flt-detail-section-title">Log a touchpoint</p>
          <div className="flt-row">
            <div className="flt-field">
              <select className="flt-select" value={tpType} onChange={(e) => setTpType(e.target.value)}>
                {TOUCH_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="flt-field">
              <input type="date" className="flt-input" value={tpDate} onChange={(e) => setTpDate(e.target.value)} />
            </div>
          </div>
          <div className="flt-field">
            <textarea className="flt-textarea" placeholder="What happened on this call/text/visit..." value={tpNotes} onChange={(e) => setTpNotes(e.target.value)} />
          </div>
          <button
            className="flt-modal-btn flt-modal-btn-primary"
            onClick={() => {
              if (!tpNotes.trim()) return;
              onAddTouchpoint({ type: tpType, date: tpDate, notes: tpNotes, source: "manual" });
              setTpNotes("");
            }}
          >
            Add touchpoint
          </button>
        </div>

        <div className="flt-detail-section">
          <p className="flt-detail-section-title">Timeline ({timeline.length})</p>
          {timeline.length === 0 && <p className="flt-timeline-notes">No touchpoints logged yet.</p>}
          {timeline.map((t) => (
            <div key={t.id} className="flt-timeline-item">
              <span className="flt-timeline-date">{formatDate(t.date)}</span>
              <div className="flt-timeline-body">
                <div className="flt-timeline-type">
                  {t.type}
                  {t.source === "import" && <span className="flt-timeline-source">imported</span>}
                </div>
                <div className="flt-timeline-notes">{t.notes}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="flt-modal-actions">
          {confirmDelete ? (
            <>
              <span style={{ fontSize: 12, alignSelf: "center", color: "var(--ink-soft)" }}>Delete this prospect for good?</span>
              <button className="flt-modal-btn" onClick={() => setConfirmDelete(false)}>Cancel</button>
              <button className="flt-modal-btn flt-btn-danger" onClick={onDelete}>Confirm delete</button>
            </>
          ) : (
            <>
              <button className="flt-modal-btn" onClick={() => setConfirmDelete(true)}>Delete</button>
              <button className="flt-modal-btn" onClick={onEdit}>Edit details</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ContactForm({ data, onCancel, onSave }) {
  const [form, setForm] = useState(data);
  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }
  return (
    <div className="flt-overlay" onClick={onCancel}>
      <div className="flt-modal" onClick={(e) => e.stopPropagation()}>
        <button className="flt-close" onClick={onCancel}>&times;</button>
        <p className="flt-modal-title">{form.name ? "Edit contact" : "New contact"}</p>
        <p className="flt-modal-sub">Brokers, investors, lenders — anyone you want to keep in touch with.</p>

        <div className="flt-field">
          <label className="flt-label">Name</label>
          <input className="flt-input" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Jane Smith" />
        </div>

        <div className="flt-row">
          <div className="flt-field">
            <label className="flt-label">Role</label>
            <select className="flt-select" value={form.role} onChange={(e) => set("role", e.target.value)}>
              {CONTACT_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="flt-field">
            <label className="flt-label">Company</label>
            <input className="flt-input" value={form.company} onChange={(e) => set("company", e.target.value)} placeholder="Company name" />
          </div>
        </div>

        <div className="flt-row">
          <div className="flt-field">
            <label className="flt-label">Phone</label>
            <input className="flt-input" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="(859) 555-0134" />
          </div>
          <div className="flt-field">
            <label className="flt-label">Email</label>
            <input className="flt-input" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="name@email.com" />
          </div>
        </div>

        <div className="flt-field">
          <label className="flt-label">Notes</label>
          <textarea className="flt-textarea" value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="How you met, what they're looking for, deal history..." />
        </div>

        <div className="flt-modal-actions">
          <button className="flt-modal-btn" onClick={onCancel}>Cancel</button>
          <button
            className="flt-modal-btn flt-modal-btn-primary"
            onClick={() => {
              if (!form.name.trim()) return;
              onSave(form);
            }}
          >
            Save contact
          </button>
        </div>
      </div>
    </div>
  );
}

function ContactDetailView({ contact, onClose, onEdit, onDelete, onAddTouchpoint }) {
  const [tpType, setTpType] = useState("Call");
  const [tpDate, setTpDate] = useState(todayStr());
  const [tpNotes, setTpNotes] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const timeline = [...contact.touchpoints].sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <div className="flt-overlay" onClick={onClose}>
      <div className="flt-modal" onClick={(e) => e.stopPropagation()}>
        <button className="flt-close" onClick={onClose}>&times;</button>
        <div className="flt-detail-head">
          <p className="flt-detail-address">{contact.name}</p>
        </div>
        <div className="flt-badges">
          <span className="flt-badge">{contact.role}</span>
        </div>
        <p className="flt-detail-meta">
          {contact.company || "No company on file"}
          {contact.phone ? " · " + contact.phone : ""}
          {contact.email ? " · " + contact.email : ""}
        </p>

        {contact.notes && (
          <div className="flt-detail-section">
            <p className="flt-detail-section-title">Notes</p>
            <p className="flt-timeline-notes">{contact.notes}</p>
          </div>
        )}

        <div className="flt-detail-section">
          <p className="flt-detail-section-title">Log a touchpoint</p>
          <div className="flt-row">
            <div className="flt-field">
              <select className="flt-select" value={tpType} onChange={(e) => setTpType(e.target.value)}>
                {TOUCH_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="flt-field">
              <input type="date" className="flt-input" value={tpDate} onChange={(e) => setTpDate(e.target.value)} />
            </div>
          </div>
          <div className="flt-field">
            <textarea className="flt-textarea" placeholder="What happened on this call/text/coffee..." value={tpNotes} onChange={(e) => setTpNotes(e.target.value)} />
          </div>
          <button
            className="flt-modal-btn flt-modal-btn-primary"
            onClick={() => {
              if (!tpNotes.trim()) return;
              onAddTouchpoint({ type: tpType, date: tpDate, notes: tpNotes, source: "manual" });
              setTpNotes("");
            }}
          >
            Add touchpoint
          </button>
        </div>

        <div className="flt-detail-section">
          <p className="flt-detail-section-title">Timeline ({timeline.length})</p>
          {timeline.length === 0 && <p className="flt-timeline-notes">No touchpoints logged yet.</p>}
          {timeline.map((t) => (
            <div key={t.id} className="flt-timeline-item">
              <span className="flt-timeline-date">{formatDate(t.date)}</span>
              <div className="flt-timeline-body">
                <div className="flt-timeline-type">
                  {t.type}
                  {t.source === "import" && <span className="flt-timeline-source">imported</span>}
                </div>
                <div className="flt-timeline-notes">{t.notes}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="flt-modal-actions">
          {confirmDelete ? (
            <>
              <span style={{ fontSize: 12, alignSelf: "center", color: "var(--ink-soft)" }}>Delete this contact for good?</span>
              <button className="flt-modal-btn" onClick={() => setConfirmDelete(false)}>Cancel</button>
              <button className="flt-modal-btn flt-btn-danger" onClick={onDelete}>Confirm delete</button>
            </>
          ) : (
            <>
              <button className="flt-modal-btn" onClick={() => setConfirmDelete(true)}>Delete</button>
              <button className="flt-modal-btn" onClick={onEdit}>Edit details</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ContactQuickLogModal({ data, contacts, onCancel, onCreateNew, onSave }) {
  const [contactId, setContactId] = useState(data.contactId);
  const [type, setType] = useState(data.type);
  const [date, setDate] = useState(data.date);
  const [notes, setNotes] = useState(data.notes);
  const [query, setQuery] = useState("");

  const options = useMemo(() => {
    if (!query.trim()) return contacts;
    const q = query.toLowerCase();
    return contacts.filter((c) => c.name.toLowerCase().includes(q) || (c.company || "").toLowerCase().includes(q));
  }, [contacts, query]);

  return (
    <div className="flt-overlay" onClick={onCancel}>
      <div className="flt-modal" onClick={(e) => e.stopPropagation()}>
        <button className="flt-close" onClick={onCancel}>&times;</button>
        <p className="flt-modal-title">Log a touchpoint</p>
        <p className="flt-modal-sub">Attach a call, text, or note to an existing contact.</p>

        {contacts.length === 0 ? (
          <p className="flt-timeline-notes">No contacts yet. Add one first.</p>
        ) : (
          <>
            <div className="flt-field">
              <label className="flt-label">Contact</label>
              <input className="flt-input" placeholder="Search name or company..." value={query} onChange={(e) => setQuery(e.target.value)} style={{ marginBottom: 6 }} />
              <select className="flt-select" value={contactId} onChange={(e) => setContactId(e.target.value)}>
                {options.map((c) => <option key={c.id} value={c.id}>{c.name}{c.company ? " — " + c.company : ""}</option>)}
              </select>
            </div>
            <div className="flt-row">
              <div className="flt-field">
                <label className="flt-label">Type</label>
                <select className="flt-select" value={type} onChange={(e) => setType(e.target.value)}>
                  {TOUCH_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="flt-field">
                <label className="flt-label">Date</label>
                <input type="date" className="flt-input" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            </div>
            <div className="flt-field">
              <label className="flt-label">Notes</label>
              <textarea className="flt-textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Paste or type what came up..." />
            </div>
          </>
        )}

        <div className="flt-modal-actions">
          <button className="flt-modal-btn" onClick={onCreateNew}>+ New contact instead</button>
          <button className="flt-modal-btn" onClick={onCancel}>Cancel</button>
          {contacts.length > 0 && (
            <button
              className="flt-modal-btn flt-modal-btn-primary"
              onClick={() => {
                if (!contactId || !notes.trim()) return;
                onSave(contactId, { type, date, notes, source: "manual" });
              }}
            >
              Save
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function QuickLogModal({ data, prospects, onCancel, onCreateNew, onSave }) {
  const [prospectId, setProspectId] = useState(data.prospectId);
  const [type, setType] = useState(data.type);
  const [date, setDate] = useState(data.date);
  const [notes, setNotes] = useState(data.notes);
  const [query, setQuery] = useState("");

  const options = useMemo(() => {
    if (!query.trim()) return prospects;
    const q = query.toLowerCase();
    return prospects.filter((p) => p.address.toLowerCase().includes(q) || (p.ownerName || "").toLowerCase().includes(q));
  }, [prospects, query]);

  return (
    <div className="flt-overlay" onClick={onCancel}>
      <div className="flt-modal" onClick={(e) => e.stopPropagation()}>
        <button className="flt-close" onClick={onCancel}>&times;</button>
        <p className="flt-modal-title">Log a touchpoint</p>
        <p className="flt-modal-sub">Attach a call, text, or note to an existing prospect.</p>

        {prospects.length === 0 ? (
          <p className="flt-timeline-notes">No prospects yet. Add one first.</p>
        ) : (
          <>
            <div className="flt-field">
              <label className="flt-label">Prospect</label>
              <input className="flt-input" placeholder="Search address or owner..." value={query} onChange={(e) => setQuery(e.target.value)} style={{ marginBottom: 6 }} />
              <select className="flt-select" value={prospectId} onChange={(e) => setProspectId(e.target.value)}>
                {options.map((p) => <option key={p.id} value={p.id}>{p.address}{p.ownerName ? " — " + p.ownerName : ""}</option>)}
              </select>
            </div>
            <div className="flt-row">
              <div className="flt-field">
                <label className="flt-label">Type</label>
                <select className="flt-select" value={type} onChange={(e) => setType(e.target.value)}>
                  {TOUCH_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="flt-field">
                <label className="flt-label">Date</label>
                <input type="date" className="flt-input" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            </div>
            <div className="flt-field">
              <label className="flt-label">Notes</label>
              <textarea className="flt-textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Paste or type what came up..." />
            </div>
          </>
        )}

        <div className="flt-modal-actions">
          <button className="flt-modal-btn" onClick={onCreateNew}>+ New prospect instead</button>
          <button className="flt-modal-btn" onClick={onCancel}>Cancel</button>
          {prospects.length > 0 && (
            <button
              className="flt-modal-btn flt-modal-btn-primary"
              onClick={() => {
                if (!prospectId || !notes.trim()) return;
                onSave(prospectId, { type, date, notes, source: "manual" });
              }}
            >
              Save
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ImportModal({ existing, onCancel, onImport }) {
  const [raw, setRaw] = useState("");
  const [parsed, setParsed] = useState(null);
  const [mapping, setMapping] = useState({});
  const [error, setError] = useState("");

  function guessField(header) {
    const h = header.toLowerCase();
    if (h.includes("address") || h.includes("property")) return "Address";
    if (h.includes("unit")) return "Unit Count";
    if (h.includes("owner") || h.includes("name") || h.includes("contact")) return "Owner Name";
    if (h.includes("phone") || h.includes("mobile") || h.includes("cell")) return "Phone";
    if (h.includes("email")) return "Email";
    if (h.includes("category") || h.includes("type")) return "Category";
    if (h.includes("note") || h.includes("comment") || h.includes("call") || h.includes("summary")) return "Notes";
    return "Ignore";
  }

  function handleParse() {
    setError("");
    const result = Papa.parse(raw.trim(), { header: true, skipEmptyLines: true });
    if (!result.data || result.data.length === 0 || !result.meta.fields) {
      setError("Couldn't find any rows. Paste CSV text including a header row.");
      return;
    }
    const initialMapping = {};
    result.meta.fields.forEach((f) => (initialMapping[f] = guessField(f)));
    setMapping(initialMapping);
    setParsed(result.data);
  }

  function handleImport() {
    if (!parsed) return;
    const newOnes = [];
    const updates = [];
    const byPhone = {};
    existing.forEach((p) => {
      const np = normalizePhone(p.phone);
      if (np) byPhone[np] = p;
    });

    parsed.forEach((row) => {
      const rec = { address: "", ownerName: "", phone: "", email: "", category: "", unitCount: "", notes: "" };
      Object.keys(mapping).forEach((header) => {
        const field = mapping[header];
        const val = (row[header] || "").trim();
        if (!val) return;
        if (field === "Address") rec.address = val;
        if (field === "Owner Name") rec.ownerName = val;
        if (field === "Phone") rec.phone = val;
        if (field === "Email") rec.email = val;
        if (field === "Category") rec.category = val;
        if (field === "Unit Count") rec.unitCount = val;
        if (field === "Notes") rec.notes = rec.notes ? rec.notes + " — " + val : val;
      });

      const np = normalizePhone(rec.phone);
      const matched = np && byPhone[np];

      if (matched) {
        const tp = rec.notes
          ? [{ id: uid(), type: "Note", date: todayStr(), notes: rec.notes, source: "import" }]
          : [];
        updates.push({ ...matched, touchpoints: [...matched.touchpoints, ...tp] });
      } else if (rec.address || rec.ownerName) {
        const category = CATEGORIES.includes(rec.category) ? rec.category : "Multifamily";
        const touchpoints = rec.notes
          ? [{ id: uid(), type: "Note", date: todayStr(), notes: rec.notes, source: "import" }]
          : [];
        newOnes.push({
          id: uid(),
          address: rec.address || "(no address given)",
          category,
          status: "New",
          ownerName: rec.ownerName,
          phone: rec.phone,
          email: rec.email,
          unitCount: rec.unitCount,
          lotSize: "",
          opportunityScore: "",
          initialThoughts: "",
          createdAt: todayStr(),
          touchpoints,
        });
      }
    });

    onImport(newOnes, updates);
  }

  return (
    <div className="flt-overlay" onClick={onCancel}>
      <div className="flt-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <button className="flt-close" onClick={onCancel}>&times;</button>
        <p className="flt-modal-title">Import from HighLevel</p>
        <p className="flt-modal-sub">Export contacts or call notes as CSV, then paste the text below. Matches on phone number to avoid duplicates.</p>

        {!parsed ? (
          <>
            <div className="flt-field">
              <textarea
                className="flt-textarea"
                style={{ minHeight: 140, fontFamily: "monospace", fontSize: 12 }}
                placeholder="Paste CSV text here (include the header row)..."
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
              />
            </div>
            {error && <p style={{ color: "var(--clay)", fontSize: 12 }}>{error}</p>}
            <div className="flt-modal-actions">
              <button className="flt-modal-btn" onClick={onCancel}>Cancel</button>
              <button className="flt-modal-btn flt-modal-btn-primary" onClick={handleParse}>Parse</button>
            </div>
          </>
        ) : (
          <>
            <p className="flt-detail-section-title">Map columns ({parsed.length} rows found)</p>
            <div className="flt-import-scroll">
              <table className="flt-import-table">
                <thead>
                  <tr><th>Column</th><th>Maps to</th></tr>
                </thead>
                <tbody>
                  {Object.keys(mapping).map((header) => (
                    <tr key={header}>
                      <td>{header}</td>
                      <td>
                        <select
                          value={mapping[header]}
                          onChange={(e) => setMapping((m) => ({ ...m, [header]: e.target.value }))}
                        >
                          {IMPORT_FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flt-modal-actions">
              <button className="flt-modal-btn" onClick={() => setParsed(null)}>Back</button>
              <button className="flt-modal-btn" onClick={onCancel}>Cancel</button>
              <button className="flt-modal-btn flt-modal-btn-primary" onClick={handleImport}>Import {parsed.length} rows</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
