import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../AuthContext';
import { GearKindIcon } from '../../components/Icons';
import {
  ACCENT_KEYS, GEAR_KINDS, accentVar, comfortOf, labelOf, onAccentVar, AccentKey, GearKind,
} from '../../lib/feel';
import { errorFromResponse, describeRequestError } from '../../lib/apiErrors';
import { useGearList } from '../../lib/useGearList';
import type { Gear } from '../../lib/runTypes';
import { gearPattern } from './gearPattern';
import '../../components/components.css';
import '../../components/runFeelForm.css';
import './gear.css';

interface GearFields {
  name: string;
  kind: GearKind;
  color: AccentKey;
}

interface FormProps {
  title: string;
  initial: GearFields;
  submitLabel: string;
  onSubmit: (fields: GearFields) => Promise<void>;
  onCancel: () => void;
  extra?: React.ReactNode;
}

function GearForm({ title, initial, submitLabel, onSubmit, onCancel, extra }: FormProps) {
  const [fields, setFields] = useState<GearFields>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!fields.name.trim()) { setError('Give it a name.'); return; }
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ ...fields, name: fields.name.trim() });
    } catch (err) {
      setError(describeRequestError(err));
      setSaving(false);
    }
  }

  return (
    <form className="card stack tight gear-form" onSubmit={submit} aria-label={title}>
      <h2 className="h2">{title}</h2>
      <input
        className="txt"
        aria-label="Name"
        placeholder="Name, e.g. Pegasus 41"
        value={fields.name}
        maxLength={80}
        autoFocus
        onChange={e => setFields(f => ({ ...f, name: e.target.value }))}
      />
      <div className="row" role="group" aria-label="Kind">
        {GEAR_KINDS.map(k => (
          <button
            key={k.key}
            type="button"
            className="chip small"
            aria-pressed={fields.kind === k.key}
            onClick={() => setFields(f => ({ ...f, kind: k.key }))}
          >
            {k.label}
          </button>
        ))}
      </div>
      <div className="row" role="group" aria-label="Colour">
        {ACCENT_KEYS.map(c => (
          <button
            key={c}
            type="button"
            className="swatch"
            aria-label={`Colour ${c.slice(1)}`}
            aria-pressed={fields.color === c}
            style={{ background: accentVar(c) }}
            onClick={() => setFields(f => ({ ...f, color: c }))}
          />
        ))}
      </div>
      {error && <p className="error-text" role="alert">{error}</p>}
      <div className="row gear-form-actions">
        {extra}
        <button type="button" className="pill-btn" onClick={onCancel} disabled={saving}>Cancel</button>
        <button type="submit" className="pill-btn primary" disabled={saving}>{saving ? 'Saving…' : submitLabel}</button>
      </div>
    </form>
  );
}

function GearSummary({ item }: { item: Gear }) {
  const comfort = comfortOf(item.avg_comfort);
  return (
    <div className="gear-row">
      <div className="gear-ic" style={{ background: accentVar(item.color), color: onAccentVar(item.color) }}>
        <GearKindIcon kind={item.kind} />
      </div>
      <div className="gear-row-text">
        <b>{item.name}</b>
        <div className="muted-line">
          {labelOf(GEAR_KINDS, item.kind)} · {item.run_count} {item.run_count === 1 ? 'run' : 'runs'}
        </div>
      </div>
      {comfort ? (
        <span className="tag" style={{ background: accentVar(comfort.accent), color: onAccentVar(comfort.accent) }}>
          {comfort.word}
        </span>
      ) : (
        <span className="tag">Not rated yet</span>
      )}
    </div>
  );
}

export default function GearTab() {
  const { apiFetch, signOut } = useAuth();
  const { gear, error, setGear } = useGearList();
  const [searchParams, setSearchParams] = useSearchParams();
  const [adding, setAdding] = useState(searchParams.get('add') === '1');
  const [editingId, setEditingId] = useState<string | null>(null);

  async function send(url: string, method: string, body: object): Promise<Gear> {
    const res = await apiFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw await errorFromResponse(res);
    return res.json();
  }

  const replace = (updated: Gear) => setGear(g => (g ?? []).map(x => (x.id === updated.id ? updated : x)));

  function closeAdd() {
    setAdding(false);
    if (searchParams.has('add')) setSearchParams({}, { replace: true });
  }

  async function create(fields: GearFields) {
    const created = await send('/api/gear', 'POST', fields);
    setGear(g => [...(g ?? []), created]);
    closeAdd();
  }

  async function update(id: string, patch: Partial<GearFields> & { retired?: boolean }) {
    replace(await send(`/api/gear/${id}`, 'PATCH', patch));
    setEditingId(null);
  }

  const active = (gear ?? []).filter(g => !g.retired);
  const retired = (gear ?? []).filter(g => g.retired);
  const pattern = gear ? gearPattern(gear) : null;

  return (
    <div className="page">
      <div className="row between gear-header">
        <div>
          <div className="eyebrow">Your closet</div>
          <h1 className="h">What you run in</h1>
        </div>
        <button type="button" className="pill-btn" onClick={signOut}>Sign out</button>
      </div>

      {pattern && (
        <section className="pattern-card">
          <div className="eyebrow">Pattern</div>
          <p className="pattern-text">{pattern}</p>
        </section>
      )}

      {gear === null && <p className="state-msg">Loading…</p>}
      {error && <p className="error-text">Couldn't load your gear ({error}).</p>}

      {active.map(item => (
        editingId === item.id ? (
          <GearForm
            key={item.id}
            title={`Edit ${item.name}`}
            initial={{ name: item.name, kind: item.kind, color: item.color }}
            submitLabel="Save"
            onSubmit={fields => update(item.id, fields)}
            onCancel={() => setEditingId(null)}
            extra={
              <button type="button" className="pill-btn retire-btn" onClick={() => update(item.id, { retired: true })}>
                Retire
              </button>
            }
          />
        ) : (
          <button
            type="button"
            key={item.id}
            className="card gear-card"
            aria-label={`Edit ${item.name}`}
            onClick={() => { setEditingId(item.id); setAdding(false); }}
          >
            <GearSummary item={item} />
          </button>
        )
      ))}

      {gear !== null && active.length === 0 && !adding && (
        <p className="muted-line">Nothing here yet. Add the shoes, tops and headphones you run in, then rate them after each run.</p>
      )}

      {adding ? (
        <GearForm
          title="Add gear"
          initial={{ name: '', kind: 'shoe', color: 'a1' }}
          submitLabel="Add"
          onSubmit={create}
          onCancel={closeAdd}
        />
      ) : (
        <button type="button" className="chip dashed" onClick={() => { setAdding(true); setEditingId(null); }}>
          + Add gear
        </button>
      )}

      {retired.length > 0 && (
        <section className="stack tight retired-section">
          <h2 className="eyebrow">Retired</h2>
          {retired.map(item => (
            <div className="card gear-card retired" key={item.id}>
              <GearSummary item={item} />
              <button type="button" className="link-btn strong" onClick={() => update(item.id, { retired: false })}>
                Bring back
              </button>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
