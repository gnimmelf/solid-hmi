import * as v from "valibot";
import { ThemeNames } from "../../lib/theme";

export const ColormapNames = [
  "viridis",
  "jet",
  "hot",
  "cool",
  "rainbow",
] as const;

export type ColormapName = (typeof ColormapNames)[number];

export const SpectrogramControlsSchema = v.strictObject({
  running: v.boolean(),
  colormap: v.picklist(ColormapNames),
});

export const SpectrogramStateSchema = v.strictObject({
  assetId: v.string(),
  running: v.boolean(),
  colormap: v.picklist(ColormapNames),
  theme: v.picklist(ThemeNames),
});

export const ThemeChangeSchema = v.strictObject({
  theme: v.picklist(ThemeNames),
});

export const SpectrogramChannelSchemas = {
  "spectrogram-controls": SpectrogramControlsSchema,
  theme: ThemeChangeSchema,
} as const;