import Alert from '@app/components/Common/Alert';
import Badge from '@app/components/Common/Badge';
import Button from '@app/components/Common/Button';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import defineMessages from '@app/utils/defineMessages';
import {
  CheckCircleIcon,
  PencilSquareIcon,
  PlusIcon,
  TrashIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';
import type {
  NoticeContext,
  NoticeEntry,
  NoticeMediaScope,
  RequestNoticeSeverity,
} from '@server/interfaces/api/settingsInterfaces';
import axios from 'axios';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import { useToasts } from 'react-toast-notifications';
import useSWR, { mutate as globalMutate } from 'swr';

const messages = defineMessages('components.Settings.Notices', {
  heading: 'Notices',
  description:
    'Operator-defined messages shown across the app. Each notice picks one or more surfaces (detail page of the type, search tab of the type, discover page of the type) and a severity (info / warning / error). Notices can be temporarily disabled without losing the wording.',
  addNotice: 'Add a notice',
  empty: 'No notices yet. Add one — pick a media type, choose where it appears, write the message.',
  // Card chips
  contextDetail: 'Detail page',
  contextSearch: 'Search tab',
  contextDiscover: 'Discover',
  // Scope labels (re-used as <select> options + chips)
  scopeGlobal: 'All media types',
  scopeMovie: 'Movies',
  scopeTv: 'Series',
  scopeBook: 'Books',
  scopeAudiobook: 'Audiobooks',
  scopeGame: 'Games',
  scopeManga: 'Manga',
  scopeComic: 'Comics',
  scopeMagazine: 'Magazines',
  // Severities
  severityInfo: 'Info',
  severityWarning: 'Warning',
  severityError: 'Error',
  // Editor form
  labelField: 'Label (admin-only)',
  labelHelp: 'Optional — shown only in this editor so similar notices stay distinguishable.',
  messageField: 'Message',
  messageHelp: 'The text users see.',
  mediaScopeField: 'Media type',
  contextsField: 'Where to display',
  severityField: 'Style',
  enabledField: 'Active',
  preview: 'Preview',
  save: 'Save',
  cancel: 'Cancel',
  saving: 'Saving…',
  noContextsWarning: 'Pick at least one surface.',
  emptyMessageWarning: 'A message is required for the notice to render.',
  // Toasts
  saved: 'Notice saved.',
  saveFailed: 'Failed to save notice.',
  deleted: 'Notice deleted.',
  deleteFailed: 'Failed to delete notice.',
  toggleFailed: 'Failed to toggle notice.',
  disabledLabel: 'Disabled',
  enableTooltip: 'Enable notice',
  disableTooltip: 'Disable notice',
});

const SCOPE_OPTIONS: NoticeMediaScope[] = [
  'global',
  'movie',
  'tv',
  'book',
  'audiobook',
  'game',
  'manga',
  'comic',
  'magazine',
];

const SCOPE_LABEL_KEY: Record<NoticeMediaScope, keyof typeof messages> = {
  global: 'scopeGlobal',
  movie: 'scopeMovie',
  tv: 'scopeTv',
  book: 'scopeBook',
  audiobook: 'scopeAudiobook',
  game: 'scopeGame',
  manga: 'scopeManga',
  comic: 'scopeComic',
  magazine: 'scopeMagazine',
};

const CONTEXT_LABEL_KEY: Record<NoticeContext, keyof typeof messages> = {
  detail: 'contextDetail',
  search: 'contextSearch',
  discover: 'contextDiscover',
};

const SEVERITY_OPTIONS: RequestNoticeSeverity[] = ['info', 'warning', 'error'];

/** Ring + text colour pair driving the severity chip on the
 *  collapsed card view (mirrors the Alert palette). */
const SEVERITY_CHIP: Record<RequestNoticeSeverity, string> = {
  info: 'bg-blue-500/20 text-blue-200 ring-blue-500/40',
  warning: 'bg-amber-500/20 text-amber-200 ring-amber-500/40',
  error: 'bg-red-500/20 text-red-200 ring-red-500/40',
};

interface DraftState {
  id: string | null;
  message: string;
  severity: RequestNoticeSeverity;
  mediaScope: NoticeMediaScope;
  contexts: NoticeContext[];
  enabled: boolean;
  label: string;
}

const BLANK_DRAFT: DraftState = {
  id: null,
  message: '',
  severity: 'info',
  mediaScope: 'global',
  contexts: ['detail'],
  enabled: true,
  label: '',
};

const NoticesSection = () => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const { data, error, mutate } = useSWR<NoticeEntry[]>(
    '/api/v1/settings/notices'
  );
  const [draft, setDraft] = useState<DraftState | null>(null);

  if (!data && !error) return <LoadingSpinner />;

  const list = data ?? [];

  /** Revalidate both this hook AND the public settings cache so
   *  the live render in /search/discover/detail picks up changes
   *  without a hard reload. */
  const revalidateAll = async () => {
    await mutate();
    await globalMutate('/api/v1/settings/public');
  };

  const startCreate = () => setDraft({ ...BLANK_DRAFT });
  const startEdit = (n: NoticeEntry) =>
    setDraft({
      id: n.id,
      message: n.message,
      severity: n.severity,
      mediaScope: n.mediaScope,
      contexts: [...n.contexts],
      enabled: n.enabled,
      label: n.label ?? '',
    });
  const cancel = () => setDraft(null);

  const persistDraft = async () => {
    if (!draft) return;
    if (draft.contexts.length === 0) return;
    const payload = {
      message: draft.message,
      severity: draft.severity,
      mediaScope: draft.mediaScope,
      contexts: draft.contexts,
      enabled: draft.enabled,
      label: draft.label,
    };
    try {
      if (draft.id) {
        await axios.put(`/api/v1/settings/notices/${draft.id}`, payload);
      } else {
        await axios.post('/api/v1/settings/notices', payload);
      }
      addToast(intl.formatMessage(messages.saved), {
        appearance: 'success',
        autoDismiss: true,
      });
      await revalidateAll();
      setDraft(null);
    } catch {
      addToast(intl.formatMessage(messages.saveFailed), {
        appearance: 'error',
        autoDismiss: true,
      });
    }
  };

  const remove = async (id: string) => {
    try {
      await axios.delete(`/api/v1/settings/notices/${id}`);
      addToast(intl.formatMessage(messages.deleted), {
        appearance: 'success',
        autoDismiss: true,
      });
      await revalidateAll();
    } catch {
      addToast(intl.formatMessage(messages.deleteFailed), {
        appearance: 'error',
        autoDismiss: true,
      });
    }
  };

  const toggleEnabled = async (n: NoticeEntry) => {
    try {
      await axios.put(`/api/v1/settings/notices/${n.id}`, {
        enabled: !n.enabled,
      });
      await revalidateAll();
    } catch {
      addToast(intl.formatMessage(messages.toggleFailed), {
        appearance: 'error',
        autoDismiss: true,
      });
    }
  };

  return (
    <>
      <div className="mb-6 mt-12 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="heading">{intl.formatMessage(messages.heading)}</h3>
          <p className="description">
            {intl.formatMessage(messages.description)}
          </p>
        </div>
        <Button buttonType="primary" onClick={startCreate}>
          <PlusIcon className="h-5 w-5" />
          <span>{intl.formatMessage(messages.addNotice)}</span>
        </Button>
      </div>

      <div className="section space-y-3">
        {draft && draft.id === null && (
          <NoticeEditor
            draft={draft}
            onChange={setDraft}
            onCancel={cancel}
            onSave={persistDraft}
          />
        )}

        {list.length === 0 && !draft ? (
          <div className="rounded-lg border border-dashed border-gray-700 bg-gray-800/40 p-8 text-center text-sm text-gray-400">
            {intl.formatMessage(messages.empty)}
          </div>
        ) : (
          list.map((n) =>
            draft && draft.id === n.id ? (
              <NoticeEditor
                key={n.id}
                draft={draft}
                onChange={setDraft}
                onCancel={cancel}
                onSave={persistDraft}
              />
            ) : (
              <NoticeCard
                key={n.id}
                entry={n}
                onEdit={() => startEdit(n)}
                onDelete={() => remove(n.id)}
                onToggle={() => toggleEnabled(n)}
              />
            )
          )
        )}
      </div>
    </>
  );
};

