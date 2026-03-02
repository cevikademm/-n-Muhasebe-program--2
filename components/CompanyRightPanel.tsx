import React, { useState, useEffect } from "react";
import { useLang } from "../LanguageContext";
import { Company } from "../types";
import { supabase } from "../services/supabaseService";
import {
  ArrowLeft,
  Building2,
  Edit2,
  Save,
  X,
  Trash2,
} from "lucide-react";

interface CompanyRightPanelProps {
  selectedCompany: Company | null;
  userRole: string;
  onCompanyUpdated: () => void;
  onCompanyDeleted: () => void;
  onClose: () => void;
}

export const CompanyRightPanel: React.FC<CompanyRightPanelProps> = ({
  selectedCompany,
  userRole,
  onCompanyUpdated,
  onCompanyDeleted,
  onClose,
}) => {
  const { t } = useLang();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [editName, setEditName] = useState("");
  const [editTax, setEditTax] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editCity, setEditCity] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");

  useEffect(() => {
    if (selectedCompany) {
      setEditName(selectedCompany.company_name || "");
      setEditTax(selectedCompany.tax_number || "");
      setEditAddress(selectedCompany.address || "");
      setEditCity(selectedCompany.city || "");
      setEditPhone(selectedCompany.phone || "");
      setEditEmail(selectedCompany.email || "");
      setEditing(false);
      setMessage("");
    }
  }, [selectedCompany]);

  const panelStyle: React.CSSProperties = {
    width: "100%",
    maxWidth: "320px",
    minWidth: "320px",
    display: "flex",
    flexDirection: "column",
    height: "100%",
    overflowY: "auto",
    background: "#0d0f15",
    borderLeft: "1px solid #1c1f27",
  };

  const fieldStyle: React.CSSProperties = {
    padding: "10px 14px",
    borderRadius: "10px",
    background: "#15181f",
    border: "1px solid #1c1f27",
  };

  if (!selectedCompany) {
    return (
      <div style={{ ...panelStyle, alignItems: "center", justifyContent: "center" }}>
        <Building2 size={40} style={{ color: "#1c1f27", marginBottom: "12px" }} />
        <p className="text-xs" style={{ color: "#3a3f4a" }}>{t.selectCompany}</p>
      </div>
    );
  }

  const handleSave = async () => {
    if (!editName.trim()) {
      setMessage(t.companyRequired);
      return;
    }
    setSaving(true);
    setMessage("");

    const { error } = await supabase
      .from("companies")
      .update({
        company_name: editName.trim(),
        tax_number: editTax.trim(),
        address: editAddress.trim(),
        city: editCity.trim(),
        phone: editPhone.trim(),
        email: editEmail.trim(),
      })
      .eq("id", selectedCompany.id);

    if (error) {
      setMessage(error.message);
    } else {
      setMessage(t.saved);
      setEditing(false);
      onCompanyUpdated();
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!window.confirm(t.deleteConfirm)) return;
    const { error } = await supabase.from("companies").delete().eq("id", selectedCompany.id);
    if (!error) onCompanyDeleted();
  };

  const isAdmin = userRole === "admin";

  return (
    <div style={panelStyle}>
      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "14px 16px",
        borderBottom: "1px solid #1c1f27",
        background: "#0d0f15",
        flexShrink: 0,
      }}>
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="md:hidden cursor-pointer border-none bg-transparent"
            style={{ color: "#3a3f4a" }}
            onMouseEnter={e => (e.currentTarget.style.color = "#06b6d4")}
            onMouseLeave={e => (e.currentTarget.style.color = "#3a3f4a")}>
            <ArrowLeft size={20} />
          </button>
          <h3 className="font-syne font-bold text-sm text-slate-100 m-0">{t.companyDetail}</h3>
        </div>
        {isAdmin && !editing && (
          <button
            onClick={() => setEditing(true)}
            style={{
              padding: "4px 10px",
              borderRadius: "8px",
              background: "rgba(6,182,212,.1)",
              border: "1px solid rgba(6,182,212,.25)",
              color: "#06b6d4",
              fontSize: "11px",
              fontWeight: 700,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}>
            <Edit2 size={11} /> {t.edit}
          </button>
        )}
      </div>

      {/* Company hero card */}
      <div style={{
        margin: "16px",
        padding: "20px",
        borderRadius: "16px",
        background: "linear-gradient(135deg, rgba(6,182,212,.12) 0%, rgba(6,182,212,.04) 100%)",
        border: "1px solid rgba(6,182,212,.2)",
        textAlign: "center",
        position: "relative",
        overflow: "hidden",
      }}>
        <div style={{
          position: "absolute", top: 0, left: "15%", right: "15%", height: "1px",
          background: "linear-gradient(90deg, transparent, rgba(6,182,212,.4), transparent)",
        }} />
        <div style={{
          width: "48px", height: "48px", borderRadius: "14px",
          background: "rgba(6,182,212,.12)", border: "1px solid rgba(6,182,212,.2)",
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 12px",
        }}>
          <Building2 size={22} style={{ color: "#06b6d4" }} />
        </div>
        <div className="font-syne font-bold text-base mb-1" style={{ color: "#e2e8f0" }}>
          {selectedCompany.company_name || "—"}
        </div>
        <div className="text-xs" style={{ color: "#64748b" }}>
          {selectedCompany.city || ""}
          {selectedCompany.tax_number ? ` · ${selectedCompany.tax_number}` : ""}
        </div>
      </div>

      {/* Flash message */}
      {message && (
        <div className="mx-4 mb-4 px-3 py-2.5 rounded-lg text-xs font-semibold" style={{
          background: message === t.saved ? "rgba(16,185,129,.12)" : "rgba(244,63,94,.12)",
          border: `1px solid ${message === t.saved ? "rgba(16,185,129,.25)" : "rgba(244,63,94,.25)"}`,
          color: message === t.saved ? "#10b981" : "#f43f5e",
        }}>
          {message}
        </div>
      )}

      {/* Fields */}
      <div className="px-4 pb-6 flex flex-col gap-2.5">
        {editing ? (
          <>
            {[
              { label: `${t.companyName} *`, value: editName, setter: setEditName },
              { label: t.taxNumber,          value: editTax,   setter: setEditTax },
              { label: t.address,            value: editAddress, setter: setEditAddress },
              { label: t.city,              value: editCity,   setter: setEditCity },
              { label: t.phone,             value: editPhone,  setter: setEditPhone },
              { label: t.companyEmail,      value: editEmail,  setter: setEditEmail },
            ].map((field, idx) => (
              <div key={idx} style={fieldStyle}>
                <div className="text-[9px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "#3a3f4a" }}>
                  {field.label}
                </div>
                <input
                  type="text"
                  value={field.value}
                  onChange={e => field.setter(e.target.value)}
                  className="c-input text-xs w-full"
                  style={{ padding: "6px 10px" }}
                />
              </div>
            ))}

            <div className="flex gap-2 mt-1">
              <button
                onClick={handleSave}
                disabled={saving}
                className="c-btn-primary flex-1 flex items-center justify-center gap-1.5 text-xs py-2">
                <Save size={12} /> {saving ? t.loading : t.save}
              </button>
              <button
                onClick={() => { setEditing(false); setMessage(""); }}
                className="c-btn-ghost flex-1 flex items-center justify-center gap-1.5 text-xs py-2">
                <X size={12} /> {t.cancel}
              </button>
            </div>
          </>
        ) : (
          <>
            {[
              { label: t.companyName,  value: selectedCompany.company_name },
              { label: t.taxNumber,    value: selectedCompany.tax_number },
              { label: t.address,      value: selectedCompany.address },
              { label: t.city,         value: selectedCompany.city },
              { label: t.phone,        value: selectedCompany.phone },
              { label: t.companyEmail, value: selectedCompany.email },
              {
                label: t.createdAt,
                value: selectedCompany.created_at
                  ? new Date(selectedCompany.created_at).toLocaleString()
                  : "—",
              },
            ].map((field, idx) => (
              <div key={idx} style={fieldStyle}>
                <div className="text-[9px] font-bold uppercase tracking-wider mb-1" style={{ color: "#3a3f4a" }}>
                  {field.label}
                </div>
                <div className="text-xs text-slate-200 break-words leading-snug">
                  {field.value || "—"}
                </div>
              </div>
            ))}

            {isAdmin && (
              <button
                onClick={handleDelete}
                className="c-btn-danger w-full mt-1 py-2.5 flex items-center justify-center gap-2 text-xs font-bold">
                <Trash2 size={13} /> {t.deleteCompany}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};
