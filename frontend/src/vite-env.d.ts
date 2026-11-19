/// <reference types="vite/client" />

declare module 'jsbarcode' {
  function JsBarcode(
    element: HTMLCanvasElement | SVGSVGElement | string,
    text: string,
    options?: {
      format?: string;
      width?: number;
      height?: number;
      displayValue?: boolean;
      text?: string;
      fontOptions?: string;
      font?: string;
      textAlign?: string;
      textPosition?: string;
      textMargin?: number;
      fontSize?: number;
      background?: string;
      lineColor?: string;
      margin?: number;
      marginTop?: number;
      marginBottom?: number;
      marginLeft?: number;
      marginRight?: number;
      valid?: (valid: boolean) => void;
    }
  ): void;
  export default JsBarcode;
}

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_APP_URL: string;
  readonly VITE_ENVIRONMENT: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
