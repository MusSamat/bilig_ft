/**
 * Optimistic locking (TZ §5 «защита от одновременной правки», §9 If-Match):
 * every save sends the version the edit was based on; a 409 opens the
 * conflict dialog with both versions side by side and two explicit choices —
 * take theirs (discard mine) or keep mine on top of theirs (re-save with the
 * new version). Unsaved values are autosaved as a local draft.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { isConflict } from '../api/client';
import { useAdminLang, useT } from '../i18n';
import { Dialog, ErrorBox, TableWrap, fmtDate } from '../shell/ui';
import { toast } from '../shell/toast';
import { Icon } from './icons';
import { diffJson, short } from './diff';
import { clearDraft, readDraft, useAutosave, type StoredDraft } from './draft';

export interface Versioned<T> {
  value: T;
  version: number;
}

export interface VersionedEditorOpts<T> {
  /** Local draft key (null: no autosave). */
  draftKey: string | null;
  /** The server state, once loaded. */
  server: Versioned<T> | undefined;
  save(value: T, version: number): Promise<Versioned<T>>;
  /** Fetch the latest server state (after a conflict). */
  reload(): Promise<Versioned<T>>;
  onSaved?(v: Versioned<T>): void;
}

export interface VersionedEditor<T> {
  value: T | undefined;
  setValue(v: T): void;
  version: number | undefined;
  dirty: boolean;
  saving: boolean;
  error: unknown;
  conflict: Versioned<T> | null;
  draft: StoredDraft<T> | null;
  save(): Promise<boolean>;
  takeTheirs(): void;
  keepMine(): Promise<boolean>;
  restoreDraft(): void;
  discardDraft(): void;
  reset(): void;
}

export function useVersionedEditor<T>(opts: VersionedEditorOpts<T>): VersionedEditor<T> {
  const [value, setValueState] = useState<T | undefined>(opts.server?.value);
  const [version, setVersion] = useState<number | undefined>(opts.server?.version);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [conflict, setConflict] = useState<Versioned<T> | null>(null);
  const [draft, setDraft] = useState<StoredDraft<T> | null>(() => (opts.draftKey ? readDraft<T>(opts.draftKey) : null));
  const optsRef = useRef(opts);
  optsRef.current = opts;

  // Adopt server state when it (re)loads and the user has no local edits.
  useEffect(() => {
    if (!opts.server || dirty) return;
    setValueState(opts.server.value);
    setVersion(opts.server.version);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.server?.version, opts.server?.value]);

  useEffect(() => {
    setDraft(opts.draftKey ? readDraft<T>(opts.draftKey) : null);
  }, [opts.draftKey]);

  useAutosave(opts.draftKey, value, version ?? null, dirty);

  const doSave = useCallback(async (v: T, ver: number): Promise<boolean> => {
    setSaving(true);
    setError(null);
    try {
      const saved = await optsRef.current.save(v, ver);
      setValueState(saved.value);
      setVersion(saved.version);
      setDirty(false);
      setConflict(null);
      if (optsRef.current.draftKey) clearDraft(optsRef.current.draftKey);
      setDraft(null);
      optsRef.current.onSaved?.(saved);
      toast('toast.saved', { tone: 'ok', params: { v: saved.version } });
      return true;
    } catch (e) {
      if (isConflict(e)) {
        try {
          setConflict(await optsRef.current.reload());
        } catch (e2) {
          setError(e2);
        }
      } else setError(e);
      return false;
    } finally {
      setSaving(false);
    }
  }, []);

  return {
    value,
    setValue: (v) => {
      setValueState(v);
      setDirty(true);
    },
    version,
    dirty,
    saving,
    error,
    conflict,
    draft: draft && opts.server && JSON.stringify(draft.value) !== JSON.stringify(opts.server.value) ? draft : null,
    save: () => (value === undefined || version === undefined ? Promise.resolve(false) : doSave(value, version)),
    takeTheirs: () => {
      if (!conflict) return;
      setValueState(conflict.value);
      setVersion(conflict.version);
      setDirty(false);
      setConflict(null);
      if (opts.draftKey) clearDraft(opts.draftKey);
    },
    keepMine: () => (conflict && value !== undefined ? doSave(value, conflict.version) : Promise.resolve(false)),
    restoreDraft: () => {
      if (!draft) return;
      setValueState(draft.value);
      setDirty(true);
      setDraft(null);
    },
    discardDraft: () => {
      if (opts.draftKey) clearDraft(opts.draftKey);
      setDraft(null);
    },
    reset: () => {
      if (!opts.server) return;
      setValueState(opts.server.value);
      setVersion(opts.server.version);
      setDirty(false);
    },
  };
}

