declare module "colormap" {
  type ColormapOptions = {
    colormap: string;
    nshades: number;
    format: "float";
  };

  export default function colormap(options: ColormapOptions): number[][];
}