interface NoticeCardProps {
  entry: NoticeEntry;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
}

const NoticeCard = ({ entry, onEdit, onDelete, onToggle }: NoticeCardProps) => {
  const intl = useIntl();
  return (
    <div
      className={`rounded-lg border bg-gray-800/60 p-4 shadow-sm ring-1 transition ${
        entry.enabled
          ? 'border-gray-700 ring-gray-700/40'
          : 'border-gray-800 opacity-60 ring-gray-800'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ${SEVERITY_CHIP[entry.severity]}`}
            >
              {intl.formatMessage(
                messages[
                  `severity${entry.severity[0].toUpperCase()}${entry.severity.slice(1)}` as keyof typeof messages
                ]
              )}
            </span>
            <Badge badgeType="default">
              {intl.formatMessage(messages[SCOPE_LABEL_KEY[entry.mediaScope]])}
            </Badge>
            {entry.contexts.length === 0 ? (
              <Badge badgeType="warning">
                {intl.formatMessage(messages.noContextsWarning)}
              </Badge>
            ) : (
              entry.contexts.map((c) => (
                <Badge key={c} badgeType="primary">
                  {intl.formatMessage(messages[CONTEXT_LABEL_KEY[c]])}
                </Badge>
              ))
            )}
            {!entry.enabled && (
              <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                <XCircleIcon className="h-4 w-4" />
                {intl.formatMessage(messages.disabledLabel)}
              </span>
            )}
          </div>
          {entry.label && (
            <div className="text-xs uppercase tracking-wider text-gray-500">
              {entry.label}
            </div>
          )}
          {entry.message ? (
            <Alert title={entry.message} type={entry.severity} />
          ) : (
            <div className="rounded border border-dashed border-gray-700 px-3 py-2 text-sm italic text-gray-500">
              {intl.formatMessage(messages.emptyMessageWarning)}
            </div>
          )}
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <Button
            buttonType="default"
            buttonSize="sm"
            onClick={onToggle}
            title={
              entry.enabled
                ? intl.formatMessage(messages.disableTooltip)
                : intl.formatMessage(messages.enableTooltip)
            }
          >
            {entry.enabled ? (
              <CheckCircleIcon className="h-5 w-5" />
            ) : (
              <XCircleIcon className="h-5 w-5" />
            )}
          </Button>
          <Button buttonType="default" buttonSize="sm" onClick={onEdit}>
            <PencilSquareIcon className="h-5 w-5" />
          </Button>
          <Button buttonType="danger" buttonSize="sm" onClick={onDelete}>
            <TrashIcon className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
};

interface NoticeEditorProps {
  draft: DraftState;
  onChange: (next: DraftState) => void;
  onCancel: () => void;
  onSave: () => void;
}

const NoticeEditor = ({
  draft,
  onChange,
  onCancel,
  onSave,
}: NoticeEditorProps) => {
  const intl = useIntl();
  const messageInvalid = draft.message.trim().length === 0;
  const contextsInvalid = draft.contexts.length === 0;

  const toggleContext = (c: NoticeContext) => {
    onChange({
      ...draft,
      contexts: draft.contexts.includes(c)
        ? draft.contexts.filter((x) => x !== c)
        : [...draft.contexts, c],
    });
  };

  return (
    <div className="rounded-lg border border-indigo-500/40 bg-gray-800/80 p-4 ring-1 ring-indigo-500/20">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <label
            htmlFor="noticeLabel"
            className="mb-1 block text-sm font-medium text-gray-100"
          >
            {intl.formatMessage(messages.labelField)}
          </label>
          <input
            id="noticeLabel"
            type="text"
            value={draft.label}
            onChange={(e) => onChange({ ...draft, label: e.target.value })}
            placeholder="Holiday maintenance — Dec 2026"
            className="block w-full rounded-md border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          <p className="mt-1 text-xs text-gray-400">
            {intl.formatMessage(messages.labelHelp)}
          </p>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-gray-100">
            {intl.formatMessage(messages.severityField)}
          </span>
          <div className="flex flex-wrap gap-2">
            {SEVERITY_OPTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onChange({ ...draft, severity: s })}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wider ring-1 transition ${
                  draft.severity === s
                    ? SEVERITY_CHIP[s]
                    : 'bg-gray-700/40 text-gray-300 ring-gray-700 hover:bg-gray-700'
                }`}
              >
                {intl.formatMessage(
                  messages[
                    `severity${s[0].toUpperCase()}${s.slice(1)}` as keyof typeof messages
                  ]
                )}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label
            htmlFor="noticeMediaScope"
            className="mb-1 block text-sm font-medium text-gray-100"
          >
            {intl.formatMessage(messages.mediaScopeField)}
          </label>
          <select
            id="noticeMediaScope"
            value={draft.mediaScope}
            onChange={(e) =>
              onChange({
                ...draft,
                mediaScope: e.target.value as NoticeMediaScope,
              })
            }
            className="block w-full rounded-md border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {SCOPE_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {intl.formatMessage(messages[SCOPE_LABEL_KEY[s]])}
              </option>
            ))}
          </select>
        </div>

        <div>
          <span className="mb-1 block text-sm font-medium text-gray-100">
            {intl.formatMessage(messages.contextsField)}
          </span>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(CONTEXT_LABEL_KEY) as NoticeContext[]).map((c) => {
              const active = draft.contexts.includes(c);
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggleContext(c)}
                  className={`rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition ${
                    active
                      ? 'bg-indigo-500/20 text-indigo-200 ring-indigo-500/40'
                      : 'bg-gray-700/40 text-gray-300 ring-gray-700 hover:bg-gray-700'
                  }`}
                >
                  {intl.formatMessage(messages[CONTEXT_LABEL_KEY[c]])}
                </button>
              );
            })}
          </div>
          {contextsInvalid && (
            <p className="mt-1 text-xs text-amber-400">
              {intl.formatMessage(messages.noContextsWarning)}
            </p>
          )}
        </div>
      </div>

      <div className="mt-4">
        <label
          htmlFor="noticeMessage"
          className="mb-1 block text-sm font-medium text-gray-100"
        >
          {intl.formatMessage(messages.messageField)}
        </label>
        <textarea
          id="noticeMessage"
          value={draft.message}
          onChange={(e) => onChange({ ...draft, message: e.target.value })}
          rows={3}
          className="block w-full rounded-md border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
        <p className="mt-1 text-xs text-gray-400">
          {intl.formatMessage(messages.messageHelp)}
        </p>
        {messageInvalid && (
          <p className="mt-1 text-xs text-amber-400">
            {intl.formatMessage(messages.emptyMessageWarning)}
          </p>
        )}
      </div>

      {!messageInvalid && (
        <div className="mt-4">
          <span className="mb-1 block text-xs uppercase tracking-wider text-gray-400">
            {intl.formatMessage(messages.preview)}
          </span>
          <Alert title={draft.message} type={draft.severity} />
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-100">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(e) => onChange({ ...draft, enabled: e.target.checked })}
            className="h-4 w-4 rounded border-gray-500 bg-gray-700 text-indigo-500 focus:ring-indigo-500"
          />
          <span>{intl.formatMessage(messages.enabledField)}</span>
        </label>
        <div className="flex items-center gap-2">
          <Button buttonType="default" onClick={onCancel}>
            {intl.formatMessage(messages.cancel)}
          </Button>
          <Button
            buttonType="primary"
            onClick={onSave}
            disabled={messageInvalid || contextsInvalid}
          >
            {intl.formatMessage(messages.save)}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default NoticesSection;
