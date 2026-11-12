import { Suspense } from "react";
import { VideoFeed } from "./VideoFeed";

export default function VideosPage() {
  return (
    <Suspense>
      <VideoFeed />
    </Suspense>
  );
}
