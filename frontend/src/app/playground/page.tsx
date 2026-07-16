import { LivePlayground } from "@/features/live-playground/components/live-playground";
import { isLivePlaygroundEnabled } from "@/features/live-playground/server-policy";
import { notFound } from "next/navigation";

export default function PlaygroundPage() {
  if (!isLivePlaygroundEnabled()) {
    notFound();
  }
  return <LivePlayground />;
}