export function ConflictDialog<T>({ editor }: { editor: VersionedEditor<T> }) {
  const t = useT();
  if (!editor.conflict) return null;
  const changes = diffJson(editor.conflict.value, editor.value).slice(0, 50);
  return (
    <Dialog
      title={t('conflict.title')}
      onClose={() => editor.takeTheirs()}
      actions={
        <>
          <button type="button" className="adm-btn" onClick={() => editor.takeTheirs()}>
            <Icon id="reset" size={18} />
            {t('conflict.takeTheirs')}
          </button>
          <button type="button" className="adm-btn adm-btn--primary" disabled={editor.saving} onClick={() => void editor.keepMine()}>
            {t('conflict.keepMine')}
          </button>
        </>
      }
    >
      <p className="adm-conflict__lead">
        <Icon id="warn" />
        <span>{t('conflict.body', { mine: editor.version, theirs: editor.conflict.version })}</span>
      </p>
      {changes.length ? (
        <TableWrap>
        <table className="adm-table adm-table--compact">
          <thead>
            <tr>
              <th>{t('conflict.field')}</th>
              <th>{t('conflict.theirs')}</th>
              <th>{t('conflict.mine')}</th>
            </tr>
          </thead>
          <tbody>
            {changes.map((c, i) => (
              <tr key={i}>
                <td>
                  <code>{c.path.join('.') || '—'}</code>
                </td>
                <td>{short(c.before)}</td>
                <td>{short(c.after)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </TableWrap>
      ) : (
        <p className="adm-muted">{t('conflict.same')}</p>
      )}
    </Dialog>
  );
}

export function DraftBanner<T>({ editor }: { editor: VersionedEditor<T> }) {
  const t = useT();
  const lang = useAdminLang((s) => s.lang);
  if (!editor.draft) return null;
  return (
    <div className="adm-alert adm-alert--info" role="status">
      <Icon id="clock" size={18} />
      <span>{t('draft.found', { when: fmtDate(editor.draft.savedAt, lang) })}</span>
      <button type="button" className="adm-btn adm-btn--small" onClick={editor.restoreDraft}>
        {t('draft.restore')}
      </button>
      <button type="button" className="adm-btn adm-btn--small adm-btn--ghost" onClick={editor.discardDraft}>
        {t('draft.discard')}
      </button>
    </div>
  );
}

export function SaveBar<T>({ editor, disabled, canSave = true }: { editor: VersionedEditor<T>; disabled?: boolean; canSave?: boolean }) {
  const t = useT();
  const state = editor.saving ? 'saving' : editor.dirty ? 'dirty' : 'clean';
  return (
    <div className="adm-savebar" data-state={state}>
      <ErrorBox error={editor.error} />
      <span className="adm-savebar__status" role="status">
        <Icon id={state === 'saving' ? 'reset' : state === 'dirty' ? 'clock' : 'a-cloud-ok'} size={18} />
        <span>{state === 'saving' ? t('common.saving') : state === 'dirty' ? t('draft.autosaved') : t('draft.clean')}</span>
        {editor.version !== undefined && <span className="adm-savebar__ver">{t('common.version', { v: editor.version })}</span>}
      </span>
      {canSave && (
        <span className="adm-savebar__actions">
          <button type="button" className="adm-btn adm-btn--ghost" disabled={!editor.dirty} onClick={editor.reset}>
            {t('common.cancel')}
          </button>
          <button type="button" className="adm-btn adm-btn--primary" disabled={!editor.dirty || editor.saving || disabled} onClick={() => void editor.save()}>
            <Icon id="check" size={18} />
            {editor.saving ? t('common.saving') : t('common.save')}
          </button>
        </span>
      )}
      <ConflictDialog editor={editor} />
    </div>
  );
}
