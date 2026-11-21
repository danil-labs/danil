import ExternalLink from "lucide-solid/icons/external-link";
import { Show, type JSX } from "solid-js";
import {
  Button,
  SettingsBlock,
  SettingsPanel,
  SettingsRow,
  SettingsSection,
} from "@danil/ui";
import { t } from "@danil/ui/i18n";

export interface AccountSectionProps {
  slot?: JSX.Element;
  part: "profile" | "emails" | "usage" | "plan";
  profile?: { name?: string | null; email?: string | null; active_organization_id?: string | null } | null;
  onOpenBilling?: () => void;
  onOpenEmails?: () => void;
}

export function AccountSection(props: AccountSectionProps) {
  return (
    <Show when={props.slot && props.part === "profile"} fallback={<FallbackAccountPart {...props} />}>
      {props.slot}
    </Show>
  );
}

function FallbackAccountPart(props: AccountSectionProps) {
  if (props.part === "profile") {
    return (
      <SettingsPanel data-danil-account="profile">
        <SettingsSection
          title={t("danil.account.title")}
          description={t("danil.account.web_description")}
        >
          <SettingsRow
            label={t("danil.account.your_account")}
            description={props.profile?.name || props.profile?.email || t("danil.account.loading")}
          />
          <SettingsRow
            label={t("danil.emails.manage_label")}
            description={t("danil.emails.manage_description")}
            data-account-emails-link=""
          >
            <Button
              size="sm"
              variant="secondary"
              onClick={() => props.onOpenEmails?.()}
            >
              <ExternalLink size={14} class="mr-1.5" />
              {t("danil.emails.manage")}
            </Button>
          </SettingsRow>
        </SettingsSection>
      </SettingsPanel>
    );
  }

  if (props.part === "emails") {
    return (
      <SettingsPanel data-danil-account="emails">
        <SettingsSection
          title={t("danil.emails.title")}
          description={t("danil.emails.description")}
        >
          <SettingsRow
            label={t("danil.emails.manage_label")}
            description={t("danil.emails.manage_description")}
            data-account-emails-link=""
          >
            <Button
              size="sm"
              variant="secondary"
              onClick={() => props.onOpenEmails?.()}
            >
              <ExternalLink size={14} class="mr-1.5" />
              {t("danil.emails.manage")}
            </Button>
          </SettingsRow>
        </SettingsSection>
      </SettingsPanel>
    );
  }

  if (props.part === "usage") {
    return (
      <SettingsPanel data-danil-account="usage">
        <SettingsSection
          title={t("settings.tab.usage")}
          description={t("settings.account_card.not_asked")}
        >
          <SettingsBlock>
            <p class="m-0 text-sm text-neutral-500">
              {t("danil.account.loading")}
            </p>
          </SettingsBlock>
        </SettingsSection>
      </SettingsPanel>
    );
  }

  if (props.part === "plan") {
    return (
      <SettingsPanel data-danil-account="plan">
        <SettingsSection
          title={t("settings.tab.plan")}
          description={t("settings.account_card.active")}
        >
          <SettingsRow
            label={t("settings.tab.plan")}
            description={t("settings.account_card.active")}
          >
            <Button
              size="sm"
              variant="secondary"
              onClick={() => props.onOpenBilling?.()}
            >
              {t("danil.emails.manage")}
            </Button>
          </SettingsRow>
        </SettingsSection>
      </SettingsPanel>
    );
  }

  return null;
}
