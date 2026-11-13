/**
 * Locale-aware reading and writing of numbers typed into a text field.
 * Indonesian writes "85,5" where English writes "85.5", and people type
 * whichever key their keyboard offers, so both separators are accepted as
 * the decimal point and shown back in the locale's own form.
 */

const decimalSeparators = new Map<string, string>();

export function decimalSeparator(locale: string): string {
  let separator = decimalSeparators.get(locale);
  if (separator === undefined) {
    separator =
      new Intl.NumberFormat(locale).formatToParts(1.5).find((part) => part.type === "decimal")
        ?.value ?? ".";
    decimalSeparators.set(locale, separator);
  }
  return separator;
}

/** Decimal places in a step: 0.1 has 1, 0.25 has 2, 1000 has 0. */
export function fractionDigitsOf(step: number): number {
  const text = String(step);
  const exponent = /e-(\d+)$/.exec(text);
  if (exponent) return Number(exponent[1]);
  const point = text.indexOf(".");
  return point === -1 ? 0 : text.length - point - 1;
}

/** Rounds half away from the float error (1.005 to 2 places is 1.01, not 1.00). */
export function roundTo(value: number, digits: number): number {
  if (digits <= 0) return Math.round(value);
  const text = String(value);
  if (text.includes("e")) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  }
  return Number(`${String(Math.round(Number(`${text}e${digits}`)))}e-${digits}`);
}

export function clampNumber(value: number, min?: number, max?: number): number {
  if (min !== undefined && value < min) return min;
  if (max !== undefined && value > max) return max;
  return value;
}

export interface NumberTextOptions {
  locale: string;
  /** Fraction digits kept; 0 means whole numbers only. */
  precision: number;
  allowNegative: boolean;
}

/**
 * Filters a keystroke's result down to what a number can hold: digits, one
 * decimal separator (shown in the locale's form) with at most `precision`
 * digits after it, and a leading minus when negatives are allowed.
 */
export function sanitizeNumberText(text: string, options: NumberTextOptions): string {
  const separator = decimalSeparator(options.locale);
  // U+2212 too: some locales format negatives with a true minus sign.
  const negative = options.allowNegative && /^\s*[-−]/.test(text);
  let integer = "";
  let fraction: string | null = null;
  for (const char of text) {
    if (char >= "0" && char <= "9") {
      if (fraction === null) integer += char;
      else if (fraction.length < options.precision) fraction += char;
    } else if ((char === "," || char === ".") && options.precision > 0 && fraction === null) {
      fraction = "";
    }
  }
  const body = fraction === null ? integer : `${integer}${separator}${fraction}`;
  return negative ? `-${body}` : body;
}

/** The number a sanitized text holds, or null while it holds none ("", "-", ","). Never NaN. */
export function parseNumberText(text: string, locale: string): number | null {
  const normalized = text.replace(decimalSeparator(locale), ".");
  if (!/\d/.test(normalized)) return null;
  const value = Number(normalized.endsWith(".") ? normalized.slice(0, -1) : normalized);
  return Number.isFinite(value) ? value : null;
}

export interface FormatNumberOptions {
  precision: number;
  useGrouping: boolean;
}

const numberFormats = new Map<string, Intl.NumberFormat>();

export function formatNumber(value: number, locale: string, options: FormatNumberOptions): string {
  const key = `${locale}|${options.precision}|${options.useGrouping}`;
  let format = numberFormats.get(key);
  if (!format) {
    format = new Intl.NumberFormat(locale, {
      maximumFractionDigits: Math.min(Math.max(options.precision, 0), 20),
      useGrouping: options.useGrouping,
    });
    numberFormats.set(key, format);
  }
  return format.format(value);
}
