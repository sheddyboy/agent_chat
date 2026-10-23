import { Suspense } from "react";
import { Chat } from "@/components/chat";

// Chat reads ?attach= with useSearchParams, which is only known at request time
export default function Page() {
  return (
    <Suspense>
      <Chat />
    </Suspense>
  );
}
