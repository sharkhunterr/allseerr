import Button from '@app/components/Common/Button';
import defineMessages from '@app/utils/defineMessages';
import { ArrowRightEndOnRectangleIcon } from '@heroicons/react/24/outline';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.Login.OidcLoginButton', {
  signinwithoidc: 'Use your {oidcProviderName} account',
});

interface OidcLoginButtonProps {
  oidcProviderName: string;
}

const OidcLoginButton = ({ oidcProviderName }: OidcLoginButtonProps) => {
  const intl = useIntl();

  return (
    <Button
      className="flex-1 bg-transparent"
      onClick={() => {
        window.location.href = '/api/v1/auth/oidc/login';
      }}
    >
      <ArrowRightEndOnRectangleIcon className="mr-2 h-5 w-5" />
      <span>
        {intl.formatMessage(messages.signinwithoidc, {
          oidcProviderName,
        })}
      </span>
    </Button>
  );
};

export default OidcLoginButton;
