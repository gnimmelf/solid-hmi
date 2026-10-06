import { Title } from "@solidjs/meta";
import SpectrogramWorkspace from "../../components/spectrogram-workspace";

export default function SpectrogramDetailPage() {
  return (
    <main style={{ display: "flex", "min-height": 0, flex: 1 }}>
      <Title>Spectrogram L3 workspace</Title>
      <SpectrogramWorkspace />
    </main>
  );
}