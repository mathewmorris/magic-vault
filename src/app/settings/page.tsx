import { type Metadata } from "next";

import SettingsPanel from "~/components/settings/SettingsPanel";

export const metadata: Metadata = {
  title: "Settings | Magic Vault",
  description: "Turn Magic Vault's card tap on or off and see the achievements you've earned.",
};

export default function SettingsPage() {
  return <SettingsPanel />;
}
