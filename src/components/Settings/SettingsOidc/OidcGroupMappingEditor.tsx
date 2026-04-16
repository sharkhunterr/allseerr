import Button from '@app/components/Common/Button';
import defineMessages from '@app/utils/defineMessages';
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import type { OidcGroupMapping } from '@server/lib/settings';
import { Permission } from '@server/lib/permissions';
import { useIntl } from 'react-intl';

const messages = defineMessages(
  'components.Settings.SettingsOidc.OidcGroupMappingEditor',
  {
    groupMappings: 'Group Mappings',
    groupMappingsDescription:
      'Map OIDC group names to Allseerr permission levels. Groups are re-evaluated on each login.',
    oidcGroupName: 'OIDC Group Name',
    permissionLevel: 'Permission Level',
    addMapping: 'Add Mapping',
    admin: 'Admin',
    standardUser: 'Standard User (can request)',
    requestOnly: 'Request-Only User',
  }
);

const PERMISSION_PRESETS = [
  { label: 'admin', value: Permission.ADMIN },
  { label: 'standardUser', value: Permission.REQUEST },
  {
    label: 'requestOnly',
    value: Permission.REQUEST,
  },
] as const;

interface OidcGroupMappingEditorProps {
  groupMappings: OidcGroupMapping[];
  onChange: (mappings: OidcGroupMapping[]) => void;
}

const OidcGroupMappingEditor = ({
  groupMappings,
  onChange,
}: OidcGroupMappingEditorProps) => {
  const intl = useIntl();

  const addMapping = () => {
    onChange([
      ...groupMappings,
      { oidcGroup: '', permissions: Permission.REQUEST },
    ]);
  };

  const removeMapping = (index: number) => {
    onChange(groupMappings.filter((_, i) => i !== index));
  };

  const updateMapping = (
    index: number,
    field: keyof OidcGroupMapping,
    value: string | number
  ) => {
    const updated = [...groupMappings];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  };

  return (
    <div className="mt-6">
      <h4 className="text-lg font-bold text-gray-100">
        {intl.formatMessage(messages.groupMappings)}
      </h4>
      <p className="mb-4 text-sm text-gray-400">
        {intl.formatMessage(messages.groupMappingsDescription)}
      </p>

      {groupMappings.length > 0 && (
        <div className="mb-2 grid grid-cols-12 gap-2 text-sm font-medium text-gray-400">
          <div className="col-span-5">
            {intl.formatMessage(messages.oidcGroupName)}
          </div>
          <div className="col-span-5">
            {intl.formatMessage(messages.permissionLevel)}
          </div>
          <div className="col-span-2" />
        </div>
      )}

      {groupMappings.map((mapping, index) => (
        <div
          key={index}
          className="mb-2 grid grid-cols-12 items-center gap-2"
        >
          <div className="col-span-5">
            <input
              type="text"
              className="w-full rounded-md border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white"
              placeholder="allseerr-admins"
              value={mapping.oidcGroup}
              onChange={(e) =>
                updateMapping(index, 'oidcGroup', e.target.value)
              }
            />
          </div>
          <div className="col-span-5">
            <select
              className="w-full rounded-md border border-gray-600 bg-gray-700 px-3 py-2 text-sm text-white"
              value={mapping.permissions}
              onChange={(e) =>
                updateMapping(
                  index,
                  'permissions',
                  parseInt(e.target.value, 10)
                )
              }
            >
              {PERMISSION_PRESETS.map((preset) => (
                <option key={preset.label} value={preset.value}>
                  {intl.formatMessage(messages[preset.label])}
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2 flex justify-center">
            <button
              type="button"
              className="rounded p-1 text-gray-400 hover:text-red-400"
              onClick={() => removeMapping(index)}
            >
              <TrashIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
      ))}

      <Button
        buttonType="default"
        type="button"
        className="mt-2"
        onClick={addMapping}
      >
        <PlusIcon className="mr-1 h-4 w-4" />
        {intl.formatMessage(messages.addMapping)}
      </Button>
    </div>
  );
};

export default OidcGroupMappingEditor;
