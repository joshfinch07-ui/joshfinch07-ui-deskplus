import { useMailClient } from '../mail/MailClientContext';

export function MailSettings() {
  const { client, setClient } = useMailClient();

  return (
    <fieldset className="mail-settings">
      <legend>Settings</legend>
      <p className="mail-settings-hint">Open email follow-ups in</p>
      <label>
        <input
          type="radio"
          name="mail-client"
          value="outlook-web"
          checked={client === 'outlook-web'}
          onChange={() => setClient('outlook-web')}
        />
        Outlook on the web
      </label>
      <label>
        <input
          type="radio"
          name="mail-client"
          value="mailto"
          checked={client === 'mailto'}
          onChange={() => setClient('mailto')}
        />
        Desktop Outlook (mailto)
      </label>
      <p className="mail-settings-hint">
        Drafts greet them by first name, include the what-to-say note, and sign off “Cheers, Josh”.
        Outlook on the web is the default for the Corpay Microsoft 365 account.
      </p>
    </fieldset>
  );
}
