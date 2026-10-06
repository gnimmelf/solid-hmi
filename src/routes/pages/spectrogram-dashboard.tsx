import { Title } from "@solidjs/meta";
import SpectrogramDashboard from "../../components/spectrogram-dashboard";

export default function SpectrogramDashboardPage() {
  return (
    <main style={{ display: "flex", "min-height": 0, flex: 1 }}>
      <Title>Spectrogram C2 dashboard</Title>
      <SpectrogramDashboard />
    </main>
  );
}