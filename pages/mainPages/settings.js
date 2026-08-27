import Layout from "@/components/core/client/frames/layout";
import SettingsContent from "@/components/core/client/contents/settingsContent";

export default function Settings() {
  return <SettingsContent />;
}

Settings.getLayout = function getLayout(page) {
  return <Layout>{page}</Layout>;
};
