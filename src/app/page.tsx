import { redirect } from "next/navigation";

// The middleware handles signed-in visitors; this catches anyone who lands here
// without a session.
export default function Home() {
  redirect("/login");
}
