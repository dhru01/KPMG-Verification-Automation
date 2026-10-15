import { redirect } from "next/navigation";

/** Settings UI is not part of the pilot workspace; configuration is via deployment env vars. */
export default function SettingsPage() {
  redirect("/");
}
