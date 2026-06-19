/**
 * RegisterServerForm — a small inline disclosure to register a server launch
 * recipe ({ name, cwd, command }). Validates that all three fields are
 * non-empty, calls `registerServer`, then asks the panel to refresh. Errors
 * are surfaced inline; nothing is swallowed.
 */
import { useState } from "react";
import type { RegisteredServer } from "@mission-control/shared";
import { registerServer, ApiError } from "../lib/api";

interface RegisterServerFormProps {
  /** Called after a successful registration so the panel can refetch. */
  onRegistered: (server: RegisteredServer) => void;
}

interface FormFields {
  name: string;
  cwd: string;
  command: string;
}

const EMPTY: FormFields = { name: "", cwd: "", command: "" };

function fieldErrorMessage(err: unknown): string {
  if (err instanceof ApiError) return `Register failed (${err.status})`;
  if (err instanceof Error) return err.message;
  return "Register failed";
}

interface TextFieldProps {
  id: string;
  label: string;
  placeholder: string;
  value: string;
  mono?: boolean;
  onChange: (value: string) => void;
}

function TextField({ id, label, placeholder, value, mono, onChange }: TextFieldProps) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1">
      <span className="caption">{label}</span>
      <input
        id={id}
        type="text"
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        className={`${mono ? "mono " : ""}rounded-md px-2 py-1.5 text-xs outline-none`}
        style={{
          backgroundColor: "var(--color-void)",
          color: "var(--color-text)",
          border: "1px solid var(--color-line)",
        }}
      />
    </label>
  );
}

export function RegisterServerForm({ onRegistered }: RegisterServerFormProps) {
  const [open, setOpen] = useState(false);
  const [fields, setFields] = useState<FormFields>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setField = (key: keyof FormFields, value: string): void => {
    setFields((prev) => ({ ...prev, [key]: value }));
  };

  const trimmed: FormFields = {
    name: fields.name.trim(),
    cwd: fields.cwd.trim(),
    command: fields.command.trim(),
  };
  const isValid = Boolean(trimmed.name && trimmed.cwd && trimmed.command);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!isValid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const server = await registerServer(trimmed);
      onRegistered(server);
      setFields(EMPTY);
      setOpen(false);
    } catch (err: unknown) {
      setError(fieldErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mono rounded-md px-3 py-1.5 text-xs font-medium tracking-wider transition-colors"
        style={{
          color: "var(--color-cool)",
          border: "1px solid var(--color-cool)",
          backgroundColor: "color-mix(in srgb, var(--color-cool) 10%, transparent)",
        }}
      >
        + REGISTER SERVER
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="panel flex flex-col gap-3 p-3">
      <TextField
        id="reg-name"
        label="name"
        placeholder="web"
        value={fields.name}
        onChange={(v) => setField("name", v)}
      />
      <TextField
        id="reg-cwd"
        label="cwd"
        placeholder="/Users/you/project"
        value={fields.cwd}
        mono
        onChange={(v) => setField("cwd", v)}
      />
      <TextField
        id="reg-command"
        label="command"
        placeholder="npm run dev"
        value={fields.command}
        mono
        onChange={(v) => setField("command", v)}
      />

      {error ? (
        <p
          className="mono text-[0.625rem] leading-tight"
          role="alert"
          style={{ color: "var(--color-alert)" }}
        >
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="mono rounded-md px-3 py-1.5 text-xs tracking-wider transition-colors"
          style={{ color: "var(--color-muted)", border: "1px solid var(--color-line)" }}
        >
          CANCEL
        </button>
        <button
          type="submit"
          disabled={!isValid || submitting}
          className="mono rounded-md px-3 py-1.5 text-xs font-medium tracking-wider transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          style={{
            color: "var(--color-ok)",
            border: "1px solid var(--color-ok)",
            backgroundColor: "color-mix(in srgb, var(--color-ok) 10%, transparent)",
          }}
        >
          {submitting ? "SAVING…" : "SAVE"}
        </button>
      </div>
    </form>
  );
}
