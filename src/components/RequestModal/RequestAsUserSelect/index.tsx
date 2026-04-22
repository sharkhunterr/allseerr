import CachedImage from '@app/components/Common/CachedImage';
import type { User } from '@app/hooks/useUser';
import { Permission, useUser } from '@app/hooks/useUser';
import defineMessages from '@app/utils/defineMessages';
import { Listbox, Transition } from '@headlessui/react';
import { CheckIcon, ChevronDownIcon } from '@heroicons/react/24/solid';
import type { UserResultsResponse } from '@server/interfaces/api/userInterfaces';
import { hasPermission } from '@server/lib/permissions';
import { useEffect, useMemo, useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages('components.RequestModal.RequestAsUserSelect', {
  requestas: 'Request As',
});

interface RequestAsUserSelectProps {
  /**
   * Permissions a target user must have for at least one of them to be
   * eligible. Same OR-shape logic as `AdvancedRequester` so admins can
   * only attribute the request to users who could actually have made it.
   */
  requiredPermissions: Permission[];
  /** Pre-selected user (defaults to the current user). */
  defaultUser?: User | null;
  onChange: (user: User | null) => void;
}

const RequestAsUserSelect = ({
  requiredPermissions,
  defaultUser,
  onChange,
}: RequestAsUserSelectProps) => {
  const intl = useIntl();
  const { user: currentUser, hasPermission: currentHasPermission } = useUser();
  const canImpersonate = currentHasPermission([
    Permission.MANAGE_REQUESTS,
    Permission.MANAGE_USERS,
  ]);

  const { data } = useSWR<UserResultsResponse>(
    canImpersonate ? '/api/v1/user?take=1000&sort=displayname' : null
  );

  const filteredUsers = useMemo(
    () =>
      data?.results.filter((u) =>
        hasPermission(requiredPermissions, u.permissions, { type: 'or' })
      ) ?? [],
    [data?.results, requiredPermissions]
  );

  const [selected, setSelected] = useState<User | null>(
    defaultUser ?? currentUser ?? null
  );

  // Reset to a sensible default the first time the user list resolves
  // (the impersonation picker only renders after the SWR fetch lands).
  useEffect(() => {
    if (!selected && filteredUsers.length > 0) {
      const me = filteredUsers.find((u) => u.id === currentUser?.id);
      setSelected(me ?? filteredUsers[0]);
    }
  }, [filteredUsers, currentUser, selected]);

  useEffect(() => {
    onChange(selected);
  }, [selected, onChange]);

  if (!canImpersonate || filteredUsers.length <= 1 || !selected) return null;

  return (
    <div className="mt-4">
      <Listbox
        as="div"
        value={selected}
        onChange={(value) => setSelected(value)}
        className="space-y-1"
      >
        {({ open }) => (
          <>
            <Listbox.Label className="text-sm text-gray-300">
              {intl.formatMessage(messages.requestas)}
            </Listbox.Label>
            <div className="relative">
              <span className="inline-block w-full rounded-md shadow-sm">
                <Listbox.Button className="focus:shadow-outline-blue relative w-full cursor-default rounded-md border border-gray-700 bg-gray-800 py-2 pl-3 pr-10 text-left text-white transition duration-150 ease-in-out focus:border-blue-300 focus:outline-none sm:text-sm sm:leading-5">
                  <span className="flex items-center">
                    <CachedImage
                      type="avatar"
                      src={selected.avatar}
                      alt=""
                      className="h-6 w-6 flex-shrink-0 rounded-full object-cover"
                      width={24}
                      height={24}
                    />
                    <span className="ml-3 block">{selected.displayName}</span>
                    {selected.displayName.toLowerCase() !== selected.email && (
                      <span className="ml-1 truncate text-gray-400">
                        ({selected.email})
                      </span>
                    )}
                  </span>
                  <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2 text-gray-500">
                    <ChevronDownIcon className="h-5 w-5" />
                  </span>
                </Listbox.Button>
              </span>
              <Transition
                show={open}
                enter="transition-opacity ease-in duration-300"
                enterFrom="opacity-0"
                enterTo="opacity-100"
                leave="transition-opacity ease-in duration-100"
                leaveFrom="opacity-100"
                leaveTo="opacity-0"
                className="mt-1 w-full rounded-md border border-gray-700 bg-gray-800 shadow-lg"
              >
                <Listbox.Options
                  static
                  className="shadow-xs max-h-60 overflow-auto rounded-md py-1 text-base leading-6 focus:outline-none sm:text-sm sm:leading-5"
                >
                  {filteredUsers.map((user) => (
                    <Listbox.Option key={user.id} value={user}>
                      {({ selected: isSelected, active }) => (
                        <div
                          className={`${
                            active
                              ? 'bg-indigo-600 text-white'
                              : 'text-gray-300'
                          } relative cursor-default select-none py-2 pl-8 pr-4`}
                        >
                          <span
                            className={`${
                              isSelected ? 'font-semibold' : 'font-normal'
                            } flex items-center`}
                          >
                            <CachedImage
                              type="avatar"
                              src={user.avatar}
                              alt=""
                              className="h-6 w-6 flex-shrink-0 rounded-full object-cover"
                              width={24}
                              height={24}
                            />
                            <span className="ml-3 block flex-shrink-0">
                              {user.displayName}
                            </span>
                            {user.displayName.toLowerCase() !== user.email && (
                              <span className="ml-1 truncate text-gray-400">
                                ({user.email})
                              </span>
                            )}
                          </span>
                          {isSelected && (
                            <span
                              className={`${
                                active ? 'text-white' : 'text-indigo-600'
                              } absolute inset-y-0 left-0 flex items-center pl-1.5`}
                            >
                              <CheckIcon className="h-5 w-5" />
                            </span>
                          )}
                        </div>
                      )}
                    </Listbox.Option>
                  ))}
                </Listbox.Options>
              </Transition>
            </div>
          </>
        )}
      </Listbox>
    </div>
  );
};

export default RequestAsUserSelect;
