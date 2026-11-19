import { redirect } from "next/navigation";

// This build exposes the admin dashboard only. The public marketing site has
// been removed, so the root URL sends visitors straight to the console.
export default function Page() {
  redirect("/dashboard");
}
