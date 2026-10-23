import { Suspense } from "react";
import { Chat } from "@/components/chat";

// Chat reads the id from the URL itself, so it can also follow replaceState.
// The URL of a dynamic route is only known at request time, hence Suspense.
export default function Page() {
  return (
    <Suspense>
      <Chat />
    </Suspense>
  );
}
